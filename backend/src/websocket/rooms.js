/**
 * Room Registry
 * 
 * In-memory Map: matchId → { playerXId, playerOId, wsX, wsO, timerRef }
 * 
 * Each room is fully isolated — one room cannot affect another.
 * Indexed by playerId for quick disconnect lookup.
 */

const rooms = new Map();         // matchId → RoomState
const playerRoomMap = new Map(); // playerId → matchId
const playerWsMap = new Map();   // playerId → WebSocket

function createRoom(matchId, playerXId, playerOId) {
  rooms.set(matchId, {
    matchId,
    playerXId,
    playerOId,
    wsX: null,
    wsO: null,
    timerRef: null,
    disconnectTimers: {},
  });
  playerRoomMap.set(playerXId, matchId);
  playerRoomMap.set(playerOId, matchId);
}

function setPlayerWs(playerId, ws) {
  playerWsMap.set(playerId, ws);
  const matchId = playerRoomMap.get(playerId);
  if (!matchId) return;
  const room = rooms.get(matchId);
  if (!room) return;
  if (room.playerXId === playerId) room.wsX = ws;
  if (room.playerOId === playerId) room.wsO = ws;
}

function getRoom(matchId) {
  return rooms.get(matchId);
}

function getRoomByPlayer(playerId) {
  const matchId = playerRoomMap.get(playerId);
  return matchId ? rooms.get(matchId) : null;
}

function getWsClient(playerId) {
  return playerWsMap.get(playerId) || null;
}

function destroyRoom(matchId) {
  const room = rooms.get(matchId);
  if (!room) return;
  if (room.timerRef) clearInterval(room.timerRef);
  clearDisconnectTimers(room);
  playerRoomMap.delete(room.playerXId);
  playerRoomMap.delete(room.playerOId);
  playerWsMap.delete(room.playerXId);
  playerWsMap.delete(room.playerOId);
  rooms.delete(matchId);
}

function clearDisconnectTimers(room) {
  for (const t of Object.values(room.disconnectTimers)) {
    clearTimeout(t);
  }
  room.disconnectTimers = {};
}

function broadcast(matchId, data) {
  const room = rooms.get(matchId);
  if (!room) return;
  const msg = JSON.stringify(data);
  if (room.wsX && room.wsX.readyState === 1) room.wsX.send(msg);
  if (room.wsO && room.wsO.readyState === 1) room.wsO.send(msg);
}

function sendTo(playerId, data) {
  const ws = playerWsMap.get(playerId);
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(data));
}

module.exports = {
  createRoom, setPlayerWs, getRoom, getRoomByPlayer,
  getWsClient, destroyRoom, broadcast, sendTo, rooms, playerWsMap,
};
