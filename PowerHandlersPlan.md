# Power Handlers Implementation Plan (Handlers #21-39)

This document outlines the implementation plan for power handlers 21 through 38 from `power_handlers.csv`. Each handler follows existing patterns established in `src/engine/ActionHandlers.ts`.

## Implementation Notes

### Invariant Checks
Handlers do NOT need to check low-level state invariants such as:
- Whether the birdfeeder has dice (handled by `Birdfeeder` class)
- Whether the deck has cards (handled by `DiscardableDeck` class)
- Whether supply has food (supply is unlimited)

These are enforced by the underlying game objects. Handlers should only check power-specific preconditions (e.g., player must have cards in hand to tuck).

### Triggering Event for Pink Powers
Pink power handlers (#21, #29, #30) can access the triggering event via `ctx.triggeringEvent` to inspect event-specific data (e.g., whether a predator succeeded, what food was gained).

### Handler Pattern
All handlers follow this general pattern:
1. Get bird card and power spec from registry
2. Check power-specific preconditions (skip if not met)
3. Prompt for activation via `withActivationPrompt()`
4. Execute power logic with appropriate prompts and effects

---

## Handler Implementations

### Group 1: Simple Automatic Powers

#### [ ] #23 - `drawFaceUpCardsFromTray` (Brant)
**Power Text**: "Draw the 3 face-up [card] in the bird tray."
**Trigger**: WHEN_PLAYED

**Effects**:
- `DrawCardsEffect` with `fromTray: [all tray card IDs]`, `fromDeck: 0`

**Prompts**:
- `ActivatePowerPrompt` only (drawing is automatic)

**Logic**:
1. Get current tray cards from view
2. Prompt for activation
3. Yield `DrawCardsEffect` with all tray card IDs

---

#### [ ] #26 - `cacheFoodFromSupply` (Carolina Chickadee)
**Power Text**: "Cache 1 [seed] from the supply on this bird."
**Trigger**: WHEN_ACTIVATED

**Parameters**: `foodType: "SEED"`, `count: 1`

**Effects**:
- `CacheFoodEffect` with `source: "SUPPLY"`

**Prompts**:
- `ActivatePowerPrompt` only (caching is automatic)

**Logic**:
1. Prompt for activation
2. Yield `CacheFoodEffect` with specified food type from supply

---

#### [ ] #27 - `allPlayersDrawCardsFromDeck` (Canvasback)
**Power Text**: "All players draw 1 [card] from the deck."
**Trigger**: WHEN_ACTIVATED

**Parameters**: `count: 1`

**Effects**:
- `AllPlayersDrawCardsEffect` with draws for each player

**Prompts**:
- `ActivatePowerPrompt` only (drawing is automatic from deck)

**Logic**:
1. Prompt for activation
2. Build `draws` map with each player getting `count` cards, drawn in 
3. Yield `AllPlayersDrawCardsEffect`

---

### Group 2: Tuck-Based Powers

#### [ ] #22 - `tuckAndLay` (Brewer's Blackbird)
**Power Text**: "Tuck 1 [card] from your hand behind this bird. If you do, you may also lay 1 [egg] on this bird."
**Trigger**: WHEN_ACTIVATED

**Parameters**:
- `tuckCount: 1`
- `eggCount: 1`
- `eggTarget: "ANY_BIRD" | "THIS_BIRD"`

**Effects**:
- `TuckCardsEffect`
- `LayEggsEffect`

**Prompts**:
- `ActivatePowerPrompt`
- `SelectCardsPrompt` (mode: "TUCK", source: "HAND")
- `PlaceEggsPrompt`

**Logic**:
1. Check player has cards in hand
2. Prompt for activation
3. Prompt to select card to tuck
4. Yield `TuckCardsEffect`
5. Check if this bird (or any bird) has egg capacity remaining
6. If yes, prompt whether to lay egg on eligible bird(s)
7. If player accepts, yield `LayEggsEffect`

---

#### [ ] #37 - `tuckAndGainFood` (Cedar Waxwing)
**Power Text**: "Tuck 1 [card] from your hand behind this bird. If you do, gain 1 [fruit] from the supply."
**Trigger**: WHEN_ACTIVATED

**Parameters**: `foodType: "FRUIT"`, `tuckCount: 1`, `foodCount: 1`

**Effects**:
- `TuckCardsEffect`
- `GainFoodEffect` with `source: "SUPPLY"`

**Prompts**:
- `ActivatePowerPrompt`
- `SelectCardsPrompt` (mode: "TUCK", source: "HAND")

**Logic**:
1. Check player has cards in hand
2. Prompt for activation
3. Prompt to select card to tuck
4. Yield `TuckCardsEffect`
5. Yield `GainFoodEffect` with specified food type

---

#### [ ] #38 - `tuckAndGainFoodOfChoice` (Pygmy Nuthatch)
**Power Text**: "Tuck 1 [card] from your hand behind this bird. If you do, gain 1 [invertebrate] or [seed] from the supply."
**Trigger**: WHEN_ACTIVATED

**Parameters**: `foodTypes: ["INVERTEBRATE", "SEED"]`, `tuckCount: 1`, `foodCount: 1`

**Effects**:
- `TuckCardsEffect`
- `GainFoodEffect` with `source: "SUPPLY"`

**Prompts**:
- `ActivatePowerPrompt`
- `SelectCardsPrompt` (mode: "TUCK", source: "HAND")
- `SelectFoodFromSupplyPrompt` (allowedFoods: foodTypes)

**Logic**:
1. Check player has cards in hand
2. Prompt for activation
3. Prompt to select card to tuck
4. Yield `TuckCardsEffect`
5. Prompt to select food type from allowed options
6. Yield `GainFoodEffect` with selected food

---

### Group 3: Card Drawing Powers

#### [ ] #24 - `drawCards` (Black-Necked Stilt)
**Power Text**: "Draw 2 [card]."
**Trigger**: WHEN_PLAYED

**Parameters**: `count: 2`

**Effects**:
- `DrawCardsEffect`

**Prompts**:
- `ActivatePowerPrompt`
- `DrawCardsPrompt` (player chooses deck vs tray)

**Logic**:
1. Prompt for activation
2. Prompt with `DrawCardsPrompt` for each card (or batch)
3. Yield `DrawCardsEffect` with player's choices

**Notes**:
Will need to handle looping if agent draws 1 card at a time and more than 1 card needs to be drawn in total.

---

#### [ ] #35 - `discardEggToDrawCards` (Franklin's Gull)
**Power Text**: "Discard 1 [egg] to draw 2 [card]."
**Trigger**: WHEN_ACTIVATED

**Parameters**: `eggCount: 1`, `drawCount: 2`

**Effects**:
- `DiscardEggsEffect`
- `DrawCardsEffect`

**Prompts**:
- `ActivatePowerPrompt`
- `DiscardEggsPrompt`
- `DrawCardsPrompt`

**Logic**:
1. Check player has eggs on any bird
2. Prompt for activation
3. Prompt to select egg to discard
4. Yield `DiscardEggsEffect`
5. Prompt for card drawing choices
6. Yield `DrawCardsEffect`

**Pattern**: Follow `discardEggToGainFood` handler

---

### Group 4: Pink Powers (ONCE_BETWEEN_TURNS)

#### [ ] #21 - `whenOpponentPredatorSucceedsGainFood` (Black Vulture)
**Power Text**: "When another player's [predator] succeeds, gain 1 [die] from the birdfeeder."
**Trigger**: ONCE_BETWEEN_TURNS

**Triggering Event**: `PredatorPowerResolvedEvent`

**Effects**:
- `GainFoodEffect` with `source: "BIRDFEEDER"`

**Prompts**:
- `ActivatePowerPrompt`
- `SelectFoodFromFeederPrompt`

**Logic**:
1. Access `ctx.triggeringEvent`, make sure it's a `PredatorPowerResolvedEvent`, and check `event.success === true`
2. If predator failed, skip without prompting
3. Prompt for activation
4. Prompt to select food from birdfeeder (handle reroll if needed)
5. Yield `GainFoodEffect`

**Note**:
We should extract a reusable helper in ActionHandlers.ts for handling `SelectFoodFromFeederPrompt`s with rerolls, since this is a common pattern used by other handlers too.

---

#### [ ] #29 - `whenOpponentPlaysBirdInHabitatTuckCard` (Horned Lark)
**Power Text**: "When another player plays a bird in their [grassland], tuck 1 [card] from your hand behind this bird."
**Trigger**: ONCE_BETWEEN_TURNS

**Parameters**: `habitat: "GRASSLAND"`, `count: 1`

**Triggering Event**: `BirdPlayedEvent`

**Effects**:
- `TuckCardsEffect`

**Prompts**:
- `ActivatePowerPrompt`
- `SelectCardsPrompt` (mode: "TUCK", source: "HAND")

**Logic**:
1. Check player has cards in hand
2. Check that the triggering event is a `BirdPlayedEvent`, and that `event.habitat` matches the expected habitat from params.
3. Prompt for activation
4. Prompt to select card to tuck
5. Yield `TuckCardsEffect`

**Pattern**: Follow `whenOpponentPlaysBirdInHabitatGainFood`

---

#### [ ] #30 - `whenOpponentGainsFoodCacheIfMatch` (Loggerhead Shrike)
**Power Text**: "When another player takes the 'gain food' action, if they gain any number of [rodent], cache 1 [rodent] from the supply on this bird."
**Trigger**: ONCE_BETWEEN_TURNS

**Parameters**: `foodType: "RODENT"`, `count: 1`

**Triggering Event**: `FoodGainedFromHabitatActivationEvent`

**Effects**:
- `CacheFoodEffect` with `source: "SUPPLY"`

**Prompts**:
- `ActivatePowerPrompt` only (caching is automatic)

**Logic**:
1. Access `ctx.triggeringEvent`, make sure its a `FoodGainedFromHabitatActivationEvent`, and check if `event.food.RODENT > 0`
2. If no rodents gained, skip without prompting
3. Prompt for activation
4. Yield `CacheFoodEffect` with rodent from supply

---

### Group 5: All Players Powers

#### [ ] #28 - `allPlayersLayEggOnNestType` (Lazuli Bunting)
**Power Text**: "All players lay 1 [egg] on any 1 [bowl] bird. You may lay 1 [egg] on 1 additional [bowl] bird."
**Trigger**: WHEN_ACTIVATED

**Parameters**: `nestType: "BOWL"`, `allPlayersCount: 1`, `bonusCount: 1`

**Effects**:
- `AllPlayersLayEggsEffect`
- `LayEggsEffect` (for owner's bonus egg)

**Prompts**:
- `ActivatePowerPrompt`
- `PlaceEggsPrompt` for each player (filtered to nest type)
- `PlaceEggsPrompt` again for owner's bonus

**Logic**:
1. Check at least one player has eligible bowl bird with capacity
2. Prompt for activation
3. For each player in turn order (starting with the player who activated this power), prompt to place 1 egg on an eligible bowl bird from their board.
4. Yield `AllPlayersLayEggsEffect` with all placements
5. Prompt owner for bonus egg placement, excluding the bird they already placed one on.
6. Yield `LayEggsEffect` for bonus egg(s) laid.

---

#### [ ] #31 - `playersWithFewestInHabitatGainFood` (Hermit Thrush)
**Power Text**: "Player(s) with the fewest birds in their [forest] gain 1 [die] from birdfeeder."
**Trigger**: WHEN_ACTIVATED

**Parameters**: `habitat: "FOREST"`, `foodCount: 1`

**Effects**:
- `GainFoodEffect` for each qualifying player

**Prompts**:
- `ActivatePowerPrompt`
- `SelectFoodFromFeederPrompt` for each qualifying player

**Logic**:
1. Prompt for activation
2. Count birds in habitat for each player
3. Find player(s) with minimum count
4. If multiple tied, use clockwise turn order for tied players, starting from the owner of the bird being activated
5. For each qualifying player, prompt to select food and yield `GainFoodEffect`

**Pattern**: Follow `playersWithFewestInHabitatDrawCard`

**Notes**: Use `getClockWisePlayerOrder` method on `GameState`, and refactor `playersWithFewestInHabitatDrawCard` to use this too.

---

### Group 6: Repeat Power (Meta-Powers)

#### [ ] #33 - `repeatBrownPowerInHabitat` (Gray Catbird)
**Power Text**: "Repeat a brown power on another bird in this habitat."
**Trigger**: WHEN_ACTIVATED

**Effects**:
- `RepeatBrownPowerEffect`

**Prompts**:
- `ActivatePowerPrompt`
- `RepeatPowerPrompt` (eligibleBirds: birds with brown powers in same habitat)

**Logic**:
1. Find all other birds in same habitat with brown powers (WHEN_ACTIVATED)
2. Check at least one eligible bird exists
3. Prompt for activation
4. Prompt to select which bird's power to repeat
5. Yield `RepeatBrownPowerEffect` with target bird

**Note**: Engine handles re-execution of the target bird's power handler, out of scope for now.

---

#### [ ] #36 - `repeatPredatorPowerInHabitat` (Hooded Merganser)
**Power Text**: "Repeat 1 [predator] power in this habitat."
**Trigger**: WHEN_ACTIVATED

**Effects**:
- `RepeatBrownPowerEffect`

**Prompts**:
- `ActivatePowerPrompt`
- `RepeatPowerPrompt` (eligibleBirds: predator birds in same habitat)

**Logic**:
1. Find all other birds in same habitat with predator powers
   - Handler IDs: `rollDiceAndCacheIfMatch`, `lookAtCardAndTuckIfWingspanUnder`
2. Check at least one eligible bird exists
3. Prompt for activation
4. Prompt to select which predator's power to repeat
5. Yield `RepeatBrownPowerEffect` with target bird

**Note**: The repeated predator power may trigger pink powers (like Black Vulture). GameEngine should handle triggering repeat powers, out of scope for now.

---

### Group 7: Play Additional Bird Powers

#### [ ] #25 - `playAdditionalBirdInHabitat` (Downy Woodpecker)
**Power Text**: "Play an additional bird in your [forest]. Pay its normal cost."
**Trigger**: WHEN_PLAYED

**Triggering Event**:
- `BirdPlayedEvent`

**Effects**:
- `PlayBirdEffect`
- Emits `BirdPlayedEvent` (triggers further powers)

**Prompts**:
- `ActivatePowerPrompt`
- `PlayBirdPrompt` (filtered to birds that can live in specified habitat)

**Logic**:
1. Find eligible birds in hand that can be played in the habitat that the triggering `BirdPlayedEvent` was played in
2. Check player can afford at least one bird (food + egg costs)
3. Check habitat has space (< 5 birds)
4. Prompt for activation
5. Prompt with `PlayBirdPrompt` (filtered to habitat)
6. Yield `PlayBirdEffect` with bird, food paid, eggs paid
7. Emit `BirdPlayedEvent` for the newly played bird

**Pattern**: Follow `playBirdHandler` turn action, but filtered to specific habitat

### Group 8: Food Manipulation Powers

#### [ ] #32 - `tradeFoodType` (Green Heron)
**Power Text**: "Trade 1 [wild] for any other type from the supply."
**Trigger**: WHEN_ACTIVATED

**Parameters**: `count: 1`

**Effects**:
- `DiscardFoodEffect`
- `GainFoodEffect` with `source: "SUPPLY"`

**Prompts**:
- `ActivatePowerPrompt`
- `DiscardFoodPrompt`
- `SelectFoodFromSupplyPrompt`

**Logic**:
1. Check player has at least 1 food in their supply
2. Prompt for activation
3. Prompt to select food to discard (from player's own supply)
4. Yield `DiscardFoodEffect`
5. Prompt to select food to gain (exclude type just discarded, or allow any)
6. Yield `GainFoodEffect`

---

#### [ ] #34 - `gainFoodFromFeederIfAvailable` (Great Crested Flycatcher)
**Power Text**: "Gain 1 [invertebrate] from the birdfeeder, if available."
**Trigger**: WHEN_ACTIVATED

**Parameters**: `foodType: "INVERTEBRATE"`, `count: 1`

**Effects**:
- `RerollBirdfeederEffect` (if player chooses)
- `GainFoodEffect` with `source: "BIRDFEEDER"`

**Prompts**:
- `ActivatePowerPrompt`
- `SelectFoodFromFeederPrompt` (filtered to specific food type, with reroll option)

**Logic**:
1. Check if birdfeeder contains the required food type
2. If not available and no reroll is possible, skip without prompting
3. Prompt for activation
4. Prompt to select food from feeder (handle reroll if all same face)
5. Yield `GainFoodEffect`

**Pattern**: Follow `gainFoodFromFeederWithCache` but simpler (no cache option)

**Note**: Reuse any helpers available for handling rerolls + food selection in a loop

---

## Implementation Checklist Summary

- [ ] #21 - `whenOpponentPredatorSucceedsGainFood`
- [ ] #22 - `tuckAndLay`
- [ ] #23 - `drawFaceUpCardsFromTray`
- [ ] #24 - `drawCards`
- [ ] #25 - `playAdditionalBirdInHabitat`
- [ ] #26 - `cacheFoodFromSupply`
- [ ] #27 - `allPlayersDrawCardsFromDeck`
- [ ] #28 - `allPlayersLayEggOnNestType`
- [ ] #29 - `whenOpponentPlaysBirdInHabitatTuckCard`
- [ ] #30 - `whenOpponentGainsFoodCacheIfMatch`
- [ ] #31 - `playersWithFewestInHabitatGainFood`
- [ ] #32 - `tradeFoodType`
- [ ] #33 - `repeatBrownPowerInHabitat`
- [ ] #34 - `gainFoodFromFeederIfAvailable`
- [ ] #35 - `discardEggToDrawCards`
- [ ] #36 - `repeatPredatorPowerInHabitat`
- [ ] #37 - `tuckAndGainFood`
- [ ] #38 - `tuckAndGainFoodOfChoice`
