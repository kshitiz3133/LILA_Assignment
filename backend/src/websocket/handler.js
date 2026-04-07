/**
 * WebSocket Event Handler
 * 
 * Handles: join_match, make_move, ping
 * Auth: JWT passed as query param ?token=...
 */

const jwt = require('jsonwebtoken');
const { Player, Match, MatchPlayer } = require('../models');
const { applyMove } = require('../services/game');

/**
 * Derive whose turn it is from MatchPlayer.last_player_moved_at.
 * The player who moved most recently already went → it's the other's turn.
 * If neither moved yet, X goes first.
 */
/**
 * Derive turn info from MatchPlayer.last_player_moved_at.
 * Returns { currentTurn, lastMovedAt: { X: date|null, O: date|null } }
 */
async function getTurnInfo(matchId) {
  const mps = await MatchPlayer.findAll({ where: { match_id: matchId } });
  const mpX = mps.find(mp => mp.symbol === 'X');
  const mpO = mps.find(mp => mp.symbol === 'O');

  const lastMovedAt = {
    X: mpX?.last_player_moved_at || null,
    O: mpO?.last_player_moved_at || null,
  };

  if (!mpX || !mpO) return { currentTurn: 'X', lastMovedAt };

  const xTime = lastMovedAt.X ? new Date(lastMovedAt.X).getTime() : 0;
  const oTime = lastMovedAt.O ? new Date(lastMovedAt.O).getTime() : 0;

  const currentTurn = (xTime === 0 && oTime === 0) ? 'X' : (xTime > oTime ? 'O' : 'X');
  return { currentTurn, lastMovedAt };
}
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

        const [pX, pO] = await Promise.all([
          Player.findByPk(match.player_x_id, { attributes: ['id', 'username', 'rank'] }),
          Player.findByPk(match.player_o_id, { attributes: ['id', 'username', 'rank'] }),
        ]);
        const fWinner = forfeitData.winnerId === match.player_x_id ? pX : pO;

        broadcast(matchId, {
          type: 'game_over',
          board: match.board,
          result: forfeitData.result,
          winnerId: forfeitData.winnerId,
          winnerUsername: fWinner?.username || null,
          players: {
            X: { id: pX?.id, username: pX?.username, rank: pX?.rank },
            O: { id: pO?.id, username: pO?.username, rank: pO?.rank },
          },
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
  const { currentTurn, lastMovedAt } = await getTurnInfo(matchId);

  // Always send acknowledgment to the joiner immediately
  send(ws, {
    type: 'joined_match',
    matchId,
    board: match.board,
    currentTurn,
    lastMovedAt,
    status: (match.status === 'started' && bothConnected) ? 'active' : match.status,
    symbol
  });

  // If transition just triggered, broadcast to everyone
  if (match.status === 'started' && bothConnected) {
    await match.update({ status: 'active' });
    broadcast(matchId, { type: 'game_started', board: match.board, currentTurn, lastMovedAt });
  }
}

async function handleMakeMove(ws, player, msg) {
  const { matchId, cell } = msg;
  if (!matchId || cell === undefined) {
    return send(ws, { type: 'move_rejected', reason: 'matchId and cell are required' });
  }

  const match = await Match.findByPk(matchId);
  if (!match) return send(ws, { type: 'error', message: 'Match not found' });
  if (match.status !== 'active' && match.status !== 'started') {
    return send(ws, { type: 'move_rejected', reason: 'Match is not active' });
  }

  const result = await applyMove(match, player.id, Number(cell));

  if (!result.ok) {
    return send(ws, { type: 'move_rejected', reason: result.reason });
  }

  if (result.gameOver) {
    // Build game over payload BEFORE sending anything, so move_accepted includes it
    clearTurnTimer(matchId);

    const [playerX, playerO] = await Promise.all([
      Player.findByPk(match.player_x_id, { attributes: ['id', 'username', 'rank'] }),
      Player.findByPk(match.player_o_id, { attributes: ['id', 'username', 'rank'] }),
    ]);

    const rankChanges = {
      [match.player_x_id]: result.winnerId === match.player_x_id ? +30 : (result.result === 'draw' ? 0 : -20),
      [match.player_o_id]: result.winnerId === match.player_o_id ? +30 : (result.result === 'draw' ? 0 : -20),
    };

    const winner = result.winnerId
      ? (result.winnerId === match.player_x_id ? playerX : playerO)
      : null;

    const gameOverPayload = {
      result: result.result,
      winnerId: result.winnerId,
      winnerUsername: winner?.username || null,
      players: {
        X: { id: playerX?.id, username: playerX?.username, rank: playerX?.rank },
        O: { id: playerO?.id, username: playerO?.username, rank: playerO?.rank },
      },
      rankChanges,
    };

    // Send move_accepted WITH game over data to the mover
    send(ws, {
      type: 'move_accepted',
      cell: Number(cell),
      board: result.board,
      currentTurn: result.currentTurn,
      lastMovedAt: result.lastMovedAt,
      gameOver: true,
      ...gameOverPayload,
    });

    // Broadcast game_over to both players (opponent needs it too)
    broadcast(matchId, {
      type: 'game_over',
      board: result.board,
      ...gameOverPayload,
    });

    destroyRoom(matchId);
  } else {
    // Acknowledge non-finishing move to the mover
    send(ws, {
      type: 'move_accepted',
      cell: Number(cell),
      board: result.board,
      currentTurn: result.currentTurn,
      lastMovedAt: result.lastMovedAt,
      gameOver: false,
    });

    broadcast(matchId, {
      type: 'board_update',
      board: result.board,
      currentTurn: result.currentTurn,
      lastMovedAt: result.lastMovedAt,
    });

    // Restart turn timer in timed mode
    if (match.game_mode === 'timed') {
      const nextPlayerId = result.currentTurn === 'X' ? match.player_x_id : match.player_o_id;
      startTurnTimer(matchId, nextPlayerId);
    }
  }
}

module.exports = { handleConnection };
