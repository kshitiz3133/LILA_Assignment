import { motion } from 'framer-motion';

interface GameBoardProps {
    board: (string | null)[];
    onMove: (index: number) => void;
    disabled: boolean;
    mySymbol: 'X' | 'O' | null;
}

export default function GameBoard({ board, onMove, disabled, mySymbol }: GameBoardProps) {
    return (
        <div className="grid grid-cols-3 gap-3 md:gap-4 w-full max-w-[400px] mx-auto p-4 md:p-6 bg-dark-800/80 backdrop-blur-xl border border-dark-400 rounded-3xl shadow-2xl">
            {board.map((cell, idx) => {
                const isMyCell = cell === mySymbol;
                return (
                    <motion.div
                        key={idx}
                        whileHover={!cell && !disabled ? { scale: 1.05 } : {}}
                        whileTap={!cell && !disabled ? { scale: 0.95 } : {}}
                        onClick={() => {
                            console.log(`Cell Clicked: ${idx}`, { cell, disabled, mySymbol });
                            if ((!cell || cell.trim() === '') && !disabled) onMove(idx);
                        }}
                        className={`
              aspect-square rounded-2xl flex items-center justify-center text-5xl md:text-6xl font-bold cursor-pointer
              transition-all duration-300 ease-out border-2
              ${!cell && !disabled ? 'hover:bg-dark-900 border-dark-400/50 hover:border-brand-500/50' : 'border-dark-400 bg-dark-900/50'}
              ${cell ? 'cursor-default shadow-inner' : ''}
              ${disabled && !cell ? 'cursor-not-allowed opacity-50' : ''}
            `}
                    >
                        {cell && (
                            <motion.span
                                initial={{ scale: 0, opacity: 0, rotate: -45 }}
                                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                className={cell === 'X' ? 'text-brand-400 drop-shadow-[0_0_10px_rgba(167,139,250,0.5)]' : 'text-success drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]'}
                            >
                                {cell}
                            </motion.span>
                        )}
                    </motion.div>
                );
            })}
        </div>
    );
}
