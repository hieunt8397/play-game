- **2026-10-09 (before implementation): Epic 2 APIs that every new game must follow.** Epic 2 was built after this spec was written; read the current code, not only older specs.
  - **Game base and resume (Story 2.5).** `MiniGameBase<G>` builds `snapshot()` itself through `makeSnapshot`, so a game must not define `snapshot()`. Instead it:
    - implements `protected abstract progress()`;
    - reads `this.resumeAt` (already validated by `readResume`);
    - calls `this.acceptResume()` only when it takes the resume.
    
    Put the resume decision in a pure `startCommands(round, resumeAt)` in the game's `round.ts`, as Tiệm kem does. Declare the game's partial in `SnapshotPartials` in `content/types.ts`.
  - **Difficulty and return path.** The level is written by the post-round chain (`core/post-round-chain.ts`), not by the game or by Map directly. Start data comes from `takeStartData` in `core/session-store.ts`.
  - **Rewards.** `round:complete` grants a decoration through `core/reward-service.ts`, which must stay the only caller of `grantDecoration`. A game never grants directly.
  - **Decoration slots.** Story 2.2 left each station 1–2 decoration slots (10 in total).
  - **Map routing.** Map decides through pure helpers: `routeRoundComplete` / `routeRoundAbandon` / `keepAbandonSnapshot` in `post-round-chain.ts`, and `routePlayAgainClose` in `play-again.ts`. Keep new Map logic in pure core helpers with tests, because scenes have no test harness.
