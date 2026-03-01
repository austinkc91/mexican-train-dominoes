const Player = require('./Player');
const Train = require('./Train');
const Round = require('./Round');
const Validator = require('./Validator');
const Scorer = require('./Scorer');

class GameState {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.phase = 'lobby'; // lobby | playing | roundEnd | gameOver
    this.hostSocketId = null;
    this.players = [];
    this.currentRound = 0;
    this.engineValue = 12;
    this.trains = {};
    this.boneyard = [];
    this.currentPlayerIndex = 0;
    this.turnState = 'play'; // play | drewCard
    this.unsatisfiedDouble = null;
    this.mexicanTrainStarted = false;
    this.roundScores = [];
    this.turnTimerRef = null;
    this.turnStartTime = null;
    this.doublePlayedBy = null; // track who played the unsatisfied double
  }

  addPlayer(socketId, name) {
    const player = new Player(socketId, name, this.players.length);
    this.players.push(player);
    return player;
  }

  removePlayer(socketId) {
    this.players = this.players.filter(p => p.id !== socketId);
  }

  startGame() {
    this.phase = 'playing';
    this.currentRound = 0;
    for (const p of this.players) {
      p.totalScore = 0;
    }
    this.roundScores = [];
    this.startRound(0);
  }

  startRound(roundNumber) {
    this.currentRound = roundNumber;
    this.engineValue = 12 - roundNumber;
    this.turnState = 'play';
    this.unsatisfiedDouble = null;
    this.mexicanTrainStarted = false;
    this.doublePlayedBy = null;
    this.phase = 'playing';

    const round = new Round(roundNumber);
    const { engineTile, boneyard } = round.deal(this.players);
    this.boneyard = boneyard;

    // Create trains for each player
    this.trains = {};
    for (const player of this.players) {
      this.trains[player.id] = new Train(player.id, this.engineValue);
      player.trainOpen = false;
    }
    // Mexican train (always open once started, but doesn't exist yet)
    this.trains['mexican'] = new Train('mexican', this.engineValue, true);

    // First player: left of "dealer" (just player 0 for round 0, rotates)
    this.currentPlayerIndex = roundNumber % this.players.length;
  }

  startNextRound() {
    this.startRound(this.currentRound + 1);
  }

  playTile(playerId, tileId, trainId) {
    const validation = Validator.validatePlay(this, playerId, tileId, trainId);
    if (!validation.valid) return { success: false, error: validation.error };

    const player = this.players.find(p => p.id === playerId);
    const tile = player.removeFromHand(tileId);
    const train = this.trains[trainId];
    const orientation = train.play(tile);

    let trainUnmarked = false;

    // If player played on their own train, remove marker
    if (trainId === playerId && train.hasMarker) {
      train.unmark();
      player.trainOpen = false;
      trainUnmarked = true;
    }

    // Track if Mexican train was just started
    if (trainId === 'mexican' && !this.mexicanTrainStarted) {
      this.mexicanTrainStarted = true;
    }

    // Handle doubles
    const playedTile = tile;
    let isDouble = tile.isDouble;

    // Check if this satisfies an unsatisfied double
    if (this.unsatisfiedDouble && trainId === this.unsatisfiedDouble.trainId) {
      this.unsatisfiedDouble = null;
      this.doublePlayedBy = null;
    }

    // Check round over
    if (player.hand.length === 0) {
      return {
        success: true,
        playedTile: { ...tile, orientation },
        orientation,
        trainUnmarked,
        roundOver: true
      };
    }

    // If a double was played, set unsatisfied double and give extra turn
    if (isDouble) {
      this.unsatisfiedDouble = { trainId, value: tile.top };
      this.doublePlayedBy = playerId;
      this.turnState = 'play';
      // Player gets another turn (same currentPlayerIndex)
    } else {
      // Normal play - advance turn
      this.advanceTurn();
    }

    return {
      success: true,
      playedTile: { ...tile, orientation },
      orientation,
      trainUnmarked,
      roundOver: false
    };
  }

  drawTile(playerId) {
    const validation = Validator.validateDraw(this, playerId);
    if (!validation.valid) return { success: false, error: validation.error };

    const tile = this.boneyard.pop();
    const player = this.players.find(p => p.id === playerId);
    player.addToHand(tile);

    this.turnState = 'drewCard';

    // Check if the drawn tile can be played
    const validMoves = Validator.getValidMoves(this, playerId);
    const canPlay = validMoves.length > 0;

    return { success: true, tile, canPlay };
  }

  passTurn(playerId) {
    const currentPlayer = this.players[this.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== playerId) {
      return { success: false, error: "It's not your turn" };
    }

    let trainMarked = false;

    // Mark the player's train as open if they drew and couldn't play
    if (this.turnState === 'drewCard' || this.boneyard.length === 0) {
      const train = this.trains[playerId];
      if (train && !train.hasMarker) {
        train.markOpen();
        currentPlayer.trainOpen = true;
        trainMarked = true;
      }
    }

    // Handle unsatisfied double - if this player couldn't satisfy, pass obligation
    // Check if we've gone all the way around
    if (this.unsatisfiedDouble) {
      this.advanceTurn();
      // Check if we're back to the player who played the double
      const nextPlayer = this.players[this.currentPlayerIndex];
      if (nextPlayer && nextPlayer.id === this.doublePlayedBy) {
        // Everyone tried and failed - dead double
        this.unsatisfiedDouble = null;
        this.doublePlayedBy = null;
      }
    } else {
      this.advanceTurn();
    }

    this.turnState = 'play';

    // Check if round should end (boneyard empty and no one can play)
    if (this.isRoundStuck()) {
      return { success: true, trainMarked, roundOver: true };
    }

    return { success: true, trainMarked, roundOver: false };
  }

  advanceTurn() {
    let attempts = 0;
    do {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
      attempts++;
    } while (!this.players[this.currentPlayerIndex].connected && attempts < this.players.length);

    this.turnState = 'play';
  }

  skipDisconnectedPlayer() {
    // Mark their train open
    const player = this.players[this.currentPlayerIndex];
    if (player) {
      const train = this.trains[player.id];
      if (train && !train.hasMarker) {
        train.markOpen();
        player.trainOpen = true;
      }
    }
    this.advanceTurn();
  }

  isRoundStuck() {
    if (this.boneyard.length > 0) return false;

    // Check if any player has a valid move
    for (const player of this.players) {
      if (!player.connected) continue;
      const moves = Validator.getValidMoves(this, player.id);
      if (moves.length > 0) return false;
    }

    return true;
  }

  endRound() {
    clearTimeout(this.turnTimerRef);
    const roundScores = Scorer.scoreRound(this.players);
    Scorer.updateTotalScores(this.players, roundScores);
    this.roundScores.push(roundScores);
    this.phase = 'roundEnd';

    // Find the winner of this round (player with 0 or lowest)
    let winnerName = null;
    const emptyHandPlayer = this.players.find(p => p.hand.length === 0);
    if (emptyHandPlayer) winnerName = emptyHandPlayer.name;

    return {
      winnerName,
      roundScores,
      totalScores: this.players.map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        roundScore: roundScores[p.id] || 0,
        totalScore: p.totalScore
      })),
      roundNumber: this.currentRound + 1
    };
  }

  checkGameOver() {
    return this.currentRound >= 12;
  }

  getFinalStandings() {
    const standings = Scorer.getFinalStandings(this.players);
    return {
      standings,
      winner: standings[0],
      roundScores: this.roundScores
    };
  }

  resetToLobby() {
    this.phase = 'lobby';
    this.currentRound = 0;
    this.trains = {};
    this.boneyard = [];
    this.roundScores = [];
    for (const p of this.players) {
      p.totalScore = 0;
      p.clearHand();
      p.trainOpen = false;
    }
  }

  toPublicState() {
    const trainData = {};
    for (const [id, train] of Object.entries(this.trains)) {
      trainData[id] = train.toJSON();
    }

    return {
      roomCode: this.roomCode,
      phase: this.phase,
      currentRound: this.currentRound,
      engineValue: this.engineValue,
      trains: trainData,
      boneyardCount: this.boneyard.length,
      currentPlayerIndex: this.currentPlayerIndex,
      turnState: this.turnState,
      unsatisfiedDouble: this.unsatisfiedDouble,
      mexicanTrainStarted: this.mexicanTrainStarted,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        tileCount: p.hand.length,
        trainOpen: p.trainOpen,
        connected: p.connected,
        totalScore: p.totalScore
      })),
      roundScores: this.roundScores
    };
  }
}

module.exports = GameState;
