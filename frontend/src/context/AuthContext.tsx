"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '@/lib/api';
import { useRouter, usePathname } from 'next/navigation';

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
    token: string | null;
    login: (token: string, userData: User) => void;
    logout: () => void;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        // Attempt to hydrate user from localStorage
        const storedToken = localStorage.getItem('token');

        if (storedToken) {
            setToken(storedToken);
            api.get('/auth/me').then(res => {
                setUser(res.data.player);
                localStorage.setItem('user', JSON.stringify(res.data.player));
            }).catch(() => {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                setToken(null);
                setUser(null);
            });

            const storedUser = localStorage.getItem('user');
            if (storedUser) {
                try {
                    setUser(JSON.parse(storedUser));
                } catch (e) {
                    localStorage.removeItem('user');
                }
            }
        }

        setLoading(false);
    }, []);

    useEffect(() => {
        if (!loading) {
            if (!user && !pathname.includes('/login') && !pathname.includes('/register')) {
                router.push('/login');
            } else if (user && (pathname.includes('/login') || pathname.includes('/register') || pathname === '/')) {
                router.push('/profile');
            }
        }
    }, [user, loading, pathname, router]);

    const login = (newToken: string, userData: User) => {
        localStorage.setItem('token', newToken);
        localStorage.setItem('user', JSON.stringify(userData));
        setToken(newToken);
        setUser(userData);
        router.push('/profile');
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setToken(null);
        setUser(null);
        router.push('/login');
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout, loading }}>
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
