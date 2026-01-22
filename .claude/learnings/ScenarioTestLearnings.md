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
Per `player_board.json`, the `playBirdCosts` array is `[0, 0, 1, 1, 2]` (aligned with standard Wingspan rules):
- Column 0: 0 eggs (free)
- Column 1: 0 eggs (free)
- Column 2: 1 egg
- Column 3: 1 egg
- Column 4: 2 eggs

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

## Task 12: Brown Power - Tuck Handlers

### Tuck Handler Types
Five tuck-related handlers exist:
1. `tuckAndDraw` - Tuck from hand, draw cards (e.g., American Coot, Yellow-Rumped Warbler)
2. `tuckFromHandAndLay` - Tuck from hand, lay eggs (e.g., Brewer's Blackbird, White-Throated Swift)
3. `tuckAndGainFood` - Tuck from hand, gain specific food from supply (e.g., Cedar Waxwing for FRUIT, Dark-Eyed Junco for SEED)
4. `tuckAndGainFoodOfChoice` - Tuck from hand, choose food type from options (e.g., Pygmy Nuthatch for INVERTEBRATE or SEED)
5. `discardFoodToTuckFromDeck` - Pay food to tuck from deck (e.g., American White Pelican for FISH, Canada Goose for SEED)

### handlerWasSkipped Assertion
When a power is skipped due to resource unavailability (e.g., empty hand for tuck powers, no required food), the handler emits an `ACTIVATE_POWER` effect with `activated: false` and `skipReason: "RESOURCE_UNAVAILABLE"`. The new `handlerWasSkipped()` assertion checks for this specific pattern. Note that `handlerWasNotInvoked()` now only checks for `activated === true` effects, so it correctly returns true when a power was skipped.

### tuckFromHandAndLay Always Prompts for Egg Placement
Even with `eggTarget: "THIS_BIRD"`, the handler prompts the player with a `placeEggs` choice. The prompt limits eligible birds to just the power's bird, but the player still must respond with the `placeEggs` choice.

### Tuck Powers Check Hand BEFORE Base Action Completes
Tuck power handlers check `view.hand.length === 0` before the activation prompt. However, by the time a brown power runs, the base action has already completed. For DRAW_CARDS in WETLAND, the player will have drawn cards into their hand. To test "skips when hand empty", use a habitat action that doesn't add cards to hand:
- FOREST with GAIN_FOOD action - Yellow-Rumped Warbler has `tuckAndDraw` in FOREST
- GRASSLAND with LAY_EGGS action - Brewer's Blackbird has `tuckFromHandAndLay` in GRASSLAND

### discardFoodToTuckFromDeck Skips on Missing Food
Unlike other tuck handlers that check for empty hand, `discardFoodToTuckFromDeck` checks for the required food type. If the player has 0 of the required food (e.g., 0 FISH for American White Pelican), the power is skipped with `RESOURCE_UNAVAILABLE`.

### placeEggs vs eggs Field Name
The `PlaceEggsChoice` type uses `placements` field, not `eggs`. Using the wrong field name causes TypeScript errors.

## Task 13: Brown Power - Discard-for-Reward Handlers

### discardEggToGainFood vs discardEggToDrawCards Egg Source Restriction
Critical distinction between these two handlers:
- `discardEggToGainFood`: Eggs must come from OTHER birds (excluding the power bird itself). The handler excludes `bird.id !== ctx.birdInstanceId` when collecting eligible birds.
- `discardEggToDrawCards`: Eggs can come from ANY bird (including the power bird itself). The handler allows all birds with eggs.

This means if the only bird with eggs is the power bird itself, `discardEggToGainFood` will skip (RESOURCE_UNAVAILABLE) while `discardEggToDrawCards` will still be available.

### discardEggToGainFood Birds
All birds with this handler use `{foodType: "WILD", foodCount: 1 or 2, eggCount: 1}`:
- `american_crow` (all habitats) - gains 1 WILD
- `black_crowned_night_heron` (WETLAND) - gains 1 WILD
- `chihuahuan_raven` (GRASSLAND) - gains 2 WILD
- `common_raven` (all habitats) - gains 2 WILD
- `fish_crow` (all habitats) - gains 1 WILD

### discardEggToDrawCards Birds
Both birds use `{drawCount: 2, eggCount: 1}`:
- `franklins_gull` (GRASSLAND, WETLAND)
- `killdeer` (GRASSLAND, WETLAND)

### tradeFoodType is Unique to Green Heron
Only one bird in the game has this power:
- `green_heron` (WETLAND) - `{count: 1, fromType: "WILD", toType: "ANY"}`

This trades 1 food of any type for 1 food of any other type from the supply.

### DiscardEggsChoice Field Name
The `DiscardEggsChoice` type uses `sources` field (not `eggs` or `placements`). It's a Record<BirdInstanceId, number> mapping bird IDs to egg counts.

### DiscardFoodChoice Field Name
The `DiscardFoodChoice` type uses `food` field with `FoodByType` structure.

## Task 14: Brown Power - Predator Handlers

### Two Types of Predator Powers
1. **rollDiceAndCacheIfMatch**: Rolls dice not in the birdfeeder, caches food if any die matches the target food type. Birds include American Kestrel (RODENT), Anhinga (FISH), Barn Owl (RODENT), etc.
2. **lookAtCardAndTuckIfWingspanUnder**: Reveals top card from deck, tucks if wingspan < threshold, discards otherwise. Birds include Barred Owl (75cm), Golden Eagle (100cm), Greater Roadrunner (50cm).

### PREDATOR_POWER_RESOLVED Event
Both predator handlers emit `PREDATOR_POWER_RESOLVED` events with:
- `predatorType`: Either `"DICE_ROLL"` or `"WINGSPAN_CHECK"`
- `success`: Boolean indicating if the predator caught prey
- For dice roll: `diceRoll.targetFoodType`, `diceRoll.matchCount`, etc.
- For wingspan check: `wingspanCheck.revealedCardId`, `wingspanCheck.wingspan`, `wingspanCheck.threshold`, `wingspanCheck.disposition`

### DiscardCardsEffect fromRevealed Field
The engine required a bug fix: when predator powers fail the wingspan check, the revealed card needs to be discarded directly (not from hand). The `DiscardCardsEffect` now has a `fromRevealed?: boolean` field. When true, cards are discarded directly to the discard pile without checking the player's hand.

### Dice Roll Predator Testing Limitations
Cannot control dice roll outcomes in scenario tests since they depend on RNG. Tests verify:
- The handler was invoked
- The PREDATOR_POWER_RESOLVED event was emitted with correct predatorType
- The power can be declined

### Wingspan Check Predator Birds for Testing
- `barred_owl` - 75cm threshold (FOREST)
- `golden_eagle` - 100cm threshold (GRASSLAND/WETLAND, capacity 1)
- `greater_roadrunner` - 50cm threshold (GRASSLAND)
- `red_tailed_hawk` - 75cm threshold (all habitats)

### Bird Wingspans for Testing Wingspan Check Powers
- `american_goldfinch` - 23cm (will succeed for all predators)
- `trumpeter_swan` - 203cm (will fail for all predators)
- `american_bittern` - 107cm (will fail for 75cm and 100cm threshold predators)

### Predator Power Skip Condition
- `rollDiceAndCacheIfMatch`: Skips when all 5 dice are in the birdfeeder (no dice to roll)
- `lookAtCardAndTuckIfWingspanUnder`: Skips when the deck is empty (no card to reveal)

### Golden Eagle Capacity Limitation
Golden Eagle has egg capacity of 1. When testing with LAY_EGGS in GRASSLAND, add a second bird (like wild_turkey) to absorb the extra eggs from the base reward.

## Task 15: Brown Power - Multi-Player Handlers

### Multi-Player Handler Types
Six WHEN_ACTIVATED multi-player handlers (testable via scenarios):
1. `playersWithFewestInHabitatDrawCard` - American Bittern, Common Loon (compare bird counts, draw cards)
2. `playersWithFewestInHabitatGainFood` - Hermit Thrush (compare bird counts, gain from feeder)
3. `eachPlayerGainsFoodFromFeeder` - Anna's/Ruby-Throated Hummingbird (round-robin from selected start)
4. `allPlayersGainFoodFromSupply` - Baltimore Oriole, Osprey, etc. (automatic, no prompts)
5. `allPlayersDrawCardsFromDeck` - Canvasback, Purple Gallinule, etc. (automatic, no prompts)
6. `allPlayersLayEggOnNestType` - Lazuli Bunting, Pileated Woodpecker, etc. (prompts each player, owner gets bonus)

One WHEN_PLAYED handler (NOT testable):
- `drawAndDistributeCards` - American Oystercatcher

### Multi-Player Turn Block Ordering
For `playersWithFewestInHabitat*` and `eachPlayerGainsFoodFromFeeder`, choices are prompted in turn order starting from the owner (or selected player). Script turn blocks must match this order. Example:
```typescript
turns: [
  { player: "alice", choices: [..., { kind: "activatePower", activate: true }, ...] },
  { player: "bob", choices: [{ kind: "selectFoodFromFeeder", ... }] },  // Bob's choice from power
  { player: "alice", choices: [{ kind: "selectFoodFromFeeder", ... }] }, // Alice's choice (if applicable)
]
```

### eachPlayerGainsFoodFromFeeder Requires selectPlayer Choice
After activating the power, you must provide a `selectPlayer` choice to specify which player starts the round-robin. The owner then selects food in their turn in the order.

### allPlayersGainFoodFromSupply/allPlayersDrawCardsFromDeck Are Automatic
These handlers emit a single effect (`ALL_PLAYERS_GAIN_FOOD` or `ALL_PLAYERS_DRAW_CARDS`) without any player prompts after activation. No additional choices needed beyond the activation prompt.

### allPlayersLayEggOnNestType Multi-Prompt Flow
This handler prompts EACH player in clockwise order from owner:
1. Owner places first egg(s)
2. Other players place egg(s) in order
3. Owner gets bonus egg prompt (must be on DIFFERENT bird than first placement)

Players without matching nest type birds with capacity are silently skipped (no prompt).

### No-Power BOWL Nest Birds for Testing
Key BOWL nest birds with `power: null`:
- `blue_winged_warbler` - BOWL, capacity 2, FOREST/GRASSLAND
- `hooded_warbler` - BOWL, capacity 3, FOREST only

Most BOWL birds have powers (e.g., `chipping_sparrow` has `layEggsOnBird`), so use the above for testing multi-player egg laying without additional power triggers.

### Song Sparrow Has a Power
Despite being commonly used as a "simple bird", `song_sparrow` has the `tuckAndDraw` power. Use `hooded_warbler` or `blue_winged_warbler` instead for power-free BOWL birds.

## Task 16: Brown Power - Power Repetition Handlers

### FOREST Base Reward Food Selection Constraint
When `buildLimitedAvailableDice(feeder, 1)` is called for each food selection, only the **first die** in the current feeder array is offered. This means:
1. First selection: only die at index 0 is available
2. After taking that die, the second selection only offers the new index 0 (previously index 1)

If a script tries to select a die that isn't at index 0 in the current feeder state, validation fails and the engine reprompts. This consumes extra scripted choices and causes `ScriptMismatchError`. Always select the first available die type, not a specific die from later in the array.

### Repeat Power Handler Birds
- `repeatBrownPowerInHabitat`: Gray Catbird (all habitats), Northern Mockingbird (all habitats) - both WHEN_ACTIVATED
- `repeatPredatorPowerInHabitat`: Hooded Merganser (WETLAND) - WHEN_ACTIVATED

### Repeat Power Eligibility
`repeatBrownPowerInHabitat` only considers other birds in the same habitat with:
1. Non-null `power` field
2. `trigger === "WHEN_ACTIVATED"` (brown powers only)

Birds without powers or with WHEN_PLAYED/ONCE_BETWEEN_TURNS triggers are not eligible for repeat.

### PREDATOR_POWER_RESOLVED Event Structure
When testing predator repeat powers, the event includes `predatorType` field:
- `"DICE_ROLL"` for `rollDiceAndCacheIfMatch` handlers
- `"WINGSPAN_CHECK"` for `lookAtCardAndTuckIfWingspanUnder` handlers

### playAdditionalBirdInHabitat is WHEN_PLAYED Only
All birds with `playAdditionalBirdInHabitat` handler use WHEN_PLAYED trigger:
- `downy_woodpecker`, `eastern_bluebird`, `great_blue_heron`, `great_egret`, `house_wren`, etc.

Since WHEN_PLAYED powers are not auto-triggered by GameEngine, these cannot be tested via scenario tests. Task 17's scope should be adjusted accordingly.

### moveToAnotherHabitatIfRightmost Birds
These are WHEN_ACTIVATED and testable:
- `bewicks_wren`, `blue_grosbeak`, `chimney_swift`, `common_nighthawk`, `lincolns_sparrow`, `song_sparrow`, `white_crowned_sparrow`, `yellow_breasted_chat`

## Task 17: Brown Power - Special Handlers

### moveToAnotherHabitatIfRightmost Eligibility Checks
The handler performs two eligibility checks before offering the activation prompt:
1. **Rightmost check**: Bird must be the rightmost (last non-null) bird in its current habitat
2. **Eligible habitats check**: At least one other habitat must have space (< 5 birds) AND the bird must be allowed to live there (per bird's `habitats` array)

If either check fails, the power is skipped with `RESOURCE_UNAVAILABLE`.

### Solo Bird is Rightmost
A single bird in a habitat is considered rightmost by definition. The check looks for `birdsInHabitat[length - 1].id === ctx.birdInstanceId`, so a solo bird passes this check.

### MOVE_BIRD Effect Structure
The `MoveBirdEffect` has:
- `type: "MOVE_BIRD"`
- `playerId`, `birdInstanceId`
- `fromHabitat`, `toHabitat`

The engine applies this by removing the bird from the old habitat slot and placing it at the leftmost empty column in the new habitat.

### SelectHabitatChoice for Movement
The `selectHabitat` choice has:
- `kind: "selectHabitat"`
- `habitat: Habitat` - must be one of the eligible habitats from the prompt

The prompt's `eligibleHabitats` array is filtered to only include habitats where the bird can legally move.

## Task 18: Pink Power - Bird Played Triggers

### Turn Action Handlers Don't Emit ACTIVATE_POWER
The `handlerWasInvoked()` assertion checks for `ACTIVATE_POWER` effects, but turn action handlers (like `playBirdHandler`) don't emit these effects. They emit effects like `PLAY_BIRD` and events like `BIRD_PLAYED` instead. For testing turn actions in pink power scenarios:
- Don't use `handlerWasInvoked("playBirdHandler")`
- Instead verify outcomes: `birdExistsOnBoard()`, `eventWasEmitted("BIRD_PLAYED", ...)`

### Pink Power Turn Order for Multiple Players
When multiple players have pink powers that trigger on the same event, they execute in clockwise order starting from the active player. If Bob (index 1) is active and Alice (index 0) and Carol (index 2) both have pink powers:
- Carol triggers first (next clockwise from Bob)
- Alice triggers second

Turn blocks in the scenario `turns` array must match this order.

### Pink Power Birds for BIRD_PLAYED Events
Key birds with pink powers triggered by BIRD_PLAYED:
- `belted_kingfisher` (WETLAND): `whenOpponentPlaysBirdInHabitatGainFood` - monitors WETLAND, gains FISH
- `eastern_kingbird` (FOREST/GRASSLAND/WETLAND): `whenOpponentPlaysBirdInHabitatGainFood` - monitors FOREST, gains INVERTEBRATE
- `horned_lark` (GRASSLAND): `whenOpponentPlaysBirdInHabitatTuckCard` - monitors GRASSLAND, tucks from hand

### Pink Power Habitat Matching
The `whenOpponentPlaysBirdInHabitat*` handlers check `triggeringEvent.habitat` against their `params.habitat`. If they don't match, the handler emits an `ACTIVATE_POWER` effect with `activated: false` (silently skipped) - no activation prompt is shown to the player.

### Pink Powers Only Trigger for Opponents
Pink powers (ONCE_BETWEEN_TURNS) only trigger when OTHER players perform the triggering action. When the owner plays a bird, their own pink powers don't trigger. The engine's `processPinkPowerTriggers()` method only checks non-active players' boards.

### No-Power Birds for Testing Pink Powers
Good birds for triggering BIRD_PLAYED events without adding extra power complexity:
- `hooded_warbler` - FOREST only, costs INVERTEBRATE: 2, no power
- `prothonotary_warbler` - FOREST/WETLAND, costs INVERTEBRATE: 2 + SEED: 1, no power
- `blue_winged_warbler` - FOREST/GRASSLAND, costs INVERTEBRATE: 2, no power

## Task 19: Pink Power - Egg Laid Triggers

### Birds with whenOpponentLaysEggsLayEggOnNestType Power
- `american_avocet` - WETLAND, requires GROUND nest for egg placement
- `barrows_goldeneye` - WETLAND, requires CAVITY nest for egg placement
- `bronzed_cowbird` - GRASSLAND, requires BOWL nest for egg placement
- `brown_headed_cowbird` - GRASSLAND, requires BOWL nest for egg placement
- `yellow_billed_cuckoo` - FOREST, requires BOWL nest for egg placement

### No-Power Birds by Nest Type
For testing nest type matching without triggering additional powers:
- **GROUND**: `american_woodcock` (FOREST/GRASSLAND), `trumpeter_swan` (WETLAND), `wild_turkey` (FOREST/GRASSLAND)
- **BOWL**: `hooded_warbler` (FOREST), `blue_winged_warbler` (FOREST/GRASSLAND)
- **CAVITY**: `prothonotary_warbler` (FOREST/WETLAND)

### Egg Laying Pink Power Skip Conditions
The `whenOpponentLaysEggsLayEggOnNestType` handler skips (with `RESOURCE_UNAVAILABLE`) when:
1. No other birds with matching nest type exist (excluding the power bird itself)
2. All birds with matching nest type are at egg capacity

The power text says "lay 1 egg on **another** bird with a [nest type] nest" - the power bird itself is explicitly excluded via `ctx.birdInstanceId` parameter to `getBirdsWithNestType()`.

### trumpeter_swan Has GROUND Nest
Despite being a water bird, `trumpeter_swan` has a GROUND nest type (not PLATFORM as one might assume). This is important when testing GROUND nest matching - trumpeter_swan counts as eligible.

## Task 20: Pink Power - Predator Triggers

### Birds with whenOpponentPredatorSucceedsGainFood Power
Three birds have this pink power:
- `black_vulture` - FOREST only
- `black_billed_magpie` - GRASSLAND only
- `turkey_vulture` - FOREST, GRASSLAND, WETLAND (most versatile for testing)

All have the same handler with `count: 1` parameter (gain 1 food from birdfeeder).

### Controlling Predator Outcomes for Testing
The `lookAtCardAndTuckIfWingspanUnder` predator power outcome can be controlled by stacking `deckTopCards`:
- Bird with wingspan < threshold → predator succeeds (card tucked)
- Bird with wingspan >= threshold → predator fails (card discarded)

Example thresholds:
- Golden Eagle: 100cm threshold
- Barred Owl: 75cm threshold
- Greater Roadrunner: 50cm threshold

Useful test birds:
- `american_goldfinch` (23cm) - will succeed for all predators
- `trumpeter_swan` (203cm) - will fail for all predators

### Golden Eagle Capacity Limitation Requires Extra Bird
Golden Eagle has egg capacity of 1. When testing with LAY_EGGS in GRASSLAND:
- Column 0 base reward is 2 eggs
- Column 2 base reward is 3 eggs (with 2 birds)
- Must add a second bird (like `wild_turkey` with capacity 5) to absorb extra eggs from base reward

If you don't add a second bird, the `placeEggs` validation will fail (total eggs != base reward) and cause `ScriptMismatchError`.

### Pink Power Does NOT Trigger for Own Predator
Pink powers (ONCE_BETWEEN_TURNS) only trigger when OTHER players perform the triggering action. When the owner's predator succeeds, their own pink power vulture does NOT trigger. The engine's `processPinkPowerTriggers()` only checks non-active players' boards.

### Pink Power Silent Skip on Predator Failure
When the predator fails (success: false in PREDATOR_POWER_RESOLVED event), the handler emits an `ACTIVATE_POWER` effect with `activated: false` but no `skipReason`. This is a "silent skip" - no activation prompt is shown to the player.

## Task 21: Pink Power - Food Gain Triggers

### whenOpponentGainsFoodCacheIfMatch Handler Details
- **Event**: `FOOD_GAINED_FROM_HABITAT_ACTIVATION` (emitted by `gainFoodHandler` after food is gained)
- **Bird**: Loggerhead Shrike (GRASSLAND, WETLAND) - monitors for RODENT
- **Params**: `{ foodType: "RODENT", count: 1 }`
- **Behavior**: When opponent gains matching food type via GAIN_FOOD action, cache `count` food from supply

### Food Type Matching
The handler checks `triggeringEvent.food[foodType] ?? 0` to see if any matching food was gained. If the food object has `RODENT: 0` or no RODENT key at all, the power silently skips (no activation prompt).

### CACHE_FOOD Effect Source
The effect uses `source: "SUPPLY"` to indicate the cached food comes from the unlimited supply, not from the opponent who gained food. This is important for verifying the power doesn't "steal" from opponents.

### Single Bird with This Power
Loggerhead Shrike is the only bird in the base game with `whenOpponentGainsFoodCacheIfMatch`. It monitors for RODENT specifically.

## Task 22: Coverage Tracking Utility

### Architecture
The coverage utility consists of three files:
- `coverage.ts` - Core module with handler lists and coverage computation
- `coverage.test.ts` - Unit tests for the coverage module
- `scripts/test-scenario.ts` - CLI script for running scenario tests with coverage

### yarn test:scenario Usage
- `yarn test:scenario` - Run all scenario tests
- `yarn test:scenario --coverage` - Run tests + print coverage report
- `yarn test:scenario path/to/test.ts` - Run specific test file(s)
- `yarn test:scenario:coverage` - Shorthand for `--coverage`

### Current Coverage Status
As of Task 22 completion: 36/42 handlers covered (86%)

Uncovered handlers (6 total, all require WHEN_PLAYED trigger support):
- `drawAndDistributeCards` - American Oystercatcher uses WHEN_PLAYED
- `drawBonusCardsAndKeep` - All birds use WHEN_PLAYED
- `drawFaceUpCardsFromTray` - All birds use WHEN_PLAYED
- `gainAllFoodTypeFromFeeder` - Bald Eagle, Northern Flicker use WHEN_PLAYED
- `layEggOnBirdsWithNestType` - All birds use WHEN_PLAYED
- `playAdditionalBirdInHabitat` - All birds use WHEN_PLAYED

These handlers cannot be tested via scenario tests until the GameEngine auto-triggers WHEN_PLAYED powers after bird placement (see Task 8 learnings).

## Task 23: Final Verification and Bug Fixing

### Final Test Results
- All 182 scenario tests pass (17 test files)
- 15 tests are skipped (expected, for WHEN_PLAYED power handlers)
- Coverage: 36/42 handlers (86%)
- All CLI commands work: `yarn test:scenario`, `yarn test:scenario --coverage`, `yarn test:scenario:coverage`, and file-specific runs

### Future Work: WHEN_PLAYED Support
To achieve 100% handler coverage, the GameEngine needs to auto-trigger WHEN_PLAYED powers after bird placement. The 6 uncovered handlers would then become testable via scenarios:
1. `drawAndDistributeCards`
2. `drawBonusCardsAndKeep`
3. `drawFaceUpCardsFromTray`
4. `gainAllFoodTypeFromFeeder`
5. `layEggOnBirdsWithNestType`
6. `playAdditionalBirdInHabitat`

This would require modifying `GameEngine.processEvent()` to trigger WHEN_PLAYED powers for the active player's just-placed bird when handling `BIRD_PLAYED` events.
