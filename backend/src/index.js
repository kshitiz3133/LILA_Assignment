const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const url = require('url');
require('dotenv').config();

const sequelize = require('./config/db');
require('./models/index'); // register associations

const authRouter = require('./routes/auth');
const matchmakingRouter = require('./routes/matchmaking');
const matchesRouter = require('./routes/matches');
const leaderboardRouter = require('./routes/leaderboard');
const playersRouter = require('./routes/players');

const { handleConnection } = require('./websocket/handler');
const { startMatchmakingLoop } = require('./services/matchmaking');

const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// REST routes
app.use('/auth', authRouter);
app.use('/matchmaking', matchmakingRouter);
app.use('/matches', matchesRouter);
app.use('/leaderboard', leaderboardRouter);
app.use('/players', playersRouter);

// 404 handler
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// HTTP + WS server
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const { pathname } = url.parse(req.url);
  if (pathname === '/game') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', handleConnection);

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await sequelize.authenticate();
    console.log('[DB] Connected to PostgreSQL');

    // Sync models (creates/alters tables)
    await sequelize.sync({ alter: true });
    console.log('[DB] Models synced');

    startMatchmakingLoop();

    server.listen(PORT, () => {
      console.log(`[Server] HTTP  → http://localhost:${PORT}`);
      console.log(`[Server] WS    → ws://localhost:${PORT}/game`);
    });
  } catch (err) {
    console.error('[Server] Startup failed:', err);
    process.exit(1);
  }
}

start();
