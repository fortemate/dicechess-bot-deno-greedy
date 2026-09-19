> [!IMPORTANT]
> **Archived — this bot moved on 2026-09-19.**
>
> `cloudflare/greedy` is now served by
> [fortemate/dicechess-bots-deno](https://github.com/fortemate/dicechess-bots-deno) at the path
> `/greedy`, together with the other Deno anchors. The identity, its rating and its game history
> were never re-created: re-registering a webhook replaces only the URL and the secret.
>
> The move was for quota, not for code. Deno Deploy bills Memory Time as provisioned memory for
> every second an *application* is loaded in memory, regardless of how many identities it serves,
> so one application per bot doubled the bill for nothing. See
> [the journal entry](https://github.com/fortemate/fortemate-internal/blob/main/content/journal/2026-09-19-greedy-migrated-to-deno-deploy.md).
>
> This repository is kept read-only because merged journal entries link to it. Nothing here is
> deployed any more.

# Dice Chess Bot — Deno Deploy (Fixed Rating Anchor, greedy)

[![CI](https://github.com/fortemate/dicechess-bot-deno-greedy/actions/workflows/ci.yml/badge.svg)](https://github.com/fortemate/dicechess-bot-deno-greedy/actions/workflows/ci.yml)
[![Leaderboard](https://img.shields.io/badge/Ladder-Leaderboard-1E90FF)](https://fortemate.com/leaderboard)
[![Engine](https://img.shields.io/badge/Engine-dicechess--engine-8A2BE2)](https://github.com/fortemate/dicechess-engine)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-lightgrey)](./LICENSE)

The host for the live **`cloudflare/greedy`** ladder anchor — the base greedy material evaluation of
`Anchor Set v1.0`.

## This is a migration, not a new bot

`cloudflare/greedy` has **61,755 games** of rating history. Re-registering a webhook replaces the URL and the
HMAC secret but leaves the identity untouched, so moving hosts costs nothing:

```
POST /bot/webhook  {"url": "https://<new>.deno.net"}  →  201 {"secret": "…"}
```

The team slug stays `cloudflare` even though the bot no longer runs there. Renaming it to `anchor/greedy`,
which the anchor specification asks for, would create a **new identity** and discard those 61,755 games — that
is a separate decision, deliberately not bundled with the move.

## Why leave Cloudflare

Workers' free plan caps a request at 10 ms of CPU. That is a poor fit for a V8 engine bundle: a cold isolate
spends ~17 ms JIT-compiling the engine on its first search against ~0.4 ms warm, and on 2026-09-18 that failed
**96 of 553 deliveries (17.4 %)** with `Exceeded CPU Time Limits`. The sibling `anchor/random`, identical code
on Deno Deploy, answered **503 of 503** over the same window with no failures. Deno Deploy documents no
per-request CPU cap; `main.ts` additionally runs one throwaway search at module scope so the JIT cost lands in
isolate start-up rather than on a turn that is on the clock.

## The one rule

**Do not improve this bot.** No book, no algorithm swap, no config knob. An anchor that gets tuned is not an
anchor.

## How greedy actually behaves

It takes the best-scoring turn and **breaks ties uniformly at random**. Measured over 200 calls:

| Position                                                              |                        Distinct answers |
| --------------------------------------------------------------------- | --------------------------------------: |
| `1r4k1/p4ppp/8/8/8/8/5PPP/R5K1 w - - 0 1 R` (rook takes a loose pawn) |                   1 — `a1a7` every time |
| opening roll `NBK`                                                    | 4, evenly split across the knight moves |
| opening roll `PPP`                                                    |                                     196 |

So the anchor is _statistically_ stationary — the distribution is fixed — but not reproducible move by move.
Only the unique-best case can be pinned, and `src/bot_test.ts` does pin it; the rest is asserted as membership
of the equal-best set.

## Layout

| Path              | Role                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `src/strategy.ts` | Calls the engine's built-in `greedy` algorithm. Nothing to configure.                                                           |
| `src/webhook.ts`  | Pure delivery logic: WebCrypto HMAC verify (±5 min replay window), handshake echo. Shared verbatim with the Cloudflare starter. |
| `main.ts`         | The `Deno.serve` handler: reads the signing secret, warms the engine, relays to `handleDelivery`.                               |
| `src/bot_test.ts` | 8 tests across both halves.                                                                                                     |

## Running it locally

```bash
DICECHESS_WEBHOOK_SECRET=local-test-secret deno task dev
```

```bash
curl -s localhost:8000     # {"status":"ok","bot":"cloudflare/greedy"}
deno task test             # 8 tests
deno task check            # type check, fmt, lint
```

## Deployment

Deno Deploy builds this repository on every push to `main`. The application needs one environment variable,
`DICECHESS_WEBHOOK_SECRET`, holding the secret returned by `POST /bot/webhook` for this identity. Credentials
live in Bitwarden, organisation `fortemate.com`, collection `Bots`, item `Fortemate — cloudflare/greedy`.

## Licence

AGPL-3.0-only, the same as the engine. See [LICENSE](./LICENSE) and [CLA.md](./CLA.md).
