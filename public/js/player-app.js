(() => {
  const socket = SocketManager.connect();
  const params = new URLSearchParams(window.location.search);
  const roomCode = params.get('room');
  const session = SocketManager.getSession();

  // Elements
  const waitingOverlay = document.getElementById('waitingOverlay');
  const turnIndicator = document.getElementById('turnIndicator');
  const roundNum = document.getElementById('roundNum');
  const myScore = document.getElementById('myScore');
  const timerBadge = document.getElementById('timerBadge');
  const doubleNotice = document.getElementById('doubleNotice');
  const trainTargets = document.getElementById('trainTargets');
  const handArea = document.getElementById('handArea');
  const drawBtn = document.getElementById('drawBtn');
  const sortBtn = document.getElementById('sortBtn');
  const handCount = document.getElementById('handCount');
  const roundOverlay = document.getElementById('roundOverlay');
  const roundOverlayTitle = document.getElementById('roundOverlayTitle');
  const roundScoreList = document.getElementById('roundScoreList');
  const playerNextRoundBtn = document.getElementById('playerNextRoundBtn');
  const gameOverlay = document.getElementById('gameOverlay');
  const gameOverWinner = document.getElementById('gameOverWinner');
  const finalScoreList = document.getElementById('finalScoreList');
  const toastContainer = document.getElementById('toastContainer');

  let hand = [];
  let gameState = null;
  let validMoves = [];
  let selectedTileId = null;
  let isMyTurn = false;
  let myId = null;
  let timerInterval = null;
  let sorted = false;

  // Reconnect to the game with our saved session
  myId = session.playerId;
  if (roomCode && session.playerName) {
    socket.emit('join-game', { roomCode, playerName: session.playerName });
  }

  // Listen for our ID from connection
  socket.on('joined-game', ({ player }) => {
    myId = player.id;
    SocketManager.saveSession(roomCode, session.playerName, player.id);
  });

  socket.on('reconnected', ({ hand: h, gameState: gs, player }) => {
    myId = player.id;
    SocketManager.saveSession(roomCode, session.playerName, player.id);
    hand = h;
    gameState = gs;
    waitingOverlay.classList.add('hidden');
    renderHand();
    updateUI();
  });

  socket.on('game-started', ({ round }) => {
    waitingOverlay.classList.add('hidden');
    roundOverlay.classList.add('hidden');
    gameOverlay.classList.add('hidden');
    playerNextRoundBtn.disabled = false;
    playerNextRoundBtn.textContent = 'Next Round';
    roundNum.textContent = round;
  });

  socket.on('hand-dealt', ({ hand: h }) => {
    hand = h;
    selectedTileId = null;
    isMyTurn = false;
    validMoves = [];
    sorted = false;
    renderHand();
    updateHandCount();
    showTurnIndicator(false);
  });

  socket.on('hand-updated', ({ hand: h }) => {
    hand = h;
    renderHand();
    updateHandCount();
  });

  socket.on('game-state-update', (state) => {
    gameState = state;
    updateUI();
  });

  socket.on('your-turn', ({ validMoves: moves }) => {
    isMyTurn = true;
    validMoves = moves;
    selectedTileId = null;

    showTurnIndicator(true);
    renderHand();
    updateDrawButton();
    updateDoubleNotice();

    // Vibrate on turn start
    if (navigator.vibrate) navigator.vibrate(100);
  });

  socket.on('turn-changed', ({ currentPlayerId, currentPlayerName }) => {
    if (currentPlayerId !== myId) {
      isMyTurn = false;
      validMoves = [];
      selectedTileId = null;
      showTurnIndicator(false, currentPlayerName);
      renderHand();
      updateDrawButton();
    }
  });

  socket.on('tile-drawn', ({ tile }) => {
    hand.push(tile);
    renderHand();
    updateHandCount();
    showToast(`Drew ${tile.top}|${tile.bottom}`);
  });

  socket.on('draw-occurred', ({ playerId }) => {
    if (playerId === myId) return;
    const name = getPlayerName(playerId);
    // showToast(`${name} drew a tile`);
  });

  socket.on('train-marked', ({ playerId }) => {
    if (playerId === myId) {
      showToast('Your train is now open');
    }
  });

  socket.on('tile-played', ({ playerId, tile, trainId }) => {
    if (playerId === myId) return;
    const name = getPlayerName(playerId);
    showToast(`${name} played ${tile.top}|${tile.bottom}`);
  });

  socket.on('turn-timer', ({ seconds }) => {
    startTimerDisplay(seconds);
  });

  socket.on('round-ended', ({ winnerName, totalScores, roundNumber: rn }) => {
    clearInterval(timerInterval);
    timerBadge.textContent = '';
    isMyTurn = false;

    roundOverlayTitle.textContent = winnerName
      ? `${winnerName} wins Round ${rn}!`
      : `Round ${rn} Complete`;

    renderRoundScores(totalScores);
    roundOverlay.classList.remove('hidden');
  });

  playerNextRoundBtn.addEventListener('click', () => {
    playerNextRoundBtn.disabled = true;
    playerNextRoundBtn.textContent = 'Waiting...';
    socket.emit('next-round');
  });

  socket.on('game-over', ({ standings, winner }) => {
    roundOverlay.classList.add('hidden');
    gameOverWinner.textContent = `${winner.name} wins with ${winner.totalScore} points!`;
    gameOverWinner.style.color = winner.color;
    renderFinalScores(standings);
    gameOverlay.classList.remove('hidden');
  });

  socket.on('game-reset', () => {
    gameOverlay.classList.add('hidden');
    roundOverlay.classList.add('hidden');
    window.location.href = `/?room=${roomCode}`;
  });

  socket.on('error', ({ message }) => {
    showToast(message);
  });

  // --- Interactions ---

  // Tap tile to select
  handArea.addEventListener('click', (e) => {
    if (!isMyTurn) return;
    const dominoEl = e.target.closest('.domino');
    if (!dominoEl) return;

    const tileId = dominoEl.dataset.tileId;
    if (!tileId) return;

    // Check if this tile has valid moves
    const tileMoves = validMoves.filter(m => m.tileId === tileId);
    if (tileMoves.length === 0) return;

    if (selectedTileId === tileId) {
      // Deselect
      selectedTileId = null;
      renderHand();
      hideTrainTargets();
      socket.emit('tile-deselected');
      return;
    }

    // If switching from a previous selection, clear old zoom first
    if (selectedTileId !== null) {
      socket.emit('tile-deselected');
    }

    selectedTileId = tileId;
    renderHand();

    // Emit selection to server so TV can zoom to new target
    const targetTrainIds = [...new Set(tileMoves.map(m => m.trainId))];
    socket.emit('tile-selected', { trainIds: targetTrainIds });

    // If only one valid train for this tile, show targets (user taps again to confirm)
    showTrainTargets(tileMoves);

    if (navigator.vibrate) navigator.vibrate(10);
  });

  // Tap train target to play
  trainTargets.addEventListener('click', (e) => {
    const target = e.target.closest('.train-target');
    if (!target || !target.classList.contains('selectable')) return;

    const trainId = target.dataset.trainId;
    if (!selectedTileId || !trainId) return;

    playTile(selectedTileId, trainId);
  });

  // Draw button
  drawBtn.addEventListener('click', () => {
    if (!isMyTurn) return;
    socket.emit('draw-tile');
    drawBtn.disabled = true;
  });

  // Sort button
  sortBtn.addEventListener('click', () => {
    sorted = !sorted;
    if (sorted) {
      hand.sort((a, b) => {
        // Sort by higher value first, then by lower value
        const aMax = Math.max(a.top, a.bottom);
        const bMax = Math.max(b.top, b.bottom);
        if (aMax !== bMax) return aMax - bMax;
        return Math.min(a.top, a.bottom) - Math.min(b.top, b.bottom);
      });
    }
    renderHand();
  });

  // --- Rendering ---

  function renderHand() {
    handArea.innerHTML = '';
    const playableTileIds = new Set(validMoves.map(m => m.tileId));

    hand.forEach(tile => {
      const isPlayable = isMyTurn && playableTileIds.has(tile.id);
      const isSelected = tile.id === selectedTileId;
      const isDimmed = isMyTurn && !isPlayable;

      const el = DominoRenderer.createDomino(tile, {
        interactive: isPlayable,
        playable: isPlayable && !isSelected,
        selected: isSelected,
        dimmed: isDimmed
      });
      handArea.appendChild(el);
    });

    updateHandCount();
  }

  function showTrainTargets(tileMoves) {
    trainTargets.innerHTML = '';
    trainTargets.classList.remove('hidden-targets');

    const seenTrains = new Set();
    tileMoves.forEach(move => {
      if (seenTrains.has(move.trainId)) return;
      seenTrains.add(move.trainId);

      const train = gameState.trains[move.trainId];
      if (!train) return;

      const isMexican = move.trainId === 'mexican';
      const player = gameState.players.find(p => p.id === move.trainId);
      const isOwn = move.trainId === myId;

      const target = document.createElement('div');
      target.className = 'train-target selectable';
      target.dataset.trainId = move.trainId;

      const color = isMexican ? '#F39C12' : (player ? player.color : '#666');
      const name = isMexican ? 'Mexican' : (isOwn ? 'Your Train' : (player ? player.name : ''));

      target.innerHTML = `
        <div class="train-target-color" style="background:${color}"></div>
        <div class="train-target-info">
          <div class="train-target-name">${escapeHtml(name)}</div>
          <div class="train-target-end">${train.openEnd}</div>
          ${train.hasMarker && !isMexican ? '<div class="train-target-marker">OPEN</div>' : ''}
        </div>
      `;

      trainTargets.appendChild(target);
    });
  }

  function hideTrainTargets() {
    trainTargets.innerHTML = '';
    trainTargets.classList.add('hidden-targets');
  }

  function playTile(tileId, trainId) {
    socket.emit('tile-deselected');
    socket.emit('play-tile', { tileId, trainId });
    selectedTileId = null;
    isMyTurn = false;
    validMoves = [];
    hideTrainTargets();
    renderHand();
    showTurnIndicator(false);

    if (navigator.vibrate) navigator.vibrate([10, 50, 10]);
  }

  function updateUI() {
    if (!gameState) return;
    const me = gameState.players.find(p => p.id === myId);
    if (me) {
      myScore.textContent = me.totalScore;
    }
    roundNum.textContent = gameState.currentRound + 1;
    updateDrawButton();
    updateDoubleNotice();
  }

  function updateDrawButton() {
    if (!isMyTurn) {
      drawBtn.disabled = true;
      drawBtn.classList.remove('highlighted');
      return;
    }
    const hasValidPlays = validMoves.length > 0;
    drawBtn.disabled = hasValidPlays;
    drawBtn.classList.toggle('highlighted', !hasValidPlays);

    if (gameState && gameState.boneyardCount === 0) {
      drawBtn.textContent = 'No tiles left';
      drawBtn.disabled = true;
      drawBtn.classList.remove('highlighted');
    } else {
      drawBtn.textContent = `Draw (${gameState ? gameState.boneyardCount : '?'} left)`;
    }
  }

  function updateDoubleNotice() {
    if (!gameState || !gameState.unsatisfiedDouble) {
      doubleNotice.classList.add('hidden');
      return;
    }
    const d = gameState.unsatisfiedDouble;
    doubleNotice.classList.remove('hidden');
    doubleNotice.textContent = `Must satisfy the double-${d.value}!`;
  }

  function showTurnIndicator(yourTurn, waitingFor) {
    if (yourTurn) {
      turnIndicator.className = 'turn-indicator your-turn';
      turnIndicator.textContent = 'Your Turn!';
    } else {
      turnIndicator.className = 'turn-indicator waiting';
      turnIndicator.textContent = waitingFor ? `Waiting for ${waitingFor}...` : 'Waiting...';
    }
  }

  function updateHandCount() {
    handCount.textContent = hand.length;
  }

  function startTimerDisplay(seconds) {
    clearInterval(timerInterval);
    let remaining = seconds;
    timerBadge.textContent = '';
    timerBadge.classList.remove('warning');

    timerInterval = setInterval(() => {
      remaining--;
      if (remaining <= 15 && isMyTurn) {
        timerBadge.textContent = remaining;
        if (remaining <= 5) {
          timerBadge.classList.add('warning');
        }
      } else {
        timerBadge.textContent = '';
      }
      if (remaining <= 0) {
        clearInterval(timerInterval);
        timerBadge.textContent = '';
      }
    }, 1000);
  }

  function renderRoundScores(totalScores) {
    roundScoreList.innerHTML = '';
    const sorted = [...totalScores].sort((a, b) => a.totalScore - b.totalScore);
    sorted.forEach(s => {
      const li = document.createElement('li');
      li.className = s.roundScore === 0 ? 'winner' : '';
      li.innerHTML = `
        <span>
          <span class="player-color-dot" style="background:${s.color}; display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px;"></span>
          ${escapeHtml(s.name)}
        </span>
        <span>${s.roundScore === 0 ? 'OUT!' : '+' + s.roundScore} (${s.totalScore})</span>
      `;
      roundScoreList.appendChild(li);
    });
  }

  function renderFinalScores(standings) {
    finalScoreList.innerHTML = '';
    standings.forEach(s => {
      const li = document.createElement('li');
      li.className = s.rank === 1 ? 'winner' : '';
      li.innerHTML = `
        <span>${s.rank === 1 ? '\uD83C\uDFC6' : '#' + s.rank} ${escapeHtml(s.name)}</span>
        <span>${s.totalScore} pts</span>
      `;
      finalScoreList.appendChild(li);
    });
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  function getPlayerName(playerId) {
    if (!gameState) return 'Someone';
    const p = gameState.players.find(p => p.id === playerId);
    return p ? p.name : 'Someone';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();
