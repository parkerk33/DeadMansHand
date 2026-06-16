# Dead Man's Hand ⚜

A web-based **fantasy poker** game — standard Texas Hold'em layered with medieval
fantasy class abilities, rendered as a 3D candlelit coastal tavern with Three.js.

## Classes

Each class has a passive and an ultimate ability:

| Class | Passive | Ultimate |
|-------|---------|----------|
| 🃏 Jester | Sleight of Hand — swap a hole card with the deck | Grand Illusion — opponents redraw their worst card |
| 👑 Noble | Tax Collection — +15% bonus on pots you win | Royal Decree — no raises this round |
| 🔮 Sorcerer | Foresight — peek at the next community card | Arcane Swap — swap a hole card with a community card |
| 🗡️ Assassin | Blade in the Dark — +25% when everyone folds to you | Mark Target — the chip leader cannot raise |
| ⚔️ Knight | Iron Will — immune to abilities used against you | Charge — force a minimum bet of 2× the pot |
| ✨ Summoner | Familiar Bond — first hole card is wild | Summon Elemental — add a wild card to the board |
| 🏹 Ranger | Tracker — peek at an upcoming community card | Hunter's Mark — replace a community card |
| ⚗️ Alchemist | Philosopher's Stone — change a hole card's suit | Grand Transmutation — shift a community card's value |

## Tech

- **Three.js** for 3D rendering (procedural geometry + canvas textures, no external art assets)
- **Vite** dev server / bundler
- Vanilla JS game logic (deck, hand evaluation with wild-card support, betting state machine, bot AI)

## Run

```bash
npm install
npm run dev
```

Then open the printed local URL. Pick a class, enter the tavern, and play against 3 AI opponents.

## Project layout

```
src/
  classes/ClassDefinitions.js   class data (abilities, colors, lore)
  game/                         Deck, HandEvaluator, PokerGame, BotPlayer
  objects/                      Card3D, Character3D
  room/                         Table, Environment, Lighting
  controllers/GameController.js main orchestrator + ability implementations
  main.js                       Three.js renderer + menu wiring
index.html                      canvas + HTML/CSS UI overlay
```
