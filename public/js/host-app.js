(() => {
  const socket = SocketManager.connect();
  const params = new URLSearchParams(window.location.search);
  let roomCode = params.get('room');

  // Elements
  const lobbyOverlay = document.getElementById('lobbyOverlay');
  const lobbyQr = document.getElementById('lobbyQr');
  const lobbyUrl = document.getElementById('lobbyUrl');
  const lobbyPlayers = document.getElementById('lobbyPlayers');
  const lobbyCount = document.getElementById('lobbyCount');
  const lobbyStartBtn = document.getElementById('lobbyStartBtn');
  const gameHeader = document.getElementById('gameHeader');
  const roundNumber = document.getElementById('roundNumber');
  const engineValue = document.getElementById('engineValue');
  const boneyardCount = document.getElementById('boneyardCount');
  const headerRoomCode = document.getElementById('headerRoomCode');
  const headerQr = document.getElementById('headerQr');
  const boardArea = document.getElementById('boardArea');
  const playerBar = document.getElementById('playerBar');
  const turnTimer = document.getElementById('turnTimer');
  const turnBanner = document.getElementById('turnBanner');
  const moveLog = document.getElementById('moveLog');
  const roundEndOverlay = document.getElementById('roundEndOverlay');
  const roundEndTitle = document.getElementById('roundEndTitle');
  const scoreTable = document.getElementById('scoreTable');
  const nextRoundBtn = document.getElementById('nextRoundBtn');
  const gameOverOverlay = document.getElementById('gameOverOverlay');
  const winnerAnnouncement = document.getElementById('winnerAnnouncement');
  const finalScoreTable = document.getElementById('finalScoreTable');
  const playAgainBtn = document.getElementById('playAgainBtn');

  let gameState = null;
  let playerMap = {};
  let timerInterval = null;

  function initWithRoom(code, joinUrl, qrDataUrl, players, state) {
    roomCode = code;
    headerRoomCode.textContent = code;
    // Update URL without reload
    window.history.replaceState(null, '', `/host?room=${code}`);
    lobbyQr.src = qrDataUrl || '';
    lobbyUrl.textContent = joinUrl || '';
    headerQr.src = qrDataUrl || '';
    renderLobbyPlayers(players || []);

    if (state && (state.phase === 'playing' || state.phase === 'roundEnd')) {
      gameState = state;
      showGame();
      roundNumber.textContent = state.currentRound + 1;
      engineValue.textContent = state.engineValue;
      boneyardCount.textContent = state.boneyardCount;
      renderBoard();
      renderPlayerBar();
    }
  }

  if (roomCode) {
    // Join existing room as host
    headerRoomCode.textContent = roomCode;
    socket.emit('join-as-host', { roomCode });
  } else {
    // No room code — auto-create a new room
    socket.emit('create-room');
  }

  // Room created (auto-create flow)
  socket.on('room-created', ({ roomCode: code, joinUrl, qrDataUrl, players }) => {
    initWithRoom(code, joinUrl, qrDataUrl, players, null);
  });

  // Joined existing room as host
  socket.on('host-joined', ({ roomCode: code, joinUrl, qrDataUrl, players, gameState: state }) => {
    initWithRoom(code, joinUrl, qrDataUrl, players, state);
  });

  socket.on('player-joined', ({ players }) => {
    renderLobbyPlayers(players);
    if (gameState) renderPlayerBar();
  });

  socket.on('player-left', ({ players, disconnectedName }) => {
    renderLobbyPlayers(players);
    if (disconnectedName) addLogEntry(`${disconnectedName} disconnected`);
    if (gameState) renderPlayerBar();
  });

  socket.on('game-started', ({ engineValue: ev, round }) => {
    showGame();
    roundNumber.textContent = round;
    engineValue.textContent = ev;
  });

  socket.on('game-state-update', (state) => {
    gameState = state;
    roundNumber.textContent = state.currentRound + 1;
    engineValue.textContent = state.engineValue;
    boneyardCount.textContent = state.boneyardCount;
    renderBoard();
    renderPlayerBar();
  });

  socket.on('tile-played', ({ playerId, tileId, trainId, tile }) => {
    const pName = getPlayerName(playerId);
    const trainName = getTrainName(trainId);
    addLogEntry(`${pName} played ${tile.top}|${tile.bottom} on ${trainName}`);
  });

  socket.on('draw-occurred', ({ playerId }) => {
    addLogEntry(`${getPlayerName(playerId)} drew a tile`);
  });

  socket.on('train-marked', ({ playerId }) => {
    addLogEntry(`${getPlayerName(playerId)}'s train is open`);
  });

  socket.on('train-unmarked', ({ playerId }) => {
    addLogEntry(`${getPlayerName(playerId)} closed their train`);
  });

  socket.on('turn-changed', ({ currentPlayerId, currentPlayerName }) => {
    const player = gameState?.players?.find(p => p.id === currentPlayerId);
    const color = player?.color || '#fff';
    turnBanner.textContent = `${currentPlayerName}'s Turn`;
    turnBanner.style.setProperty('--player-turn-color', color);
    turnBanner.style.borderColor = color;
    turnBanner.classList.add('visible');
  });

  socket.on('turn-timer', ({ seconds }) => {
    startTimerDisplay(seconds);
  });

  socket.on('round-ended', ({ winnerName, totalScores, roundNumber: rn }) => {
    clearInterval(timerInterval);
    turnTimer.classList.remove('visible');
    turnBanner.classList.remove('visible');

    roundEndTitle.textContent = winnerName
      ? `${winnerName} wins Round ${rn}!`
      : `Round ${rn} Complete`;

    renderScoreTable(scoreTable, totalScores);
    roundEndOverlay.classList.remove('hidden');
  });

  socket.on('game-over', ({ standings, winner }) => {
    roundEndOverlay.classList.add('hidden');
    winnerAnnouncement.textContent = `${winner.name} wins with ${winner.totalScore} points!`;
    winnerAnnouncement.style.color = winner.color;
    renderFinalScoreTable(finalScoreTable, standings);
    gameOverOverlay.classList.remove('hidden');
  });

  socket.on('game-reset', ({ players }) => {
    gameOverOverlay.classList.add('hidden');
    roundEndOverlay.classList.add('hidden');
    lobbyOverlay.classList.remove('hidden');
    gameState = null;
    renderLobbyPlayers(players);
  });

  // Zoom-on-select: TV zooms into target trains when player selects a tile
  socket.on('highlight-trains', ({ playerId, trainIds }) => {
    if (!gameState) return;
    TrainRenderer.highlightTrains(trainIds);
    TrainRenderer.zoomToTrains(trainIds);
  });

  socket.on('clear-highlight', () => {
    TrainRenderer.clearHighlight();
    TrainRenderer.zoomReset();
  });

  lobbyStartBtn.addEventListener('click', () => {
    socket.emit('start-game');
  });

  nextRoundBtn.addEventListener('click', () => {
    roundEndOverlay.classList.add('hidden');
    socket.emit('next-round');
  });

  playAgainBtn.addEventListener('click', () => {
    socket.emit('restart-game');
  });

  // --- Rendering ---

  function showGame() {
    lobbyOverlay.classList.add('hidden');
  }

  function renderLobbyPlayers(players) {
    playerMap = {};
    players.forEach(p => { playerMap[p.id] = p; });

    lobbyPlayers.innerHTML = '';
    players.forEach(p => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="lobby-player-dot" style="background:${p.color}"></span>${escapeHtml(p.name)}`;
      lobbyPlayers.appendChild(li);
    });
    lobbyCount.textContent = `${players.length}/8 players`;
    lobbyStartBtn.disabled = players.length < 2;
  }

  let boardInitialized = false;
  function renderBoard() {
    if (!gameState) return;
    // Update player map
    gameState.players.forEach(p => { playerMap[p.id] = p; });
    if (!boardInitialized) {
      TrainRenderer.init(boardArea);
      boardInitialized = true;
    }
    TrainRenderer.render(gameState);
  }

  function renderPlayerBar() {
    if (!gameState) return;
    playerBar.innerHTML = '';
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];

    gameState.players.forEach(p => {
      const card = document.createElement('div');
      card.className = 'player-card';
      if (currentPlayer && p.id === currentPlayer.id) card.classList.add('current-turn');
      if (!p.connected) card.classList.add('disconnected');

      card.innerHTML = `
        <div class="player-card-color" style="background:${p.color}"></div>
        <div class="player-card-info">
          <div class="player-card-name">${escapeHtml(p.name)}</div>
          <div class="player-card-stats">
            <span class="tile-count">${p.tileCount} tiles</span>
            <span class="score-display">${p.totalScore} pts</span>
          </div>
        </div>
      `;
      playerBar.appendChild(card);
    });
  }

  function renderScoreTable(table, totalScores) {
    table.innerHTML = `
      <thead>
        <tr><th style="text-align:left">Player</th><th>Round</th><th>Total</th></tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');
    // Sort by total score
    const sorted = [...totalScores].sort((a, b) => a.totalScore - b.totalScore);
    sorted.forEach(s => {
      const tr = document.createElement('tr');
      tr.className = 'player-row';
      if (s.roundScore === 0) tr.classList.add('winner-row');
      tr.innerHTML = `
        <td><span class="player-color-dot" style="background:${s.color}; display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:8px;"></span>${escapeHtml(s.name)}</td>
        <td>${s.roundScore === 0 ? 'OUT!' : '+' + s.roundScore}</td>
        <td>${s.totalScore}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderFinalScoreTable(table, standings) {
    table.innerHTML = `
      <thead>
        <tr><th>#</th><th style="text-align:left">Player</th><th>Score</th></tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');
    standings.forEach(s => {
      const tr = document.createElement('tr');
      tr.className = 'player-row';
      if (s.rank === 1) tr.classList.add('winner-row');
      tr.innerHTML = `
        <td>${s.rank === 1 ? '\uD83C\uDFC6' : s.rank}</td>
        <td><span class="player-color-dot" style="background:${s.color}; display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:8px;"></span>${escapeHtml(s.name)}</td>
        <td>${s.totalScore}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function startTimerDisplay(seconds) {
    clearInterval(timerInterval);
    let remaining = seconds;
    turnTimer.textContent = remaining;
    turnTimer.classList.remove('visible', 'warning');

    // Only show timer when it gets low
    timerInterval = setInterval(() => {
      remaining--;
      if (remaining <= 15) {
        turnTimer.classList.add('visible');
        turnTimer.textContent = remaining;
        if (remaining <= 5) {
          turnTimer.classList.add('warning');
        }
      }
      if (remaining <= 0) {
        clearInterval(timerInterval);
        turnTimer.classList.remove('visible');
      }
    }, 1000);
  }

  function addLogEntry(text) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = text;
    moveLog.prepend(entry);
    // Keep only last 50 entries
    while (moveLog.children.length > 50) {
      moveLog.removeChild(moveLog.lastChild);
    }
  }

  function getPlayerName(playerId) {
    const p = playerMap[playerId];
    return p ? p.name : 'Unknown';
  }

  function getTrainName(trainId) {
    if (trainId === 'mexican') return 'Mexican Train';
    const p = playerMap[trainId];
    return p ? `${p.name}'s train` : 'a train';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();
