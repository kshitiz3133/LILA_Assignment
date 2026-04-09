# Ranked Tic-Tac-Toe (Multiplayer)

A production-ready, server-authoritative multiplayer Tic-Tac-Toe game built with **Nakama** and **Next.js**. Features include real-time matchmaking, skill-based ranking (ELO), blitz/classic modes, and robust session persistence.

## 🚀 Features
- **Server-Authoritative Logic**: Game state is managed entirely on the backend to prevent cheating.
- **Real-time Matchmaking**: Pair with opponents globally using Nakama's optimized matchmaker.
- **Ranked System**: Earn/lose ELO points based on match outcomes.
- **Blitz Mode**: Fast-paced 10-second turn timer for high-stakes play.
- **Optimistic UI**: Immediate feedback on board taps for a lag-free experience.
- **Session Persistence**: Reconnect to active matches even after page refreshes or short disconnects.

---

## 🏗 Architecture & Design Decisions

### **Backend: Nakama (Go-based Game Server)**
We moved from a custom Node.js backend to **Nakama** for several architectural advantages:
- **Scalability**: Nakama handles thousands of concurrent WebSockets natively in Go, avoiding Node's single-threaded event loop bottlenecks during matchmaking.
- **Persistence**: Using Nakama's **Storage Engine**, player statistics (wins, losses, rank) are persisted reliably in a NoSQL-style collection (`player_stats`).
- **Match Loop**: authoritative logic runs in a high-frequency tick loop, ensuring game rules (turns, win conditions, timers) are enforced server-side.
- **RPC Endpoints**: Custom logic (like fetching unified stats) is exposed via RPC to simplify frontend data fetching.

### **Frontend: Next.js + Tailwind CSS**
- **Tailwind CSS**: Custom dark-themed UI with glassmorphism and subtle animations.
- **AuthContext**: Centralized authentication flow using Nakama's custom account system, tethered to browser device IDs.
- **Socket Ref Management**: Ensures persistent WebSocket connections throughout the lifecycle of the component.

---

## 🛠 Setup & Installation

### **Prerequisites**
- [Docker & Docker Compose](https://www.docker.com/products/docker-desktop/)
- [Node.js (v18+)](https://nodejs.org/)

### **Backend (Nakama)**
1. Navigate to the server directory:
   ```bash
   cd nakama-server
   ```
2. Build the TypeScript match logic:
   ```bash
   npm install
   npm run build
   ```
3. Start the Nakama stack:
   ```bash
   docker-compose up -d
   ```
   *The server will be available at `http://localhost:7350`.*

### **Frontend (Next.js)**
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure Environment: Create a `.env` file (see `.env.example`):
   ```env
   NEXT_PUBLIC_NAKAMA_HOST="127.0.0.1"
   NEXT_PUBLIC_NAKAMA_PORT="7350"
   NEXT_PUBLIC_NAKAMA_USE_SSL="false"
   NEXT_PUBLIC_NAKAMA_SERVER_KEY="default_server_key"
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```

---

## 🌐 Deployment Documentation

### **Backend (Render)**
The backend is deployed using a custom **Dockerfile** to Render Web Services.
1. **Provision Database**: Create a Render PostgreSQL instance.
2. **Web Service**: Create a new Web Service on Render, pointing to the `nakama-server` root.
3. **Environment Variables**:
   - `DATABASE_URL`: Set this to your Render Internal Postgres URL.
4. **Build**: Render will automatically build the image using the multi-stage Dockerfile provided.

### **Frontend (Vercel)**
1. **Import Project**: Connect GitHub and select the `frontend` directory.
2. **Environment Variables**: Use the production Nakama URL provided by Render. Set `NEXT_PUBLIC_NAKAMA_PORT="443"` and `NEXT_PUBLIC_NAKAMA_USE_SSL="true"`.

---

## 📡 API & Server Configuration

### **Nakama Modules**
- **Auth Hook**: `afterAuthenticateCustom` ensures users are registered with a display name and linked device metadata.
- **Matchmaker Hook**: `matchmakerMatched` creates 1v1 authoritative matches with randomized X/O assignments.
- **RPC**: `get_player_stats` provides the frontend with a clean JSON payload of the user's current standings.

### **Match Config**
- **Tick Rate**: 1Hz (optimized for turn-based play).
- **Grace Period**: 30 seconds for players to rejoin an empty match before termination.
- **Cooldown**: 30 seconds persistence after a game ends to show the victory modal.

---

## 🧪 Testing Multiplayer Functionality

1. **Local Test**:
   - Open two different browsers (e.g., Chrome and Firefox) or one normal window and one Incognito window.
   - Login with two different nicknames.
   - Click "Play Standard" on both. You should be paired within seconds.
2. **Match Reconnection**:
   - Start a match.
   - Refresh the page for one player. The board should restore state automatically.
3. **Forfeit Test**:
   - One player clicks "Forfeit Match".
   - Verify that the other player immediately sees the "Opponent Forfeited" victory modal and stats are updated.
4. **Blitz Mode**:
   - Select "Timed Mode" in the dashboard.
   - Verify that turns automatically transition or forfeit if the 10-second timer hits zero.
