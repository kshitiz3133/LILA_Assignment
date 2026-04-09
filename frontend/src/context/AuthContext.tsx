"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import client from '@/lib/nakama';
import { Session } from '@heroiclabs/nakama-js';
import { useRouter, usePathname } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';

interface User {
    id: string;
    username: string;
    rank: number;
    wins: number;
    losses: number;
    win_streak: number;
    best_streak: number;
    current_match_id?: string | null;
}

interface AuthContextType {
    user: User | null;
    session: Session | null;
    logout: () => void;
    login: (username: string) => Promise<void>;
    refreshUser: () => Promise<void>;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        const initAuth = async () => {
            let deviceId = localStorage.getItem('nakama_device_id');
            if (!deviceId) {
                deviceId = uuidv4();
                localStorage.setItem('nakama_device_id', deviceId);
            }

            try {
                const storedToken = localStorage.getItem('nakama_session_token');
                const storedRefreshToken = localStorage.getItem('nakama_refresh_token');
                const storedUsername = localStorage.getItem('nakama_username');
                let currentSession: Session | null = null;

                if (storedToken && storedRefreshToken) {
                    try {
                        currentSession = Session.restore(storedToken, storedRefreshToken);
                        if (currentSession.isexpired(Math.floor(Date.now() / 1000))) {
                            // Try to refresh or re-auth with custom
                            if (storedUsername) {
                                currentSession = await client?.authenticateCustom(storedUsername, true, undefined, { device_id: deviceId });
                            } else {
                                currentSession = null;
                            }
                        }
                    } catch (e) {
                        currentSession = null;
                    }
                }

                if (!currentSession && storedUsername) {
                    currentSession = await client?.authenticateCustom(storedUsername, true, storedUsername, { device_id: deviceId });
                }

                if (!currentSession) {
                    setLoading(false);
                    return;
                }

                localStorage.setItem('nakama_session_token', currentSession.token);
                if (currentSession.refresh_token) {
                    localStorage.setItem('nakama_refresh_token', currentSession.refresh_token);
                }
                setSession(currentSession);

                // Fetch account
                const account = await client.getAccount(currentSession);

                // Fetch stats from simpler RPC endpoint
                let stats = { rank: 1000, wins: 0, losses: 0, win_streak: 0, best_streak: 0 };
                try {
                    const rpcRes = await client.rpc(currentSession, "get_player_stats", {});
                    if (rpcRes.payload) {
                        const parsed = typeof rpcRes.payload === 'string' ? JSON.parse(rpcRes.payload) : rpcRes.payload;
                        stats = { ...stats, ...parsed };
                    }
                } catch (e) {
                    console.error("Failed to read player stats RPC:", e);
                }

                const mappedUser: User = {
                    id: account.user?.id || '',
                    username: account.user?.username || 'Player',
                    rank: stats.rank,
                    wins: stats.wins,
                    losses: stats.losses,
                    win_streak: stats.win_streak,
                    best_streak: stats.best_streak,
                };
                setUser(mappedUser);
            } catch (e) {
                console.error('Nakama Auth Error:', e);
                router.push('/login');
            } finally {
                setLoading(false);
            }
        };

        initAuth();
    }, []);

    useEffect(() => {
        if (!loading) {
            // Nakama is always authenticated via device in this flow
            if (user && (pathname.includes('/login') || pathname.includes('/register') || pathname === '/')) {
                router.push('/profile');
            }
        }
    }, [user, loading, pathname, router]);

    const logout = () => {
        localStorage.removeItem('nakama_session_token');
        localStorage.removeItem('nakama_refresh_token');
        localStorage.removeItem('nakama_username');
        setSession(null);
        setUser(null);
        router.push('/login');
    };

    const login = async (username: string) => {
        setLoading(true);
        try {
            let deviceId = localStorage.getItem('nakama_device_id');
            if (!deviceId) {
                deviceId = uuidv4();
                localStorage.setItem('nakama_device_id', deviceId);
            }

            const currentSession = await client.authenticateCustom(username, true, username, { device_id: deviceId });

            localStorage.setItem('nakama_session_token', currentSession.token);
            if (currentSession.refresh_token) {
                localStorage.setItem('nakama_refresh_token', currentSession.refresh_token);
            }
            localStorage.setItem('nakama_username', username);

            setSession(currentSession);
            const account = await client.getAccount(currentSession);

            let stats = { rank: 1000, wins: 0, losses: 0, win_streak: 0, best_streak: 0 };
            try {
                const rpcRes = await client.rpc(currentSession, "get_player_stats", {});
                if (rpcRes.payload) {
                    const parsed = typeof rpcRes.payload === 'string' ? JSON.parse(rpcRes.payload) : rpcRes.payload;
                    stats = { ...stats, ...parsed };
                }
            } catch (e) {
                console.error("Failed to read player stats RPC:", e);
            }

            const mappedUser: User = {
                id: account.user?.id || '',
                username: account.user?.username || 'Player',
                rank: stats.rank,
                wins: stats.wins,
                losses: stats.losses,
                win_streak: stats.win_streak,
                best_streak: stats.best_streak,
            };
            setUser(mappedUser);
        } catch (e) {
            console.error('Login error:', e);
            throw e;
        } finally {
            setLoading(false);
        }
    };

    const refreshUser = async () => {
        if (!session) return;
        try {
            const account = await client.getAccount(session);

            let stats = { rank: 1000, wins: 0, losses: 0, win_streak: 0, best_streak: 0 };
            try {
                const rpcRes = await client.rpc(session, "get_player_stats", {});
                if (rpcRes.payload) {
                    const parsed = typeof rpcRes.payload === 'string' ? JSON.parse(rpcRes.payload) : rpcRes.payload;
                    stats = { ...stats, ...parsed };
                }
            } catch (e) {
                console.error("Failed to read player stats RPC:", e);
            }

            const mappedUser: User = {
                id: account.user?.id || '',
                username: account.user?.username || 'Player',
                rank: stats.rank,
                wins: stats.wins,
                losses: stats.losses,
                win_streak: stats.win_streak,
                best_streak: stats.best_streak,
            };
            setUser(mappedUser);
        } catch (e) {
            console.error('Refresh user error');
        }
    };

    return (
        <AuthContext.Provider value={{ user, session, logout, login, refreshUser, loading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
