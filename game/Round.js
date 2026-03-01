const DominoSet = require('./DominoSet');

class Round {
  constructor(roundNumber) {
    this.roundNumber = roundNumber;
    this.engineValue = 12 - roundNumber;
  }

  deal(players) {
    const tiles = DominoSet.generate();

    // Remove the engine tile
    const engineId = `${this.engineValue}-${this.engineValue}`;
    const engineIndex = tiles.findIndex(t => t.id === engineId);
    const engineTile = tiles.splice(engineIndex, 1)[0];

    // Shuffle remaining
    DominoSet.shuffle(tiles);

    // Deal hands
    const handSize = DominoSet.getInitialHandSize(players.length);
    for (const player of players) {
      player.clearHand();
      for (let i = 0; i < handSize; i++) {
        if (tiles.length > 0) {
          player.addToHand(tiles.pop());
        }
      }
    }

    return {
      engineTile,
      boneyard: tiles
    };
  }
}

module.exports = Round;
