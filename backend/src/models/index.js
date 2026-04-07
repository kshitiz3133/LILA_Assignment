const Player = require('./Player');
const Match = require('./Match');
const MatchPlayer = require('./MatchPlayer');
const MatchMove = require('./MatchMove');

// Player → current match (self-referential FK via current_match_id)
Player.belongsTo(Match, { foreignKey: 'current_match_id', as: 'currentMatch', constraints: false });

// Match → players
Match.belongsTo(Player, { foreignKey: 'player_x_id', as: 'playerX' });
Match.belongsTo(Player, { foreignKey: 'player_o_id', as: 'playerO' });
Match.belongsTo(Player, { foreignKey: 'winner_id', as: 'winner' });

// MatchPlayer associations
Match.hasMany(MatchPlayer, { foreignKey: 'match_id' });
MatchPlayer.belongsTo(Match, { foreignKey: 'match_id' });
Player.hasMany(MatchPlayer, { foreignKey: 'player_id' });
MatchPlayer.belongsTo(Player, { foreignKey: 'player_id' });

// MatchMove associations
Match.hasMany(MatchMove, { foreignKey: 'match_id', as: 'moves' });
MatchMove.belongsTo(Match, { foreignKey: 'match_id' });
Player.hasMany(MatchMove, { foreignKey: 'player_id', as: 'moves' });
MatchMove.belongsTo(Player, { foreignKey: 'player_id' });

module.exports = { Player, Match, MatchPlayer, MatchMove };
