const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Match = sequelize.define('Match', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  player_x_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  player_o_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  board: {
    type: DataTypes.CHAR(9),
    defaultValue: '         ', // 9 spaces
  },
  current_turn: {
    type: DataTypes.CHAR(1),
    defaultValue: 'X',
  },
  status: {
    type: DataTypes.ENUM('waiting', 'started', 'active', 'finished'),
    defaultValue: 'waiting',
  },
  game_mode: {
    type: DataTypes.ENUM('classic', 'timed'),
    defaultValue: 'classic',
  },
  turn_deadline: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
  },
  result: {
    type: DataTypes.ENUM('x_wins', 'o_wins', 'draw', 'x_forfeit', 'o_forfeit', 'x_timeout', 'o_timeout'),
    allowNull: true,
    defaultValue: null,
  },
  winner_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  started_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  finished_at: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
  },
}, {
  tableName: 'matches',
  underscored: true,
});

module.exports = Match;
