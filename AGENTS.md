# Dice Chess Bot — Deno Greedy — AI Agent Guidelines

## Architecture Overview

- **Domain**: Production Dice Chess ladder anchor running the engine's unmodified `greedy` search on Deno
  Deploy. This hosts the EXISTING `cloudflare/greedy` identity (61,755 games) — it is a host migration, not a
  new bot.
- **Contract**: Pure webhook endpoint implementing WebCrypto HMAC-SHA256 verification and ownership handshake.
  `src/webhook.ts` is shared verbatim with the Cloudflare starter and depends on no runtime globals beyond
  WebCrypto.
- **Core Rule**: Do not modify or optimize the strategy, and do not add an opening book. `greedy` is
  deliberately fixed so the ladder has an unmoving baseline.
- **Tie-breaking**: `greedy` takes the best-scoring turn and breaks ties uniformly at random, so it is
  statistically stationary but not reproducible move by move. Only the unique-best case can be pinned —
  `src/bot_test.ts` pins one (`a1a7`) and asserts set membership for the rest.

## Developer Workflows

- **Setup**: `deno --version` (Deno 2.x; no install step — dependencies resolve from `deno.json`).
- **Tests**: `deno task test` (8 tests: strategy behaviour, tie-break contract, HMAC, handshake, replay
  window).
- **Check**: `deno task check` (`deno check`, `deno fmt --check`, `deno lint`).
- **Dev**: `deno task dev` (serves on :8000; set `DICECHESS_WEBHOOK_SECRET` first).
- **Deploy**: pushed to `main`, deployed by Deno Deploy from this repository.

## Publication boundary

<!-- dc-shared:publication v4 — keep identical across Fortemate repositories -->

- Fortemate is open-core. Public by nature, in the public repositories: their source (engine rules and search,
  feature definitions and extractors, bot templates, the play client and server), serving contracts,
  mechanics, and the programme numbers already published in the project READMEs. Private repositories
  (evaluation service, training pipelines, proprietary evaluators, house bots, analytics, infrastructure) stay
  private in full; this rule governs what may be written into the public ones.
- Always private, wherever it is written: trained weights, opening books, labelled corpora, production
  parameter **values** (search profiles, candidate limits, table sizes, blend weights, time budgets),
  experiment **verdicts** (win rates, feature importance, cost ratios, negative results) and the names of
  private artifacts, hosts and internal paths.
- Before writing to a public repository — code, docs, scaladoc, commit messages, Issues, pull requests, review
  replies — check the text against that list. Values and verdicts go to the private knowledge base
  (`fortemate-internal`, a private repository agents read and write through the owner's access; naming it is
  the address, not a disclosure) and are referenced from public text by page title only; examples use
  placeholders such as `<candidate-limit>` instead of real values.
- The rule is forward-only (ADR 009): nothing already published is retracted and history is never rewritten.
  When unsure whether something is a definition or a verdict, ask the owner before publishing.

<!-- /dc-shared:publication -->

## Issue management

<!-- dc-shared:issue-management v7 — keep identical across Fortemate repositories -->

- Classify work with the native GitHub Issue Type: `Bug` (unexpected or incorrect behavior), `Feature`
  (request, idea, new user-visible capability), `Task` (a specific piece of engineering, research, maintenance
  or documentation work). Labels on Issues name a technical domain or cross-cutting concern only, never repeat
  the Type, and must already exist in the repository.
- Never commit to a repository's default branch. Name branches you control `<type>/<short-description>` or
  `<type>/<issue-id>-<short-description>` with a type from `task|feat|bug|refactor|chore|docs|ci|test|perf`. A
  branch that carries an Issue id must be closed by its pull request (`Closes #<id>`, or
  `Closes owner/repository#<id>` across repositories); partial work uses a non-closing reference. Before
  dispatching an external tool, read the repository's live PR-policy workflow: a tool-managed branch name is
  acceptable only when that policy allows it and the pull request closes the delegated leaf Issue — never edit
  a workflow to make a generated branch pass. A delegated pull request and its commits close only their leaf
  Issue, never a parent or sibling.
- GitHub-facing text is English-only. Every Issue has `Context`, `Objective` and a testable
  `Definition of Done`; create it with `gh issue create --body-file <file>`, never with an inline multi-line
  body, and search open and closed Issues across Fortemate repositories for duplicates first. Every actionable
  Issue (never a pull request) belongs to the organization Project
  [Fortemate Engineering](https://github.com/orgs/fortemate/projects/1); triage (Type, `Execution tier`,
  `Status`, `Priority`, labels, relationships, assignee) and the mandatory read-back after every mutation
  follow the `github-issue-workflow` skill in `fortemate-internal/skills/`.
- `jules` is a live execution trigger, not a label. Jules, Antigravity, CI, delegated subagents and any agent
  without the current user's explicit task-scoped authorization never apply, reapply or remove it. Dispatch
  qualification, monitoring, feedback (only a submitted comment starting with `@jules`; every other comment by
  the triggering user wakes the session too), takeover, the audit-marker rule for closed Issues and the "no
  bare `#N` in a spec" rule are the `jules-delegation` skill; a repository must pass the
  `jules-repo-readiness` skill before its first dispatch.
- The human owner reviews, approves and merges pull requests. Agents never merge pull requests or execute
  releases.

<!-- /dc-shared:issue-management -->
