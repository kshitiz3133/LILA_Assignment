const express = require('express');
const router = express.Router();
const { Player } = require('../models');
const { Op } = require('sequelize');
const sequelize = require('../config/db');

// GET /leaderboard?page=1&limit=50
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = ((parseInt(req.query.page) || 1) - 1) * limit;

    const players = await Player.findAll({
      attributes: [
        'id', 'username', 'rank', 'wins', 'losses', 'win_streak', 'best_streak',
        [
          sequelize.literal(`CASE WHEN (wins + losses) = 0 THEN 0 ELSE ROUND(wins::numeric / (wins + losses) * 100, 1) END`),
          'win_rate',
        ],
      ],
      order: [['rank', 'DESC']],
      limit,
      offset,
    });

    return res.json(players);
  } catch (err) {
    console.error('Leaderboard error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
