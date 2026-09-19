import { assert, assertEquals, assertMatch } from '@std/assert';
import { chooseMoves } from './strategy.ts';
import { handleDelivery, sign } from './webhook.ts';

const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const DFEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 NBK';
const SECRET = 'test-secret';

Deno.test('greedy returns a well-formed, engine-legal turn from a bare DFEN', () => {
  const moves = chooseMoves(DFEN);
  assert(moves.length > 0, 'the opening roll NBK must have at least one legal micro-move');
  for (const m of moves) assertMatch(m, UCI);
});

Deno.test('a rolled position with no legal move yields an empty pass', () => {
  assertEquals(chooseMoves('4k3/8/8/8/8/8/8/4K3 w - - 0 1 R'), []);
});

// The load-bearing test of this repository. greedy is deterministic, so its play can be pinned;
// this case is carried over verbatim from the Cloudflare starter it is migrating from. If the move
// below ever changes, the anchor has moved and the ladder's fixed point has silently drifted —
// whichever host it runs on.
Deno.test('greedy grabs undefended material — unchanged from the Cloudflare deployment', () => {
  // White: Ra1, Kg1, pawns f2/g2/h2. Black: Rb8, Kg8, pawns f7/g7/h7 and a loose pawn on a7.
  // Only the rook die is usable, so a1a7 is the sole candidate to compare against staying home.
  assertEquals(chooseMoves('1r4k1/p4ppp/8/8/8/8/5PPP/R5K1 w - - 0 1 R'), ['a1a7']);
});

// greedy is NOT move-by-move deterministic: it takes the best-scoring turn and breaks ties
// uniformly at random. Measured over 200 calls — a1a7 above is stable 200/200 because its best move
// is unique, while the opening roll NBK yields all four knight moves at roughly 25% each, and PPP
// yields 196 distinct turn paths out of 200. That makes the anchor statistically stationary, which
// is what the scale needs, but it cannot be pinned outside the unique-best case. What IS a contract
// is that every answer comes from the equal-best set.
Deno.test('greedy always answers from the best-scoring set (ties broken at random)', () => {
  const knightMoves = new Set(['b1a3', 'b1c3', 'g1f3', 'g1h3']);
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const moves = chooseMoves(DFEN);
    assertEquals(moves.length, 1, 'the NBK roll is answered with a single micro-move');
    assert(knightMoves.has(moves[0]), `${moves[0]} is not one of the equal-best knight moves`);
    seen.add(moves[0]);
  }
  assert(seen.size > 1, 'ties are expected to be broken at random, not fixed');
});

Deno.test('the verification handshake echoes the nonce without a signature', async () => {
  const r = await handleDelivery(
    {},
    JSON.stringify({ type: 'verification', nonce: 'abc' }),
    SECRET,
    chooseMoves,
    0,
  );
  assertEquals(r.status, 200);
  assertEquals(r.body, { nonce: 'abc' });
});

Deno.test('a turn with a valid signature is answered with moves', async () => {
  const body = JSON.stringify({ type: 'turn', dfen: DFEN });
  const ts = 1_700_000_000;
  const headers = {
    'x-dicechess-timestamp': String(ts),
    'x-dicechess-signature': await sign(SECRET, ts, body),
  };
  const r = await handleDelivery(headers, body, SECRET, chooseMoves, ts);
  assertEquals(r.status, 200);
  assert(Array.isArray((r.body as { moves: string[] }).moves));
});

Deno.test('a turn with a bad signature is rejected', async () => {
  const body = JSON.stringify({ type: 'turn', dfen: DFEN });
  const ts = 1_700_000_000;
  const headers = { 'x-dicechess-timestamp': String(ts), 'x-dicechess-signature': 'deadbeef' };
  assertEquals((await handleDelivery(headers, body, SECRET, chooseMoves, ts)).status, 401);
});

Deno.test('a stale timestamp is rejected even with a genuine signature', async () => {
  const body = JSON.stringify({ type: 'turn', dfen: DFEN });
  const ts = 1_700_000_000;
  const headers = {
    'x-dicechess-timestamp': String(ts),
    'x-dicechess-signature': await sign(SECRET, ts, body),
  };
  assertEquals((await handleDelivery(headers, body, SECRET, chooseMoves, ts + 400)).status, 401);
});
