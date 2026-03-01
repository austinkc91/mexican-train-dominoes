// Creates domino DOM elements using inline SVGs for pixel-perfect pip rendering
const DominoRenderer = (() => {
  const NS = 'http://www.w3.org/2000/svg';

  // Pip positions as fractions [x, y] within a domino half-face
  // Standard domino/dice layouts extended to double-12
  const PIPS = {
    0: [],
    1: [[.5, .5]],
    2: [[.73, .25], [.27, .75]],
    3: [[.73, .25], [.5, .5], [.27, .75]],
    4: [[.27, .25], [.73, .25], [.27, .75], [.73, .75]],
    5: [[.27, .25], [.73, .25], [.5, .5], [.27, .75], [.73, .75]],
    6: [[.27, .2], [.73, .2], [.27, .5], [.73, .5], [.27, .8], [.73, .8]],
    7: [[.27, .2], [.73, .2], [.27, .5], [.5, .5], [.73, .5], [.27, .8], [.73, .8]],
    8: [[.27, .15], [.73, .15], [.27, .383], [.73, .383], [.27, .617], [.73, .617], [.27, .85], [.73, .85]],
    9: [[.27, .2], [.5, .2], [.73, .2], [.27, .5], [.5, .5], [.73, .5], [.27, .8], [.5, .8], [.73, .8]],
    10: [[.27, .15], [.5, .15], [.73, .15], [.27, .383], [.5, .383], [.73, .383], [.27, .617], [.5, .617], [.73, .617], [.5, .85]],
    11: [[.27, .15], [.5, .15], [.73, .15], [.27, .383], [.5, .383], [.73, .383], [.27, .617], [.5, .617], [.73, .617], [.27, .85], [.73, .85]],
    12: [[.27, .15], [.5, .15], [.73, .15], [.27, .383], [.5, .383], [.73, .383], [.27, .617], [.5, .617], [.73, .617], [.27, .85], [.5, .85], [.73, .85]]
  };

  // Render pip circles into SVG within a rectangular area
  function renderPips(svg, value, ax, ay, aw, ah) {
    const pips = PIPS[value] || [];
    const pad = 0.12;
    const ix = ax + aw * pad;
    const iy = ay + ah * pad;
    const iw = aw * (1 - 2 * pad);
    const ih = ah * (1 - 2 * pad);
    const r = Math.min(iw, ih) * 0.1;

    pips.forEach(([nx, ny]) => {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', ix + nx * iw);
      c.setAttribute('cy', iy + ny * ih);
      c.setAttribute('r', r);
      c.setAttribute('fill', '#222');
      svg.appendChild(c);
    });
  }

  function buildSVG(topVal, bottomVal, horizontal) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'domino-svg');

    let W, H;
    if (horizontal) { W = 380; H = 200; }
    else { W = 200; H = 380; }

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    // Ivory background
    const bg = document.createElementNS(NS, 'rect');
    bg.setAttribute('width', W);
    bg.setAttribute('height', H);
    bg.setAttribute('fill', '#f5f0e8');
    svg.appendChild(bg);

    // Divider line
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('stroke', '#999');
    line.setAttribute('stroke-width', 2);

    if (horizontal) {
      line.setAttribute('x1', W / 2); line.setAttribute('y1', H * 0.1);
      line.setAttribute('x2', W / 2); line.setAttribute('y2', H * 0.9);
      svg.appendChild(line);
      renderPips(svg, topVal, 0, 0, W / 2, H);
      renderPips(svg, bottomVal, W / 2, 0, W / 2, H);
    } else {
      line.setAttribute('x1', W * 0.1); line.setAttribute('y1', H / 2);
      line.setAttribute('x2', W * 0.9); line.setAttribute('y2', H / 2);
      svg.appendChild(line);
      renderPips(svg, topVal, 0, 0, W, H / 2);
      renderPips(svg, bottomVal, 0, H / 2, W, H / 2);
    }

    return svg;
  }

  function createDomino(tile, options = {}) {
    const {
      horizontal = false, small = false, tiny = false,
      interactive = false, selected = false, playable = false,
      dimmed = false, playerColor = null, facedown = false
    } = options;

    const el = document.createElement('div');
    el.className = 'domino';
    el.dataset.tileId = tile.id;

    if (horizontal) el.classList.add('horizontal');
    if (small) el.classList.add('small');
    if (tiny) el.classList.add('tiny');
    if (selected) el.classList.add('selected');
    if (playable) el.classList.add('playable');
    if (dimmed) el.classList.add('dimmed');
    if (facedown) el.classList.add('facedown');
    if (tile.isDouble) el.classList.add('is-double');

    if (playerColor) {
      el.style.setProperty('--player-accent', playerColor);
      el.setAttribute('data-player-color', '');
    }

    if (!facedown) {
      const topVal = tile.orientation === 'flipped' ? tile.bottom : tile.top;
      const bottomVal = tile.orientation === 'flipped' ? tile.top : tile.bottom;
      el.appendChild(buildSVG(topVal, bottomVal, horizontal));
    }

    if (interactive) el.style.cursor = 'pointer';
    return el;
  }

  function createEngineDomino(value) {
    const tile = { id: `${value}-${value}`, top: value, bottom: value, isDouble: true, orientation: 'normal' };
    const el = createDomino(tile);
    el.classList.add('engine');
    return el;
  }

  return { createDomino, createEngineDomino };
})();
