// Socket.IO connection manager - shared across all views
const SocketManager = (() => {
  let socket = null;
  let roomCode = sessionStorage.getItem('roomCode');
  let playerName = sessionStorage.getItem('playerName');
  let playerId = sessionStorage.getItem('playerId');

  function connect() {
    if (socket && socket.connected) return socket;
    socket = io({ reconnection: true, reconnectionDelay: 1000, reconnectionAttempts: 20 });

    socket.on('connect', () => {
      console.log('Connected:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('Disconnected:', reason);
    });

    socket.on('reconnect', () => {
      console.log('Reconnected');
      // Attempt to rejoin the game
      if (roomCode && playerName) {
        socket.emit('join-game', { roomCode, playerName });
      }
    });

    return socket;
  }

  function emit(event, data) {
    if (socket) socket.emit(event, data);
  }

  function on(event, callback) {
    if (socket) socket.on(event, callback);
  }

  function off(event, callback) {
    if (socket) socket.off(event, callback);
  }

  function saveSession(room, name, id) {
    roomCode = room;
    playerName = name;
    playerId = id;
    sessionStorage.setItem('roomCode', room);
    sessionStorage.setItem('playerName', name);
    if (id) sessionStorage.setItem('playerId', id);
  }

  function getSession() {
    return { roomCode, playerName, playerId };
  }

  function getSocket() {
    return socket;
  }

  return { connect, emit, on, off, saveSession, getSession, getSocket };
})();
