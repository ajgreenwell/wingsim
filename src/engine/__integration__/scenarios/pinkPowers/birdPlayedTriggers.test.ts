/**
 * Scenario tests for pink powers triggered by BIRD_PLAYED events.
 *
 * Tests cover:
 * - whenOpponentPlaysBirdInHabitatGainFood: Habitat-specific bird play trigger gains food
 * - whenOpponentPlaysBirdInHabitatTuckCard: Habitat-specific bird play trigger tucks card
 * - Pink power does NOT trigger for self-played birds
 * - Pink power does NOT trigger for wrong habitat
 */

import { describe, it } from "vitest";
import { runScenario } from "../../ScenarioRunner.js";
import type { ScenarioConfig } from "../../ScenarioBuilder.js";
import {
  handlerWasInvoked,
  playerHasFood,
  playerHandSize,
  habitatBirdCount,
  birdExistsOnBoard,
  birdHasTuckedCards,
  eventWasEmitted,
  custom,
} from "../../assertions.js";

describe("Pink Power: whenOpponentPlaysBirdInHabitatGainFood", () => {
  /**
   * Tests that Belted Kingfisher's pink power triggers when an opponent
   * plays a bird in the WETLAND habitat, gaining 1 FISH from supply.
   *
   * Flow:
   * 1. Alice has Belted Kingfisher in her WETLAND
   * 2. Bob plays prothonotary_warbler into his WETLAND
   * 3. Alice's Belted Kingfisher triggers (BIRD_PLAYED event)
   * 4. Alice chooses to activate and gains 1 FISH
   */
  it("triggers when opponent plays bird in matching habitat (WETLAND)", async () => {
    const scenario: ScenarioConfig = {
      name: "Belted Kingfisher triggers on opponent wetland bird",
      description: "Bob plays bird in wetland, Alice's Belted Kingfisher gains fish",
      targetHandlers: ["whenOpponentPlaysBirdInHabitatGainFood", "playBirdHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { FISH: 0 }, // Starts with no fish
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [{ cardId: "belted_kingfisher", eggs: 0 }],
          },
        },
        {
          id: "bob",
          // prothonotary_warbler can go in WETLAND and has no power
          hand: ["prothonotary_warbler"],
          bonusCards: [],
          food: { INVERTEBRATE: 2, SEED: 1 }, // Enough to pay for prothonotary_warbler
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
      ],

      turns: [
        // Bob's turn: plays a wetland bird
        {
          player: "bob",
          label: "Bob's turn - play bird in wetland",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "prothonotary_warbler",
              habitat: "WETLAND",
              foodToSpend: { INVERTEBRATE: 2, SEED: 1 },
              eggsToSpend: {},
            },
          ],
        },
        // Alice's pink power triggers during Bob's turn
        {
          player: "alice",
          label: "Alice's pink power response",
          choices: [
            { kind: "activatePower", activate: true },
          ],
        },
      ],

      birdfeeder: ["SEED", "SEED", "INVERTEBRATE", "FISH", "FRUIT"],
      startingPlayerIndex: 1, // Bob goes first
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Verify both handlers were invoked
        // Bob's bird was played
        birdExistsOnBoard("bob", "bob_prothonotary_warbler"),

        // Pink power was invoked
        handlerWasInvoked("whenOpponentPlaysBirdInHabitatGainFood"),

        // Verify Alice gained fish from the pink power
        playerHasFood("alice", { FISH: 1 }),

        // Verify Bob's bird is on the board
        birdExistsOnBoard("bob", "bob_prothonotary_warbler"),
        habitatBirdCount("bob", "WETLAND", 1),

        // Verify BIRD_PLAYED event was emitted
        eventWasEmitted("BIRD_PLAYED", (e) =>
          e.type === "BIRD_PLAYED" &&
          e.playerId === "bob" &&
          e.habitat === "WETLAND" &&
          e.birdCardId === "prothonotary_warbler"
        ),
      ],
    });
  });

  /**
   * Tests that Eastern Kingbird's pink power triggers when an opponent
   * plays a bird in the FOREST habitat, gaining 1 INVERTEBRATE from supply.
   */
  it("triggers for FOREST habitat (Eastern Kingbird)", async () => {
    const scenario: ScenarioConfig = {
      name: "Eastern Kingbird triggers on opponent forest bird",
      description: "Bob plays bird in forest, Alice's Eastern Kingbird gains invertebrate",
      targetHandlers: ["whenOpponentPlaysBirdInHabitatGainFood", "playBirdHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { INVERTEBRATE: 0 }, // Starts with no invertebrate
          board: {
            FOREST: [{ cardId: "eastern_kingbird", eggs: 0 }],
            GRASSLAND: [],
            WETLAND: [],
          },
        },
        {
          id: "bob",
          // hooded_warbler is FOREST only and has no power
          hand: ["hooded_warbler"],
          bonusCards: [],
          food: { INVERTEBRATE: 2 }, // Enough to pay for hooded_warbler
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
      ],

      turns: [
        {
          player: "bob",
          label: "Bob's turn - play bird in forest",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "hooded_warbler",
              habitat: "FOREST",
              foodToSpend: { INVERTEBRATE: 2 },
              eggsToSpend: {},
            },
          ],
        },
        {
          player: "alice",
          label: "Alice's pink power response",
          choices: [
            { kind: "activatePower", activate: true },
          ],
        },
      ],

      birdfeeder: ["SEED", "SEED", "INVERTEBRATE", "FISH", "FRUIT"],
      startingPlayerIndex: 1,
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Pink power was invoked
        handlerWasInvoked("whenOpponentPlaysBirdInHabitatGainFood"),
        playerHasFood("alice", { INVERTEBRATE: 1 }),
        birdExistsOnBoard("bob", "bob_hooded_warbler"),
      ],
    });
  });

  /**
   * Tests that the pink power does NOT trigger when the opponent plays
   * a bird in a different habitat than the one the power monitors.
   * Belted Kingfisher monitors WETLAND, but Bob plays in FOREST.
   */
  it("does NOT trigger when opponent plays bird in wrong habitat", async () => {
    const scenario: ScenarioConfig = {
      name: "Belted Kingfisher ignores forest bird",
      description: "Bob plays bird in forest, Alice's Belted Kingfisher does not trigger",
      targetHandlers: ["playBirdHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { FISH: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [{ cardId: "belted_kingfisher", eggs: 0 }],
          },
        },
        {
          id: "bob",
          // hooded_warbler is FOREST only
          hand: ["hooded_warbler"],
          bonusCards: [],
          food: { INVERTEBRATE: 2 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
      ],

      turns: [
        // Bob plays a forest bird - Alice's pink power should NOT trigger
        {
          player: "bob",
          label: "Bob's turn - play forest bird",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "hooded_warbler",
              habitat: "FOREST",
              foodToSpend: { INVERTEBRATE: 2 },
              eggsToSpend: {},
            },
          ],
        },
        // No turn block for Alice - her pink power doesn't trigger for forest birds
      ],

      birdfeeder: ["SEED", "SEED", "INVERTEBRATE", "FISH", "FRUIT"],
      startingPlayerIndex: 1,
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Turn action handler doesn't emit ACTIVATE_POWER, just verify bird was played

        // Alice should NOT have gained any fish
        playerHasFood("alice", { FISH: 0 }),

        // Bob's bird is on board
        birdExistsOnBoard("bob", "bob_hooded_warbler"),

        // Verify handler was silently skipped (wrong habitat)
        // The handler still fires but with activated: false due to habitat mismatch
        custom("pink power was silently skipped (wrong habitat)", (ctx) => {
          const activations = ctx.effects.filter(
            (e) =>
              e.type === "ACTIVATE_POWER" &&
              e.handlerId === "whenOpponentPlaysBirdInHabitatGainFood" &&
              e.activated === true
          );
          if (activations.length > 0) {
            throw new Error(
              "Belted Kingfisher should not have activated for forest bird"
            );
          }
        }),
      ],
    });
  });

  /**
   * Tests that the pink power does NOT trigger when the owner plays
   * a bird (pink powers only trigger for opponents).
   */
  it("does NOT trigger when owner plays bird in matching habitat", async () => {
    const scenario: ScenarioConfig = {
      name: "Belted Kingfisher ignores own bird play",
      description: "Alice plays bird in wetland, her own Belted Kingfisher does not trigger",
      targetHandlers: ["playBirdHandler"],

      players: [
        {
          id: "alice",
          hand: ["prothonotary_warbler"],
          bonusCards: [],
          food: { INVERTEBRATE: 2, SEED: 1, FISH: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            // belted_kingfisher has eggs to pay for column 1 cost
            WETLAND: [{ cardId: "belted_kingfisher", eggs: 1 }],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 1 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
      ],

      turns: [
        {
          player: "alice",
          label: "Alice's turn - play bird in wetland",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "prothonotary_warbler",
              habitat: "WETLAND",
              foodToSpend: { INVERTEBRATE: 2, SEED: 1 },
              eggsToSpend: { alice_belted_kingfisher: 1 },
            },
          ],
        },
      ],

      birdfeeder: ["SEED", "SEED", "INVERTEBRATE", "FISH", "FRUIT"],
      startingPlayerIndex: 0,
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Turn action handler doesn't emit ACTIVATE_POWER, just verify bird was played

        // Alice should NOT have gained any fish (pink power doesn't trigger for self)
        playerHasFood("alice", { FISH: 0 }),

        // Both birds should be on Alice's board
        habitatBirdCount("alice", "WETLAND", 2),
        birdExistsOnBoard("alice", "alice_prothonotary_warbler"),

        // Verify pink power was NOT invoked (not even silently skipped)
        custom("pink power was not invoked for owner's bird play", (ctx) => {
          const activations = ctx.effects.filter(
            (e) =>
              e.type === "ACTIVATE_POWER" &&
              e.handlerId === "whenOpponentPlaysBirdInHabitatGainFood"
          );
          if (activations.length > 0) {
            throw new Error(
              "Belted Kingfisher should not trigger when owner plays a bird"
            );
          }
        }),
      ],
    });
  });

  /**
   * Tests that player can decline the pink power activation.
   */
  it("allows player to decline activation", async () => {
    const scenario: ScenarioConfig = {
      name: "Decline Belted Kingfisher activation",
      description: "Alice declines to activate Belted Kingfisher when Bob plays wetland bird",
      targetHandlers: ["whenOpponentPlaysBirdInHabitatGainFood", "playBirdHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { FISH: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [{ cardId: "belted_kingfisher", eggs: 0 }],
          },
        },
        {
          id: "bob",
          hand: ["prothonotary_warbler"],
          bonusCards: [],
          food: { INVERTEBRATE: 2, SEED: 1 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
      ],

      turns: [
        {
          player: "bob",
          label: "Bob's turn - play bird in wetland",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "prothonotary_warbler",
              habitat: "WETLAND",
              foodToSpend: { INVERTEBRATE: 2, SEED: 1 },
              eggsToSpend: {},
            },
          ],
        },
        {
          player: "alice",
          label: "Alice declines pink power",
          choices: [
            { kind: "activatePower", activate: false }, // Decline
          ],
        },
      ],

      birdfeeder: ["SEED", "SEED", "INVERTEBRATE", "FISH", "FRUIT"],
      startingPlayerIndex: 1,
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Turn action handler doesn't emit ACTIVATE_POWER, just verify bird was played

        // Alice declined, so no fish gained
        playerHasFood("alice", { FISH: 0 }),

        // Verify the handler ran but was declined
        custom("pink power was declined", (ctx) => {
          const activation = ctx.effects.find(
            (e) =>
              e.type === "ACTIVATE_POWER" &&
              e.handlerId === "whenOpponentPlaysBirdInHabitatGainFood" &&
              e.activated === false
          );
          if (!activation) {
            throw new Error("Expected ACTIVATE_POWER effect with activated: false");
          }
        }),
      ],
    });
  });

  /**
   * Tests that multiple players' pink powers can trigger on the same event.
   * Both Alice and Carol have Belted Kingfisher; Bob plays a wetland bird.
   */
  it("triggers for multiple players with same pink power", async () => {
    const scenario: ScenarioConfig = {
      name: "Multiple Belted Kingfishers trigger",
      description: "Bob plays wetland bird, both Alice and Carol's Belted Kingfishers trigger",
      targetHandlers: ["whenOpponentPlaysBirdInHabitatGainFood", "playBirdHandler"],

      players: [
        {
          id: "alice",
          hand: [],
          bonusCards: [],
          food: { FISH: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            WETLAND: [{ cardId: "belted_kingfisher", eggs: 0 }],
          },
        },
        {
          id: "bob",
          hand: ["prothonotary_warbler"],
          bonusCards: [],
          food: { INVERTEBRATE: 2, SEED: 1 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
        {
          id: "carol",
          hand: [],
          bonusCards: [],
          food: { FISH: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [],
            // Use eastern_kingbird which monitors WETLAND... wait no, eastern_kingbird monitors FOREST
            // Let's use a different approach - give carol a different bird ID to avoid instance collision
            // Actually we can have same cardId, different instanceIds
            WETLAND: [{ cardId: "belted_kingfisher", eggs: 0 }],
          },
        },
      ],

      turns: [
        {
          player: "bob",
          label: "Bob's turn - play bird in wetland",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "prothonotary_warbler",
              habitat: "WETLAND",
              foodToSpend: { INVERTEBRATE: 2, SEED: 1 },
              eggsToSpend: {},
            },
          ],
        },
        // Pink powers trigger in clockwise order from active player
        // Bob is player index 1, so clockwise: Carol (index 2), Alice (index 0)
        {
          player: "carol",
          label: "Carol's pink power response",
          choices: [
            { kind: "activatePower", activate: true },
          ],
        },
        {
          player: "alice",
          label: "Alice's pink power response",
          choices: [
            { kind: "activatePower", activate: true },
          ],
        },
      ],

      birdfeeder: ["SEED", "SEED", "INVERTEBRATE", "FISH", "FRUIT"],
      startingPlayerIndex: 1, // Bob goes first
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Turn action handler doesn't emit ACTIVATE_POWER, just verify bird was played

        // Both Alice and Carol should have gained fish
        playerHasFood("alice", { FISH: 1 }),
        playerHasFood("carol", { FISH: 1 }),

        // Bob's bird is on board
        birdExistsOnBoard("bob", "bob_prothonotary_warbler"),

        // Handler should have been invoked twice
        custom("handler invoked twice", (ctx) => {
          const activations = ctx.effects.filter(
            (e) =>
              e.type === "ACTIVATE_POWER" &&
              e.handlerId === "whenOpponentPlaysBirdInHabitatGainFood" &&
              e.activated === true
          );
          if (activations.length !== 2) {
            throw new Error(
              `Expected 2 activations, found ${activations.length}`
            );
          }
        }),
      ],
    });
  });
});

describe("Pink Power: whenOpponentPlaysBirdInHabitatTuckCard", () => {
  /**
   * Tests that Horned Lark's pink power triggers when an opponent
   * plays a bird in the GRASSLAND habitat, tucking 1 card from hand.
   *
   * Flow:
   * 1. Alice has Horned Lark in her GRASSLAND and cards in hand
   * 2. Bob plays blue_winged_warbler into his GRASSLAND
   * 3. Alice's Horned Lark triggers (BIRD_PLAYED event)
   * 4. Alice chooses to activate and tucks 1 card from hand
   */
  it("triggers when opponent plays bird in GRASSLAND", async () => {
    const scenario: ScenarioConfig = {
      name: "Horned Lark triggers on opponent grassland bird",
      description: "Bob plays bird in grassland, Alice's Horned Lark tucks a card",
      targetHandlers: ["whenOpponentPlaysBirdInHabitatTuckCard", "playBirdHandler"],

      players: [
        {
          id: "alice",
          // Alice has cards to tuck
          hand: ["wild_turkey"],
          bonusCards: [],
          food: { SEED: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [{ cardId: "horned_lark", eggs: 0 }],
            WETLAND: [],
          },
        },
        {
          id: "bob",
          // blue_winged_warbler can go in GRASSLAND and has no power
          hand: ["blue_winged_warbler"],
          bonusCards: [],
          food: { INVERTEBRATE: 2 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
      ],

      turns: [
        {
          player: "bob",
          label: "Bob's turn - play bird in grassland",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "blue_winged_warbler",
              habitat: "GRASSLAND",
              foodToSpend: { INVERTEBRATE: 2 },
              eggsToSpend: {},
            },
          ],
        },
        {
          player: "alice",
          label: "Alice's pink power response",
          choices: [
            { kind: "activatePower", activate: true },
            { kind: "selectCards", cards: ["wild_turkey"] },
          ],
        },
      ],

      birdfeeder: ["SEED", "SEED", "INVERTEBRATE", "FISH", "FRUIT"],
      startingPlayerIndex: 1,
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Turn action handler doesn't emit ACTIVATE_POWER, just verify bird was played
        handlerWasInvoked("whenOpponentPlaysBirdInHabitatTuckCard"),

        // Alice should have tucked her card
        playerHandSize("alice", 0),
        birdHasTuckedCards("alice", "alice_horned_lark", 1),

        // Bob's bird is on board
        birdExistsOnBoard("bob", "bob_blue_winged_warbler"),
        habitatBirdCount("bob", "GRASSLAND", 1),
      ],
    });
  });

  /**
   * Tests that the pink power does NOT trigger when the opponent plays
   * a bird in a different habitat than GRASSLAND.
   */
  it("does NOT trigger when opponent plays bird in wrong habitat", async () => {
    const scenario: ScenarioConfig = {
      name: "Horned Lark ignores wetland bird",
      description: "Bob plays bird in wetland, Alice's Horned Lark does not trigger",
      targetHandlers: ["playBirdHandler"],

      players: [
        {
          id: "alice",
          hand: ["wild_turkey"],
          bonusCards: [],
          food: { SEED: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [{ cardId: "horned_lark", eggs: 0 }],
            WETLAND: [],
          },
        },
        {
          id: "bob",
          // prothonotary_warbler can go in WETLAND
          hand: ["prothonotary_warbler"],
          bonusCards: [],
          food: { INVERTEBRATE: 2, SEED: 1 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
      ],

      turns: [
        {
          player: "bob",
          label: "Bob's turn - play bird in wetland",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "prothonotary_warbler",
              habitat: "WETLAND",
              foodToSpend: { INVERTEBRATE: 2, SEED: 1 },
              eggsToSpend: {},
            },
          ],
        },
        // No turn block for Alice - her pink power doesn't trigger for wetland birds
      ],

      birdfeeder: ["SEED", "SEED", "INVERTEBRATE", "FISH", "FRUIT"],
      startingPlayerIndex: 1,
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Turn action handler doesn't emit ACTIVATE_POWER, just verify bird was played

        // Alice should still have her card (no tuck happened)
        playerHandSize("alice", 1),
        birdHasTuckedCards("alice", "alice_horned_lark", 0),

        // Bob's bird is on board
        birdExistsOnBoard("bob", "bob_prothonotary_warbler"),

        // Handler was silently skipped
        custom("pink power was silently skipped (wrong habitat)", (ctx) => {
          const activations = ctx.effects.filter(
            (e) =>
              e.type === "ACTIVATE_POWER" &&
              e.handlerId === "whenOpponentPlaysBirdInHabitatTuckCard" &&
              e.activated === true
          );
          if (activations.length > 0) {
            throw new Error(
              "Horned Lark should not have activated for wetland bird"
            );
          }
        }),
      ],
    });
  });

  /**
   * Tests that the power is skipped when the player has no cards in hand.
   */
  it("skips when player has no cards in hand", async () => {
    const scenario: ScenarioConfig = {
      name: "Horned Lark skips with empty hand",
      description: "Alice has no cards to tuck, power is skipped",
      targetHandlers: ["playBirdHandler"],

      players: [
        {
          id: "alice",
          hand: [], // No cards to tuck
          bonusCards: [],
          food: { SEED: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [{ cardId: "horned_lark", eggs: 0 }],
            WETLAND: [],
          },
        },
        {
          id: "bob",
          hand: ["blue_winged_warbler"],
          bonusCards: [],
          food: { INVERTEBRATE: 2 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
      ],

      turns: [
        {
          player: "bob",
          label: "Bob's turn - play bird in grassland",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "blue_winged_warbler",
              habitat: "GRASSLAND",
              foodToSpend: { INVERTEBRATE: 2 },
              eggsToSpend: {},
            },
          ],
        },
        // No choices needed from Alice - power skipped due to empty hand
      ],

      birdfeeder: ["SEED", "SEED", "INVERTEBRATE", "FISH", "FRUIT"],
      startingPlayerIndex: 1,
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Turn action handler doesn't emit ACTIVATE_POWER, just verify bird was played

        // No tucked cards (power was skipped)
        birdHasTuckedCards("alice", "alice_horned_lark", 0),

        // Verify power was skipped due to resource unavailable
        custom("power was skipped due to empty hand", (ctx) => {
          const skippedEffect = ctx.effects.find(
            (e) =>
              e.type === "ACTIVATE_POWER" &&
              e.handlerId === "whenOpponentPlaysBirdInHabitatTuckCard" &&
              e.activated === false &&
              e.skipReason === "RESOURCE_UNAVAILABLE"
          );
          if (!skippedEffect) {
            throw new Error(
              "Expected power to be skipped with RESOURCE_UNAVAILABLE reason"
            );
          }
        }),
      ],
    });
  });

  /**
   * Tests that player can decline the pink power activation.
   */
  it("allows player to decline activation", async () => {
    const scenario: ScenarioConfig = {
      name: "Decline Horned Lark activation",
      description: "Alice declines to activate Horned Lark",
      targetHandlers: ["whenOpponentPlaysBirdInHabitatTuckCard", "playBirdHandler"],

      players: [
        {
          id: "alice",
          hand: ["wild_turkey"],
          bonusCards: [],
          food: { SEED: 0 },
          board: {
            FOREST: [],
            GRASSLAND: [{ cardId: "horned_lark", eggs: 0 }],
            WETLAND: [],
          },
        },
        {
          id: "bob",
          hand: ["blue_winged_warbler"],
          bonusCards: [],
          food: { INVERTEBRATE: 2 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
      ],

      turns: [
        {
          player: "bob",
          label: "Bob's turn - play bird in grassland",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "blue_winged_warbler",
              habitat: "GRASSLAND",
              foodToSpend: { INVERTEBRATE: 2 },
              eggsToSpend: {},
            },
          ],
        },
        {
          player: "alice",
          label: "Alice declines pink power",
          choices: [
            { kind: "activatePower", activate: false },
          ],
        },
      ],

      birdfeeder: ["SEED", "SEED", "INVERTEBRATE", "FISH", "FRUIT"],
      startingPlayerIndex: 1,
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Turn action handler doesn't emit ACTIVATE_POWER, just verify bird was played

        // Alice declined, so card still in hand
        playerHandSize("alice", 1),
        birdHasTuckedCards("alice", "alice_horned_lark", 0),

        // Verify the handler ran but was declined
        custom("pink power was declined", (ctx) => {
          const activation = ctx.effects.find(
            (e) =>
              e.type === "ACTIVATE_POWER" &&
              e.handlerId === "whenOpponentPlaysBirdInHabitatTuckCard" &&
              e.activated === false
          );
          if (!activation) {
            throw new Error("Expected ACTIVATE_POWER effect with activated: false");
          }
        }),
      ],
    });
  });

  /**
   * Tests that the pink power does NOT trigger when the owner plays a bird.
   */
  it("does NOT trigger when owner plays bird in matching habitat", async () => {
    const scenario: ScenarioConfig = {
      name: "Horned Lark ignores own bird play",
      description: "Alice plays bird in grassland, her own Horned Lark does not trigger",
      targetHandlers: ["playBirdHandler"],

      players: [
        {
          id: "alice",
          // Alice plays blue_winged_warbler into grassland
          hand: ["blue_winged_warbler", "wild_turkey"],
          bonusCards: [],
          food: { INVERTEBRATE: 2 },
          board: {
            FOREST: [],
            GRASSLAND: [{ cardId: "horned_lark", eggs: 1 }], // Has egg for column cost
            WETLAND: [],
          },
        },
        {
          id: "bob",
          hand: [],
          bonusCards: [],
          food: { SEED: 1 },
          board: { FOREST: [], GRASSLAND: [], WETLAND: [] },
        },
      ],

      turns: [
        {
          player: "alice",
          label: "Alice's turn - play bird in grassland",
          choices: [
            { kind: "turnAction", action: "PLAY_BIRD", takeBonus: false },
            {
              kind: "playBird",
              bird: "blue_winged_warbler",
              habitat: "GRASSLAND",
              foodToSpend: { INVERTEBRATE: 2 },
              eggsToSpend: { alice_horned_lark: 1 },
            },
          ],
        },
      ],

      birdfeeder: ["SEED", "SEED", "INVERTEBRATE", "FISH", "FRUIT"],
      startingPlayerIndex: 0,
      turnsToRun: 1,
    };

    await runScenario(scenario, {
      assertions: [
        // Turn action handler doesn't emit ACTIVATE_POWER, just verify bird was played

        // Alice's card should still be in hand (no tuck from pink power)
        playerHandSize("alice", 1), // Started with 2, played 1 -> 1 remaining
        birdHasTuckedCards("alice", "alice_horned_lark", 0),

        // Verify pink power was NOT invoked
        custom("pink power was not invoked for owner's bird play", (ctx) => {
          const activations = ctx.effects.filter(
            (e) =>
              e.type === "ACTIVATE_POWER" &&
              e.handlerId === "whenOpponentPlaysBirdInHabitatTuckCard"
          );
          if (activations.length > 0) {
            throw new Error(
              "Horned Lark should not trigger when owner plays a bird"
            );
          }
        }),
      ],
    });
  });
});
