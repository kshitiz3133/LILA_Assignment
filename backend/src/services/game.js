/**
 * Game Service
 * 
 * Server-authoritative logic:
 *  - Validate moves
 *  - Detect win / draw
 *  - Apply rank changes (+30 win / -20 loss)
 *  - Update streaks
 */

const { Player, Match, MatchPlayer } = require('../models');

const WIN_LINES = [
  [0,1,2],[3,4,5],[6,7,8], // rows
  [0,3,6],[1,4,7],[2,5,8], // cols
  [0,4,8],[2,4,6],         // diags
];

function checkWinner(board) {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] !== ' ' && board[a] === board[b] && board[a] === board[c]) {
      return board[a]; // 'X' or 'O'
    }
  }
  return null;
}

function isDraw(board) {
  return !board.includes(' ');
}

/**
 * Apply a move. Returns { ok, reason, board, currentTurn, gameOver, result, winnerId }
 *
 * Turn order is determined by last_player_moved_at on MatchPlayer:
 * the player who moved most recently already took their turn,
 * so the other player is the one who should move next.
 */
async function applyMove(match, playerId, cell) {
  const board = match.board.split('');

  // Look up both MatchPlayer rows to determine whose turn it is
  const matchPlayers = await MatchPlayer.findAll({ where: { match_id: match.id } });
  const mover = matchPlayers.find(mp => String(mp.player_id) === String(playerId));
  const opponent = matchPlayers.find(mp => String(mp.player_id) !== String(playerId));

  if (!mover || !opponent) {
    return { ok: false, reason: 'Player not found in match' };
  }

  const symbol = mover.symbol; // 'X' or 'O'

  // Validate turn: the player whose last_player_moved_at is MORE recent
  // is the one who just went — so it's the OTHER player's turn.
  // If neither has moved yet (both null), X goes first by convention.
  const moverTime = mover.last_player_moved_at ? new Date(mover.last_player_moved_at).getTime() : 0;
  const opponentTime = opponent.last_player_moved_at ? new Date(opponent.last_player_moved_at).getTime() : 0;

  if (moverTime > opponentTime) {
    return { ok: false, reason: 'Not your turn' };
  }
  // If both are 0 (game start), only X can go first
  if (moverTime === 0 && opponentTime === 0 && symbol !== 'X') {
    return { ok: false, reason: 'Not your turn' };
  }

  // BLITZ MODE: Hard timestamp check
  if (match.game_mode === 'timed') {
    const baseline = opponentTime || new Date(match.created_at).getTime();
    const elapsed = Date.now() - baseline;
    if (elapsed > 12000) { // 12s hard limit
      return { ok: false, reason: 'Turn timeout' };
    }
  }

  // Validate cell range
  if (cell < 0 || cell > 8) {
    return { ok: false, reason: 'Invalid cell index' };
  }
  // Validate cell empty
  if (board[cell] !== ' ') {
    return { ok: false, reason: 'Cell already occupied' };
  }

  board[cell] = symbol;
  const boardStr = board.join('');
  const now = new Date();

  // Record the move on the MatchPlayer row
  await mover.update({ last_player_moved_at: now, last_player_move: [cell] });

  // Build lastMovedAt payload for frontend
  const lastMovedAt = {
    [mover.symbol]: now,
    [opponent.symbol]: opponent.last_player_moved_at || null,
  };

  const winner = checkWinner(boardStr);
  const draw = !winner && isDraw(boardStr);

  if (winner || draw) {
    let result, winnerId;
    if (winner === 'X') { result = 'x_wins'; winnerId = match.player_x_id; }
    else if (winner === 'O') { result = 'o_wins'; winnerId = match.player_o_id; }
    else { result = 'draw'; winnerId = null; }

    const nextTurn = symbol === 'X' ? 'O' : 'X';
    await match.update({
      board: boardStr,
      current_turn: nextTurn,
      status: 'finished',
      result,
      winner_id: winnerId,
      finished_at: now,
    });

    await applyRankChanges(match, winnerId, result);

    return { ok: true, board: boardStr, currentTurn: null, lastMovedAt, gameOver: true, result, winnerId };
  }

  const nextTurn = symbol === 'X' ? 'O' : 'X';
  await match.update({ board: boardStr, current_turn: nextTurn });

  return { ok: true, board: boardStr, currentTurn: nextTurn, lastMovedAt, gameOver: false };
}

async function applyRankChanges(match, winnerId, result) {
  const playerXId = match.player_x_id;
  const playerOId = match.player_o_id;

  const [playerX, playerO] = await Promise.all([
    Player.findByPk(playerXId),
    Player.findByPk(playerOId),
  ]);

  const updates = {};

  if (result === 'draw') {
    updates[playerXId] = { current_match_id: null };
    updates[playerOId] = { current_match_id: null };
  } else {
    const winner = winnerId === playerXId ? playerX : playerO;
    const loser  = winnerId === playerXId ? playerO : playerX;

    const newWinStreak = winner.win_streak + 1;
    updates[winner.id] = {
      wins: winner.wins + 1,
      rank: winner.rank + 30,
      win_streak: newWinStreak,
      best_streak: Math.max(winner.best_streak, newWinStreak),
      current_match_id: null,
    };
    updates[loser.id] = {
      losses: loser.losses + 1,
      rank: Math.max(0, loser.rank - 20),
      win_streak: 0,
      current_match_id: null,
    };
  }

  await Promise.all(
    Object.entries(updates).map(([id, data]) => Player.update(data, { where: { id } }))
  );

  return { 
    rankChanges: {
      [playerXId]: result === 'draw' ? 0 : (winnerId === playerXId ? +30 : -20),
      [playerOId]: result === 'draw' ? 0 : (winnerId === playerOId ? +30 : -20),
    }
  };
}

/**
 * Apply forfeit (disconnect or timeout). The forfeiting player's ID is provided.
 */
async function applyForfeit(match, forfeitingPlayerId, reason = 'forfeit') {
  const isX = match.player_x_id === forfeitingPlayerId;
  const result = isX ? `x_${reason}` : `o_${reason}`;
  const winnerId = isX ? match.player_o_id : match.player_x_id;

  await match.update({
    status: 'finished',
    result,
    winner_id: winnerId,
    finished_at: new Date(),
  });

  const { rankChanges } = await applyRankChanges(match, winnerId, result);

  return { result, winnerId, rankChanges };
}

module.exports = { applyMove, applyForfeit, applyRankChanges };
