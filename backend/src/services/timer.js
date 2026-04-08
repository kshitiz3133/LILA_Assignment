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

const TURN_LIMIT_MS = 10 * 1000; // 10s displayed to user
const FORFEIT_TOLERANCE_MS = 12 * 1000; // 12s hard limit for the backend (2s buffer)

function startTurnTimer(matchId, currentPlayerId) {
  const room = getRoom(matchId);
  if (!room) return;

  // Clear previous timer if any
  if (room.timerRef) {
    clearInterval(room.timerRef);
    room.timerRef = null;
  }

  const startedAt = Date.now();
  const deadline = startedAt + TURN_LIMIT_MS;
  const hardDeadline = startedAt + FORFEIT_TOLERANCE_MS;

  room.timerRef = setInterval(async () => {
    const now = Date.now();
    const secondsLeft = Math.max(0, Math.ceil((deadline - now) / 1000));
    
    // Only broadcast updates while within the 10s display window
    if (now <= deadline + 1000) {
      broadcast(matchId, { type: 'timer_update', secondsLeft });
    }

    if (now >= hardDeadline) {
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
