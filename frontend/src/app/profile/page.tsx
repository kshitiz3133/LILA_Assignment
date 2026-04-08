"use client";

import { useAuth } from '@/context/AuthContext';
import NavBar from '@/components/NavBar';
import { motion } from 'framer-motion';
import { Trophy, Medal, MapPin, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import api from '@/lib/api';

export default function ProfilePage() {
    const { user: contextUser, token } = useAuth();
    const [user, setUser] = useState(contextUser);

    useEffect(() => {
        if (!token) return;
        api.get('/auth/me')
            .then(res => setUser(res.data.player))
            .catch(console.error);
    }, [token]);

    if (!user) return null;

    return (
        <div className="min-h-screen flex flex-col">
            <NavBar />

            <main className="flex-1 max-w-2xl w-full mx-auto p-4 flex flex-col pt-12 pb-20">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-dark-800/80 backdrop-blur-xl border border-brand-500/20 rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden"
                >
                    <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-brand-600 to-brand-400" />

                    <div className="mx-auto w-24 h-24 bg-dark-900 border border-dark-400 rounded-full flex flex-col items-center justify-center shadow-inner mb-6 relative">
                        <span className="text-4xl font-extrabold text-gray-300">
                            {user.username.charAt(0).toUpperCase()}
                        </span>
                        <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-success rounded-full flex items-center justify-center border-[3px] border-dark-800">
                            <span className="block w-2.5 h-2.5 bg-white rounded-full" />
                        </div>
                    </div>

                    <h1 className="text-3xl font-black text-white mb-1">
                        {user.username}
                    </h1>
                    <p className="text-gray-400 font-medium flex items-center justify-center gap-2 mb-8">
                        <MapPin className="w-4 h-4 text-brand-500" /> Secure Device Registered
                    </p>

                    <div className="bg-dark-900/50 rounded-2xl border border-dark-400 p-6 grid grid-cols-2 gap-4 relative overflow-hidden">
                        <div className="absolute right-0 top-0 opacity-5">
                            <Trophy className="w-48 h-48 -mr-10 -mt-10" />
                        </div>

                        <div className="text-left col-span-2 mb-2">
                            <h3 className="text-xl font-bold text-gray-200">Current Rank</h3>
                            <div className="flex items-end gap-3 mt-1">
                                <span className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-brand-300">
                                    {user.rank}
                                </span>
                                <span className="text-brand-500 font-bold mb-1 uppercase tracking-wider text-sm">{user.rank} ELO</span>
                            </div>
                        </div>

                        <div className="bg-dark-800 p-4 rounded-xl border border-dark-400 text-center">
                            <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">Wins</p>
                            <p className="text-2xl font-bold text-success">{user.wins}</p>
                        </div>

                        <div className="bg-dark-800 p-4 rounded-xl border border-dark-400 text-center">
                            <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">Losses</p>
                            <p className="text-2xl font-bold text-error">{user.losses}</p>
                        </div>

                        <div className="bg-dark-800 p-4 rounded-xl border border-dark-400 text-center">
                            <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">Win Rate</p>
                            <p className="text-2xl font-bold text-white">
                                {(user.wins + user.losses) > 0
                                    ? Math.round((user.wins / (user.wins + user.losses)) * 100)
                                    : 0}%
                            </p>
                        </div>

                        <div className="bg-dark-800 p-4 rounded-xl border border-dark-400 text-center">
                            <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">Best Streak</p>
                            <p className="text-2xl font-bold text-white">{user.best_streak} W</p>
                        </div>
                    </div>

                    <div className="mt-8 flex gap-4">
                        <Link href="/leaderboard" className="flex-1 bg-dark-400 hover:bg-dark-400/80 text-white py-3.5 rounded-xl font-bold transition flex justify-center items-center gap-2">
                            <Trophy className="w-5 h-5" /> Scoreboards
                        </Link>

                        {user.current_match_id ? (
                            <Link href={`/game/${user.current_match_id}`} className="flex-1 bg-warning hover:bg-warning/80 text-black py-3.5 rounded-xl font-bold transition shadow-lg shadow-warning/25 flex justify-center items-center gap-2">
                                <Search className="w-5 h-5" /> Rejoin Match
                            </Link>
                        ) : (
                            <Link href="/play" className="flex-1 bg-brand-600 hover:bg-brand-500 text-white py-3.5 rounded-xl font-bold transition shadow-lg shadow-brand-500/25 flex justify-center items-center gap-2">
                                <Search className="w-5 h-5" /> Matchmaking
                            </Link>
                        )}
                    </div>

                </motion.div>
            </main>
        </div>
    );
}
