/**
 * WebSocket Event Handler
 * 
 * Handles: join_match, make_move, ping
 * Auth: JWT passed as query param ?token=...
 */

const jwt = require('jsonwebtoken');
const { Player, Match } = require('../models');
const { applyMove } = require('../services/game');
const { startTurnTimer, clearTurnTimer } = require('../services/timer');
const { handleDisconnect, handleReconnect } = require('./disconnect');
const {
  createRoom, setPlayerWs, getRoom, getRoomByPlayer,
  broadcast, destroyRoom, sendTo,
} = require('./rooms');

function send(ws, data) {
  if (ws.readyState === 1) ws.send(JSON.stringify(data));
}

async function handleConnection(ws, req) {
  // Auth via ?token=
  const url = new URL(req.url, `http://localhost`);
  const token = url.searchParams.get('token');

  if (!token) return ws.close(4001, 'Missing token');

  let player;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    player = await Player.findByPk(decoded.id);
    if (!player) return ws.close(4001, 'Player not found');
  } catch {
    return ws.close(4001, 'Invalid token');
  }

  // Mark online
  await player.update({ is_online: true, last_active_at: new Date() });
  setPlayerWs(player.id, ws);

  // If player has an active match, handle as reconnect
  if (player.current_match_id) {
    await handleReconnect(player.id);
  }

  send(ws, { type: 'connected', playerId: player.id, username: player.username });

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    const { type } = msg;

    try {
      if (type === 'ping') {
        await Player.update({ last_active_at: new Date(), is_online: true }, { where: { id: player.id } });
        send(ws, { type: 'pong' });

      } else if (type === 'join_match') {
        await handleJoinMatch(ws, player, msg);

      } else if (type === 'make_move') {
        await handleMakeMove(ws, player, msg);
      } else if (type === 'forfeit') {
        const { matchId } = msg;

        const match = await Match.findByPk(matchId);
        if (!match || ['finished', 'waiting'].includes(match.status)) return;
        
        const { applyForfeit } = require('../services/game');
        const forfeitData = await applyForfeit(match, player.id, 'forfeit');

        // Note: clearTurnTimer and broadcast implicitly rely on match room scope.

        clearTurnTimer(matchId);

        broadcast(matchId, {
          type: 'game_over',
          board: match.board,
          result: forfeitData.result,
          winnerId: forfeitData.winnerId,
          rankChanges: forfeitData.rankChanges,
        });

        destroyRoom(matchId);
      }
    } catch (err) {
      console.error(`[WS] Error handling ${type}:`, err);
      send(ws, { type: 'error', message: 'Internal server error' });
    }
  });

  ws.on('close', async () => {
    await handleDisconnect(player.id);
  });
}

async function handleJoinMatch(ws, player, msg) {
  const { matchId } = msg;
  if (!matchId) return send(ws, { type: 'error', message: 'matchId required' });

  const match = await Match.findByPk(matchId);
  if (!match) return send(ws, { type: 'error', message: 'Match not found' });
  if (match.player_x_id !== player.id && match.player_o_id !== player.id) {
    return send(ws, { type: 'error', message: 'You are not in this match' });
  }

  // Final safeguard: ensure room exists
  if (!getRoom(matchId)) {
    createRoom(matchId, match.player_x_id, match.player_o_id);
  }
  setPlayerWs(player.id, ws);

  const room = getRoom(matchId);
  const bothConnected = !!(room?.wsX && room?.wsO);

  const symbol = String(match.player_x_id) === String(player.id) ? 'X' : 'O';

  // Always send acknowledgment to the joiner immediately
  send(ws, { 
    type: 'joined_match', 
    matchId, 
    board: match.board, 
    currentTurn: match.current_turn, 
    status: (match.status === 'started' && bothConnected) ? 'active' : match.status, 
    symbol 
  });

  // If transition just triggered, broadcast to everyone
  if (match.status === 'started' && bothConnected) {
    await match.update({ status: 'active' });
    broadcast(matchId, { type: 'game_started', board: match.board, currentTurn: match.current_turn });
  }
}

async function handleMakeMove(ws, player, msg) {
  const { matchId, cell } = msg;
  if (!matchId || cell === undefined) {
    return send(ws, { type: 'move_rejected', reason: 'matchId and cell are required' });
  }

  const match = await Match.findByPk(matchId);
  if (!match) return send(ws, { type: 'error', message: 'Match not found' });
  if (match.status !== 'active') {
    return send(ws, { type: 'move_rejected', reason: 'Match is not active' });
  }

  const result = await applyMove(match, player.id, Number(cell));

  if (!result.ok) {
    return send(ws, { type: 'move_rejected', reason: result.reason });
  }

  if (result.gameOver) {
    clearTurnTimer(matchId);

    const rankChanges = {
      [match.player_x_id]: result.winnerId === match.player_x_id ? +30 : (result.result === 'draw' ? 0 : -20),
      [match.player_o_id]: result.winnerId === match.player_o_id ? +30 : (result.result === 'draw' ? 0 : -20),
    };

    broadcast(matchId, {
      type: 'game_over',
      board: result.board,
      result: result.result,
      winnerId: result.winnerId,
      rankChanges,
    });

    destroyRoom(matchId);
  } else {
    broadcast(matchId, {
      type: 'board_update',
      board: result.board,
      currentTurn: result.currentTurn,
    });

    // Restart turn timer in timed mode
    if (match.game_mode === 'timed') {
      const nextPlayerId = result.currentTurn === 'X' ? match.player_x_id : match.player_o_id;
      startTurnTimer(matchId, nextPlayerId);
    }
  }
}

module.exports = { handleConnection };
