// The move-choosing brain: the engine's unmodified built-in `greedy` search — no opening book, no
// tuning, no swapping.
//
// This is `anchor/greedy` in Anchor Set v1.0: the base greedy material evaluation, one ply, no
// lookahead. It is deterministic, which is why this repository can pin its behaviour in a test —
// see `src/bot_test.ts`. That test is the point: it proves a host migration does not change how the
// anchor plays.
//
// Do not change ALGORITHM and do not add a book. An "improved" anchor is not an anchor. If you want
// a stronger Deno bot, build a new one.
import { DiceChess } from '@fortemate/dicechess-engine';

const ALGORITHM = 'greedy';

/** DFEN in, the turn's UCI micro-moves out. `[]` = pass (no legal move; the server auto-passes). */
export function chooseMoves(dfen: string): string[] {
  const result = DiceChess.getBestMove(dfen, { algorithm: ALGORITHM });
  const moves = result?.moves ?? [];
  return moves.map((m) => m.from + m.to + (m.promotion ?? ''));
}

/** The opening position, used only to force JIT compilation at isolate start — see main.ts. */
export const WARMUP_DFEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 NBK';
