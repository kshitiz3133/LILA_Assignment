/**
 * Disconnect Handler
 * 
 * On WS close:
 *  1. Mark player offline in DB
 *  2. Notify opponent and start 30s grace timer
 *  3. If player reconnects (setPlayerWs called) → clear timer, resume
 *  4. If timer fires → apply forfeit, game_over to opponent, destroy room
 */

const { Player, Match, MatchPlayer } = require('../models');
const { applyForfeit } = require('../services/game');
const { clearTurnTimer } = require('../services/timer');
const { getRoom, getRoomByPlayer, broadcast, destroyRoom, sendTo } = require('./rooms');

const GRACE_MS = 30 * 1000;

async function handleDisconnect(playerId) {
  await Player.update({ is_online: false }, { where: { id: playerId } });

  const room = getRoomByPlayer(playerId);
  if (!room) return; // Not in a match

  const match = await Match.findByPk(room.matchId);
  if (!match || ['finished', 'waiting'].includes(match.status)) return;

  // Notify opponent
  const opponentId = room.playerXId === playerId ? room.playerOId : room.playerXId;
  sendTo(opponentId, {
    type: 'opponent_disconnected',
    grace_seconds: 30,
  });

  // Pause the turn timer if timed mode
  clearTurnTimer(room.matchId);

  // Start grace timer
  room.disconnectTimers[playerId] = setTimeout(async () => {
    const freshMatch = await Match.findByPk(room.matchId);
    if (!freshMatch || freshMatch.status === 'finished') return;

    const { result, winnerId } = await applyForfeit(freshMatch, playerId, 'forfeit');

    const { Player } = require('../models');
    const [pX, pO] = await Promise.all([
      Player.findByPk(freshMatch.player_x_id, { attributes: ['id', 'username', 'rank'] }),
      Player.findByPk(freshMatch.player_o_id, { attributes: ['id', 'username', 'rank'] }),
    ]);
    const dcWinner = winnerId === freshMatch.player_x_id ? pX : pO;

    const rankChanges = {
      [freshMatch.player_x_id]: winnerId === freshMatch.player_x_id ? +30 : -20,
      [freshMatch.player_o_id]: winnerId === freshMatch.player_o_id ? +30 : -20,
    };

    broadcast(room.matchId, {
      type: 'game_over',
      result,
      winnerId,
      winnerUsername: dcWinner?.username || null,
      players: {
        X: { id: pX?.id, username: pX?.username, rank: pX?.rank },
        O: { id: pO?.id, username: pO?.username, rank: pO?.rank },
      },
      rankChanges,
      reason: 'forfeit',
    });

    destroyRoom(room.matchId);
  }, GRACE_MS);
}

async function handleReconnect(playerId) {
  await Player.update({ is_online: true, last_active_at: new Date() }, { where: { id: playerId } });

  const room = getRoomByPlayer(playerId);
  if (!room) return;

  // Cancel grace timer
  if (room.disconnectTimers[playerId]) {
    clearTimeout(room.disconnectTimers[playerId]);
    delete room.disconnectTimers[playerId];
  }

  // Freshen match state for reconnecting player
  const match = await Match.findByPk(room.matchId);
  if (!match || match.status !== 'active') return;

  // Derive current turn and lastMovedAt from MatchPlayer
  const mps = await MatchPlayer.findAll({ where: { match_id: match.id } });
  const mpX = mps.find(mp => mp.symbol === 'X');
  const mpO = mps.find(mp => mp.symbol === 'O');

  const lastMovedAt = {
    X: mpX?.last_player_moved_at || null,
    O: mpO?.last_player_moved_at || null,
  };

  let currentTurn = 'X';
  if (mpX && mpO) {
    const xTime = lastMovedAt.X ? new Date(lastMovedAt.X).getTime() : 0;
    const oTime = lastMovedAt.O ? new Date(lastMovedAt.O).getTime() : 0;
    if (xTime === 0 && oTime === 0) currentTurn = 'X';
    else currentTurn = xTime > oTime ? 'O' : 'X';
  }

  sendTo(playerId, {
    type: 'reconnected',
    board: match.board,
    currentTurn,
    lastMovedAt,
    matchId: match.id,
  });

  // Notify opponent
  const opponentId = room.playerXId === playerId ? room.playerOId : room.playerXId;
  sendTo(opponentId, { type: 'opponent_reconnected' });
}

module.exports = { handleDisconnect, handleReconnect };
