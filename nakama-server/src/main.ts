/// <reference path="../node_modules/nakama-runtime/index.d.ts" />

function InitModule(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, initializer: nkruntime.Initializer) {
    logger.info("Ranked Tic-Tac-Toe Nakama Module Loading...");

    try {
        nk.leaderboardCreate("global_rank", true, nkruntime.SortOrder.DESCENDING, nkruntime.Operator.INCREMENTAL, null, {});
        logger.info("Global Rank Leaderboard initialized");
    } catch (e: any) {
        logger.error("Failed to initialize leaderboard: %s", e.message);
    }

    initializer.registerAfterAuthenticateDevice(afterAuthenticateDevice);
    initializer.registerAfterAuthenticateCustom(afterAuthenticateCustom);
    initializer.registerMatchmakerMatched(matchmakerMatched);
    initializer.registerRpc("get_player_stats", rpcGetPlayerStats);

    initializer.registerMatch("tic_tac_toe", {
        matchInit: matchInit,
        matchJoinAttempt: matchJoinAttempt,
        matchJoin: matchJoin,
        matchLeave: matchLeave,
        matchLoop: matchLoop,
        matchSignal: matchSignal,
        matchTerminate: matchTerminate
    });

    logger.info("Ranked Tic-Tac-Toe Nakama Module Loaded");
}

/**
 * Game OpCodes
 */
enum OpCode {
    MOVE = 1,
    UPDATE = 2,
    TIMER = 3,
    GAME_OVER = 4,
    FORFEIT = 5
}

/**
 * Match State
 */
interface State {
    board: (string | null)[];
    marks: { [userId: string]: string };
    presences: { [userId: string]: nkruntime.Presence };
    currentTurn: string;
    lastMoveMs: number;
    gameMode: 'classic' | 'timed';
    winnerId: string | null;
    draw: boolean;
    lastMoveBy: string | null;
    terminateTick: number | null;
    emptySinceTick: number | null;
    forfeitedBy: string | null;
}

/**
 * Authentication Hook
 */
function afterAuthenticateDevice(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, data: nkruntime.Session, request: nkruntime.AuthenticateDeviceRequest) {
    if (!ctx.userId) return;
    try {
        const metadata = {
            last_ip: ctx.clientIp || "unknown",
            last_ua: ctx.vars ? (ctx.vars['user_agent'] || 'unknown') : 'unknown'
        };
        nk.accountUpdateId(ctx.userId, undefined, undefined, undefined, undefined, undefined, undefined, metadata);
    } catch (e: any) {
        logger.error("Failed to update account metadata: %s", e.message);
    }
}

/**
 * Custom Authentication Hook
 */
function afterAuthenticateCustom(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, data: nkruntime.Session, request: nkruntime.AuthenticateCustomRequest) {
    if (!ctx.userId) return;

    try {
        const account = nk.accountGetId(ctx.userId);
        const metadata = account.user.metadata ? JSON.parse(JSON.stringify(account.user.metadata)) : {};

        const deviceId = request.account?.vars?.device_id;
        const clientIp = ctx.clientIp || "unknown";

        // We used to block device mismatch here, but removed it to allow cross-browser/cleared-cache logins
        if (metadata.device_id && metadata.device_id !== deviceId) {
            logger.info("User %s logging in from a new device/browser (IP: %s)", ctx.username, clientIp);
        }

        // Always update to latest device_id so we know their active device
        metadata.device_id = deviceId || metadata.device_id;
        metadata.registration_ip = metadata.registration_ip || clientIp;

        metadata.last_login = Date.now();
        metadata.last_ip = clientIp;

        nk.accountUpdateId(ctx.userId, undefined, undefined, undefined, undefined, undefined, undefined, metadata);

        // Also set the username as the display name if it's not set or is empty
        if (!account.user.displayName || account.user.displayName === account.user.username || account.user.displayName === "") {
            // Use the username from the request/account as the display name
            nk.accountUpdateId(ctx.userId, undefined, account.user.username);
        }

    } catch (e: any) {
        if (e.code) throw e; // Re-throw our custom error
        logger.error("Failed in afterAuthenticateCustom: %s", e.message);
        throw e;
    }
}

/**
 * Matchmaker Matched Hook
 */
function matchmakerMatched(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, matches: nkruntime.MatchmakerResult[]) {
    // Randomly assign X / O
    const users = matches.map(m => m.presence.userId);
    for (let i = users.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [users[i], users[j]] = [users[j], users[i]];
    }

    const matchId = nk.matchCreate("tic_tac_toe", {
        mode: matches[0].properties['mode'] || 'classic',
        player_x: users[0],
        player_o: users[1]
    });
    return matchId;
}

/**
 * Match Handlers
 */
function matchInit(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, params: { [key: string]: string }) {
    const state: State = {
        board: Array(9).fill(null),
        marks: {
            [params['player_x']]: 'X',
            [params['player_o']]: 'O'
        },
        presences: {},
        currentTurn: params['player_x'] || "",
        lastMoveMs: (ctx.matchTickRate || 1) * 1000,
        gameMode: (params['mode'] as any) || 'classic',
        winnerId: null,
        draw: false,
        lastMoveBy: null,
        terminateTick: null,
        emptySinceTick: null,
        forfeitedBy: null
    };
    return { state, tickRate: 1, label: JSON.stringify({ mode: state.gameMode, marks: state.marks }) };
}

function matchJoinAttempt(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, tick: number, state: State, presence: nkruntime.Presence, metadata: { [key: string]: any }) {
    return { state, accept: true };
}

function matchJoin(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, tick: number, state: State, presences: nkruntime.Presence[]) {
    state.emptySinceTick = null; // Clear empty status as someone joined
    presences.forEach(p => {
        state.presences[p.userId] = p;
    });

    // Broadcast update to all players to ensure they know their symbols
    dispatcher.broadcastMessage(OpCode.UPDATE, JSON.stringify({
        board: state.board,
        marks: state.marks,
        currentTurn: state.currentTurn,
        winnerId: state.winnerId,
        draw: state.draw,
        lastMoveBy: state.lastMoveBy
    }));

    return { state };
}

function matchLoop(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, tick: number, state: State, messages: nkruntime.MatchMessage[]) {
    messages.forEach(m => {
        if (m.opCode === OpCode.MOVE) {
            if (m.sender.userId !== state.currentTurn) return;
            const payload = JSON.parse(nk.binaryToString(m.data));
            const index = payload.index;
            if (index < 0 || index >= 9 || state.board[index] || state.winnerId || state.draw) return;
            state.board[index] = state.marks[m.sender.userId];
            state.lastMoveMs = tick;
            state.lastMoveBy = m.sender.userId;

            const winRes = checkWinner(state.board);
            if (winRes) {
                state.winnerId = m.sender.userId;
            } else if (!state.board.includes(null)) {
                state.draw = true;
            } else {
                state.currentTurn = Object.keys(state.presences).find(id => id !== m.sender.userId) || "";
            }
            dispatcher.broadcastMessage(OpCode.UPDATE, JSON.stringify({
                board: state.board,
                marks: state.marks,
                currentTurn: state.currentTurn,
                winnerId: state.winnerId,
                draw: state.draw,
                lastMoveBy: state.lastMoveBy
            }));
        } else if (m.opCode === OpCode.FORFEIT) {
            if (state.winnerId || state.draw) return;
            state.winnerId = Object.keys(state.marks).find(id => id !== m.sender.userId) || null;
            state.forfeitedBy = m.sender.userId;
            // The match processing logic at the bottom of matchLoop will handle the broadcast and termination
        }
    });

    if (state.gameMode === 'timed' && !state.winnerId && !state.draw) {
        const secondsElapsed = tick - state.lastMoveMs;
        if (10 - secondsElapsed <= 0) {
            state.winnerId = Object.keys(state.presences).find(id => id !== state.currentTurn) || null;
            dispatcher.broadcastMessage(OpCode.GAME_OVER, JSON.stringify({ result: 'timeout', winnerId: state.winnerId }));
            return null;
        }
        dispatcher.broadcastMessage(OpCode.TIMER, JSON.stringify({ secondsLeft: 10 - secondsElapsed }));
    }
    if ((state.winnerId || state.draw) && state.terminateTick === null) {
        state.terminateTick = tick + 30; // Wait 30 seconds (30 ticks) before terminating

        try {
            // Helper: read-modify-write player_stats storage object
            const updatePlayerStats = (userId: string, isWinner: boolean, rankDelta: number) => {
                try {
                    const existing = nk.storageRead([
                        { collection: 'player_stats', key: 'stats', userId }
                    ]);
                    const stats = existing.length > 0 ? (existing[0].value as any) : {
                        wins: 0, losses: 0, rank: 1000, win_streak: 0, best_streak: 0
                    };

                    stats.rank = Math.max(0, (stats.rank || 1000) + rankDelta);

                    if (isWinner) {
                        stats.wins = (stats.wins || 0) + 1;
                        stats.win_streak = (stats.win_streak || 0) + 1;
                        stats.best_streak = Math.max(stats.best_streak || 0, stats.win_streak);
                    } else {
                        stats.losses = (stats.losses || 0) + 1;
                        stats.win_streak = 0;
                    }

                    nk.storageWrite([{
                        collection: 'player_stats',
                        key: 'stats',
                        userId,
                        value: stats,
                        permissionRead: 2, // public read
                        permissionWrite: 0 // server only
                    }]);
                } catch (e: any) {
                    logger.error("Failed to update player_stats for %s: %s", userId, e.message);
                }
            };

            if (state.winnerId) {
                const loserId = Object.keys(state.marks).find(id => id !== state.winnerId);

                updatePlayerStats(state.winnerId, true, 30);
                nk.leaderboardRecordWrite("global_rank", state.winnerId, undefined, 30, 0, {});

                if (loserId) {
                    updatePlayerStats(loserId, false, -20);
                    try {
                        nk.leaderboardRecordWrite("global_rank", loserId, undefined, -20, 0, {});
                    } catch (e) { logger.error("Leaderboard loser update failed: %s", e); }
                }
            } else if (state.draw) {
                Object.keys(state.marks).forEach(id => {
                    updatePlayerStats(id, false, 0);
                    try {
                        nk.leaderboardRecordWrite("global_rank", id, undefined, 0, 0, {});
                    } catch (e) { }
                });
            }
        } catch (e: any) {
            logger.error("Failed to record game results: %s", e.message);
        }

        // Broadcast GAME_OVER once
        dispatcher.broadcastMessage(OpCode.GAME_OVER, JSON.stringify({
            result: state.forfeitedBy ? 'forfeit' : (state.draw ? 'draw' : 'finished'),
            winnerId: state.winnerId,
            forfeitedBy: state.forfeitedBy
        }));
    }

    if (state.terminateTick !== null && tick >= state.terminateTick) {
        return null; // End match after cooldown
    }

    // Grace period for empty matches
    if (Object.keys(state.presences).length === 0) {
        if (state.emptySinceTick === null) {
            state.emptySinceTick = tick;
        }
        if (tick - state.emptySinceTick >= 30) {
            return null; // Terminate if empty for >30 seconds
        }
    } else {
        state.emptySinceTick = null;
    }

    return { state };
}

function matchLeave(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, tick: number, state: State, presences: nkruntime.Presence[]) {
    presences.forEach(p => {
        delete state.presences[p.userId];
    });

    return { state };
}

function matchSignal(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, tick: number, state: State, data: string) {
    return { state, data: "" };
}

function matchTerminate(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, tick: number, state: State, graceSeconds: number) {
    return { state };
}

function checkWinner(board: (string | null)[]): string | null {
    const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
    for (const [a, b, c] of lines) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
    }
    return null;
}

function rpcGetPlayerStats(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    const userId = ctx.userId;
    if (!userId) {
        throw new Error("unauthenticated");
    }

    try {
        const existing = nk.storageRead([
            { collection: 'player_stats', key: 'stats', userId }
        ]);
        if (existing.length > 0) {
            return JSON.stringify(existing[0].value);
        } else {
            return JSON.stringify({ wins: 0, losses: 0, rank: 1000, win_streak: 0, best_streak: 0 });
        }
    } catch (e: any) {
        logger.error("Error reading stats for %s: %s", userId, e.message);
        return JSON.stringify({ wins: 0, losses: 0, rank: 1000, win_streak: 0, best_streak: 0 });
    }
}
