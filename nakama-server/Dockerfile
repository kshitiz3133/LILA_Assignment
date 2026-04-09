# Build Stage
FROM node:18-alpine AS builder

WORKDIR /backend
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Run Stage
FROM heroiclabs/nakama:3.15.0

# Copy compiled TypeScript modules from builder stage
COPY --from=builder /backend/data/modules/dist/main.js /nakama/data/modules/dist/main.js

# Copy the local Nakama configuration (optional, as Render uses env vars, but useful for defaults)
COPY data/local.yml /nakama/data/local.yml

# Render automatically assigns the PORT environment variable. Nakama usually runs on 7350 for websocket traffic.
ENV PORT=7350

# Render provides DATABASE_URL, e.g. postgres://user:password@host/dbname. We map this to Nakama's database requirement
ENTRYPOINT ["/bin/sh", "-ecx", "/nakama/nakama migrate up --database.address $DATABASE_URL && /nakama/nakama --config /nakama/data/local.yml --name nakama1 --database.address $DATABASE_URL --socket.port $PORT --console.port 7351"]
