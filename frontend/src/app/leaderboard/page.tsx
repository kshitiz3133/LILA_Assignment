"use client";

import { useEffect, useState } from 'react';
import NavBar from '@/components/NavBar';
import { useAuth } from '@/context/AuthContext';
import { motion } from 'framer-motion';
import { Trophy, Medal, Loader2, Award } from 'lucide-react';
import client from '@/lib/nakama';

interface PlayerRank {
    id: string;
    username: string;
    rank_score: number;
}

export default function LeaderboardPage() {
    const { user, session } = useAuth();
    const [players, setPlayers] = useState<PlayerRank[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!session) return;

        const fetchLeaderboard = async () => {
            try {
                const records = await client.listLeaderboardRecords(session, "global_rank");
                const mapped = (records.records || []).map((r: any) => ({
                    id: r.owner_id as string,
                    username: r.username || 'Anonymous',
                    rank_score: r.score ? parseInt(r.score) : 0
                }));
                // Sort by score descending
                setPlayers(mapped.sort((a: PlayerRank, b: PlayerRank) => b.rank_score - a.rank_score));
            } catch (err) {
                console.error('Leaderboard error', err);
            } finally {
                setLoading(false);
            }
        };

        fetchLeaderboard();
    }, [session]);

    return (
        <div className="min-h-screen flex flex-col">
            <NavBar />

            <main className="flex-1 max-w-4xl w-full mx-auto p-4 flex flex-col pt-12 pb-20">
                <div className="text-center mb-12 relative flex flex-col items-center">
                    <div className="absolute -top-10 bg-brand-500/20 w-32 h-32 blur-3xl rounded-full" />
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', damping: 15 }}
                        className="w-16 h-16 bg-brand-500/10 border border-brand-500/30 rounded-2xl flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(139,92,246,0.3)] backdrop-blur-md"
                    >
                        <Trophy className="w-8 h-8 text-brand-400" />
                    </motion.div>
                    <motion.h1
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-200 to-gray-500 tracking-tight mb-3"
                    >
                        Global Rankings
                    </motion.h1>
                    <motion.p
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.1 }}
                        className="text-gray-400 text-lg max-w-lg mx-auto"
                    >
                        The master tacticians of the grid. Climb the ranks to solidify your legacy.
                    </motion.p>
                </div>

                {loading ? (
                    <div className="flex justify-center mt-20">
                        <Loader2 className="w-12 h-12 text-brand-500 animate-spin" />
                    </div>
                ) : (
                    <motion.div
                        initial={{ y: 40, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="bg-dark-800/50 backdrop-blur-xl border border-dark-400 rounded-3xl overflow-hidden shadow-2xl relative"
                    >
                        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-brand-500 to-transparent" />

                        <div className="hidden md:grid grid-cols-12 gap-4 p-6 border-b border-dark-400 text-sm font-bold text-gray-400 uppercase tracking-wider">
                            <div className="col-span-2 text-center">Rank</div>
                            <div className="col-span-6">Player</div>
                            <div className="col-span-4 text-right">Score</div>
                        </div>

                        <div className="divide-y divide-dark-400/50">
                            {players.map((player, idx) => {
                                const isMe = user?.id === player.id;
                                return (
                                    <motion.div
                                        initial={{ x: -20, opacity: 0 }}
                                        animate={{ x: 0, opacity: 1 }}
                                        transition={{ delay: 0.1 * idx }}
                                        key={player.id}
                                        className={`grid grid-cols-12 gap-4 p-4 md:p-6 items-center transition-colors hover:bg-dark-900/50 ${isMe ? 'bg-brand-500/10' : ''}`}
                                    >
                                        <div className="col-span-3 md:col-span-2 flex justify-center">
                                            {idx === 0 ? <Medal className="w-8 h-8 text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]" /> :
                                                idx === 1 ? <Medal className="w-8 h-8 text-gray-300 drop-shadow-[0_0_8px_rgba(209,213,219,0.6)]" /> :
                                                    idx === 2 ? <Medal className="w-8 h-8 text-amber-700 drop-shadow-[0_0_8px_rgba(180,83,9,0.6)]" /> :
                                                        <span className="text-xl font-bold text-gray-500 w-8 text-center">{idx + 1}</span>}
                                        </div>
                                        <div className="col-span-5 md:col-span-6 flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-dark-400 border border-dark-400 flex items-center justify-center">
                                                <span className="text-sm font-bold text-gray-300">{player.username.charAt(0).toUpperCase()}</span>
                                            </div>
                                            <div>
                                                <p className={`font-bold text-lg ${isMe ? 'text-brand-400' : 'text-white'}`}>
                                                    {player.username} {isMe && <span className="text-xs ml-2 px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300">You</span>}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="col-span-4 flex items-center justify-end gap-2 text-right">
                                            <Award className={`w-4 h-4 ${idx < 3 ? 'text-brand-400' : 'text-gray-500'}`} />
                                            <span className="text-xl font-black text-white">{player.rank_score}</span>
                                        </div>
                                    </motion.div>
                                );
                            })}
                            {players.length === 0 && (
                                <div className="p-12 text-center text-gray-500">No players ranked yet. Play a game to join the board!</div>
                            )}
                        </div>
                    </motion.div>
                )}
            </main>
        </div>
    );
}
