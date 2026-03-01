# Mexican Train Dominoes

Multiplayer Mexican Train Dominoes you can play on your local network. Host the board on a TV or laptop, players join from their phones by scanning a QR code.

## Quick Start

**Requires [Node.js](https://nodejs.org/) (v18 or newer)**

```bash
npm start
```

That's it. This installs dependencies automatically and starts the server.

Open the **Network URL** shown in the terminal on your TV/laptop to host the board. Players scan the QR code or enter the URL on their phones to join.

## How to Play

1. **Host** opens the Network URL on a TV or shared screen
2. **Players** scan the QR code (or type the URL) on their phones and enter a name
3. Host clicks **Start Game** when everyone has joined (2-8 players)
4. On your turn, tap a domino in your hand, then tap the train you want to play it on
5. Can't play? Draw from the boneyard. Still can't? Your train gets marked open for others
6. First to empty their hand wins the round. Lowest total score after 13 rounds wins!

## Game Rules

- Double-12 domino set (91 tiles), 13 rounds
- Each player has a personal train + one shared Mexican Train
- Playing a double gives you an extra turn (the double must be "satisfied" before play continues)
- Score = pip count remaining in your hand (lower is better)
