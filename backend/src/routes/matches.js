const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { Player, Match } = require('../models');

// GET /matches/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const match = await Match.findByPk(req.params.id, {
      include: [
        { model: Player, as: 'playerX', attributes: ['id', 'username', 'rank'] },
        { model: Player, as: 'playerO', attributes: ['id', 'username', 'rank'] },
        { model: Player, as: 'winner', attributes: ['id', 'username'] },
      ],
    });

    if (!match) return res.status(404).json({ error: 'Match not found' });

    // Only players in the match can view it
    const playerId = req.player.id;
    if (match.player_x_id !== playerId && match.player_o_id !== playerId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    return res.json(match);
  } catch (err) {
    console.error('Get match error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
