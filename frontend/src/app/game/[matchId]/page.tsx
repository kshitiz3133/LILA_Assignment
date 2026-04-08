"use client";

import { useAuth } from '@/context/AuthContext';
import NavBar from '@/components/NavBar';
import GameBoard from '@/components/GameBoard';
import { useCallback, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, AlertCircle, ArrowLeft, Loader2, Users, Crown, Minus, Frown, Swords } from 'lucide-react';
import confetti from 'canvas-confetti';
import Link from 'next/link';
import React from 'react';
import { BACKEND_BASEURL, WS_BACKEND_BASEURL } from '@/constants/config';
import api from '@/lib/api';

// Next.js App router specific page generic
export default function GamePage({ params }: { params: any }) {
    // Extract params via React.use
    const unwrappedParams = React.use(params) as { matchId: string };
    const matchId = unwrappedParams.matchId;

    const { user, token, refreshUser } = useAuth();
    const router = useRouter();

    const [board, setBoard] = useState<(string | null)[]>(Array(9).fill(null));

    const normalizeBoard = (b: any) => {
        if (!b) return Array(9).fill(null);
        const arr = typeof b === 'string' ? b.split('') : b;
        return arr.map((c: string) => (c === ' ' || !c) ? null : c);
    };
    const [status, setStatus] = useState<string>('connecting');
    const [currentTurn, setCurrentTurn] = useState<string>('');
    const [mySymbol, setMySymbol] = useState<'X' | 'O' | null>(null);
    const [gameOverResult, setGameOverResult] = useState<{
        result: string;
        winnerId?: string;
        winnerUsername?: string;
        players?: { X: { id: string; username: string; rank: number }; O: { id: string; username: string; rank: number } };
        rankChanges?: any;
    } | null>(null);
    const [lastMovedAt, setLastMovedAt] = useState<{ X: string | null; O: string | null }>({ X: null, O: null });
    const [error, setError] = useState<string>('');
    const [showForfeitModal, setShowForfeitModal] = useState(false);

    console.log("[Game State]", { status, currentTurn, mySymbol, isMyTurn: status === 'playing' && currentTurn === mySymbol });

    const wsRef = useRef<WebSocket | null>(null);
    const pollRef = useRef<NodeJS.Timeout | null>(null);
    const ackTimerRef = useRef<NodeJS.Timeout | null>(null);
    const statusRef = useRef(status);
    const userRef = useRef(user);
    const mySymbolRef = useRef(mySymbol);
    const matchIdRef = useRef(matchId);

    statusRef.current = status;
    userRef.current = user;
    mySymbolRef.current = mySymbol;
    matchIdRef.current = matchId;

    // Reset state when matchId changes (prevents modal leakage)
    useEffect(() => {
        setBoard(Array(9).fill(null));
        setStatus('connecting');
        setCurrentTurn('');
        setMySymbol(null);
        setGameOverResult(null);
        setError('');
        setShowForfeitModal(false);
    }, [matchId]);

    function fireConfetti() {
        const duration = 3000;
        const end = Date.now() + duration;

        const frame = () => {
            confetti({
                particleCount: 3,
                angle: 60,
                spread: 55,
                origin: { x: 0, y: 0.7 },
                colors: ['#a78bfa', '#8b5cf6', '#10b981', '#f59e0b', '#ffffff'],
            });
            confetti({
                particleCount: 3,
                angle: 120,
                spread: 55,
                origin: { x: 1, y: 0.7 },
                colors: ['#a78bfa', '#8b5cf6', '#10b981', '#f59e0b', '#ffffff'],
            });
            if (Date.now() < end) requestAnimationFrame(frame);
        };
        frame();

        // Big burst in the center
        setTimeout(() => {
            confetti({
                particleCount: 100,
                spread: 100,
                origin: { x: 0.5, y: 0.4 },
                colors: ['#a78bfa', '#8b5cf6', '#10b981', '#f59e0b', '#ffffff'],
            });
        }, 300);
    }

    // Apply match data from any source (WS or REST)
    function applyMatchData(data: any) {
        // ID Validation: ignore data from stale/different matches
        const incomingId = data.matchId || data.id;
        if (incomingId && String(incomingId) !== String(matchIdRef.current)) {
            console.warn("[Sync] Ignoring data for different matchId:", incomingId);
            return;
        }

        const u = userRef.current;
        if (data.player_x_id && u) {
            if (data.player_x_id === u.id) setMySymbol('X');
            else if (data.player_o_id === u.id) setMySymbol('O');
        }
        if (data.symbol) setMySymbol(data.symbol);
        if (data.board) setBoard(normalizeBoard(data.board));
        if (data.currentTurn) setCurrentTurn(data.currentTurn);
        if (data.lastMovedAt) setLastMovedAt(data.lastMovedAt);

        if (data.status === 'finished') {
            setStatus('finished');
            refreshUser();
            // Build game over result from REST or WS data
            if (data.winnerId !== undefined || data.result) {
                setGameOverResult(prev => {
                    // Don't overwrite if already set (WS arrived first)
                    if (prev) return prev;
                    return {
                        result: data.result,
                        winnerId: data.winnerId || data.winner_id,
                        winnerUsername: data.winnerUsername || data.winner?.username || null,
                        players: data.players || (data.playerX && data.playerO ? {
                            X: { id: data.playerX.id, username: data.playerX.username, rank: data.playerX.rank },
                            O: { id: data.playerO.id, username: data.playerO.username, rank: data.playerO.rank },
                        } : undefined),
                        rankChanges: data.rankChanges,
                    };
                });
                // Fire confetti if we won
                const winnerId = data.winnerId || data.winner_id;
                if (winnerId && winnerId === u?.id) {
                    fireConfetti();
                }
            }
        } else if (data.currentTurn && data.lastMovedAt) {
            setStatus('playing');
        }
    }

    // REST poll: fetch latest match state
    function fetchMatchState(tkn: string) {
        fetch(`${BACKEND_BASEURL}/matches/${matchId}`, {
            headers: { Authorization: `Bearer ${tkn}` }
        })
            .then(res => res.json())
            .then(data => applyMatchData(data))
            .catch(e => console.error('[Poll] fetch error', e));
    }

    // WebSocket connection with auto-reconnect + REST poll fallback
    useEffect(() => {
        if (!token) return;

        let reconnectTimer: NodeJS.Timeout | null = null;
        let destroyed = false;

        function stopPolling() {
            if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
            }
        }

        function startPolling() {
            if (pollRef.current) return;
            fetchMatchState(token!);
            pollRef.current = setInterval(() => fetchMatchState(token!), 2000);
        }

        function connect() {
            if (destroyed) return;
            if (wsRef.current && wsRef.current.readyState <= 1) return;

            const ws = new WebSocket(`${WS_BACKEND_BASEURL}/game?token=${token}`);
            wsRef.current = ws;

            // Connection Timeout: if not open in 3.5s, start polling
            const connTimeout = setTimeout(() => {
                if (ws.readyState !== WebSocket.OPEN) {
                    console.log("[WS] Connection timeout, falling back to polling");
                    startPolling();
                }
            }, 3500);

            ws.onopen = () => {
                clearTimeout(connTimeout);
                console.log('[WS] Connected, sending join_match');
                stopPolling();
                ws.send(JSON.stringify({ type: 'join_match', matchId }));
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                console.log("[WS Message]", data);

                switch (data.type) {
                    case 'joined_match':
                        applyMatchData(data);
                        break;
                    case 'game_started':
                        setStatus('playing');
                        if (data.board) setBoard(normalizeBoard(data.board));
                        if (data.currentTurn) setCurrentTurn(data.currentTurn);
                        if (data.lastMovedAt) setLastMovedAt(data.lastMovedAt);
                        break;
                    case 'move_accepted':
                        // Server confirmed — cancel fallback timer, apply authoritative state
                        if (ackTimerRef.current) { clearTimeout(ackTimerRef.current); ackTimerRef.current = null; }
                        setBoard(normalizeBoard(data.board));
                        if (data.currentTurn) setCurrentTurn(data.currentTurn);
                        if (data.lastMovedAt) setLastMovedAt(data.lastMovedAt);
                        // If this move ended the game, show game over immediately
                        if (data.gameOver) {
                            setStatus('finished');
                            refreshUser();
                            setGameOverResult({
                                result: data.result,
                                winnerId: data.winnerId,
                                winnerUsername: data.winnerUsername,
                                players: data.players,
                                rankChanges: data.rankChanges,
                            });
                            if (data.winnerId && data.winnerId === userRef.current?.id) {
                                fireConfetti();
                            }
                            stopPolling();
                        }
                        break;
                    case 'board_update':
                        if (ackTimerRef.current) { clearTimeout(ackTimerRef.current); ackTimerRef.current = null; }
                        setBoard(normalizeBoard(data.board));
                        setCurrentTurn(data.currentTurn);
                        if (data.lastMovedAt) setLastMovedAt(data.lastMovedAt);
                        break;
                    case 'game_over':
                        setStatus('finished');
                        refreshUser();
                        if (data.board) setBoard(normalizeBoard(data.board));
                        setGameOverResult({
                            result: data.result,
                            winnerId: data.winnerId,
                            winnerUsername: data.winnerUsername,
                            players: data.players,
                            rankChanges: data.rankChanges,
                        });
                        // Fire confetti on victory
                        if (data.winnerId && data.winnerId === userRef.current?.id) {
                            fireConfetti();
                        }
                        stopPolling();
                        break;
                    case 'reconnected':
                        setBoard(normalizeBoard(data.board));
                        setCurrentTurn(data.currentTurn);
                        if (data.lastMovedAt) setLastMovedAt(data.lastMovedAt);
                        setStatus('playing');
                        break;
                    case 'move_rejected':
                        // Cancel ack timer and revert optimistic update via REST
                        if (ackTimerRef.current) { clearTimeout(ackTimerRef.current); ackTimerRef.current = null; }
                        if (token) fetchMatchState(token);
                        setError(data.reason || 'Move rejected');
                        setTimeout(() => setError(''), 3000);
                        break;
                    case 'error':
                        setError(data.message || 'An error occurred');
                        setTimeout(() => setError(''), 3000);
                        break;
                }
            };

            ws.onclose = () => {
                wsRef.current = null;
                if (destroyed) return;
                if (statusRef.current === 'finished') return;
                // Fallback to REST polling while WS is down
                startPolling();
                // Try to reconnect WS after 3s
                reconnectTimer = setTimeout(connect, 3000);
            };
        }

        // Kick off WS + immediate REST fetch in parallel
        connect();
        fetchMatchState(token);

        return () => {
            destroyed = true;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            stopPolling();
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [token, matchId]); // Only depends on token & matchId — stable across user hydration

    const handleMove = (index: number) => {
        if (status !== 'playing' || currentTurn !== mySymbol) return;
        const symbol = mySymbolRef.current;
        if (!symbol) return;

        // 1. Optimistic UI: paint the move and flip turn immediately
        setBoard(prev => {
            const next = [...prev];
            next[index] = symbol;
            return next;
        });
        const nextTurn = symbol === 'X' ? 'O' : 'X';
        setCurrentTurn(nextTurn);

        // 2. Send to WS
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'make_move', matchId, cell: index }));
        }

        // 3. Start 2s ack timer — if no WS ack arrives, fall back to REST
        if (ackTimerRef.current) clearTimeout(ackTimerRef.current);
        ackTimerRef.current = setTimeout(() => {
            console.log('[Ack] No WS ack in 2s, falling back to REST');
            if (token) fetchMatchState(token);
        }, 2000);
    };

    const confirmForfeit = async () => {
        console.log("Confirming forfeit for match:", matchId);
        try {
            await api.post(`/matches/${matchId}/forfeit`);
            setShowForfeitModal(false);
            // Fetch final match state to update UI (game_over, rank changes, etc.)
            if (token) fetchMatchState(token);
        } catch (err: any) {
            console.error("Forfeit API Error:", err.response?.data || err.message);
            setError("Failed to forfeit. Try again.");
            setShowForfeitModal(false);
        }
    };

    const isMyTurn = status === 'playing' && currentTurn === mySymbol;

    return (
        <div className="min-h-screen flex flex-col">
            <NavBar />

            <main className="flex-1 max-w-4xl w-full mx-auto p-4 flex flex-col justify-center pb-20 relative">
                {status === 'playing' || status === 'waiting' ? (
                    <button
                        onClick={() => setShowForfeitModal(true)}
                        className="absolute top-4 left-4 text-gray-400 hover:text-white flex items-center gap-2 transition bg-dark-800/50 px-4 py-2 rounded-full border border-dark-400 backdrop-blur-md"
                    >
                        <AlertCircle className="w-4 h-4" /> Forfeit Match
                    </button>
                ) : (
                    <Link href="/" className="absolute top-4 left-4 text-gray-400 hover:text-white flex items-center gap-2 transition bg-dark-800/50 px-4 py-2 rounded-full border border-dark-400 backdrop-blur-md">
                        <ArrowLeft className="w-4 h-4" /> Exit Match
                    </Link>
                )}

                {error && (
                    <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-error/20 border border-error/50 text-error px-6 py-3 rounded-full shadow-lg flex items-center gap-2 z-50">
                        <AlertCircle className="w-5 h-5" /> <span>{error}</span>
                    </div>
                )}

                <div className="text-center mb-8 mt-16">
                    <h2 className="text-3xl font-bold text-white mb-2">Ranked Arena</h2>
                    <div className="flex items-center justify-center gap-3">
                        <span className={`px-4 py-1.5 rounded-full text-sm font-bold border flex items-center gap-2 ${mySymbol === 'X' ? 'bg-brand-500/10 border-brand-500/50 text-brand-400' : 'bg-success/10 border-success/50 text-success'}`}>
                            <Users className="w-4 h-4" /> You play as {mySymbol || '?'}
                        </span>
                        <span className={`px-4 py-1.5 rounded-full text-sm font-bold border ${status === 'playing' ? 'bg-blue-500/10 border-blue-500/50 text-blue-400' : status === 'waiting' ? 'bg-yellow-500/10 border-yellow-500/50 text-yellow-400' : 'bg-dark-800 border-dark-400 text-gray-400'}`}>
                            {status === 'connecting' && 'Connecting...'}
                            {status === 'waiting' && 'Waiting for opponent...'}
                            {status === 'playing' && (isMyTurn ? 'Your Turn' : "Opponent's Turn")}
                            {status === 'disconnected' && 'Disconnected'}
                            {status === 'finished' && 'Game Over'}
                        </span>
                    </div>
                </div>

                <GameBoard
                    board={board}
                    onMove={handleMove}
                    disabled={status !== 'playing' || !isMyTurn}
                    mySymbol={mySymbol}
                />

                <AnimatePresence>
                    {status === 'finished' && gameOverResult && (() => {
                        const isWin = gameOverResult.winnerId === user?.id;
                        const isDraw = gameOverResult.result === 'draw';
                        const isLoss = !isDraw && !isWin;
                        const myRankChange = gameOverResult.rankChanges?.[user!.id] ?? 0;
                        const isForfeit = gameOverResult.result?.includes('forfeit');

                        return (
                            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.8, y: 40 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                                    className={`w-full max-w-md rounded-3xl p-8 text-center shadow-2xl border-2 relative overflow-hidden ${isWin
                                        ? 'bg-gradient-to-b from-dark-800 to-dark-900 border-brand-500/50 shadow-[0_0_80px_rgba(139,92,246,0.3)]'
                                        : isDraw
                                            ? 'bg-gradient-to-b from-dark-800 to-dark-900 border-yellow-500/40 shadow-[0_0_60px_rgba(245,158,11,0.2)]'
                                            : 'bg-gradient-to-b from-dark-800 to-dark-900 border-error/40 shadow-[0_0_60px_rgba(239,68,68,0.2)]'
                                        }`}
                                >
                                    {/* Glow effect */}
                                    <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 rounded-full blur-3xl opacity-20 ${isWin ? 'bg-brand-500' : isDraw ? 'bg-yellow-500' : 'bg-error'
                                        }`} />

                                    {/* Icon */}
                                    <motion.div
                                        initial={{ scale: 0, rotate: -180 }}
                                        animate={{ scale: 1, rotate: 0 }}
                                        transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
                                        className={`relative mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-5 ${isWin
                                            ? 'bg-brand-500/20 ring-2 ring-brand-500/40'
                                            : isDraw
                                                ? 'bg-yellow-500/20 ring-2 ring-yellow-500/40'
                                                : 'bg-error/20 ring-2 ring-error/40'
                                            }`}
                                    >
                                        {isWin && <Crown className="w-10 h-10 text-brand-400" />}
                                        {isDraw && <Minus className="w-10 h-10 text-yellow-400" />}
                                        {isLoss && <Frown className="w-10 h-10 text-error" />}
                                    </motion.div>

                                    {/* Title */}
                                    <motion.h3
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.3 }}
                                        className={`text-4xl font-black mb-1 ${isWin ? 'text-brand-400' : isDraw ? 'text-yellow-400' : 'text-error'
                                            }`}
                                    >
                                        {isWin ? 'Victory!' : isDraw ? 'Draw!' : 'Defeat'}
                                    </motion.h3>

                                    {/* Subtitle */}
                                    <motion.p
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 0.4 }}
                                        className="text-gray-400 text-sm mb-6"
                                    >
                                        {isForfeit
                                            ? (isWin ? 'Your opponent surrendered' : 'You surrendered')
                                            : (isWin ? 'You outplayed your opponent!' : isDraw ? 'A hard-fought battle' : 'Better luck next time')}
                                    </motion.p>

                                    {/* Winner banner */}
                                    {gameOverResult.winnerUsername && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: 0.45 }}
                                            className="flex items-center justify-center gap-2 mb-5"
                                        >
                                            <Trophy className="w-4 h-4 text-yellow-400" />
                                            <span className="text-sm font-semibold text-yellow-300">
                                                {gameOverResult.winnerUsername} wins!
                                            </span>
                                        </motion.div>
                                    )}

                                    {/* Players & Rank Changes */}
                                    {gameOverResult.players && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.5 }}
                                            className="bg-dark-900/80 border border-dark-400 rounded-2xl p-4 mb-6"
                                        >
                                            <div className="flex items-center justify-between">
                                                {/* Player X */}
                                                <div className="flex-1 text-center">
                                                    <p className={`text-xs font-bold mb-1 ${gameOverResult.players.X.id === user?.id ? 'text-brand-400' : 'text-gray-500'}`}>
                                                        {gameOverResult.players.X.id === user?.id ? 'YOU' : 'OPP'}
                                                    </p>
                                                    <p className="text-white font-bold text-sm truncate px-1">{gameOverResult.players.X.username}</p>
                                                    <div className="flex items-center justify-center gap-1 mt-1">
                                                        <span className="text-xs text-gray-400">ELO {gameOverResult.players.X.rank}</span>
                                                    </div>
                                                    {gameOverResult.rankChanges && (
                                                        <p className={`text-lg font-black mt-1 ${gameOverResult.rankChanges[gameOverResult.players.X.id] > 0 ? 'text-success' :
                                                            gameOverResult.rankChanges[gameOverResult.players.X.id] < 0 ? 'text-error' : 'text-gray-400'
                                                            }`}>
                                                            {gameOverResult.rankChanges[gameOverResult.players.X.id] > 0 ? '+' : ''}
                                                            {gameOverResult.rankChanges[gameOverResult.players.X.id]}
                                                        </p>
                                                    )}
                                                </div>

                                                {/* VS divider */}
                                                <div className="px-3">
                                                    <Swords className="w-5 h-5 text-dark-400" />
                                                </div>

                                                {/* Player O */}
                                                <div className="flex-1 text-center">
                                                    <p className={`text-xs font-bold mb-1 ${gameOverResult.players.O.id === user?.id ? 'text-brand-400' : 'text-gray-500'}`}>
                                                        {gameOverResult.players.O.id === user?.id ? 'YOU' : 'OPP'}
                                                    </p>
                                                    <p className="text-white font-bold text-sm truncate px-1">{gameOverResult.players.O.username}</p>
                                                    <div className="flex items-center justify-center gap-1 mt-1">
                                                        <span className="text-xs text-gray-400">ELO {gameOverResult.players.O.rank}</span>
                                                    </div>
                                                    {gameOverResult.rankChanges && (
                                                        <p className={`text-lg font-black mt-1 ${gameOverResult.rankChanges[gameOverResult.players.O.id] > 0 ? 'text-success' :
                                                            gameOverResult.rankChanges[gameOverResult.players.O.id] < 0 ? 'text-error' : 'text-gray-400'
                                                            }`}>
                                                            {gameOverResult.rankChanges[gameOverResult.players.O.id] > 0 ? '+' : ''}
                                                            {gameOverResult.rankChanges[gameOverResult.players.O.id]}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}

                                    {/* Your rank change highlight (fallback if no players data) */}
                                    {!gameOverResult.players && gameOverResult.rankChanges && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.5 }}
                                            className="bg-dark-900 border border-dark-400 rounded-xl p-4 mb-6"
                                        >
                                            <p className="text-sm font-medium text-gray-400 mb-1">Rank Change</p>
                                            <p className={`text-2xl font-bold ${myRankChange > 0 ? 'text-success' : myRankChange < 0 ? 'text-error' : 'text-gray-300'}`}>
                                                {myRankChange > 0 ? '+' : ''}{myRankChange}
                                            </p>
                                        </motion.div>
                                    )}

                                    {/* Actions */}
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.6 }}
                                        className="flex gap-3"
                                    >
                                        <Link href="/play" className="flex-1 bg-brand-600 hover:bg-brand-500 text-white py-3.5 rounded-xl font-bold transition shadow-lg shadow-brand-500/30 flex items-center justify-center gap-2">
                                            <Swords className="w-4 h-4" /> Play Again
                                        </Link>
                                        <Link href="/leaderboard" className="flex-1 bg-dark-400 hover:bg-dark-400/80 text-white py-3.5 rounded-xl font-bold transition flex items-center justify-center gap-2">
                                            <Trophy className="w-4 h-4" /> Leaderboard
                                        </Link>
                                    </motion.div>
                                </motion.div>
                            </div>
                        );
                    })()}

                    {showForfeitModal && (status === 'playing' || status === 'waiting') && (
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="bg-dark-800 border border-brand-500/30 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl"
                            >
                                <AlertCircle className="w-16 h-16 text-error mx-auto mb-4" />
                                <h3 className="text-2xl font-bold text-white mb-2">Forfeit Match?</h3>
                                <p className="text-gray-400 mb-8">
                                    Are you sure you want to surrender? This will result in an immediate loss and a -20 ELO rank penalty.
                                </p>
                                <div className="flex gap-4">
                                    <button
                                        onClick={() => setShowForfeitModal(false)}
                                        className="flex-1 bg-dark-400 hover:bg-dark-400/80 text-white py-3 rounded-xl font-bold transition"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={confirmForfeit}
                                        className="flex-1 bg-error hover:bg-error/80 text-white py-3 rounded-xl font-bold transition shadow-lg shadow-error/30"
                                    >
                                        Yes, Forfeit
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

            </main>
        </div>
    );
}
