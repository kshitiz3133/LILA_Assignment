const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { Player } = require('../models');
const matchmakingService = require('../services/matchmaking');
const Joi = require('joi');

const joinSchema = Joi.object({
  mode: Joi.string().valid('classic', 'timed').default('classic'),
});

// POST /matchmaking/join
router.post('/join', auth, async (req, res) => {
  const { error, value } = joinSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const player = await Player.findByPk(req.player.id);
  if (!player) return res.status(404).json({ error: 'Player not found' });

  if (player.current_match_id) {
    return res.status(409).json({ error: 'Already in an active match' });
  }
  if (player.search_started_at) {
    return res.status(409).json({ error: 'Already in matchmaking queue' });
  }

  await player.update({
    search_started_at: new Date(),
    search_mode: value.mode,
    is_online: true,
    last_active_at: new Date(),
  });

  matchmakingService.addToQueue(player.id);

  return res.json({ message: 'Joined matchmaking queue', mode: value.mode });
});

// DELETE /matchmaking/leave
router.delete('/leave', auth, async (req, res) => {
  const player = await Player.findByPk(req.player.id);
  if (!player) return res.status(404).json({ error: 'Player not found' });

  await player.update({ search_started_at: null, search_mode: null });
  matchmakingService.removeFromQueue(player.id);

  return res.json({ message: 'Left matchmaking queue' });
});

// GET /matchmaking/status
router.get('/status', auth, async (req, res) => {
  const player = await Player.findByPk(req.player.id);
  if (!player) return res.status(404).json({ error: 'Player not found' });

  // Trigger algorithmic check
  await matchmakingService.runMatchmakingTick();

  // Re-fetch to check if assignment happened
  const freshPlayer = await Player.findByPk(req.player.id);

  if (freshPlayer.current_match_id) {
    return res.json({ status: 'matched', matchId: freshPlayer.current_match_id });
  } else {
    return res.json({ status: 'searching' });
  }
});

module.exports = router;
