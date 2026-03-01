class Validator {
  static validatePlay(gameState, playerId, tileId, trainId) {
    // Check it's this player's turn
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== playerId) {
      return { valid: false, error: "It's not your turn" };
    }

    // Check player has the tile
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return { valid: false, error: 'Player not found' };
    const tile = player.hand.find(t => t.id === tileId);
    if (!tile) return { valid: false, error: "You don't have that tile" };

    // Check the train exists
    const train = gameState.trains[trainId];
    if (!train) return { valid: false, error: 'Train not found' };

    // If there's an unsatisfied double, must play on THAT train
    if (gameState.unsatisfiedDouble) {
      if (trainId !== gameState.unsatisfiedDouble.trainId) {
        return { valid: false, error: 'You must satisfy the double first' };
      }
    }

    // Check train access
    if (!Validator.canAccessTrain(gameState, playerId, trainId)) {
      return { valid: false, error: "You can't play on that train" };
    }

    // Check tile matches train open end
    if (!train.canPlay(tile)) {
      return { valid: false, error: "That tile doesn't match the train's open end" };
    }

    return { valid: true, orientation: train.getOrientation(tile) };
  }

  static canAccessTrain(gameState, playerId, trainId) {
    // Can always play on your own train
    if (trainId === playerId) return true;

    // Can play on the Mexican train if it exists
    if (trainId === 'mexican') {
      return gameState.mexicanTrainStarted || true; // Can always start it
    }

    // Can play on other players' trains only if they have a marker
    const train = gameState.trains[trainId];
    if (train && train.isOpen) return true;

    return false;
  }

  static validateDraw(gameState, playerId) {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== playerId) {
      return { valid: false, error: "It's not your turn" };
    }

    if (gameState.turnState === 'drewCard') {
      return { valid: false, error: 'You already drew this turn' };
    }

    if (gameState.boneyard.length === 0) {
      return { valid: false, error: 'Boneyard is empty' };
    }

    return { valid: true };
  }

  static getValidMoves(gameState, playerId) {
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return [];

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== playerId) return [];

    const moves = [];

    // Determine which trains can be played on
    const accessibleTrains = Validator.getAccessibleTrains(gameState, playerId);

    for (const trainId of accessibleTrains) {
      const train = gameState.trains[trainId];
      if (!train) continue;

      // If unsatisfied double, only allow that train
      if (gameState.unsatisfiedDouble && trainId !== gameState.unsatisfiedDouble.trainId) {
        continue;
      }

      for (const tile of player.hand) {
        if (train.canPlay(tile)) {
          moves.push({
            tileId: tile.id,
            trainId,
            orientation: train.getOrientation(tile)
          });
        }
      }
    }

    return moves;
  }

  static getAccessibleTrains(gameState, playerId) {
    const trains = [];

    // Own train always accessible
    if (gameState.trains[playerId]) {
      trains.push(playerId);
    }

    // Mexican train
    if (gameState.trains['mexican']) {
      trains.push('mexican');
    }

    // Other players' open trains
    for (const player of gameState.players) {
      if (player.id === playerId) continue;
      const train = gameState.trains[player.id];
      if (train && train.isOpen) {
        trains.push(player.id);
      }
    }

    return trains;
  }
}

module.exports = Validator;
