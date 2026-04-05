const Player = require('./Player');
const Match = require('./Match');

// Player → current match (self-referential FK via current_match_id)
Player.belongsTo(Match, { foreignKey: 'current_match_id', as: 'currentMatch', constraints: false });

// Match → players
Match.belongsTo(Player, { foreignKey: 'player_x_id', as: 'playerX' });
Match.belongsTo(Player, { foreignKey: 'player_o_id', as: 'playerO' });
Match.belongsTo(Player, { foreignKey: 'winner_id', as: 'winner' });

module.exports = { Player, Match };
