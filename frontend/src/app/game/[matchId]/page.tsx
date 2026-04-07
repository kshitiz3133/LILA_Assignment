"use client";

import { useAuth } from '@/context/AuthContext';
import NavBar from '@/components/NavBar';
import GameBoard from '@/components/GameBoard';
import { useCallback, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, AlertCircle, ArrowLeft, Loader2, Users } from 'lucide-react';
import Link from 'next/link';
import React from 'react';
import { BACKEND_BASEURL, WS_BACKEND_BASEURL } from '@/constants/config';
import api from '@/lib/api';

// Next.js App router specific page generic
export default function GamePage({ params }: { params: any }) {
    // Extract params via React.use
    const unwrappedParams = React.use(params) as { matchId: string };
    const matchId = unwrappedParams.matchId;

    const { user, token } = useAuth();
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
        result: string; winnerId?: number; rankChanges?: any;
    } | null>(null);
    const [error, setError] = useState<string>('');
    const [showForfeitModal, setShowForfeitModal] = useState(false);

    console.log("[Game State]", { status, currentTurn, mySymbol, isMyTurn: status === 'playing' && currentTurn === mySymbol });

    const wsRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        if (!token || !user) return;
        if (wsRef.current) return;

        const ws = new WebSocket(`${WS_BACKEND_BASEURL}/game?token=${token}`);
        wsRef.current = ws;

        ws.onopen = () => {
            setStatus('waiting');
            // Join match
            ws.send(JSON.stringify({ type: 'join_match', matchId }));
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log("[WS Message]", data);

            switch (data.type) {
                case 'joined_match':
                    setBoard(normalizeBoard(data.board));
                    setCurrentTurn(data.currentTurn);
                    if (data.symbol) setMySymbol(data.symbol);
                    setStatus(data.status === 'started' ? 'waiting' : 'playing');
                    if (data.status === 'active') setStatus('playing');
                    break;
                case 'game_started':
                    setStatus('playing');
                    setBoard(normalizeBoard(data.board));
                    setCurrentTurn(data.currentTurn);
                    break;
                case 'board_update':
                    setBoard(normalizeBoard(data.board));
                    setCurrentTurn(data.currentTurn);
                    break;
                case 'game_over':
                    setStatus('finished');
                    setBoard(normalizeBoard(data.board));
                    setGameOverResult({
                        result: data.result,
                        winnerId: data.winnerId,
                        rankChanges: data.rankChanges,
                    });
                    break;
                case 'error':
                case 'move_rejected':
                    setError(data.message || data.reason || 'An error occurred');
                    setTimeout(() => setError(''), 3000);
                    break;
            }
        };

        ws.onclose = () => {
            if (status !== 'finished') setStatus('disconnected');
        };

        return () => {
            ws.close();
            wsRef.current = null;
        };
    }, [token, user, matchId]); // Deliberately omit status dependency so it doesn't reconnect

    // Re-sync symbols: Since the websocket doesn't explicitly tell us our symbol initially until we get the full API match details, actually the DB knows or we can guess. Let's just track it from the moves if 'currentTurn' changes or we can fetch match details. Wait, the backend doesn't send "You are X" in `joined_match`.
    // Wait, if I am X, and the current turn is X... To handle this perfectly, maybe I should fetch the match details from API first.
    useEffect(() => {
        if (!token) return;
        fetch(`${BACKEND_BASEURL}/matches/${matchId}`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                if (data.player_x_id === user?.id) setMySymbol('X');
                if (data.player_o_id === user?.id) setMySymbol('O');
            })
            .catch(console.error);
    }, [matchId, token, user]);

    const handleMove = (index: number) => {
        if (status !== 'playing' || currentTurn !== mySymbol) return;
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'make_move', matchId, cell: index }));
        }
    };

    const confirmForfeit = async () => {
        console.log("Confirming forfeit for match:", matchId);
        try {
            await api.post(`/matches/${matchId}/forfeit`);
            setShowForfeitModal(false);
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
                    {status === 'finished' && gameOverResult && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 30 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            className="mt-10 bg-dark-800 border border-brand-500/30 w-full max-w-[400px] mx-auto rounded-3xl p-8 text-center shadow-[0_0_50px_rgba(139,92,246,0.2)]"
                        >
                            <div className="mx-auto w-16 h-16 bg-brand-500/20 rounded-full flex items-center justify-center mb-4">
                                <Trophy className="w-8 h-8 text-brand-400" />
                            </div>
                            <h3 className="text-3xl font-black text-white mb-2">
                                {gameOverResult.result === 'draw' ? 'Draw!' : (gameOverResult.winnerId === user?.id ? 'Victory!' : 'Defeat')}
                            </h3>

                            <div className="bg-dark-900 border border-dark-400 rounded-xl p-4 my-6">
                                <p className="text-sm font-medium text-gray-400 mb-1">Rank Change</p>
                                <p className={`text-2xl font-bold ${gameOverResult.rankChanges[user!.id] > 0 ? 'text-success' : gameOverResult.rankChanges[user!.id] < 0 ? 'text-error' : 'text-gray-300'}`}>
                                    {gameOverResult.rankChanges[user!.id] > 0 ? '+' : ''}{gameOverResult.rankChanges[user!.id]}
                                </p>
                            </div>

                            <div className="flex gap-4">
                                <Link href="/" className="flex-1 bg-dark-400 hover:bg-dark-400/80 text-white py-3 rounded-xl font-bold transition">
                                    Dashboard
                                </Link>
                                <Link href="/leaderboard" className="flex-1 bg-brand-600 hover:bg-brand-500 text-white py-3 rounded-xl font-bold transition shadow-lg shadow-brand-500/30">
                                    Leaderboard
                                </Link>
                            </div>
                        </motion.div>
                    )}

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
