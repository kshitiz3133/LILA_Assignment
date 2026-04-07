const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const MatchMove = sequelize.define('MatchMove', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  match_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'matches',
      key: 'id'
    }
  },
  player_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'players',
      key: 'id'
    }
  },
  player_moved_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false,
  },
  player_move: {
    type: DataTypes.ARRAY(DataTypes.INTEGER),
    allowNull: false,
  }
}, {
  tableName: 'match_moves',
  underscored: true,
});

module.exports = MatchMove;
