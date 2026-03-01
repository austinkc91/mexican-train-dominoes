// Hub-and-spoke board renderer for host/TV view
// Engine at center, trains radiate outward as rotated spokes — tiles chain end-to-end
const TrainRenderer = (() => {
  let boardEl = null;
  let hubBoard = null;
  let resizeObserver = null;
  let lastState = null;
  let zoomTransform = null;
  // Store computed spoke endpoints for zoom targeting
  let spokeEndpoints = {};

  const SIZES = {
    normal: { w: 40, h: 76, gap: 3 },
    small:  { w: 28, h: 52, gap: 2 },
    tiny:   { w: 20, h: 38, gap: 1 }
  };

  function init(element) {
    boardEl = element;
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = new ResizeObserver(() => {
      if (lastState) render(lastState);
    });
    resizeObserver.observe(boardEl);
  }

  function maxSpokeLength(cx, cy, W, H, angleDeg) {
    const rad = angleDeg * Math.PI / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    let tMin = Infinity;
    if (dx !== 0) {
      const tRight = (W - cx) / dx;
      const tLeft = -cx / dx;
      if (tRight > 0) tMin = Math.min(tMin, tRight);
      if (tLeft > 0) tMin = Math.min(tMin, tLeft);
    }
    if (dy !== 0) {
      const tBottom = (H - cy) / dy;
      const tTop = -cy / dy;
      if (tBottom > 0) tMin = Math.min(tMin, tBottom);
      if (tTop > 0) tMin = Math.min(tMin, tTop);
    }
    return tMin === Infinity ? 0 : tMin;
  }

  function chooseTileSize(tileCount, availableLength) {
    if (tileCount === 0) return 'normal';
    for (const sizeName of ['normal', 'small', 'tiny']) {
      const s = SIZES[sizeName];
      const needed = tileCount * (s.h + s.gap);
      if (needed <= availableLength) return sizeName;
    }
    return 'tiny';
  }

  function tilesThatFit(sizeName, availableLength) {
    const s = SIZES[sizeName];
    return Math.floor(availableLength / (s.h + s.gap));
  }

  function render(gameState) {
    if (!boardEl) return;
    lastState = gameState;
    spokeEndpoints = {};

    const players = gameState.players;
    const trains = gameState.trains;
    const engineValue = gameState.engineValue;
    const currentPlayerId = players[gameState.currentPlayerIndex]?.id;

    const rect = boardEl.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    if (W === 0 || H === 0) return;

    const cx = W / 2;
    const cy = H / 2;

    const trainOrder = [...players.map(p => p.id), 'mexican'];
    const spokeCount = trainOrder.length;
    if (spokeCount === 0) return;

    const angleStep = 360 / spokeCount;
    const mexicanAngle = 90;
    const startAngle = mexicanAngle - (spokeCount - 1) * angleStep;
    const engineRadius = 50;

    // Create or reuse hub board
    if (!hubBoard || !boardEl.contains(hubBoard)) {
      const existingTimer = boardEl.querySelector('.turn-timer');
      const existingLog = boardEl.querySelector('.move-log');
      boardEl.innerHTML = '';
      hubBoard = document.createElement('div');
      hubBoard.className = 'hub-board';
      boardEl.appendChild(hubBoard);
      if (existingTimer) boardEl.appendChild(existingTimer);
      if (existingLog) boardEl.appendChild(existingLog);
    }

    hubBoard.innerHTML = '';
    hubBoard.style.width = W + 'px';
    hubBoard.style.height = H + 'px';

    if (zoomTransform) {
      hubBoard.style.transformOrigin = '0 0';
      hubBoard.style.transform = `translate(${zoomTransform.tx}px, ${zoomTransform.ty}px) scale(${zoomTransform.scale})`;
    } else {
      hubBoard.style.transformOrigin = '';
      hubBoard.style.transform = '';
    }

    // Engine at center
    const engineEl = document.createElement('div');
    engineEl.className = 'engine-hub';
    engineEl.style.left = (cx - 30) + 'px';
    engineEl.style.top = (cy - 30) + 'px';
    engineEl.appendChild(DominoRenderer.createEngineDomino(engineValue));
    hubBoard.appendChild(engineEl);

    // Render each spoke
    trainOrder.forEach((trainId, i) => {
      const train = trains[trainId];
      if (!train) return;

      const angle = startAngle + i * angleStep;
      const rad = angle * Math.PI / 180;
      const isMexican = trainId === 'mexican';
      const player = players.find(p => p.id === trainId);
      const isCurrentTurn = trainId === currentPlayerId;
      const color = isMexican ? '#F39C12' : (player ? player.color : '#fff');
      const name = isMexican ? 'Mexican Train' : (player ? player.name : '');

      const rawMax = maxSpokeLength(cx, cy, W, H, angle);
      const availableLength = rawMax - engineRadius - 40;

      const sizeName = chooseTileSize(train.tiles.length, Math.max(0, availableLength));
      const sizeObj = SIZES[sizeName];
      const maxFit = tilesThatFit(sizeName, Math.max(0, availableLength));
      const hiddenCount = Math.max(0, train.tiles.length - maxFit);
      const visibleTiles = hiddenCount > 0 ? train.tiles.slice(-maxFit) : train.tiles;

      // Spoke container — rotated from center
      const spoke = document.createElement('div');
      spoke.className = 'spoke';
      if (isCurrentTurn) spoke.classList.add('active-turn');
      spoke.dataset.trainId = trainId;
      spoke.style.left = cx + 'px';
      spoke.style.top = cy + 'px';
      spoke.style.transformOrigin = '0 0';
      spoke.style.transform = `rotate(${angle}deg)`;
      spoke.style.width = (rawMax - 10) + 'px';

      // Track line
      const track = document.createElement('div');
      track.className = 'spoke-track';
      spoke.appendChild(track);

      // Label (counter-rotated so text stays readable)
      const label = document.createElement('div');
      label.className = 'spoke-label';
      label.style.transform = `rotate(${-angle}deg)`;

      const dot = document.createElement('span');
      dot.className = 'spoke-label-dot';
      dot.style.background = color;
      label.appendChild(dot);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'spoke-label-name';
      nameSpan.textContent = isMexican ? 'MEX' : (name.length > 8 ? name.substring(0, 7) + '..' : name);
      nameSpan.style.color = color;
      label.appendChild(nameSpan);

      if (train.hasMarker && !isMexican) {
        const marker = document.createElement('span');
        marker.className = 'spoke-label-marker';
        marker.textContent = 'OPEN';
        label.appendChild(marker);
      }

      spoke.appendChild(label);

      // Tiles area
      const tilesArea = document.createElement('div');
      tilesArea.className = 'spoke-tiles';
      tilesArea.style.left = engineRadius + 'px';

      if (hiddenCount > 0) {
        const badge = document.createElement('div');
        badge.className = 'spoke-hidden-badge';
        badge.textContent = `+${hiddenCount}`;
        badge.style.transform = `rotate(${-angle}deg)`;
        tilesArea.appendChild(badge);
      }

      if (visibleTiles.length === 0 && hiddenCount === 0) {
        const empty = document.createElement('div');
        empty.className = 'spoke-empty';
        empty.textContent = '--';
        empty.style.transform = `rotate(${-angle}deg)`;
        tilesArea.appendChild(empty);
      } else {
        visibleTiles.forEach(tile => {
          tilesArea.appendChild(DominoRenderer.createDomino(tile, {
            horizontal: !tile.isDouble,
            small: sizeName === 'small',
            tiny: sizeName === 'tiny',
            playerColor: color
          }));
        });
      }

      // Open end at tip
      const openEnd = document.createElement('div');
      openEnd.className = 'spoke-open-end';
      openEnd.textContent = train.openEnd;
      openEnd.style.transform = `rotate(${-angle}deg)`;
      tilesArea.appendChild(openEnd);

      spoke.appendChild(tilesArea);
      hubBoard.appendChild(spoke);

      // Compute endpoint in board coordinates for zoom targeting
      // Account for doubles (narrower) vs non-doubles (wider along spoke)
      let tilesLength = engineRadius;
      visibleTiles.forEach(t => {
        tilesLength += (t.isDouble ? sizeObj.w : sizeObj.h) + sizeObj.gap;
      });
      const endDist = Math.min(tilesLength + 20, rawMax - 10);
      spokeEndpoints[trainId] = {
        x: cx + Math.cos(rad) * endDist,
        y: cy + Math.sin(rad) * endDist
      };
    });
  }

  function zoomToTrains(trainIds) {
    if (!hubBoard || !lastState) return;

    const rect = boardEl.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;

    // Target the actual endpoint of the train(s)
    let targetX = 0, targetY = 0, count = 0;
    trainIds.forEach(tid => {
      const ep = spokeEndpoints[tid];
      if (ep) {
        targetX += ep.x;
        targetY += ep.y;
        count++;
      }
    });
    if (count === 0) return;
    targetX /= count;
    targetY /= count;

    // Use translate + scale to CENTER the target in the viewport
    const scale = 1.8;
    const tx = W / 2 - targetX * scale;
    const ty = H / 2 - targetY * scale;

    zoomTransform = { scale, tx, ty };
    hubBoard.style.transition = 'transform 0.5s ease';
    hubBoard.style.transformOrigin = '0 0';
    hubBoard.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  function zoomReset() {
    zoomTransform = null;
    if (hubBoard) {
      hubBoard.style.transition = 'transform 0.5s ease';
      hubBoard.style.transformOrigin = '0 0';
      hubBoard.style.transform = '';
    }
  }

  function highlightTrains(trainIds) {
    if (!hubBoard) return;
    hubBoard.querySelectorAll('.spoke').forEach(spoke => {
      if (trainIds.includes(spoke.dataset.trainId)) {
        spoke.classList.add('highlight-target');
      } else {
        spoke.classList.remove('highlight-target');
      }
    });
  }

  function clearHighlight() {
    if (!hubBoard) return;
    hubBoard.querySelectorAll('.spoke.highlight-target').forEach(s => {
      s.classList.remove('highlight-target');
    });
  }

  function updateDimensions() {
    if (lastState) render(lastState);
  }

  return { init, render, updateDimensions, zoomToTrains, zoomReset, highlightTrains, clearHighlight };
})();
