const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const MatchPlayer = sequelize.define('MatchPlayer', {
  match_id: {
    type: DataTypes.UUID,
    primaryKey: true,
    references: {
      model: 'matches',
      key: 'id'
    }
  },
  player_id: {
    type: DataTypes.UUID,
    primaryKey: true,
    references: {
      model: 'players',
      key: 'id'
    }
  },
  symbol: {
    type: DataTypes.ENUM('X', 'O'),
    allowNull: false
  },
  last_player_moved_at: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
  },
  last_player_move: {
    type: DataTypes.ARRAY(DataTypes.INTEGER),
    allowNull: true,
    defaultValue: null,
  }
}, {
  tableName: 'match_players',
  underscored: true,
  indexes: [
    // Ensure we only assign one 'X' and one 'O' per match natively in the DB
    { unique: true, fields: ['match_id', 'symbol'] }
  ]
});

module.exports = MatchPlayer;
