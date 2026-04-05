/**
 * Disconnect Handler
 * 
 * On WS close:
 *  1. Mark player offline in DB
 *  2. Notify opponent and start 30s grace timer
 *  3. If player reconnects (setPlayerWs called) → clear timer, resume
 *  4. If timer fires → apply forfeit, game_over to opponent, destroy room
 */

const { Player, Match } = require('../models');
const { applyForfeit } = require('../services/game');
const { clearTurnTimer } = require('../services/timer');
const { getRoom, getRoomByPlayer, broadcast, destroyRoom, sendTo } = require('./rooms');

const GRACE_MS = 30 * 1000;

async function handleDisconnect(playerId) {
  await Player.update({ is_online: false }, { where: { id: playerId } });

  const room = getRoomByPlayer(playerId);
  if (!room) return; // Not in a match

  const match = await Match.findByPk(room.matchId);
  if (!match || match.status !== 'active') return;

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

    const rankChanges = {
      [freshMatch.player_x_id]: winnerId === freshMatch.player_x_id ? +30 : -20,
      [freshMatch.player_o_id]: winnerId === freshMatch.player_o_id ? +30 : -20,
    };

    broadcast(room.matchId, {
      type: 'game_over',
      result,
      winnerId,
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

  sendTo(playerId, {
    type: 'reconnected',
    board: match.board,
    currentTurn: match.current_turn,
    matchId: match.id,
  });

  // Notify opponent
  const opponentId = room.playerXId === playerId ? room.playerOId : room.playerXId;
  sendTo(opponentId, { type: 'opponent_reconnected' });
}

module.exports = { handleDisconnect, handleReconnect };
