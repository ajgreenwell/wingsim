# Scenario Test Learnings

## Task 1: ScriptedAgent Implementation

### PowerSpec Structure
The `PowerSpec` type in `src/types/core.ts` has the following fields:
- `handlerId: string`
- `trigger: "WHEN_ACTIVATED" | "WHEN_PLAYED" | "ONCE_BETWEEN_TURNS"`
- `params: Record<string, unknown>`
- `text: string`

Note: There is NO `color` field in PowerSpec - the color (brown/pink/white) is implicit in the trigger type.

### ScriptedChoice Implementation
- ScriptedChoice is a union of all choice types with `promptId` omitted
- The `kind` field is used to match choices to prompts - the agent validates that the next scripted choice's `kind` matches the received prompt's `kind`
- The agent copies the script array in the constructor to prevent external mutation

### Test Helper Patterns
When creating test prompts for ActivatePowerPrompt, you need:
- `promptId`, `playerId`, `kind: "activatePower"`, `view`, `context`
- `birdInstanceId`: The runtime instance ID of the bird with the power
- `power`: A valid PowerSpec object with the fields listed above

### Directory Structure
The `__integration__` directory was created with subdirectories for scenario categories:
- `src/engine/__integration__/scenarios/brownPowers/`
- `src/engine/__integration__/scenarios/pinkPowers/`
- `src/engine/__integration__/scenarios/turnActions/`

## Task 2: ScenarioBuilder Implementation

### Duck-Typed Factory Functions vs Inheritance
The `BirdCardSupply`, `DiscardableDeck`, and `Birdfeeder` classes all shuffle/roll on construction and don't expose methods to set internal state directly. Rather than modifying these core classes or using complex inheritance, the ScenarioBuilder uses **duck-typed factory functions** that create objects matching the interface but with preset state:
- `createPresetBirdCardSupply()` - creates a BirdCardSupply-compatible object with a preset deck order and tray
- `createPresetDiscardableDeck()` - creates a DiscardableDeck-compatible object with a preset deck order
- `createPresetBirdfeeder()` - creates a Birdfeeder-compatible object with preset dice

This approach keeps the core engine classes clean while providing full control for testing.

### BuiltScenario Returns GameState, Not GameEngine
The spec originally mentioned `GameEngine.fromState()`, but the implementation returns `BuiltScenario` containing `gameState` (not engine) because:
1. The ScenarioRunner will need to create the GameEngine with the agents
2. This separation makes the builder more focused and testable
3. The ScenarioRunner can wire up the GameState with agents into the engine

### Bird Instance ID Convention
Bird instance IDs follow the format `{playerId}_{cardId}`, e.g., `alice_barn_owl`. This is created by the ScenarioBuilder when placing birds on the board.

### Turn Block Grouping
The `turns` array in ScenarioConfig is grouped by player to create per-player choice queues. Choices are appended in the order they appear in the `turns` array, preserving execution order even when a player has multiple turn blocks (e.g., for pink power responses during another player's turn).

### Card Removal Strategy
The builder collects ALL cards that appear in:
- Player hands
- Player boards (bird placements)
- Tucked cards on birds
- Bird tray configuration
- Deck top cards
- Bonus cards held by players
- Bonus deck top cards

These are removed from the main decks to ensure no duplicates and deterministic state.

## Task 3: ScenarioRunner Implementation

### GameObserver Interface
Created `src/engine/GameObserver.ts` with a simple interface:
- `onEventProcessing?(event: Event): void` - called when an event is about to be processed
- `onEffectApplied?(effect: Effect): void` - called when an effect is about to be applied

Both methods are optional since observers may only care about one type.

### GameEngine.fromState() Factory
The `GameEngine.fromState()` static factory method creates an engine from a pre-built `GameState`. This uses `Object.create()` to bypass the constructor (which calls `setupGame()`) and then manually initializes all private fields via a `Record<string, unknown>` cast.

### GameEngine.runSingleTurn()
The `runSingleTurn()` method runs a single turn for the current active player and then advances `activePlayerIndex` to the next player (round-robin). This differs from the internal `runTurn()` which doesn't advance the player index.

### Birdfeeder Dice Selection Limitation
The `buildLimitedAvailableDice()` function in `ActionHandlers.ts` limits which dice are **offered** to the player based on array position, not just how many can be taken. For column 0 (empty FOREST), only 1 die is offered - the first die in the birdfeeder array. This affects scenario design: scripted choices must select from the offered dice, not from all dice in the feeder.

### ScenarioRunner Architecture
The `runScenario()` function:
1. Creates a `DataRegistry` and `ScenarioBuilder`
2. Builds the scenario to get `gameState` and `agents`
3. Creates a `GameEngine` via `GameEngine.fromState()`
4. Registers a `ScenarioObserver` to collect events/effects
5. Runs the specified number of turns via `runSingleTurn()`
6. Executes assertion callbacks with full `ScenarioContext`
7. Optionally verifies all agent scripts were consumed

### Validation Reprompt Behavior
When the ActionProcessor's choice validation fails (e.g., selecting a die not in `availableDice`), it reprompts with the same prompt ID. The `ScriptedAgent` consumes a choice on each call to `chooseOption()`, so invalid choices in the script will exhaust it quickly. Ensure scripted choices only select from the dice/options that will actually be offered.

## Task 4: Assertion Helpers Implementation

### Additional Assertions Beyond Spec
Beyond the spec-required assertions, additional helpers were implemented for common use cases:
- `handlerWasNotInvoked()` - negation of handlerWasInvoked
- `playerHasTotalFood()` - check total food count across all types
- `birdHasNoCachedFood()` - verify a bird has no cached food
- `playerHasCardInHand()` - check for specific card in hand
- `birdExistsOnBoard()` - verify bird placement
- `totalBirdCount()` - count all birds across habitats
- `eventWasNotEmitted()` - negation of eventWasEmitted
- `eventEmittedTimes()` - count specific event occurrences
- `playerBonusCardCount()` - count bonus cards
- `custom()` - wrapper for inline custom assertions with nice error messages

### Effect Filtering for Handler Assertions
Handler assertions filter effects by checking `type === "ACTIVATE_POWER"` AND `activated === true`. The `activated` check is important because `ActivatePowerEffect` is also emitted when a player declines a power (with `activated: false`).

## Task 5: gainFoodHandler Scenario Tests

### Habitat Bonus Availability
The FOREST habitat bonus is only available at columns 1, 3, and 5 (see `player_board.json`). Column 0 has `null` for bonus. To test the bonus, place at least 1 bird in FOREST to reach column 1.

### Birds Without Powers
For testing basic mechanics without triggering brown powers, use birds with `power: null`:
- `hooded_warbler` - FOREST only
- `prothonotary_warbler` - FOREST, WETLAND
- `blue_winged_warbler` - FOREST, GRASSLAND
- `american_woodcock` - FOREST, GRASSLAND
- `wild_turkey` - FOREST, GRASSLAND
- `trumpeter_swan` - WETLAND only

### Birdfeeder Reroll RNG
The preset birdfeeder's `rerollAll()` uses the `rng` passed during creation in ScenarioBuilder. The RNG state is affected by earlier operations (shuffling decks, etc.), so the actual dice after a reroll with `seed: 12345` are `[FISH, RODENT, RODENT, RODENT, SEED_INVERTEBRATE]` in a minimal scenario.

### REROLL_BIRDFEEDER is an Effect, Not an Event
To check if a reroll happened, filter effects (`ctx.effects`) for `type === "REROLL_BIRDFEEDER"`, not events.

### Food Selection Per Iteration
The `gainFoodHandler` issues one `selectFoodFromFeeder` prompt per food to gain. With base reward 1 and bonus 1, there are 2 separate food selection prompts - each selects exactly 1 die.

## Task 6: layEggsHandler Scenario Tests

### Bird Egg Capacities
Always verify bird egg capacities before writing tests. Common no-power birds and their capacities:
- `trumpeter_swan` - capacity 2 (WETLAND)
- `prothonotary_warbler` - capacity 4 (FOREST, WETLAND)
- `hooded_warbler` - capacity 2 (FOREST)
- `blue_winged_warbler` - capacity 2 (FOREST, GRASSLAND)
- `american_woodcock` - capacity 2 (FOREST, GRASSLAND)
- `wild_turkey` - capacity 5 (FOREST, GRASSLAND) - **highest capacity no-power bird**

### Choice Validation Reprompt Behavior
When a `placeEggs` choice fails validation (e.g., exceeds capacity), the ActionProcessor reprompts with the SAME prompt ID but increments the internal attempt counter. The ScriptedAgent consumes a choice on EACH call, so if the first choice is invalid, the agent will consume subsequent choices for reprompts. This means invalid choices in the script will cause `ScriptExhaustedError` quickly.

### GRASSLAND Base Rewards
Per `player_board.json`, GRASSLAND base rewards by column:
- Column 0: 2 eggs
- Column 1: 2 eggs (has bonus slot)
- Column 2: 3 eggs
- Column 3: 3 eggs (has bonus slot)
- Column 4: 4 eggs
- Column 5: 4 eggs (has bonus slot)

### Prompt ID Numbering
Prompt IDs start at `prompt_1` (not `prompt_0`) because `generatePromptId()` uses pre-increment `++this.promptCounter`. The first prompt (TurnActionPrompt from GameEngine.runTurn) gets `prompt_1`.

## Task 7: drawCardsHandler Scenario Tests

### WETLAND Base Rewards
Per `player_board.json`, WETLAND base rewards by column:
- Column 0: 1 card
- Column 1: 1 card (has bonus slot)
- Column 2: 2 cards
- Column 3: 2 cards (has bonus slot)
- Column 4: 3 cards
- Column 5: 3 cards (has bonus slot)

### WETLAND Bonus Cost
The WETLAND bonus trades 1 egg for 1 extra card draw. Unlike FOREST (trade cards for food) or GRASSLAND (trade food for eggs), WETLAND requires eggs to activate the bonus. If no eggs are available on any bird, the bonus prompt is skipped.

### DrawCardsChoice Structure
The `DrawCardsChoice` has two fields:
- `trayCards: BirdCardId[]` - IDs of cards to draw from the face-up tray
- `numDeckCards: number` - count of blind draws from the deck

Players can draw from both sources in a single choice, or across multiple choices within the same draw action.

### Card Draw Iteration
The `drawCardsHandler` loops while `remaining > 0`, issuing a `drawCards` prompt each iteration. The loop breaks if the player draws 0 cards in an iteration (e.g., empty tray and deck). This allows flexible scripting: draw all cards in one choice, or split across multiple choices.

### WETLAND Brown Power Bird
`american_coot` is a good WETLAND bird for testing brown power chains. It has the `tuckAndDraw` power (tuck 1 card from hand, draw 1 card), which tests both hand manipulation and draw mechanics.

### Valid Bird Card IDs for Tray
Always verify bird IDs exist before using them in `birdTray`. Some common birds that DO NOT exist: `house_sparrow`. Use `song_sparrow`, `chipping_sparrow`, or other verified IDs instead.

## Task 8: playBirdHandler Scenario Tests

### WILD Food Cost Eligibility Limitation
The `PlayerState.getEligibleBirdsToPlay()` method does NOT handle WILD food costs specially. Birds with `WILD: n` in their foodCost require the player to have `n` WILD food tokens to be considered eligible. This is a known limitation - the method checks for exact food type matches rather than treating WILD as "any food type". For scenario tests, either:
- Give the player WILD food tokens matching the cost
- Use birds without WILD costs for basic mechanics testing

### WHEN_PLAYED (White) Powers Not Auto-Triggered
The GameEngine's `processEvent()` method handles `BIRD_PLAYED` events by triggering pink powers for OTHER players, but it does NOT automatically trigger WHEN_PLAYED powers for the bird itself. This is a missing feature in the current implementation. The handler mechanism exists (powers can be executed via `executeSinglePower`), but the GameEngine doesn't wire up WHEN_PLAYED power execution after bird placement.

### Egg Costs by Column
Per `player_board.json`, the `playBirdCosts` array is `[1, 1, 2, 2, 3]`:
- Column 0: 1 egg
- Column 1: 1 egg
- Column 2: 2 eggs
- Column 3: 2 eggs
- Column 4: 3 eggs

This differs from standard Wingspan rules where columns 0-1 are free.

### PlayBirdChoice Structure
The `PlayBirdChoice` has four key fields:
- `bird: BirdCardId` - which bird from hand to play
- `habitat: Habitat` - which habitat to place the bird in
- `foodToSpend: FoodByType` - food tokens to pay
- `eggsToSpend: EggsByBird` - eggs to remove from birds (keyed by BirdInstanceId)

### Bird Instance ID for Newly Played Birds
When a bird is played, its instance ID follows the pattern `{playerId}_{cardId}`, e.g., `alice_hooded_warbler`. Use this pattern in assertions after playing a bird.

## Task 9: Brown Power - Food Gain Handlers

### Power Skip vs Power Decline
When a power cannot activate due to missing resources, the handler calls `skipPowerDueToResourceUnavailable()` which emits an `ACTIVATE_POWER` effect with:
- `activated: false`
- `skipReason: "RESOURCE_UNAVAILABLE"`

This differs from player decline, which also has `activated: false` but no `skipReason`. The `handlerWasNotInvoked()` assertion checks for ANY `ACTIVATE_POWER` effect with that handler, so it will match both skipped and declined powers. For precise testing of resource-unavailable skips, use a custom assertion that checks `skipReason`.

### gainFoodFromFeederIfAvailable Reroll Logic
This handler has special reroll behavior:
1. If food not available AND reroll not possible → skip power (no activation prompt)
2. If food not available BUT reroll possible → offer activation prompt, player can reroll
3. After reroll, if still no food and no reroll possible → power ends without food gain
4. If food appears after reroll → prompt for selection

The handler counts `SEED_INVERTEBRATE` as matching when looking for `SEED` or `INVERTEBRATE`.

### gainAllFoodTypeFromFeeder is WHEN_PLAYED Only
All birds with `gainAllFoodTypeFromFeeder` (`bald_eagle`, `northern_flicker`) use `WHEN_PLAYED` trigger. Since WHEN_PLAYED powers are not auto-triggered by the GameEngine (see Task 8 learnings), these cannot be tested via scenario tests currently. Tests are marked as skipped with comments explaining the limitation.

### Brown Power Birds for Testing
Key birds with WHEN_ACTIVATED food gain powers:
- `blue_gray_gnatcatcher` - `gainFoodFromSupply` (INVERTEBRATE)
- `carolina_chickadee` - `cacheFoodFromSupply` (SEED)
- `acorn_woodpecker` - `gainFoodFromFeederWithCache` (SEED)
- `american_redstart` - `gainFoodFromFeeder` (WILD - any die)
- `great_crested_flycatcher` - `gainFoodFromFeederIfAvailable` (INVERTEBRATE)

### selectFoodDestination Choice
When a power offers caching vs supply as a destination, the `selectFoodDestination` choice has:
- `destination: "CACHE_ON_SOURCE_BIRD"` - cache on the bird that has the power
- `destination: "PLAYER_SUPPLY"` - add to player's food supply

### RNG-Dependent Tests Are Fragile
Tests that rely on specific dice rolls after reroll are fragile because the RNG state is affected by earlier scenario operations (deck shuffling, etc.). Prefer tests that:
- Don't require specific RNG outcomes
- Test the activation/decline flow rather than post-reroll state
- Use deterministic setups where the required food is already available

## Task 10: Brown Power - Egg Laying Handlers

### leftmostEmpty Determines Base Reward
The `layEggsHandler` uses `leftmostEmpty = player.board.getLeftmostEmptyColumn("GRASSLAND")` to determine the base reward. With N birds already placed, `leftmostEmpty = N`, so the base reward is `baseRewards[N]`. This is critical for scenario scripting:
- 0 birds → leftmostEmpty = 0 → base reward = 2 eggs
- 1 bird → leftmostEmpty = 1 → base reward = 2 eggs
- 2 birds → leftmostEmpty = 2 → base reward = 3 eggs
- 3 birds → leftmostEmpty = 3 → base reward = 3 eggs

### placeEggs Validation Requires Exact Count
The `validatePlaceEggsChoice` function requires that `totalEggs === prompt.count`. If your script places fewer eggs than the base reward, validation fails and the engine reprompts, consuming more scripted choices. Always place exactly the expected number of eggs.

### layEggsOnBird Birds for Testing
Key GRASSLAND birds with `layEggsOnBird` WHEN_ACTIVATED power:
- `bairds_sparrow` - "Lay 1 egg on any bird", capacity 2
- `grasshopper_sparrow` - "Lay 1 egg on any bird", capacity 2
- `chipping_sparrow` - "Lay 1 egg on any bird", capacity 3 (FOREST/GRASSLAND)
- `mourning_dove` - "Lay 1 egg on this bird", capacity 5 (all habitats)
- `scaled_quail` - "Lay 1 egg on this bird", capacity 6

### layEggOnBirdsWithNestType is WHEN_PLAYED Only
All birds with `layEggOnBirdsWithNestType` use WHEN_PLAYED trigger:
- `ash_throated_flycatcher` (CAVITY nest)
- `bobolink` (GROUND nest)
- `inca_dove` (PLATFORM nest)
- `says_phoebe` (BOWL nest)

Since WHEN_PLAYED powers are not auto-triggered by GameEngine (see Task 8), these handlers cannot be tested via scenario tests currently. Tests are marked as skipped.

### Brown Power Chain Order
Powers execute right-to-left in the habitat. With birds at columns 0, 1, 2, the column 1 power executes before column 0 (if column 2 has no power). The `getBirdsWithBrownPowers()` method returns bird IDs in right-to-left order.

## Task 11: Brown Power - Card Draw Handlers

### deckTopCards and birdTray Interaction
When setting `deckTopCards` in a scenario config, you MUST also set `birdTray` explicitly. Otherwise, the tray auto-fills from the deck on initialization, consuming your stacked deck cards. This means if you specify `deckTopCards: ["a", "b", "c"]` without `birdTray`, the tray will contain `["a", "b", "c"]` and the deck will have none of those cards.

### Card Draw Handlers by Trigger Type
- `drawCards`: Mallard is the only WHEN_ACTIVATED bird (WETLAND, draws 1 card)
- `drawFaceUpCardsFromTray`: ALL birds use WHEN_PLAYED (e.g., Brant) - BLOCKED for scenario tests
- `drawCardsWithDelayedDiscard`: Multiple WHEN_ACTIVATED birds (Black Tern, Clark's Grebe, Common Yellowthroat, Forster's Tern, Pied-billed Grebe, Ruddy Duck, Red-breasted Merganser, Wood Duck)
- `drawBonusCardsAndKeep`: ALL birds use WHEN_PLAYED (Atlantic Puffin, California Condor, etc.) - BLOCKED for scenario tests

### drawCardsWithDelayedDiscard Mechanics
This handler:
1. Checks deck size BEFORE prompting (skips if empty)
2. Draws cards immediately from deck only (not tray)
3. Defers discard to end of turn using `deferToEndOfTurn()` wrapper
4. The deferred discard reads live state, so the player discards from their updated hand

The `selectCards` choice for the deferred discard must match the discard count (or fewer if hand is smaller).

### Card Draw Birds for Testing
Key WETLAND birds with WHEN_ACTIVATED card draw powers:
- `mallard` - `drawCards`, draws 1 card (from deck or tray)
- `black_tern` - `drawCardsWithDelayedDiscard`, draws 1, discards 1
- `common_yellowthroat` - `drawCardsWithDelayedDiscard`, draws 2, discards 1
- `clarks_grebe` - `drawCardsWithDelayedDiscard`, draws 1, discards 1
- `forsters_tern` - `drawCardsWithDelayedDiscard`, draws 1, discards 1

### selectCards Choice for Discard
The `selectCards` choice (used in delayed discard) has:
- `kind: "selectCards"`
- `cards: BirdCardId[]` - array of card IDs to discard

This differs from `drawCards` choice which has `trayCards` and `numDeckCards` fields.
