const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { Player, Match, MatchPlayer } = require('../models');

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

    // Include last_player_moved_at from MatchPlayer rows
    const matchPlayers = await MatchPlayer.findAll({ where: { match_id: match.id } });
    const mpX = matchPlayers.find(mp => mp.symbol === 'X');
    const mpO = matchPlayers.find(mp => mp.symbol === 'O');

    const lastMovedAt = {
      X: mpX?.last_player_moved_at || null,
      O: mpO?.last_player_moved_at || null,
    };

    // Derive currentTurn from lastMovedAt
    const xTime = lastMovedAt.X ? new Date(lastMovedAt.X).getTime() : 0;
    const oTime = lastMovedAt.O ? new Date(lastMovedAt.O).getTime() : 0;
    const currentTurn = (xTime === 0 && oTime === 0) ? 'X' : (xTime > oTime ? 'O' : 'X');

    const response = { ...match.toJSON(), lastMovedAt, currentTurn };

    // Include game over details for finished matches
    if (match.status === 'finished') {
      const playerX = match.playerX;
      const playerO = match.playerO;
      const winnerId = match.winner_id;

      response.winnerId = winnerId;
      response.winnerUsername = match.winner?.username || null;
      response.players = {
        X: { id: playerX?.id, username: playerX?.username, rank: playerX?.rank },
        O: { id: playerO?.id, username: playerO?.username, rank: playerO?.rank },
      };

      // Derive rank changes from result
      const result = match.result;
      if (result === 'draw') {
        response.rankChanges = { [match.player_x_id]: 0, [match.player_o_id]: 0 };
      } else if (winnerId) {
        response.rankChanges = {
          [match.player_x_id]: winnerId === match.player_x_id ? +30 : -20,
          [match.player_o_id]: winnerId === match.player_o_id ? +30 : -20,
        };
      }
    }

    return res.json(response);
  } catch (err) {
    console.error('Get match error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /matches/:id/forfeit
router.post('/:id/forfeit', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const match = await Match.findByPk(id);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    if (match.status === 'finished') return res.status(400).json({ error: 'Match already finished' });
    
    // Only players in the match can forfeit
    if (match.player_x_id !== req.player.id && match.player_o_id !== req.player.id) {
       return res.status(403).json({ error: 'Forbidden' });
    }

    const { applyForfeit } = require('../services/game');
    const { clearTurnTimer } = require('../services/timer');
    const { broadcast, destroyRoom } = require('../websocket/rooms');

    const resultData = await applyForfeit(match, req.player.id, 'forfeit');
    
    clearTurnTimer(id);
    broadcast(id, {
        type: 'game_over',
        board: match.board,
        result: resultData.result,
        winnerId: resultData.winnerId,
        rankChanges: resultData.rankChanges
    });
    destroyRoom(id);

    return res.json({ success: true, ...resultData });
  } catch (err) {
    console.error('Forfeit error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
