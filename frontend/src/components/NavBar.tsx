"use client";

import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, Trophy, Gamepad2, User as UserIcon } from 'lucide-react';

export default function NavBar() {
    const { user, logout } = useAuth();
    const pathname = usePathname();

    if (!user) return null;

    return (
        <nav className="border-b border-dark-400 bg-dark-900/50 backdrop-blur-md sticky top-0 z-50">
            <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2 text-white hover:opacity-80 transition">
                    <Gamepad2 className="w-6 h-6 text-brand-500" />
                    <span className="font-bold text-lg tracking-tight">Ranked</span>
                </Link>

                <div className="flex items-center gap-6">
                    {/* 
                    <Link
                        href="/leaderboard"
                        className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${pathname === '/leaderboard' ? 'text-brand-400' : 'text-gray-400 hover:text-white'}`}
                    >
                        <Trophy className="w-4 h-4" />
                        <span className="hidden sm:inline">Leaderboard</span>
                    </Link>
                    */}

                    <div className="h-6 w-px bg-dark-400" />

                    <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end">
                            <span className="text-sm font-semibold text-white leading-none">{user.username}</span>
                            <span className="text-xs text-brand-400 font-medium">Rank: {user.rank}</span>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-dark-400 border border-dark-400 flex items-center justify-center">
                            <UserIcon className="w-4 h-4 text-gray-300" />
                        </div>
                        <button
                            onClick={logout}
                            className="ml-2 text-gray-500 hover:text-error transition p-1 rounded hover:bg-error/10"
                            title="Logout"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    );
}
