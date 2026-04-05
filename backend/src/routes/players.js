const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { Player } = require('../models');
const sequelize = require('../config/db');

// GET /players/me — own profile
router.get('/me', auth, async (req, res) => {
  try {
    const player = await Player.findByPk(req.player.id, {
      attributes: [
        'id', 'username', 'rank', 'wins', 'losses', 'win_streak', 'best_streak',
        'is_online', 'last_active_at', 'current_match_id',
        [
          sequelize.literal(`CASE WHEN (wins + losses) = 0 THEN 0 ELSE ROUND(wins::numeric / (wins + losses) * 100, 1) END`),
          'win_rate',
        ],
      ],
    });
    if (!player) return res.status(404).json({ error: 'Player not found' });
    return res.json(player);
  } catch (err) {
    console.error('Get profile error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
