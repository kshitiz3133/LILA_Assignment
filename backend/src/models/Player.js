const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Player = sequelize.define('Player', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  username: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
  },
  ip_address: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  rank: {
    type: DataTypes.INTEGER,
    defaultValue: 1000,
  },
  wins: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  losses: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  win_streak: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  best_streak: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  search_started_at: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
  },
  search_mode: {
    type: DataTypes.ENUM('classic', 'timed'),
    allowNull: true,
    defaultValue: null,
  },
  is_online: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  last_active_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  current_match_id: {
    type: DataTypes.UUID,
    allowNull: true,
    defaultValue: null,
  },
}, {
  tableName: 'players',
  underscored: true,
});

module.exports = Player;
