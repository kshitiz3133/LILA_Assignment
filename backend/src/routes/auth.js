const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const { Player } = require('../models');

const schema = Joi.object({
  username: Joi.string().alphanum().min(2).max(50).required(),
});

// POST /auth/register OR /auth/login
router.post(['/register', '/login'], async (req, res) => {
  // Strip unknown properties (like password if still sent by old clients)
  const { error, value } = schema.validate(req.body, { stripUnknown: true });
  if (error) return res.status(400).json({ error: error.details[0].message });

  const { username } = value;
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  try {
    // Check if username already taken
    let player = await Player.findOne({ where: { username } });

    if (player) {
      // If it exists, verify IP
      if (player.ip_address && player.ip_address !== clientIp) {
        return res.status(401).json({ error: 'This username is registered to another device/IP.' });
      }
      // If ip_address is null (old account), bind it now
      if (!player.ip_address) {
        player.ip_address = clientIp;
        await player.save();
      }
    } else {
      // Create new bound account
      player = await Player.create({ username, ip_address: clientIp });
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
        current_match_id: player.current_match_id,
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});



const authMiddleware = require('../middleware/auth');

// GET /auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const player = await Player.findByPk(req.player.id);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    return res.status(200).json({
      player: {
        id: player.id,
        username: player.username,
        rank: player.rank,
        wins: player.wins,
        losses: player.losses,
        win_streak: player.win_streak,
        best_streak: player.best_streak,
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
