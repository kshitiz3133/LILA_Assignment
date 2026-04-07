/**
 * Matchmaking Service
 * 
 * Maintains an in-memory set of player IDs currently in the queue.
 * A polling loop runs every 2s to pair compatible online players.
 * 
 * Bracket expansion (per player, based on search duration):
 *   0–10s    → ±30
 *   10–15s   → ±60
 *   15–20s   → ±120
 *   20–25s   → ±240
 *   25–30s   → ±480
 *   30–90s   → ±960 (hard cap)
 *   90s+     → timeout — removed from queue, client notified
 */

const { Player, Match, MatchPlayer } = require('../models');
const { getWsClient, broadcast } = require('../websocket/rooms');

const QUEUE_TIMEOUT_MS = 90 * 1000;
const POLL_INTERVAL_MS = 2000;

const queue = new Set(); // Set of player IDs

function getBracket(elapsedMs) {
  const s = elapsedMs / 1000;
  if (s < 10)  return 30;
  if (s < 15)  return 60;
  if (s < 20)  return 120;
  if (s < 25)  return 240;
  if (s < 30)  return 480;
  return 960; // hard cap — holds until 90s timeout
}

function addToQueue(playerId) {
  queue.add(playerId);
}

function removeFromQueue(playerId) {
  queue.delete(playerId);
}

async function runMatchmakingTick() {
  if (queue.size < 2) return;

  const now = new Date();
  // Load all queued players from DB in one query
  const players = await Player.findAll({
    where: { id: Array.from(queue) },
  });

  const paired = new Set();

  for (const playerA of players) {
    if (paired.has(playerA.id)) continue;
    if (!playerA.search_started_at) { removeFromQueue(playerA.id); continue; }

    const elapsed = now - playerA.search_started_at;

    // Timeout check
    if (elapsed >= QUEUE_TIMEOUT_MS) {
      removeFromQueue(playerA.id);
      await playerA.update({ search_started_at: null, search_mode: null });
      const ws = getWsClient(playerA.id);
      if (ws) ws.send(JSON.stringify({ type: 'queue_timeout', message: 'Matchmaking timed out after 90 seconds' }));
      continue;
    }

    const bracket = getBracket(elapsed);

    // Find best candidate
    const candidates = players.filter(p =>
      !paired.has(p.id) &&
      p.id !== playerA.id &&
      p.is_online &&
      p.search_mode === playerA.search_mode &&
      p.search_started_at !== null &&
      Math.abs(p.rank - playerA.rank) <= bracket
    );

    if (candidates.length === 0) continue;

    // Pick closest rank
    candidates.sort((a, b) => Math.abs(a.rank - playerA.rank) - Math.abs(b.rank - playerA.rank));
    const playerB = candidates[0];

    paired.add(playerA.id);
    paired.add(playerB.id);
    removeFromQueue(playerA.id);
    removeFromQueue(playerB.id);

    await pairPlayers(playerA, playerB);
  }
}

async function pairPlayers(playerA, playerB) {
  try {
    // Randomly assign X / O
    const [playerX, playerO] = Math.random() > 0.5 ? [playerA, playerB] : [playerB, playerA];

    const match = await Match.create({
      player_x_id: playerX.id,
      player_o_id: playerO.id,
      status: 'started',
      game_mode: playerX.search_mode,
      started_at: new Date(),
    });

    // Create the explicit identifier mapping in the DB.
    // The DB's UNIQUE(match_id, symbol) ensures 100% strictness.
    // By artificially setting last_player_moved_at on playerO, X knows it is their turn first.
    await MatchPlayer.bulkCreate([
      { match_id: match.id, player_id: playerX.id, symbol: 'X' },
      { match_id: match.id, player_id: playerO.id, symbol: 'O', last_player_moved_at: new Date() }
    ]);

    await Player.update(
      { search_started_at: null, search_mode: null, current_match_id: match.id },
      { where: { id: [playerX.id, playerO.id] } }
    );

    const payload = (symbol, opponent) => JSON.stringify({
      type: 'match_found',
      matchId: match.id,
      symbol,
      mode: match.game_mode,
      opponent: { id: opponent.id, username: opponent.username, rank: opponent.rank },
    });

    const wsX = getWsClient(playerX.id);
    const wsO = getWsClient(playerO.id);
    if (wsX) wsX.send(payload('X', playerO));
    if (wsO) wsO.send(payload('O', playerX));

    console.log(`[Matchmaking] Paired ${playerX.username} (X) vs ${playerO.username} (O) | match ${match.id}`);
  } catch (err) {
    console.error('[Matchmaking] Pair error:', err);
  }
}

function startMatchmakingLoop() {
  console.log('[Matchmaking] Service ready (Handling requests natively)');
}

module.exports = { addToQueue, removeFromQueue, startMatchmakingLoop, runMatchmakingTick };
