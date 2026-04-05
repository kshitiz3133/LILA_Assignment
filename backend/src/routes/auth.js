const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const { Player } = require('../models');

const schema = Joi.object({
  username: Joi.string().alphanum().min(2).max(50).required(),
});

// POST /auth/register
router.post('/register', async (req, res) => {
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const { username } = value;

  try {
    // Check if username already taken
    let player = await Player.findOne({ where: { username } });

    if (!player) {
      player = await Player.create({ username });
    }

    const token = jwt.sign(
      { id: player.id, username: player.username },
      process.env.JWT_SECRET,
      { expiresIn: '5d' }
    );

    return res.status(200).json({
      token,
      player: {
        id: player.id,
        username: player.username,
        rank: player.rank,
        wins: player.wins,
        losses: player.losses,
        win_streak: player.win_streak,
        best_streak: player.best_streak,
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
