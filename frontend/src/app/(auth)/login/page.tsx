"use client";

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { motion } from 'framer-motion';
import { Loader2, Gamepad2, AlertCircle, Swords } from 'lucide-react';
import api from '@/lib/api';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            // Try login first (existing user with same IP)
            const res = await api.post('/auth/login', { username });
            login(res.data.token, res.data.player);
        } catch (loginErr: any) {
            // If login fails, try registering as new user
            try {
                const res = await api.post('/auth/register', { username });
                login(res.data.token, res.data.player);
            } catch (registerErr: any) {
                setError(registerErr.response?.data?.error || loginErr.response?.data?.error || 'Something went wrong. Try a different nickname.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="w-full max-w-md relative"
            >
                {/* Background glow */}
                <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-72 h-72 bg-brand-500/15 rounded-full blur-3xl pointer-events-none" />

                <div className="relative bg-dark-800/60 backdrop-blur-xl rounded-3xl border border-dark-400/50 p-8 shadow-2xl overflow-hidden">
                    <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-brand-600 via-brand-400 to-brand-600" />

                    {/* Logo / Brand */}
                    <div className="text-center mb-8">
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
                            className="mx-auto bg-brand-500/10 w-20 h-20 rounded-2xl flex items-center justify-center mb-5 border border-brand-500/20 shadow-[0_0_30px_rgba(139,92,246,0.2)]"
                        >
                            <Swords className="w-10 h-10 text-brand-400" />
                        </motion.div>
                        <h1 className="text-3xl font-black text-white tracking-tight">Tic Tac Toe</h1>
                        <p className="text-gray-400 mt-2 text-sm">Enter a nickname to jump into ranked matches</p>
                    </div>

                    {error && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="mb-6 p-3 rounded-xl bg-error/10 border border-error/20 flex flex-row items-center gap-3 text-error"
                        >
                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                            <p className="text-sm font-medium">{error}</p>
                        </motion.div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2" htmlFor="username">
                                Nickname
                            </label>
                            <input
                                id="username"
                                type="text"
                                required
                                minLength={2}
                                maxLength={50}
                                autoFocus
                                className="w-full bg-dark-900/50 border border-dark-400 rounded-xl px-4 py-3.5 text-white text-lg placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all duration-300"
                                placeholder="Enter your nickname..."
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                            <p className="text-xs text-gray-500 mt-2">Letters and numbers only. Your account is tied to this device.</p>
                        </div>

                        <motion.button
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.98 }}
                            type="submit"
                            disabled={isLoading || username.length < 2}
                            className="w-full bg-brand-600 hover:bg-brand-500 text-white rounded-xl px-4 py-3.5 font-bold text-lg shadow-lg shadow-brand-500/25 flex items-center justify-center gap-2.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Joining...
                                </>
                            ) : (
                                <>
                                    <Gamepad2 className="w-5 h-5" />
                                    Let's Play
                                </>
                            )}
                        </motion.button>
                    </form>
                </div>
            </motion.div>
        </div>
    );
}
