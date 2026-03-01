(() => {
  const socket = SocketManager.connect();

  const joinScreen = document.getElementById('joinScreen');
  const lobbyScreen = document.getElementById('lobbyScreen');
  const nameInput = document.getElementById('nameInput');
  const codeInput = document.getElementById('codeInput');
  const createBtn = document.getElementById('createBtn');
  const joinBtn = document.getElementById('joinBtn');
  const errorMsg = document.getElementById('errorMsg');
  const lobbyRoomCode = document.getElementById('lobbyRoomCode');
  const lobbyPlayerCount = document.getElementById('lobbyPlayerCount');
  const lobbyPlayerList = document.getElementById('lobbyPlayerList');
  const lobbyQrSection = document.getElementById('lobbyQrSection');
  const lobbyQrImg = document.getElementById('lobbyQrImg');
  const lobbyJoinUrl = document.getElementById('lobbyJoinUrl');
  const tvViewLink = document.getElementById('tvViewLink');
  const startBtn = document.getElementById('startBtn');
  const waitingText = document.getElementById('waitingText');

  let isCreator = false;
  let myId = null;

  // Check URL params for room code (from QR scan)
  const params = new URLSearchParams(window.location.search);
  const roomFromUrl = params.get('room');
  if (roomFromUrl) {
    codeInput.value = roomFromUrl.toUpperCase();
    nameInput.focus();
    // Visually emphasize Join over Create when code is pre-filled
    joinBtn.classList.remove('btn-secondary');
    joinBtn.classList.add('btn-primary');
    createBtn.classList.remove('btn-primary');
    createBtn.classList.add('btn-secondary');
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    setTimeout(() => { errorMsg.textContent = ''; }, 4000);
  }

  function getName() {
    const name = nameInput.value.trim();
    if (!name) {
      showError('Please enter your name');
      nameInput.focus();
      return null;
    }
    return name;
  }

  createBtn.addEventListener('click', () => {
    const name = getName();
    if (!name) return;
    isCreator = true;
    socket.emit('create-game', { playerName: name });
  });

  joinBtn.addEventListener('click', () => {
    const name = getName();
    if (!name) return;
    const code = codeInput.value.trim().toUpperCase();
    if (code.length !== 4) {
      showError('Enter a 4-letter room code');
      codeInput.focus();
      return;
    }
    socket.emit('join-game', { roomCode: code, playerName: name });
  });

  // Enter key handlers
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (codeInput.value.trim().length === 4) {
        joinBtn.click();
      } else {
        createBtn.click();
      }
    }
  });

  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinBtn.click();
  });

  // Force uppercase on room code
  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase();
  });

  // Socket events
  socket.on('game-created', ({ roomCode, joinUrl, qrDataUrl, player }) => {
    myId = player.id;
    SocketManager.saveSession(roomCode, nameInput.value.trim(), player.id);
    showLobby(roomCode, joinUrl, qrDataUrl);
  });

  socket.on('joined-game', ({ roomCode, player }) => {
    myId = player.id;
    SocketManager.saveSession(roomCode, nameInput.value.trim(), player.id);
    showLobby(roomCode);
  });

  socket.on('player-joined', ({ players }) => {
    renderPlayerList(players);
  });

  socket.on('player-left', ({ players }) => {
    renderPlayerList(players);
  });

  socket.on('game-started', () => {
    // Redirect to player view
    window.location.href = `/play?room=${SocketManager.getSession().roomCode}`;
  });

  // Reconnection — player rejoining a game already in progress
  socket.on('reconnected', ({ hand, gameState, player }) => {
    const code = codeInput.value.trim().toUpperCase() || roomFromUrl;
    SocketManager.saveSession(code, nameInput.value.trim(), player.id);
    window.location.href = `/play?room=${code}`;
  });

  socket.on('error', ({ message }) => {
    showError(message);
  });

  function showLobby(roomCode, joinUrl, qrDataUrl) {
    joinScreen.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');
    lobbyRoomCode.textContent = roomCode;

    if (isCreator) {
      startBtn.classList.remove('hidden');
      waitingText.classList.add('hidden');

      // Show QR code for the game creator
      if (qrDataUrl) {
        lobbyQrImg.src = qrDataUrl;
        lobbyQrSection.classList.remove('hidden');
      }
      if (joinUrl) {
        lobbyJoinUrl.textContent = joinUrl;
      }

      // Show TV view link
      tvViewLink.href = `/host?room=${roomCode}`;
      tvViewLink.classList.remove('hidden');
    }

    startBtn.addEventListener('click', () => {
      socket.emit('start-game');
    });
  }

  function renderPlayerList(players) {
    lobbyPlayerCount.textContent = `${players.length}/8 players`;
    lobbyPlayerList.innerHTML = '';

    players.forEach(p => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="player-color-dot" style="background:${p.color}"></span>
        <span class="player-name">${escapeHtml(p.name)}</span>
        ${p.id === myId ? '<span class="player-you">(you)</span>' : ''}
        <span class="status-dot ${p.connected ? 'connected' : 'disconnected'}"></span>
      `;
      lobbyPlayerList.appendChild(li);
    });

    // Enable start button if 2+ players
    if (isCreator) {
      startBtn.disabled = players.length < 2;
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();
