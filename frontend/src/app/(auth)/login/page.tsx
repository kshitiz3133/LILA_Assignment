"use client";

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { LogIn, Loader2, Gamepad2, AlertCircle } from 'lucide-react';
import api from '@/lib/api';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth();
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const res = await api.post('/auth/login', { username });
            login(res.data.token, res.data.player);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to login');
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
                className="w-full max-w-md bg-dark-800/50 backdrop-blur-xl rounded-2xl border border-dark-400/50 p-8 shadow-2xl relative overflow-hidden"
            >
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-brand-600 via-brand-500 to-brand-600" />

                <div className="text-center mb-8">
                    <div className="mx-auto bg-brand-500/10 w-16 h-16 rounded-full flex items-center justify-center mb-4 border border-brand-500/20 shadow-[0_0_15px_rgba(139,92,246,0.3)]">
                        <Gamepad2 className="w-8 h-8 text-brand-500" />
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Welcome Back</h1>
                    <p className="text-dark-400/80 mt-2 text-sm text-gray-400">Enter your credentials to continue your ranked journey.</p>
                </div>

                {error && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="mb-6 p-3 rounded-lg bg-error/10 border border-error/20 flex flex-row items-center gap-3 text-error"
                    >
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <p className="text-sm font-medium">{error}</p>
                    </motion.div>
                )}

                <form onSubmit={handleLogin} className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5" htmlFor="username">Username</label>
                        <input
                            id="username"
                            type="text"
                            required
                            className="w-full bg-dark-900/50 border border-dark-400 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all duration-300"
                            placeholder="player123"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                    </div>

                    <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-brand-600 hover:bg-brand-500 text-white rounded-xl px-4 py-3 font-semibold shadow-lg shadow-brand-500/25 flex items-center justify-center gap-2 transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
                        {isLoading ? 'Signing In...' : 'Sign In'}
                    </motion.button>
                </form>

                <p className="mt-8 text-center text-sm text-gray-400">
                    Don't have an account?{' '}
                    <Link href="/register" className="text-brand-500 hover:text-brand-400 font-medium transition-colors">
                        Register here
                    </Link>
                </p>
            </motion.div>
        </div>
    );
}
