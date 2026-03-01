class DominoSet {
  static generate() {
    const tiles = [];
    for (let i = 0; i <= 12; i++) {
      for (let j = i; j <= 12; j++) {
        tiles.push({
          id: `${i}-${j}`,
          top: i,
          bottom: j,
          isDouble: i === j,
          pipCount: i + j
        });
      }
    }
    return tiles;
  }

  static shuffle(tiles) {
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    return tiles;
  }

  static getInitialHandSize(playerCount) {
    if (playerCount <= 4) return 15;
    if (playerCount <= 6) return 12;
    return 10;
  }
}

module.exports = DominoSet;
