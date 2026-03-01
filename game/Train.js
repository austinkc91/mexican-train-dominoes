class Train {
  constructor(ownerId, engineValue, isOpen = false) {
    this.ownerId = ownerId;
    this.tiles = [];
    this.openEnd = engineValue;
    this.isOpen = isOpen;
    this.hasMarker = false;
  }

  canPlay(tile) {
    return tile.top === this.openEnd || tile.bottom === this.openEnd;
  }

  play(tile) {
    let orientation;
    if (tile.top === this.openEnd) {
      orientation = 'normal';
      this.openEnd = tile.bottom;
    } else if (tile.bottom === this.openEnd) {
      orientation = 'flipped';
      this.openEnd = tile.top;
    } else {
      return null;
    }
    this.tiles.push({ ...tile, orientation });
    return orientation;
  }

  getOrientation(tile) {
    if (tile.top === this.openEnd) return 'normal';
    if (tile.bottom === this.openEnd) return 'flipped';
    return null;
  }

  markOpen() {
    this.hasMarker = true;
    this.isOpen = true;
  }

  unmark() {
    this.hasMarker = false;
    this.isOpen = false;
  }

  reset(engineValue) {
    this.tiles = [];
    this.openEnd = engineValue;
    this.hasMarker = false;
    if (this.ownerId !== 'mexican') {
      this.isOpen = false;
    }
  }

  toJSON() {
    return {
      ownerId: this.ownerId,
      tiles: this.tiles,
      openEnd: this.openEnd,
      isOpen: this.isOpen,
      hasMarker: this.hasMarker
    };
  }
}

module.exports = Train;
