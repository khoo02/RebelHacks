# RebelHacks
# 🃏 BlackJack Brawl — Vegas Dungeon

A browser-based card game built for RebelHacks where blackjack meets dungeon crawling. Fight monsters using the power of cards, unlock jokers, and survive the dungeon.

## 🎮 Game Modes

**Fun Mode** — Fantasy RPG blackjack. Battle monsters, collect Joker power-ups, and use special abilities to defeat enemies floor by floor. Features an endless mode once all bosses are defeated.

**Realistic Mode** — A standard blackjack casino simulator. No power-ups, just true casino rules and odds — great for learning the game.

## ⚔️ How to Play

- **Hit** — Draw a card. Try to get as close to 21 as possible without busting.
- **Stand** — End your turn and let the monster play.
- **Special** — Spend charges to deal bonus damage.
- Use **Jokers** for unique abilities like peeking at upcoming cards, blocking monster attacks, or forcing the enemy to overdraw.
- Spend coins at the **Dungeon Shop** between floors to heal, recharge specials, or grab a random Joker.

## 🛠️ Tech Stack

- HTML, CSS, JavaScript (Vanilla)
- Web Audio API for sound effects
- No frameworks or libraries — fully hand-built

## 🚀 How to Run

1. Clone the repo:
   ```bash
   git clone https://github.com/khoo02/RebelHacks.git
   cd RebelHacks
   ```
2. Open `templates/index.html` in your browser — no server needed!

## 📁 Project Structure

```
RebelHacks/
├── templates/
│   ├── index.html       # Main menu / mode select
│   ├── fun.html         # Fun mode game screen
│   └── realistic.html   # Realistic mode game screen
└── static/
    ├── game.js          # Core game logic
    ├── ui.js            # UI helpers and DOM updates
    ├── features.js      # Passives, shop, and special features
    └── style.css        # Styling
```

## 👾 Built at RebelHacks
