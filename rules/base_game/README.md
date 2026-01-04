# Wingspan Rules Documentation

This collection of Markdown files provides a comprehensive reference for the board game Wingspan, structured for efficient navigation and understanding by AI coding agents or developers implementing game logic.

## File Structure

### Core Game Files

- **01_game_overview.md** - High-level game description, objective, and victory conditions
- **02_components.md** - Complete list of game components and their quantities
- **03_setup.md** - Detailed setup instructions for starting a game
- **04_game_structure.md** - Round structure, turn order, and game flow
- **05_actions.md** - The four main actions players can take each turn
- **06_playing_birds.md** - Rules for playing bird cards from hand
- **07_food_system.md** - Food types, costs, birdfeeder mechanics, and conversions
- **08_egg_system.md** - Egg laying rules, limits, and conversions
- **09_card_drawing.md** - Card drawing mechanics and bird tray management
- **10_bird_powers.md** - Overview of the three power categories and activation timing
- **11_end_of_round.md** - Round end procedures and goal scoring
- **12_game_end_scoring.md** - Final scoring and tiebreakers

### Reference Files

- **13_end_of_round_goals.md** - Detailed descriptions of all end-of-round goal types
- **14_bonus_cards.md** - Complete bonus card reference with scoring criteria
- **15_bird_power_food_gaining.md** - All food-gaining bird powers with edge cases
- **16_bird_power_egg_laying.md** - All egg-laying bird powers with edge cases
- **17_bird_power_card_drawing.md** - All card-drawing bird powers with edge cases
- **18_bird_power_flocking.md** - All flocking bird powers with edge cases
- **19_bird_power_hunting_fishing.md** - All hunting and fishing bird powers with edge cases
- **20_bird_power_other.md** - Other special bird powers with edge cases

### Quick Reference

- **21_glossary.md** - Definitions of key terms and icons
- **22_edge_cases_faq.md** - Common edge cases and frequently asked questions
- **23_timing_and_priority.md** - Rules for simultaneous effects and turn order

## Navigation Guide

For implementing game logic, start with:
1. **02_components.md** - Understand the game pieces
2. **03_setup.md** - Initialize game state
3. **04_game_structure.md** - Implement the game loop
4. **05_actions.md** - Implement the four core actions

For resolving specific game situations:
- Consult the relevant bird power file (15-20) for specific bird abilities
- Check **22_edge_cases_faq.md** for unusual interactions
- Reference **23_timing_and_priority.md** for simultaneous effect resolution

## Document Conventions

- **Bold text** highlights key rules and important concepts
- Numbered lists indicate sequential steps or procedures
- Bullet points indicate options or non-sequential information
- Code-style formatting (e.g., `WHEN ACTIVATED`) indicates card text or game terminology
- Tables organize comparative information (e.g., bonus card criteria)

## Version

This documentation is based on the Wingspan base game rulebook and appendix.
