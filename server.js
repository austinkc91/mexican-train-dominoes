const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const QRCode = require('qrcode');
const path = require('path');
const GameState = require('./game/GameState');
const Validator = require('./game/Validator');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  // If room code in URL, show join form (phone scanning QR). Otherwise show host/QR view.
  if (req.query.room) {
    res.sendFile(path.join(__dirname, 'public', 'join.html'));
  } else {
    res.sendFile(path.join(__dirname, 'public', 'host.html'));
  }
});
app.get('/host', (req, res) => res.sendFile(path.join(__dirname, 'public', 'host.html')));
app.get('/play', (req, res) => res.sendFile(path.join(__dirname, 'public', 'player.html')));

// In-memory game storage
const games = new Map();
const socketToGame = new Map();
const disconnectTimers = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (games.has(code));
  return code;
}

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const LOCAL_IP = getLocalIP();
const PORT = process.env.PORT || 3000;

function getGame(socket) {
  const roomCode = socketToGame.get(socket.id);
  return roomCode ? games.get(roomCode) : null;
}

function broadcastGameState(game) {
  const publicState = game.toPublicState();
  io.to(game.roomCode).emit('game-state-update', publicState);
}

function sendTurnNotification(game) {
  if (game.phase !== 'playing') return;
  const currentPlayer = game.players[game.currentPlayerIndex];
  if (!currentPlayer || !currentPlayer.connected) return;
  const validMoves = Validator.getValidMoves(game, currentPlayer.id);

  // Auto-pass immediately if player has no moves and can't draw
  if (validMoves.length === 0 && game.boneyard.length === 0) {
    const passResult = game.passTurn(currentPlayer.id);
    if (passResult.success) {
      if (passResult.trainMarked) {
        io.to(game.roomCode).emit('train-marked', { playerId: currentPlayer.id });
      }
      broadcastGameState(game);
      if (passResult.roundOver) {
        handleRoundEnd(game);
      } else {
        sendTurnNotification(game);
      }
    }
    return;
  }

  io.to(currentPlayer.id).emit('your-turn', { validMoves });
  // Broadcast whose turn it is
  io.to(game.roomCode).emit('turn-changed', {
    currentPlayerIndex: game.currentPlayerIndex,
    currentPlayerId: currentPlayer.id,
    currentPlayerName: currentPlayer.name
  });
  startTurnTimer(game);
}

function startTurnTimer(game) {
  clearTimeout(game.turnTimerRef);
  game.turnStartTime = Date.now();
  io.to(game.roomCode).emit('turn-timer', { seconds: 90 });

  game.turnTimerRef = setTimeout(() => {
    const currentPlayer = game.players[game.currentPlayerIndex];
    if (!currentPlayer) return;

    if (game.turnState === 'play') {
      const drawResult = game.drawTile(currentPlayer.id);
      if (drawResult.success) {
        io.to(currentPlayer.id).emit('tile-drawn', { tile: drawResult.tile });
        io.to(game.roomCode).emit('draw-occurred', {
          playerId: currentPlayer.id,
          boneyardCount: game.boneyard.length
        });
        if (!drawResult.canPlay) {
          const passResult = game.passTurn(currentPlayer.id);
          if (passResult.success) {
            if (passResult.trainMarked) {
              io.to(game.roomCode).emit('train-marked', { playerId: currentPlayer.id });
            }
            broadcastGameState(game);
            sendTurnNotification(game);
          }
        } else {
          broadcastGameState(game);
          sendTurnNotification(game);
        }
      } else {
        // Boneyard empty, auto-pass
        const passResult = game.passTurn(currentPlayer.id);
        if (passResult.success) {
          broadcastGameState(game);
          sendTurnNotification(game);
        }
      }
    } else if (game.turnState === 'drewCard') {
      const passResult = game.passTurn(currentPlayer.id);
      if (passResult.success) {
        if (passResult.trainMarked) {
          io.to(game.roomCode).emit('train-marked', { playerId: currentPlayer.id });
        }
        broadcastGameState(game);
        if (passResult.roundOver) {
          handleRoundEnd(game);
        } else {
          sendTurnNotification(game);
        }
      }
    }
  }, 90000);
}

function handleRoundEnd(game) {
  clearTimeout(game.turnTimerRef);
  const scores = game.endRound();
  io.to(game.roomCode).emit('round-ended', scores);

  if (game.checkGameOver()) {
    const finalScores = game.getFinalStandings();
    io.to(game.roomCode).emit('game-over', finalScores);
  }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  // Host creates a room (TV view - no player added)
  socket.on('create-room', async () => {
    const roomCode = generateRoomCode();
    const game = new GameState(roomCode);
    game.hostSocketId = socket.id;
    games.set(roomCode, game);
    socketToGame.set(socket.id, roomCode);
    socket.join(roomCode);

    const joinUrl = `http://${LOCAL_IP}:${PORT}/?room=${roomCode}`;
    let qrDataUrl;
    try {
      qrDataUrl = await QRCode.toDataURL(joinUrl, { width: 256, margin: 1 });
    } catch (e) {
      qrDataUrl = null;
    }

    socket.emit('room-created', {
      roomCode,
      joinUrl,
      qrDataUrl,
      players: []
    });
  });

  socket.on('create-game', async ({ playerName }) => {
    const roomCode = generateRoomCode();
    const game = new GameState(roomCode);
    const player = game.addPlayer(socket.id, playerName);
    games.set(roomCode, game);
    socketToGame.set(socket.id, roomCode);
    socket.join(roomCode);

    const joinUrl = `http://${LOCAL_IP}:${PORT}/?room=${roomCode}`;
    let qrDataUrl;
    try {
      qrDataUrl = await QRCode.toDataURL(joinUrl, { width: 256, margin: 1 });
    } catch (e) {
      qrDataUrl = null;
    }

    socket.emit('game-created', {
      roomCode,
      joinUrl,
      qrDataUrl,
      player: { id: player.id, name: player.name, color: player.color }
    });
    io.to(roomCode).emit('player-joined', {
      players: game.players.map(p => ({ id: p.id, name: p.name, color: p.color, connected: p.connected }))
    });
  });

  socket.on('join-game', ({ roomCode, playerName }) => {
    const code = roomCode.toUpperCase();
    const game = games.get(code);
    if (!game) return socket.emit('error', { message: 'Game not found' });
    if (game.phase !== 'lobby') {
      // Check if this is a reconnection (match by name, regardless of connected status)
      const existing = game.players.find(p => p.name === playerName);
      if (existing) {
        // Reconnect — swap socket ID
        clearTimeout(disconnectTimers.get(existing.id));
        disconnectTimers.delete(existing.id);
        const oldId = existing.id;

        // Disconnect old socket if still alive
        const oldSocket = io.sockets.sockets.get(oldId);
        if (oldSocket && oldId !== socket.id) {
          oldSocket.leave(code);
          socketToGame.delete(oldId);
        }

        existing.id = socket.id;
        existing.connected = true;

        // Update train ownership
        if (game.trains[oldId] && oldId !== socket.id) {
          game.trains[socket.id] = game.trains[oldId];
          game.trains[socket.id].ownerId = socket.id;
          delete game.trains[oldId];
        }

        socketToGame.set(socket.id, code);
        socket.join(code);

        socket.emit('reconnected', {
          hand: existing.hand,
          gameState: game.toPublicState(),
          player: { id: existing.id, name: existing.name, color: existing.color }
        });
        io.to(code).emit('player-joined', {
          players: game.players.map(p => ({ id: p.id, name: p.name, color: p.color, connected: p.connected }))
        });
        broadcastGameState(game);
        if (game.players[game.currentPlayerIndex]?.id === socket.id) {
          sendTurnNotification(game);
        }
        return;
      }
      return socket.emit('error', { message: 'Game already in progress' });
    }
    if (game.players.length >= 8) return socket.emit('error', { message: 'Game is full (max 8 players)' });
    if (game.players.find(p => p.name === playerName)) return socket.emit('error', { message: 'Name already taken' });

    const player = game.addPlayer(socket.id, playerName);
    socketToGame.set(socket.id, code);
    socket.join(code);

    socket.emit('joined-game', {
      roomCode: code,
      player: { id: player.id, name: player.name, color: player.color }
    });
    io.to(code).emit('player-joined', {
      players: game.players.map(p => ({ id: p.id, name: p.name, color: p.color, connected: p.connected }))
    });
  });

  socket.on('join-as-host', async ({ roomCode }) => {
    const code = roomCode.toUpperCase();
    const game = games.get(code);
    if (!game) return socket.emit('error', { message: 'Game not found' });

    game.hostSocketId = socket.id;
    socketToGame.set(socket.id, code);
    socket.join(code);

    const joinUrl = `http://${LOCAL_IP}:${PORT}/?room=${code}`;
    let qrDataUrl;
    try {
      qrDataUrl = await QRCode.toDataURL(joinUrl, { width: 256, margin: 1 });
    } catch (e) {
      qrDataUrl = null;
    }

    socket.emit('host-joined', {
      roomCode: code,
      joinUrl,
      qrDataUrl,
      gameState: game.toPublicState(),
      players: game.players.map(p => ({ id: p.id, name: p.name, color: p.color, connected: p.connected }))
    });
  });

  socket.on('start-game', () => {
    const game = getGame(socket);
    if (!game) return socket.emit('error', { message: 'Game not found' });
    if (game.players.length < 2) return socket.emit('error', { message: 'Need at least 2 players' });
    if (game.phase !== 'lobby') return socket.emit('error', { message: 'Game already started' });

    game.startGame();

    io.to(game.roomCode).emit('game-started', {
      engineValue: game.engineValue,
      round: game.currentRound + 1
    });

    // Send each player their hand privately
    for (const player of game.players) {
      io.to(player.id).emit('hand-dealt', { hand: player.hand });
    }

    broadcastGameState(game);
    sendTurnNotification(game);
  });

  socket.on('play-tile', ({ tileId, trainId }) => {
    const game = getGame(socket);
    if (!game) return socket.emit('error', { message: 'Game not found' });

    const result = game.playTile(socket.id, tileId, trainId);
    if (!result.success) return socket.emit('error', { message: result.error });

    io.to(game.roomCode).emit('tile-played', {
      playerId: socket.id,
      tileId,
      trainId,
      tile: result.playedTile,
      orientation: result.orientation
    });

    if (result.trainUnmarked) {
      io.to(game.roomCode).emit('train-unmarked', { playerId: socket.id });
    }

    // Send updated hand to the player
    const player = game.players.find(p => p.id === socket.id);
    if (player) {
      io.to(socket.id).emit('hand-updated', { hand: player.hand });
    }

    broadcastGameState(game);

    if (result.roundOver) {
      handleRoundEnd(game);
    } else {
      sendTurnNotification(game);
    }
  });

  socket.on('draw-tile', () => {
    const game = getGame(socket);
    if (!game) return socket.emit('error', { message: 'Game not found' });

    const result = game.drawTile(socket.id);
    if (!result.success) return socket.emit('error', { message: result.error });

    socket.emit('tile-drawn', { tile: result.tile });
    io.to(game.roomCode).emit('draw-occurred', {
      playerId: socket.id,
      boneyardCount: game.boneyard.length
    });

    broadcastGameState(game);

    if (!result.canPlay) {
      // Auto-pass: mark train and move on
      const passResult = game.passTurn(socket.id);
      if (passResult.success) {
        if (passResult.trainMarked) {
          io.to(game.roomCode).emit('train-marked', { playerId: socket.id });
        }
        broadcastGameState(game);
        if (passResult.roundOver) {
          handleRoundEnd(game);
        } else {
          sendTurnNotification(game);
        }
      }
    } else {
      // Player drew a playable tile - let them play it
      sendTurnNotification(game);
    }
  });

  socket.on('pass-turn', () => {
    const game = getGame(socket);
    if (!game) return socket.emit('error', { message: 'Game not found' });

    const result = game.passTurn(socket.id);
    if (!result.success) return socket.emit('error', { message: result.error });

    if (result.trainMarked) {
      io.to(game.roomCode).emit('train-marked', { playerId: socket.id });
    }

    broadcastGameState(game);
    if (result.roundOver) {
      handleRoundEnd(game);
    } else {
      sendTurnNotification(game);
    }
  });

  socket.on('next-round', () => {
    const game = getGame(socket);
    if (!game) return socket.emit('error', { message: 'Game not found' });
    if (game.phase !== 'roundEnd') return socket.emit('error', { message: 'Not in round end phase' });

    game.startNextRound();

    io.to(game.roomCode).emit('game-started', {
      engineValue: game.engineValue,
      round: game.currentRound + 1
    });

    for (const player of game.players) {
      io.to(player.id).emit('hand-dealt', { hand: player.hand });
    }

    broadcastGameState(game);
    sendTurnNotification(game);
  });

  socket.on('restart-game', () => {
    const game = getGame(socket);
    if (!game) return socket.emit('error', { message: 'Game not found' });

    game.resetToLobby();
    io.to(game.roomCode).emit('game-reset', {
      players: game.players.map(p => ({ id: p.id, name: p.name, color: p.color, connected: p.connected }))
    });
  });

  socket.on('kick-player', ({ playerId }) => {
    const game = getGame(socket);
    if (!game) return;
    if (game.phase !== 'lobby') return;

    game.removePlayer(playerId);
    io.to(playerId).emit('kicked');
    const kickedSocket = io.sockets.sockets.get(playerId);
    if (kickedSocket) {
      kickedSocket.leave(game.roomCode);
      socketToGame.delete(playerId);
    }
    io.to(game.roomCode).emit('player-joined', {
      players: game.players.map(p => ({ id: p.id, name: p.name, color: p.color, connected: p.connected }))
    });
  });

  // Tile selection relay for TV zoom feature
  socket.on('tile-selected', ({ trainIds }) => {
    const game = getGame(socket);
    if (!game) return;
    io.to(game.roomCode).emit('highlight-trains', {
      playerId: socket.id,
      trainIds
    });
  });

  socket.on('tile-deselected', () => {
    const game = getGame(socket);
    if (!game) return;
    io.to(game.roomCode).emit('clear-highlight');
  });

  socket.on('disconnect', () => {
    console.log(`Disconnected: ${socket.id}`);
    const game = getGame(socket);
    if (!game) return;

    const player = game.players.find(p => p.id === socket.id);
    if (player) {
      player.connected = false;
      io.to(game.roomCode).emit('player-left', {
        players: game.players.map(p => ({ id: p.id, name: p.name, color: p.color, connected: p.connected })),
        disconnectedName: player.name
      });

      // If it was their turn, auto-skip after a delay
      if (game.phase === 'playing' && game.players[game.currentPlayerIndex]?.id === socket.id) {
        disconnectTimers.set(socket.id, setTimeout(() => {
          if (game.phase === 'playing' && game.players[game.currentPlayerIndex]?.id === socket.id) {
            game.skipDisconnectedPlayer();
            broadcastGameState(game);
            sendTurnNotification(game);
          }
        }, 15000));
      }

      // Cleanup game after 30 min if all players gone
      const allGone = game.players.every(p => !p.connected);
      if (allGone) {
        setTimeout(() => {
          const g = games.get(game.roomCode);
          if (g && g.players.every(p => !p.connected)) {
            games.delete(game.roomCode);
            console.log(`Cleaned up game ${game.roomCode}`);
          }
        }, 30 * 60 * 1000);
      }
    } else if (game.hostSocketId === socket.id) {
      game.hostSocketId = null;
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚂 Mexican Train Dominoes Server`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://${LOCAL_IP}:${PORT}`);
  console.log(`\n   Open the Network URL on your TV/laptop to host a game.`);
  console.log(`   Players scan the QR code or visit the URL on their phones.\n`);
});
