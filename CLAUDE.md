# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wingsim is a headless, CLI-runnable Node.js simulator for the Wingspan board game. It features a deterministic rules engine, pluggable player agents (including LLM-backed agents), and hidden information handling. Target: 2-5 players.

## Build and Run Commands

```bash
yarn install      # Install dependencies
yarn build        # Compile TypeScript (tsc)
yarn dev          # Build and run
yarn start        # Run compiled code (node dist/index.js)
```

CLI usage: `wingsim simulate -p <players>`

## Architecture

The codebase follows the specification in `WingsimSpec.md` and implementation plan in `WingsimImplementationPlan.md`. Key architectural decisions:

**Core Components** (to be implemented in `src/engine/`):

- `GameEngine` - Authoritative state owner, applies rules, maintains FIFO event queue
- `PowerProcessor` - Resolves bird powers via handlers, returns typed Effects (never mutates state)
- `ViewBuilder` - Constructs per-player views enforcing hidden information
- `MatchOrchestrator` - Match lifecycle, creates per-match engine/agents/RNG instances

**Key Design Patterns**:

- **Information Hiding**: Engine constructs `PlayerView` objects; agents never see raw `GameState`
- **Effect-driven Mutations**: All state changes go through `GameEngine.applyEffects()`
- **Event Queue**: Powers trigger via semantic events; processed synchronously before next action
- **Determinism**: All randomness through seeded `Rng` instance; no `Math.random()`

**Data Flow**:

1. Engine emits events (e.g., `HabitatActivatedEvent`, `BirdPlayedEvent`)
2. `PowerProcessor` resolves powers and returns `Effect`s
3. Engine applies effects and may generate more events
4. Queue empties before next action proceeds

**ID Conventions**:

- `BirdCardId` (e.g., `"barn_owl"`) - Static JSON definition ID
- `BirdInstanceId` (e.g., `"alice_forest_0_barn_owl"`) - Runtime instance on a board

## Key Files and Directories

- `src/types/` - Core type definitions (core.ts, effects.ts, events.ts, prompts.ts)
- `src/data/base_game/` - JSON datasets (birds.json, bonus_cards.json, round_goals.json)
- `rules/base_game/` - Comprehensive game rules documentation for implementing power handlers + execution loop
- `WingsimSpec.md` - Authoritative specification; all implementation must adhere to this
- `WingsimImplementationPlan.md` - Phased implementation tasks

## Implementation Notes

- Power handlers live in `PowerProcessor.powerHandlersById` registry; JSON stores `PowerSpec` with `powerHandlerId` referencing code
- Pink power triggers must resolve synchronously before continuing the brown power chain
- Effects are granular (e.g., `GainFoodEffect`, `DiscardCardsEffect`); events are semantic
- `AgentProxy` pattern handles timeouts/retries with 3-strike forfeit rule
- The `GameObserver` interface enables renderers/loggers to observe without coupling
