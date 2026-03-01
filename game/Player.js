const PLAYER_COLORS = [
  '#E74C3C', '#3498DB', '#2ECC71', '#F39C12',
  '#9B59B6', '#1ABC9C', '#E67E22', '#E91E63'
];

class Player {
  constructor(socketId, name, colorIndex) {
    this.id = socketId;
    this.name = name;
    this.color = PLAYER_COLORS[colorIndex % PLAYER_COLORS.length];
    this.hand = [];
    this.trainOpen = false;
    this.connected = true;
    this.totalScore = 0;
  }

  addToHand(tile) {
    this.hand.push(tile);
  }

  removeFromHand(tileId) {
    const index = this.hand.findIndex(t => t.id === tileId);
    if (index === -1) return null;
    return this.hand.splice(index, 1)[0];
  }

  hasTile(tileId) {
    return this.hand.some(t => t.id === tileId);
  }

  getHandPipCount() {
    return this.hand.reduce((sum, t) => sum + t.pipCount, 0);
  }

  hasPlayableTile(openEnds) {
    return this.hand.some(tile =>
      openEnds.some(end => tile.top === end || tile.bottom === end)
    );
  }

  getPlayableTilesForEnd(endValue) {
    return this.hand.filter(tile => tile.top === endValue || tile.bottom === endValue);
  }

  clearHand() {
    this.hand = [];
  }
}

Player.COLORS = PLAYER_COLORS;

module.exports = Player;
