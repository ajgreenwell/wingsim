# Scenario-Based Integration Test Implementation Plan

This plan breaks down the implementation of the scenario-based integration testing system described in `ScenarioTestSpec.md` into discrete, completable tasks.

---

## Core Infrastructure Tasks

### [x] Task 1: Implement ScriptedAgent

**File:** `src/engine/__integration__/ScriptedAgent.ts`

Implement the `ScriptedAgent` class that follows a predetermined script of choices.

**Scope:**
- Define `ScriptedChoice` type (union of all choice types with `promptId` omitted)
- Define `ScriptedAgentConfig` interface
- Implement `ScriptedAgent` class implementing `PlayerAgent` interface
- Implement `chooseStartingHand()`, `chooseTurnAction()`, and `chooseOption()` methods
- Implement `isScriptFullyConsumed()` and `getRemainingChoiceCount()` helper methods
- Implement error classes: `ScriptExhaustedError` and `ScriptMismatchError`
- Add unit tests for script consumption, exhaustion errors, and mismatch errors

**Dependencies:** None (uses existing `PlayerAgent` interface and prompt/choice types)

---

### [x] Task 2: Implement ScenarioBuilder

**File:** `src/engine/__integration__/ScenarioBuilder.ts`

Implement the `ScenarioBuilder` class that constructs a fully configured `GameState` from a declarative scenario configuration.

**Scope:**
- Define configuration interfaces: `ScenarioPlayerConfig`, `ScenarioBoardConfig`, `ScenarioBirdPlacement`, `ScenarioTurn`, `ScenarioConfig`, `BuiltScenario`
- Implement `ScenarioBuilder` class with `build()` method
- Implement turn block grouping: flatten turn blocks by player into per-player choice queues
- Implement card removal logic: remove all dealt cards from decks (hands, boards, tray, deckTopCards)
- Implement deck stacking: place `deckTopCards` and `bonusDeckTopCards` at top of respective decks
- Implement birdfeeder setup with specific dice using duck-typed factory functions
- Implement bird tray setup using duck-typed factory functions
- Add unit tests for builder configuration, card removal, and deck stacking (24 tests)

**Dependencies:** Task 1 (ScriptedAgent)

---

### [x] Task 3: Implement ScenarioRunner

**File:** `src/engine/__integration__/ScenarioRunner.ts`

Implement the `runScenario()` function that executes scenarios and provides hooks for assertions.

**Scope:**
- Define interfaces: `ScenarioContext`, `ScenarioAssertion`, `RunScenarioOptions`
- Implement `ScenarioObserver` class implementing `GameObserver` for event/effect collection
- Implement `runScenario()` function
- Add `GameEngine.addObserver()` and `GameEngine.removeObserver()` methods
- Add `GameEngine.runSingleTurn()` method for limited turn execution
- Implement script consumption verification with warnings

**Dependencies:** Task 2 (ScenarioBuilder)

---

### [x] Task 4: Implement Assertion Helpers

**File:** `src/engine/__integration__/assertions.ts`

Implement reusable assertion factory functions for common scenario checks.

**Scope:**
- Implement handler assertions: `handlerWasInvoked()`, `handlerInvokedTimes()`
- Implement player state assertions: `playerHasFood()`, `playerHandSize()`
- Implement bird state assertions: `birdHasCachedFood()`, `birdHasEggs()`, `birdHasTuckedCards()`, `birdIsInHabitat()`
- Implement board assertions: `habitatBirdCount()`
- Implement event assertions: `eventWasEmitted()`
- Implement combinator: `all()`
- Add unit tests for each assertion helper

**Dependencies:** Task 3 (ScenarioRunner)

---

## Turn Action Handler Scenarios

### [x] Task 5: Turn Action Scenarios - gainFoodHandler

**File:** `src/engine/__integration__/scenarios/turnActions/gainFood.test.ts`

Create scenario tests for the `gainFoodHandler` turn action.

**Scope:**
- Test basic food gain from birdfeeder (single die)
- Test food gain with SEED_INVERTEBRATE die selection
- Test birdfeeder reroll when all dice show same face
- Test food gain with habitat bonus (trade cards for food)
- Verify brown power chain triggers after gain food action

**Dependencies:** Task 4 (Assertion Helpers)

---

### [x] Task 6: Turn Action Scenarios - layEggsHandler

**File:** `src/engine/__integration__/scenarios/turnActions/layEggs.test.ts`

Create scenario tests for the `layEggsHandler` turn action.

**Scope:**
- Test basic egg laying on single bird
- Test egg laying distributed across multiple birds
- Test respecting egg capacity limits
- Test habitat bonus (trade food for eggs)
- Verify brown power chain triggers after lay eggs action

**Dependencies:** Task 4 (Assertion Helpers)

---

### [x] Task 7: Turn Action Scenarios - drawCardsHandler

**File:** `src/engine/__integration__/scenarios/turnActions/drawCards.test.ts`

Create scenario tests for the `drawCardsHandler` turn action.

**Scope:**
- Test drawing from bird tray
- Test drawing from deck
- Test mixed tray/deck draws
- Test habitat bonus (trade eggs for cards)
- Verify brown power chain triggers after draw cards action

**Dependencies:** Task 4 (Assertion Helpers)

---

### [x] Task 8: Turn Action Scenarios - playBirdHandler

**File:** `src/engine/__integration__/scenarios/turnActions/playBird.test.ts`

Create scenario tests for the `playBirdHandler` turn action.

**Scope:**
- Test basic bird play with food cost
- Test bird play with egg cost (based on habitat column)
- Test wild food cost payment options
- Test bird placement in correct habitat slot
- Verify BIRD_PLAYED event emission

**Dependencies:** Task 4 (Assertion Helpers)

---

## Brown Power Handler Scenarios

### [x] Task 9: Brown Power Scenarios - Food Gain Powers

**File:** `src/engine/__integration__/scenarios/brownPowers/gainFoodHandlers.test.ts`

Create scenario tests for food-gaining brown power handlers.

**Scope:**
- `gainFoodFromSupply`: Test gaining food from unlimited supply
- `gainFoodFromFeeder`: Test gaining food from birdfeeder
- `gainFoodFromFeederWithCache`: Test with destination choice (cache vs supply)
- `cacheFoodFromSupply`: Test caching food directly on bird
- `gainFoodFromFeederIfAvailable`: Test conditional feeder gain
- `gainAllFoodTypeFromFeeder`: Test collecting all dice of a type

**Dependencies:** Task 4 (Assertion Helpers)

---

### [x] Task 10: Brown Power Scenarios - Egg Laying Powers

**File:** `src/engine/__integration__/scenarios/brownPowers/layEggHandlers.test.ts`

Create scenario tests for egg-laying brown power handlers.

**Scope:**
- `layEggsOnBird`: Test laying eggs on the power bird
- `layEggOnBirdsWithNestType`: Test laying on birds matching nest type

**Dependencies:** Task 4 (Assertion Helpers)

---

### [x] Task 11: Brown Power Scenarios - Card Draw Powers

**File:** `src/engine/__integration__/scenarios/brownPowers/drawCardHandlers.test.ts`

Create scenario tests for card-drawing brown power handlers.

**Scope:**
- `drawCards`: Test simple card draw (Mallard - WHEN_ACTIVATED) ✓
- `drawFaceUpCardsFromTray`: BLOCKED - All birds use WHEN_PLAYED trigger
- `drawCardsWithDelayedDiscard`: Test draw-now-discard-later (Black Tern, Common Yellowthroat) ✓
- `drawBonusCardsAndKeep`: BLOCKED - All birds use WHEN_PLAYED trigger

**Dependencies:** Task 4 (Assertion Helpers)

---

### [ ] Task 12: Brown Power Scenarios - Tuck Powers

**File:** `src/engine/__integration__/scenarios/brownPowers/tuckHandlers.test.ts`

Create scenario tests for tuck-related brown power handlers.

**Scope:**
- `tuckAndDraw`: Test tuck from hand, draw from deck
- `tuckFromHandAndLay`: Test tuck from hand, lay eggs
- `tuckAndGainFood`: Test tuck from hand, gain specific food
- `tuckAndGainFoodOfChoice`: Test tuck from hand, choose food type
- `discardFoodToTuckFromDeck`: Test food payment for deck tucks

**Dependencies:** Task 4 (Assertion Helpers)

---

### [ ] Task 13: Brown Power Scenarios - Discard-for-Reward Powers

**File:** `src/engine/__integration__/scenarios/brownPowers/discardHandlers.test.ts`

Create scenario tests for discard-based brown power handlers.

**Scope:**
- `discardEggToGainFood`: Test egg-to-food conversion
- `discardEggToDrawCards`: Test egg-to-cards conversion
- `tradeFoodType`: Test food type exchange

**Dependencies:** Task 4 (Assertion Helpers)

---

### [ ] Task 14: Brown Power Scenarios - Predator Powers

**File:** `src/engine/__integration__/scenarios/brownPowers/predatorHandlers.test.ts`

Create scenario tests for predator-type brown power handlers.

**Scope:**
- `rollDiceAndCacheIfMatch`: Test dice roll predator with matching wingspan
- `lookAtCardAndTuckIfWingspanUnder`: Test reveal predator with wingspan check
- Test predator failure case (no match)
- Verify PREDATOR_POWER_RESOLVED event emission

**Dependencies:** Task 4 (Assertion Helpers)

---

### [ ] Task 15: Brown Power Scenarios - Multi-Player Powers

**File:** `src/engine/__integration__/scenarios/brownPowers/multiPlayerHandlers.test.ts`

Create scenario tests for powers that affect multiple players.

**Scope:**
- `playersWithFewestInHabitatDrawCard`: Test comparison-based card draw
- `playersWithFewestInHabitatGainFood`: Test comparison-based food gain
- `eachPlayerGainsFoodFromFeeder`: Test round-robin food selection
- `allPlayersGainFoodFromSupply`: Test simultaneous food gain
- `allPlayersDrawCardsFromDeck`: Test simultaneous card draw
- `allPlayersLayEggOnNestType`: Test simultaneous egg laying
- `drawAndDistributeCards`: Test draw-and-distribute mechanics

**Dependencies:** Task 4 (Assertion Helpers)

---

### [ ] Task 16: Brown Power Scenarios - Power Repetition Powers

**File:** `src/engine/__integration__/scenarios/brownPowers/repeatPowerHandlers.test.ts`

Create scenario tests for power repetition handlers.

**Scope:**
- `repeatBrownPowerInHabitat`: Test repeating another bird's brown power
- `repeatPredatorPowerInHabitat`: Test repeating a predator power
- Test choosing which bird's power to repeat

**Dependencies:** Task 4 (Assertion Helpers)

---

### [ ] Task 17: Brown Power Scenarios - Special Powers

**File:** `src/engine/__integration__/scenarios/brownPowers/specialHandlers.test.ts`

Create scenario tests for special/unique brown power handlers.

**Scope:**
- `playAdditionalBirdInHabitat`: Test playing a second bird during turn
- `moveToAnotherHabitatIfRightmost`: Test bird movement power

**Dependencies:** Task 4 (Assertion Helpers)

---

## Pink Power Handler Scenarios

### [ ] Task 18: Pink Power Scenarios - Bird Played Triggers

**File:** `src/engine/__integration__/scenarios/pinkPowers/birdPlayedTriggers.test.ts`

Create scenario tests for pink powers triggered by BIRD_PLAYED events.

**Scope:**
- `whenOpponentPlaysBirdInHabitatGainFood`: Test habitat-specific bird play trigger
- `whenOpponentPlaysBirdInHabitatTuckCard`: Test tuck on opponent bird play
- Test that pink power does NOT trigger for self-played birds
- Test that pink power does NOT trigger for wrong habitat

**Dependencies:** Task 4 (Assertion Helpers)

---

### [ ] Task 19: Pink Power Scenarios - Egg Laid Triggers

**File:** `src/engine/__integration__/scenarios/pinkPowers/eggTriggers.test.ts`

Create scenario tests for pink powers triggered by EGGS_LAID events.

**Scope:**
- `whenOpponentLaysEggsLayEggOnNestType`: Test egg-laying response to opponent eggs
- Test nest type matching requirement
- Test that pink power does NOT trigger for self-laid eggs

**Dependencies:** Task 4 (Assertion Helpers)

---

### [ ] Task 20: Pink Power Scenarios - Predator Triggers

**File:** `src/engine/__integration__/scenarios/pinkPowers/predatorTriggers.test.ts`

Create scenario tests for pink powers triggered by PREDATOR_POWER_RESOLVED events.

**Scope:**
- `whenOpponentPredatorSucceedsGainFood`: Test food gain on opponent predator success
- Test that pink power does NOT trigger on predator failure
- Test that pink power does NOT trigger for self predator

**Dependencies:** Task 4 (Assertion Helpers)

---

### [ ] Task 21: Pink Power Scenarios - Food Gain Triggers

**File:** `src/engine/__integration__/scenarios/pinkPowers/foodGainTriggers.test.ts`

Create scenario tests for pink powers triggered by FOOD_GAINED events.

**Scope:**
- `whenOpponentGainsFoodCacheIfMatch`: Test caching when opponent gains matching food
- Test food type matching requirement
- Test that pink power does NOT trigger for self food gain

**Dependencies:** Task 4 (Assertion Helpers)

---

## Coverage and Verification

### [ ] Task 22: Coverage Tracking Utility

**File:** `src/engine/__integration__/coverage.ts`

Create a utility for tracking handler coverage across scenario tests.

**Scope:**
- Export list of all handler IDs (38 power + 4 turn action)
- Implement function to scan scenario files and extract `targetHandlers`
- Implement function to compute coverage percentage
- Create `yarn test:scenario` package.json script to run to verify 100% coverage. It should be able to accept test filepaths as args, and a `--coverage` arg for generating the coverage report and printing it to the console.


**Dependencies:** All scenario tasks (Tasks 5-21)

---

### [ ] Task 23: Final Verification and Bug Fixing

Ensure all scenario tests pass without issues.

**Scope:**
- Use `yarn test:scenario`, passing spec test file paths, to check that all the scenario tests pass
- If `--coverage` is passed, verify that a coverage report gets generated and printed to the console after
- If any issues are discovered, fix them now. If you are unable to fix them all, write your findings + remaining TODOs to the ScenarioTestLearnings.md file.

**Dependencies:** Task 22 (Coverage Tracking)

---