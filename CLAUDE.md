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
- `ActionProcessor` - Resolves turn actions and bird powers via handlers, returns typed Events + Effects (never mutates state)
- `ViewBuilder` - Constructs per-player views enforcing hidden information
- `MatchOrchestrator` - Match lifecycle, creates per-match engine/agents/RNG instances

**Key Design Patterns**:

- **Information Hiding**: Engine constructs `PlayerView` objects; agents never see raw `GameState`
- **Effect-driven Mutations**: All state changes go through `GameEngine.applyEffects()`
- **Event Queue**: Powers trigger via semantic events; processed synchronously before next action
- **Determinism**: All randomness through seeded `Rng` instance; no `Math.random()`

**Data Flow**:

1. Engine emits events (e.g., `HabitatActivatedEvent`, `BirdPlayedEvent`)
2. `ActionProcessor` resolves powers and returns `Effect`s (and sometimes `Event`s)
3. Engine applies effects and handles subsequent events as needed

**ID Conventions**:

- `BirdCardId` (e.g., `"barn_owl"`) - Static JSON definition ID
- `BirdInstanceId` (e.g., `"alice_forest_0_barn_owl"`) - Runtime instance on a board

## Key Files and Directories

- `src/types/` - Core type definitions (core.ts, effects.ts, events.ts, prompts.ts)
- `src/data/base_game/` - JSON datasets (birds.json, bonus_cards.json, round_goals.json)
- `rules/base_game/` - Comprehensive game rules documentation for implementing power handlers + execution loop
- `WingsimSpec.md` - Authoritative specification; all implementation must adhere to this
- `WingsimImplementationPlan.md` - Phased implementation tasks

## Orchestration Tips

- Use subagents in parallel for exploring files and gathering context about existing code.
- Make sure not to let subagent outputs overwhelm your context window.
- Use the TypeScript LSP as much as possible for exploring the codebase, falling back to tools like ripgrep as needed.

## Implementation Notes

- Turn + power handlers live in `ActionProcessor` registry, but are defined in ActionHandlers; JSON stores `PowerSpec` with `powerHandlerId` referencing handler functions by name in code
- Pink power triggers must resolve synchronously before continuing the brown power chain
- Effects are granular (e.g., `GainFoodEffect`, `DiscardCardsEffect`); events are semantic
- `AgentProxy` pattern handles timeouts/retries with 3-strike forfeit rule
- The `GameObserver` interface enables renderers/loggers to observe without coupling

## Testing

- Always run unit tests for each unit of code added, to verify it works before claiming task completion.
- Always add a code comment above each unit test clearly explaining the reasoning for its existence. Why do we need it? How does it ensure quality for the system as a whole?
- If a test begins failing after you make some changes, assume it is YOUR RESPONSIBILITY to fix it now. Do not wait or delay fixing broken tests, even if they don't appear to be your fault.

## Style Preferences

- Avoid using big section comments like:

```
// ============================================================================
// Power Handler Tests
// ============================================================================
```
