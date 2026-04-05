/**
 * Timer Service (Timed Game Mode)
 * 
 * - On each valid move in a timed match, starts a 30s countdown.
 * - Broadcasts timer_update every second.
 * - On expiry, triggers applyForfeit on the current player.
 */

const { Match } = require('../models');
const { applyForfeit } = require('./game');
const { broadcast, destroyRoom, getRoom } = require('../websocket/rooms');

const TURN_LIMIT_MS = 30 * 1000;

function startTurnTimer(matchId, currentPlayerId) {
  const room = getRoom(matchId);
  if (!room) return;

  // Clear previous timer if any
  if (room.timerRef) {
    clearInterval(room.timerRef);
    room.timerRef = null;
  }

  const deadline = Date.now() + TURN_LIMIT_MS;
  let secondsLeft = 30;

  room.timerRef = setInterval(async () => {
    secondsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));

    broadcast(matchId, { type: 'timer_update', secondsLeft });

    if (secondsLeft <= 0) {
      clearInterval(room.timerRef);
      room.timerRef = null;

      // Fetch fresh match from DB
      const match = await Match.findByPk(matchId);
      if (!match || match.status !== 'active') return;

      const { result, winnerId } = await applyForfeit(match, currentPlayerId, 'timeout');

      const rankChanges = {
        [match.player_x_id]: winnerId === match.player_x_id ? +30 : -20,
        [match.player_o_id]: winnerId === match.player_o_id ? +30 : -20,
      };

      broadcast(matchId, {
        type: 'game_over',
        result,
        winnerId,
        rankChanges,
        reason: 'timeout',
      });

      destroyRoom(matchId);
    }
  }, 1000);
}

function clearTurnTimer(matchId) {
  const room = getRoom(matchId);
  if (room && room.timerRef) {
    clearInterval(room.timerRef);
    room.timerRef = null;
  }
}

module.exports = { startTurnTimer, clearTurnTimer };
