/**
 * Game Service
 * 
 * Server-authoritative logic:
 *  - Validate moves
 *  - Detect win / draw
 *  - Apply rank changes (+30 win / -20 loss)
 *  - Update streaks
 */

const { Player, Match } = require('../models');

const WIN_LINES = [
  [0,1,2],[3,4,5],[6,7,8], // rows
  [0,3,6],[1,4,7],[2,5,8], // cols
  [0,4,8],[2,4,6],         // diags
];

function checkWinner(board) {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] !== ' ' && board[a] === board[b] && board[a] === board[c]) {
      return board[a]; // 'X' or 'O'
    }
  }
  return null;
}

function isDraw(board) {
  return !board.includes(' ');
}

/**
 * Apply a move. Returns { ok, reason, board, currentTurn, gameOver, result, winnerId }
 */
async function applyMove(match, playerId, cell) {
  const board = match.board.split('');
  const symbol = match.player_x_id === playerId ? 'X' : 'O';

  // Validate turn
  if (match.current_turn !== symbol) {
    return { ok: false, reason: 'Not your turn' };
  }
  // Validate cell range
  if (cell < 0 || cell > 8) {
    return { ok: false, reason: 'Invalid cell index' };
  }
  // Validate cell empty
  if (board[cell] !== ' ') {
    return { ok: false, reason: 'Cell already occupied' };
  }

  board[cell] = symbol;
  const boardStr = board.join('');
  const winner = checkWinner(boardStr);
  const draw = !winner && isDraw(boardStr);

  if (winner || draw) {
    let result, winnerId;
    if (winner === 'X') { result = 'x_wins'; winnerId = match.player_x_id; }
    else if (winner === 'O') { result = 'o_wins'; winnerId = match.player_o_id; }
    else { result = 'draw'; winnerId = null; }

    await match.update({
      board: boardStr,
      status: 'finished',
      result,
      winner_id: winnerId,
      finished_at: new Date(),
    });

    await applyRankChanges(match, winnerId, result);

    return { ok: true, board: boardStr, currentTurn: null, gameOver: true, result, winnerId };
  }

  const nextTurn = symbol === 'X' ? 'O' : 'X';
  await match.update({ board: boardStr, current_turn: nextTurn });

  return { ok: true, board: boardStr, currentTurn: nextTurn, gameOver: false };
}

async function applyRankChanges(match, winnerId, result) {
  const playerXId = match.player_x_id;
  const playerOId = match.player_o_id;

  const [playerX, playerO] = await Promise.all([
    Player.findByPk(playerXId),
    Player.findByPk(playerOId),
  ]);

  const updates = {};

  if (result === 'draw') {
    updates[playerXId] = { current_match_id: null };
    updates[playerOId] = { current_match_id: null };
  } else {
    const winner = winnerId === playerXId ? playerX : playerO;
    const loser  = winnerId === playerXId ? playerO : playerX;

    const newWinStreak = winner.win_streak + 1;
    updates[winner.id] = {
      wins: winner.wins + 1,
      rank: winner.rank + 30,
      win_streak: newWinStreak,
      best_streak: Math.max(winner.best_streak, newWinStreak),
      current_match_id: null,
    };
    updates[loser.id] = {
      losses: loser.losses + 1,
      rank: Math.max(0, loser.rank - 20),
      win_streak: 0,
      current_match_id: null,
    };
  }

  await Promise.all(
    Object.entries(updates).map(([id, data]) => Player.update(data, { where: { id } }))
  );

  return { 
    rankChanges: {
      [playerXId]: result === 'draw' ? 0 : (winnerId === playerXId ? +30 : -20),
      [playerOId]: result === 'draw' ? 0 : (winnerId === playerOId ? +30 : -20),
    }
  };
}

/**
 * Apply forfeit (disconnect or timeout). The forfeiting player's ID is provided.
 */
async function applyForfeit(match, forfeitingPlayerId, reason = 'forfeit') {
  const isX = match.player_x_id === forfeitingPlayerId;
  const result = isX ? `x_${reason}` : `o_${reason}`;
  const winnerId = isX ? match.player_o_id : match.player_x_id;

  await match.update({
    status: 'finished',
    result,
    winner_id: winnerId,
    finished_at: new Date(),
  });

  await applyRankChanges(match, winnerId, result);

  return { result, winnerId };
}

module.exports = { applyMove, applyForfeit, applyRankChanges };
