"use client";

import { useAuth } from '@/context/AuthContext';
import NavBar from '@/components/NavBar';
import GameBoard from '@/components/GameBoard';
import { useCallback, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, AlertCircle, ArrowLeft, Loader2, Users, Crown, Minus, Frown, Swords, Clock } from 'lucide-react';
import confetti from 'canvas-confetti';
import Link from 'next/link';
import React from 'react';
import client, { useSSL } from '@/lib/nakama';
import api from '@/lib/api';

// Next.js App router specific page generic
export default function GamePage({ params }: { params: any }) {
    // Extract params via React.use
    const unwrappedParams = React.use(params) as { matchId: string };
    const matchId = unwrappedParams.matchId;

    const { user, session, refreshUser, loading } = useAuth();
    const router = useRouter();

    const [board, setBoard] = useState<(string | null)[]>(Array(9).fill(null));

    const normalizeBoard = (b: any) => {
        if (!b) return Array(9).fill(null);
        return b;
    };
    const [status, setStatus] = useState<string>('connecting');
    const [currentTurn, setCurrentTurn] = useState<string>('');
    const [mySymbol, setMySymbol] = useState<'X' | 'O' | null>(null);
    const [gameOverResult, setGameOverResult] = useState<any>(null);
    const [error, setError] = useState<string>('');
    const [showForfeitModal, setShowForfeitModal] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
    const [lastMoveBy, setLastMoveBy] = useState<string | null>(null);
    const [gameMode, setGameMode] = useState<string>('classic');

    const socketRef = useRef<any>(null);
    const userRef = useRef(user);

    useEffect(() => {
        userRef.current = user;
    }, [user]);

    const OpCode = {
        MOVE: 1,
        UPDATE: 2,
        TIMER: 3,
        GAME_OVER: 4,
        FORFEIT: 5
    };

    function fireConfetti() {
        confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 }
        });
    }

    useEffect(() => {
        if (loading || !session) return;

        let cancelled = false;

        const connectToMatch = async (retries = 3): Promise<void> => {
            try {
                const socket = client.createSocket(useSSL, false);
                socket.onmatchdata = (state: any) => {
                    const data = JSON.parse(new TextDecoder().decode(state.data));
                    console.log("[MatchData]", state.op_code, data);

                    switch (state.op_code) {
                        case OpCode.UPDATE:
                            setBoard(data.board);
                            if (data.marks && userRef.current) {
                                const myMark = data.marks[userRef.current.id];
                                if (myMark) {
                                    setMySymbol(myMark);
                                    const opponentMark = myMark === 'X' ? 'O' : 'X';
                                    setCurrentTurn(data.currentTurn === userRef.current.id ? myMark : opponentMark);
                                }
                            }
                            if (data.lastMoveBy) {
                                setLastMoveBy(data.lastMoveBy);
                            }
                            if (data.winnerId || data.draw) {
                                setStatus('finished');
                                setGameOverResult({
                                    result: data.draw ? 'draw' : 'finished',
                                    winnerId: data.winnerId
                                });
                            }
                            break;

                        case OpCode.TIMER:
                            setSecondsLeft(data.secondsLeft);
                            break;

                        case OpCode.GAME_OVER:
                            setStatus('finished');
                            setGameOverResult({
                                result: data.result || 'finished',
                                winnerId: data.winnerId
                            });
                            if (data.winnerId === user?.id) fireConfetti();
                            refreshUser();
                            break;
                    }
                };

                await socket.connect(session, true);
                const match = await socket.joinMatch(matchId);

                // Parse label to get mode, marks, and initial turn
                if (match.label) {
                    const label = JSON.parse(match.label);
                    setGameMode(label.mode);
                    if (label.marks && userRef.current) {
                        const myMark = label.marks[userRef.current.id];
                        if (myMark) {
                            setMySymbol(myMark);
                            const opponentMark = myMark === 'X' ? 'O' : 'X';
                            // Initial turn setup from label - assuming player_x goes first or server provides currentTurn
                            // The server initializes currentTurn to player_x in matchInit
                            // We can check if user is player_x
                            const isMyTurnInit = label.marks[userRef.current.id] === 'X';
                            setCurrentTurn(isMyTurnInit ? myMark : opponentMark);
                        }
                    }
                }

                // Initial symbols based on join order or metadata
                // In our main.ts, the first join gets X. 
                // We'll trust the UPDATE broadcast for the most accurate state.

                socketRef.current = socket;
                setStatus('playing');
            } catch (e: any) {
                console.error("Match Join Error:", e);
                if (!cancelled && retries > 0) {
                    // Retry after 1 second — session may still be settling
                    await new Promise(res => setTimeout(res, 1000));
                    return connectToMatch(retries - 1);
                }
                if (!cancelled) setError("Failed to join match arena.");
            }
        };

        connectToMatch();

        return () => {
            cancelled = true;
            if (socketRef.current) socketRef.current.disconnect();
        };
    }, [session, matchId, loading]);

    const handleMove = async (index: number) => {
        if (status !== 'playing' || !socketRef.current) return;

        try {
            const payload = JSON.stringify({ index });
            await socketRef.current.sendMatchState(matchId, OpCode.MOVE, payload);
        } catch (e) {
            console.error("Move Error:", e);
        }
    };

    const confirmForfeit = async () => {
        if (socketRef.current) {
            try {
                await socketRef.current.sendMatchState(matchId, OpCode.FORFEIT, JSON.stringify({}));
                // Wait a tiny bit for delivery
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (e) {
                console.error("Forfeit send error:", e);
            }
        }
        router.push('/play');
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
                    <div className="flex flex-wrap items-center justify-center gap-3">
                        <span className={`px-4 py-1.5 rounded-full text-xs md:text-sm font-bold border flex items-center gap-2 ${mySymbol === 'X' ? 'bg-brand-500/10 border-brand-500/50 text-brand-400' : 'bg-success/10 border-success/50 text-success'}`}>
                            <Users className="w-4 h-4" /> You play as {mySymbol || '?'}
                        </span>
                        <span className={`px-4 py-1.5 rounded-full text-xs md:text-sm font-bold border ${gameMode === 'timed' ? 'bg-error/10 border-error/50 text-error' : 'bg-blue-500/10 border-blue-500/50 text-blue-400'}`}>
                            {gameMode === 'timed' ? 'BLITZ' : 'CLASSIC'}
                        </span>
                        <span className={`px-4 py-1.5 rounded-full text-xs md:text-sm font-bold border ${status === 'playing' ? 'bg-blue-500/10 border-blue-500/50 text-blue-400' : status === 'waiting' ? 'bg-yellow-500/10 border-yellow-500/50 text-yellow-400' : 'bg-dark-800 border-dark-400 text-gray-400'}`}>
                            {status === 'connecting' && 'Connecting...'}
                            {status === 'waiting' && 'Waiting...'}
                            {status === 'playing' && (isMyTurn ? 'Your Turn' : "Opponent's Turn")}
                            {status === 'disconnected' && 'Disconnected'}
                            {status === 'finished' && 'Game Over'}
                        </span>
                        {gameMode === 'timed' && (status === 'playing' || status === 'connecting') && (
                            <motion.span
                                key={secondsLeft ?? 'waiting'}
                                initial={{ scale: 1.2, color: (secondsLeft !== null && secondsLeft <= 3) ? '#ef4444' : '#fff' }}
                                animate={{ scale: 1, color: (secondsLeft !== null && secondsLeft <= 3) ? '#ef4444' : '#fff' }}
                                className={`px-4 py-1.5 rounded-full text-xs md:text-sm font-black border ${(secondsLeft !== null && secondsLeft <= 3) ? 'bg-error/10 border-error/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'bg-dark-800 border-dark-400 text-white'}`}
                            >
                                <Clock className="w-3 h-3 inline mr-1" /> {secondsLeft !== null ? `${secondsLeft}s` : '--s'}
                            </motion.span>
                        )}
                        {lastMoveBy && status === 'playing' && (
                            <span className="px-4 py-1.5 rounded-full text-xs md:text-sm font-medium bg-dark-800 border border-dark-400 text-gray-400">
                                Last move: {lastMoveBy === user?.id ? 'You' : 'Opponent'}
                            </span>
                        )}
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
                                    <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 rounded-full blur-3xl opacity-20 ${isWin ? 'bg-brand-500' : isDraw ? 'bg-yellow-500' : 'bg-error'}`} />

                                    <motion.div
                                        initial={{ scale: 0, rotate: -180 }}
                                        animate={{ scale: 1, rotate: 0 }}
                                        transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
                                        className={`relative mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-5 ${isWin ? 'bg-brand-500/20 ring-2 ring-brand-500/40' : isDraw ? 'bg-yellow-500/20 ring-2 ring-yellow-500/40' : 'bg-error/20 ring-2 ring-error/40'}`}
                                    >
                                        {isWin && <Crown className="w-10 h-10 text-brand-400" />}
                                        {isDraw && <Minus className="w-10 h-10 text-yellow-400" />}
                                        {isLoss && <Frown className="w-10 h-10 text-error" />}
                                    </motion.div>

                                    <motion.h3
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.3 }}
                                        className={`text-4xl font-black mb-1 ${isWin ? 'text-brand-400' : isDraw ? 'text-yellow-400' : 'text-error'}`}
                                    >
                                        {isWin ? 'Victory!' : isDraw ? 'Draw!' : 'Defeat'}
                                    </motion.h3>

                                    <motion.p
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 0.4 }}
                                        className="text-gray-400 text-sm mb-6"
                                    >
                                        {isWin ? 'You outplayed your opponent!' : isDraw ? 'A hard-fought battle' : 'Better luck next time'}
                                    </motion.p>

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
