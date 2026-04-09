---
description: How to run the Ranked Tic-Tac-Toe application with Nakama
---

To launch the integrated Nakama and Next.js application, follow these steps:

### 1. Launch Infrastructure
Execute Docker Compose to start the Nakama server and its PostgreSQL database.
// turbo
```bash
cd nakama-server && docker-compose up -d
```

### 2. Build Server Logic
Transpile the authoritative Tic-Tac-Toe engine (TypeScript) into the Nakama runtime directory.
// turbo
```bash
cd nakama-server && npm run build
```

### 3. Start Frontend
Launch the Next.js development server to access the game arena.
// turbo
```bash
cd frontend && npm run dev
```

The application will be accessible at [http://localhost:3000](http://localhost:3000).
Confirm that the Nakama server is running at [http://localhost:7351](http://localhost:7351) (Dashboard).
