"use client";

import { useAuth } from '@/context/AuthContext';
import NavBar from '@/components/NavBar';
import { motion } from 'framer-motion';
import { Swords, Clock, User, Loader2, Play } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';

export default function Dashboard() {
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const [matchmaking, setMatchmaking] = useState(false);
  const [foundMatchId, setFoundMatchId] = useState<string | null>(null);
  const [mode, setMode] = useState<'classic' | 'timed'>('classic');
  const [error, setError] = useState('');
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Eject user if trying to queue while actively matched
  useEffect(() => {
    if (user?.current_match_id) {
      router.replace(`/game/${user.current_match_id}`);
    }
  }, [user, router]);

  // Auto-cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const findMatch = async () => {
    if (!user) return;
    setMatchmaking(true);
    setFoundMatchId(null);
    setError('');

    try {
      const res = await api.post('/matchmaking/join', { mode });
      const { status, matchId } = res.data;

      if (status === 'matched') {
        setFoundMatchId(matchId);
        refreshUser(); // Sync global state
        router.push(`/game/${matchId}`);
      } else {
        // Poll for match
        pollMatchmaking();
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to start matchmaking.');
      setMatchmaking(false);
    }
  };

  const pollMatchmaking = () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await api.get('/matchmaking/status');
        if (res.data.status === 'matched') {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setFoundMatchId(res.data.matchId);
          setMatchmaking(false);
          refreshUser(); // Sync global state
          router.push(`/game/${res.data.matchId}`);
        }
      } catch {
        // Stop polling on error
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        setMatchmaking(false);
        setError('Matchmaking connection lost.');
      }
    }, 2000);
  };

  const cancelMatchmaking = async () => {
    try {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      await api.delete('/matchmaking/leave');
      setMatchmaking(false);
    } catch (err) {
      console.error('Cancel error');
    }
  };

  if (!user || user.current_match_id || foundMatchId) {
    return (
      <div className="min-h-screen bg-dark-950 flex flex-col items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-6"
        >
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 border-4 border-brand-500/20 rounded-full" />
            <div className="absolute inset-0 border-4 border-t-brand-500 rounded-full animate-spin" />
            <Swords className="w-6 h-6 text-brand-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-bold text-white mb-1">Entering Arena</h2>
            <p className="text-gray-400 text-sm animate-pulse italic">Synchronizing battle state...</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <NavBar />

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 flex flex-col justify-center pb-20">
        <div className="text-center mb-12">
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 mb-4 tracking-tight"
          >
            Ready for Battle?
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-gray-400 text-lg"
          >
            Select your mode and climb the leaderboard.
          </motion.p>
        </div>

        {error && (
          <div className="bg-error/20 border border-error/50 text-error p-4 rounded-xl mb-6 text-center shadow-lg">
            {error}
          </div>
        )}

        {matchmaking ? (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-dark-800/80 backdrop-blur-xl border border-brand-500/30 p-10 rounded-3xl w-full max-w-md mx-auto text-center shadow-[0_0_50px_rgba(139,92,246,0.15)]"
          >
            <div className="relative w-24 h-24 mx-auto mb-6">
              <div className="absolute inset-0 border-t-2 border-brand-500 rounded-full animate-spin"></div>
              <div className="absolute inset-2 border-r-2 border-brand-400 rounded-full animate-spin direction-reverse"></div>
              <Swords className="w-10 h-10 text-brand-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Searching for Opponent</h2>
            <p className="text-gray-400 mb-8">Estimated Wait: 0:15</p>

            <button
              onClick={cancelMatchmaking}
              className="px-6 py-2.5 rounded-full bg-dark-400 hover:bg-error/20 text-gray-300 hover:text-error transition font-medium text-sm border border-transparent hover:border-error/30"
            >
              Cancel Search
            </button>
          </motion.div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6 w-full max-w-2xl mx-auto">
            {/* Standard Mode */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onMouseEnter={() => setMode('classic')}
              onClick={() => setMode('classic')}
              className={`cursor-pointer rounded-3xl p-6 border-2 transition-all duration-300 outline-none 
                ${mode === 'classic' ? 'bg-dark-800 border-brand-500 shadow-[0_0_30px_rgba(139,92,246,0.2)]' : 'bg-dark-900 border-dark-400 hover:border-brand-500/50'}
                max-sm:bg-dark-800 max-sm:border-brand-500/50`}
            >
              <div className="flex h-12 w-12 rounded-full bg-blue-500/10 items-center justify-center mb-4 text-blue-500">
                <User className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Standard</h3>
              <p className="text-sm text-gray-400 mb-6 min-h-[40px]">Classic Tic-Tac-Toe without turn time limits.</p>

              <button
                onClick={(e) => { e.stopPropagation(); setMode('classic'); findMatch(); }}
                className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all 
                  ${mode === 'classic' ? 'bg-brand-600 text-white hover:bg-brand-500 shadow-lg' : 'bg-dark-400 text-gray-400 hover:text-white'}
                  max-sm:bg-brand-600 max-sm:text-white`}
              >
                <Play className="w-4 h-4 fill-current" />
                Play Standard
              </button>
            </motion.div>

            {/* Timed Mode */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onMouseEnter={() => setMode('timed')}
              onClick={() => setMode('timed')}
              className={`cursor-pointer rounded-3xl p-6 border-2 transition-all duration-300 outline-none 
                ${mode === 'timed' ? 'bg-dark-800 border-error shadow-[0_0_30px_rgba(239,68,68,0.2)]' : 'bg-dark-900 border-dark-400 hover:border-error/50'}
                max-sm:bg-dark-800 max-sm:border-error/50`}
            >
              <div className="flex h-12 w-12 rounded-full bg-error/10 items-center justify-center mb-4 text-error">
                <Clock className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Timed (Blitz)</h3>
              <p className="text-sm text-gray-400 mb-6 min-h-[40px]">10 seconds per turn. Fast thinkers only.</p>

              <button
                onClick={(e) => { e.stopPropagation(); setMode('timed'); findMatch(); }}
                className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all 
                  ${mode === 'timed' ? 'bg-error text-white hover:bg-error/90 shadow-lg shadow-error/20' : 'bg-dark-400 text-gray-400 hover:text-white'}
                  max-sm:bg-error max-sm:text-white`}
              >
                <Play className="w-4 h-4 fill-current" />
                Play Blitz
              </button>
            </motion.div>
          </div>
        )}
      </main>
    </div>
  );
}
