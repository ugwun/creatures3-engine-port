// ── Brain Tab — Spatial Heatmap ───────────────────────────────────────────
// Renders all lobes spatially using genome coordinates. Each neuron is a
// coloured cell; winning neurons get an orange highlight. Tract connections
// are drawn as SVG lines between lobes. Click a tract or neuron to see
// individual dendrite connections.

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────
  let brainData = null;       // { lobes:[], tracts:[] }
  let lobeNeurons = {};       // lobeIdx → { neurons:[], winner:int }
  let cachedLobePositions = {};  // lobeIdx → { px, py, pw, ph, lobe }
  let cachedBounds = null;

  // Dendrite inspection state
  let selectedTractIdx = null;
  let selectedNeuronKey = null; // "lobeIdx:neuronIdx" or null
  let tractDetail = null;       // fetched dendrite data for selected tract

  // Zoom state
  let zoomLevel = 1.0;
  const ZOOM_MIN = 0.4;
  const ZOOM_MAX = 3.0;
  const ZOOM_STEP = 0.15;

  // Scale: genome coords → pixels.
  const CELL_SIZE = 12;
  const PADDING = 20;

  function getSelectedCreatureId() {
    const sel = document.querySelector('.crt-list-item--selected');
    return sel ? parseInt(sel.dataset.id) : null;
  }

  // ── DOM refs ───────────────────────────────────────────────────────────
  const brainCanvas = document.getElementById('crt-brain-canvas');
  const brainSvg = document.getElementById('crt-brain-svg');
  const dendriteSvg = document.getElementById('crt-brain-dendrite-svg');
  const infoContent = document.getElementById('crt-brain-info-content');

  // ── Colour mapping ─────────────────────────────────────────────────────
  function neuronColour(val) {
    const v = Math.max(0, Math.min(1, val));
    if (v < 0.001) return 'rgba(0,0,0,0.15)';
    const lightness = 15 + v * 45;
    const saturation = 40 + v * 60;
    return 'hsl(24,' + Math.round(saturation) + '%,' + Math.round(lightness) + '%)';
  }

  // Darken pastel genome colours so labels are readable on the light background
  function lobeHeaderColour(colour) {
    if (!colour) return '#333';
    // Convert RGB to HSL, clamp lightness to max 40% for readability
    const r = colour[0] / 255, g = colour[1] / 255, b = colour[2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    // Clamp lightness and boost saturation for readability
    l = Math.min(l, 0.35);
    s = Math.min(s + 0.15, 1.0);
    return 'hsl(' + Math.round(h * 360) + ',' + Math.round(s * 100) + '%,' + Math.round(l * 100) + '%)';
  }

  // Dendrite weight → colour (semi-transparent magenta for visibility over orange neurons)
  function dendriteColour(weight) {
    const w = Math.max(0, Math.min(1, weight));
    const alpha = 0.15 + w * 0.65;
    return 'rgba(255,0,255,' + alpha.toFixed(2) + ')';
  }

  // ── Pixel position of a neuron within the spatial brain ────────────────
  function neuronPixelPos(lobeIdx, neuronId) {
    const pos = cachedLobePositions[lobeIdx];
    if (!pos) return null;
    const lobe = pos.lobe;
    const cs = CELL_SIZE * zoomLevel;
    const gx = neuronId % lobe.width;
    const gy = Math.floor(neuronId / lobe.width);
    return {
      x: pos.px + gx * cs + cs / 2,
      y: pos.py + gy * cs + cs / 2
    };
  }

  // Find lobe index by name
  function lobeIndexByName(name) {
    if (!brainData) return -1;
    const l = brainData.lobes.find(l => l.name === name);
    return l ? l.index : -1;
  }

  // ── Fetch brain overview ───────────────────────────────────────────────
  async function fetchBrain(creatureId) {
    try {
      const resp = await fetch('/api/creature/' + creatureId + '/brain');
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.error) { brainData = null; return; }
      brainData = data;

      // Fetch all lobe neuron data in parallel
      const fetches = brainData.lobes.map(lobe =>
        fetch('/api/creature/' + creatureId + '/brain/lobe/' + lobe.index)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      );
      const results = await Promise.all(fetches);

      lobeNeurons = {};
      for (let i = 0; i < results.length; i++) {
        if (results[i] && !results[i].error) {
          lobeNeurons[brainData.lobes[i].index] = results[i];
        }
      }

      renderSpatialBrain();
    } catch (e) {
      // ignore
    }
  }

  // ── Fetch tract dendrite detail ────────────────────────────────────────
  async function fetchTractDetail(creatureId, tractIdx) {
    try {
      const resp = await fetch('/api/creature/' + creatureId + '/brain/tract/' + tractIdx);
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.error) { tractDetail = null; return; }
      tractDetail = data;
      renderDendriteLines();
      renderInfoPanel(); // update sidebar with dendrite info
    } catch (e) {
      // ignore
    }
  }

  // ── Compute brain bounds ───────────────────────────────────────────────
  function computeBounds() {
    let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
    for (const lobe of brainData.lobes) {
      minX = Math.min(minX, lobe.x);
      minY = Math.min(minY, lobe.y);
      maxX = Math.max(maxX, lobe.x + lobe.width);
      maxY = Math.max(maxY, lobe.y + lobe.height);
    }
    return { minX, minY, maxX, maxY };
  }

  // ── Render spatial brain ───────────────────────────────────────────────
  function renderSpatialBrain() {
    if (!brainData || !brainData.lobes) {
      brainCanvas.innerHTML = '<div class="crt-empty-hint">No brain data</div>';
      return;
    }

    cachedBounds = computeBounds();
    const bounds = cachedBounds;
    const cs = CELL_SIZE * zoomLevel;
    const pad = PADDING * zoomLevel;
    const totalW = (bounds.maxX - bounds.minX) * cs + pad * 2;
    const totalH = (bounds.maxY - bounds.minY) * cs + pad * 2 + brainData.lobes.length * 16 * zoomLevel;

    brainCanvas.style.width = totalW + 'px';
    brainCanvas.style.height = totalH + 'px';
    brainCanvas.style.position = 'relative';

    // Size both SVGs
    [brainSvg, dendriteSvg].forEach(svg => {
      svg.setAttribute('width', totalW);
      svg.setAttribute('height', totalH);
      svg.style.width = totalW + 'px';
      svg.style.height = totalH + 'px';
    });

    let html = '';
    brainSvg.innerHTML = '';
    cachedLobePositions = {};

    for (const lobe of brainData.lobes) {
      const px = (lobe.x - bounds.minX) * cs + pad;
      const py = (lobe.y - bounds.minY) * cs + pad;
      const pw = lobe.width * cs;
      const ph = lobe.height * cs;

      cachedLobePositions[lobe.index] = { px, py, pw, ph, lobe };

      html += '<div class="crt-brain-lobe" style="' +
        'left:' + px + 'px;top:' + py + 'px;' +
        'width:' + pw + 'px;height:' + ph + 'px;">';

      const labelSize = Math.max(8, Math.round(9 * zoomLevel));
      html += '<div class="crt-brain-lobe-label" style="color:' +
        lobeHeaderColour(lobe.colour) + ';font-size:' + labelSize + 'px">' + lobe.name + '</div>';

      const neurons = lobeNeurons[lobe.index];
      if (neurons && neurons.neurons) {
        const labels = lobe.labels || [];
        for (let n = 0; n < neurons.neurons.length; n++) {
          const neuron = neurons.neurons[n];
          const activity = neuron.states[0];
          const isWinner = neuron.id === lobe.winner && activity > 0.001;
          const label = (n < labels.length && labels[n]) ? labels[n] : '';

          const gx = n % lobe.width;
          const gy = Math.floor(n / lobe.width);
          const nw = cs;  // neuron cell size = zoomed cell size

          let tip = lobe.name + ' #' + neuron.id;
          if (label) tip += ' (' + label + ')';
          tip += '\nActivity: ' + activity.toFixed(3);
          for (let s = 1; s < neuron.states.length; s++) {
            if (neuron.states[s] !== 0) {
              tip += '\nS' + s + ': ' + neuron.states[s].toFixed(3);
            }
          }
          tip += '\nClick to show connections';

          html += '<div class="crt-brain-neuron' +
            (isWinner ? ' crt-brain-neuron--winner' : '') +
            '" style="' +
            'left:' + (gx * cs) + 'px;' +
            'top:' + (gy * cs) + 'px;' +
            'width:' + nw + 'px;height:' + nw + 'px;' +
            'background:' + neuronColour(activity) + ';"' +
            ' title="' + tip.replace(/"/g, '&quot;') + '"' +
            ' data-lobe="' + lobe.index + '" data-neuron="' + neuron.id + '">' +
            '</div>';
        }
      }
      html += '</div>';
    }

    brainCanvas.innerHTML = html;

    // Attach neuron click handlers
    brainCanvas.querySelectorAll('.crt-brain-neuron').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const lobeIdx = parseInt(el.dataset.lobe);
        const neuronId = parseInt(el.dataset.neuron);
        handleNeuronClick(lobeIdx, neuronId);
      });
    });

    renderTractLines();

    // Re-render dendrite lines if a tract was selected
    if (selectedTractIdx !== null && tractDetail) {
      renderDendriteLines();
    }

    renderInfoPanel();
  }

  // ── Render tract lines ─────────────────────────────────────────────────
  function renderTractLines() {
    if (!brainData || !brainData.tracts) return;

    let svgContent = '';
    const drawnPairs = new Map(); // pairKey → array of tract indices

    for (const tract of brainData.tracts) {
      const srcLobe = brainData.lobes.find(l => l.name === tract.srcLobe);
      const dstLobe = brainData.lobes.find(l => l.name === tract.dstLobe);
      if (!srcLobe || !dstLobe) continue;

      const srcPos = cachedLobePositions[srcLobe.index];
      const dstPos = cachedLobePositions[dstLobe.index];
      if (!srcPos || !dstPos) continue;

      const pairKey = srcLobe.index + '→' + dstLobe.index;
      if (drawnPairs.has(pairKey)) {
        drawnPairs.get(pairKey).push(tract.index);
        continue;
      }
      drawnPairs.set(pairKey, [tract.index]);

      const x1 = srcPos.px + srcPos.pw / 2;
      const y1 = srcPos.py + srcPos.ph / 2;
      const x2 = dstPos.px + dstPos.pw / 2;
      const y2 = dstPos.py + dstPos.ph / 2;

      const thickness = Math.max(0.5, Math.min(3, Math.log2(tract.dendriteCount + 1) * 0.4));
      const isSelected = selectedTractIdx === tract.index;
      const opacity = isSelected ? 1.0 : Math.max(0.15, Math.min(0.6, tract.dendriteCount / 500));

      svgContent += '<line x1="' + x1 + '" y1="' + y1 +
        '" x2="' + x2 + '" y2="' + y2 + '"' +
        ' stroke="' + (isSelected ? 'rgba(255,0,255,0.8)' : 'rgba(255,95,0,' + opacity.toFixed(2) + ')') + '"' +
        ' stroke-width="' + (isSelected ? 3 : thickness.toFixed(1)) + '"' +
        ' stroke-linecap="round"' +
        ' data-tract="' + tract.index + '"' +
        ' style="cursor:pointer;pointer-events:stroke"' +
        '><title>' + tract.name + ' (' + tract.dendriteCount + ' dendrites) — click to inspect</title></line>';
    }

    brainSvg.innerHTML = svgContent;

    // Attach click handlers to tract lines
    brainSvg.querySelectorAll('line').forEach(line => {
      line.addEventListener('click', (e) => {
        e.stopPropagation();
        const tractIdx = parseInt(line.dataset.tract);
        handleTractClick(tractIdx);
      });
    });
  }

  // ── Handle tract click — fetch and show dendrites ──────────────────────
  function handleTractClick(tractIdx) {
    if (selectedTractIdx === tractIdx) {
      // Deselect
      selectedTractIdx = null;
      selectedNeuronKey = null;
      tractDetail = null;
      dendriteSvg.innerHTML = '';
      renderTractLines();
      renderInfoPanel();
      return;
    }

    selectedTractIdx = tractIdx;
    selectedNeuronKey = null;
    renderTractLines(); // re-render to highlight the selected tract

    const creatureId = getSelectedCreatureId();
    if (creatureId !== null) {
      fetchTractDetail(creatureId, tractIdx);
    }
  }

  // ── Handle neuron click — show all dendrites connected to this neuron ──
  function handleNeuronClick(lobeIdx, neuronId) {
    const key = lobeIdx + ':' + neuronId;
    if (selectedNeuronKey === key) {
      // Deselect
      selectedNeuronKey = null;
      selectedTractIdx = null;
      tractDetail = null;
      dendriteSvg.innerHTML = '';
      renderTractLines();
      renderInfoPanel();
      return;
    }

    selectedNeuronKey = key;

    // Find all tracts that connect to/from this lobe
    if (!brainData) return;
    const lobe = brainData.lobes.find(l => l.index === lobeIdx);
    if (!lobe) return;

    // Find tracts where this lobe is src or dst
    const relevantTracts = brainData.tracts.filter(
      t => t.srcLobe === lobe.name || t.dstLobe === lobe.name
    );

    if (relevantTracts.length === 0) {
      dendriteSvg.innerHTML = '';
      renderInfoPanel();
      return;
    }

    // Fetch all relevant tracts and combine dendrites
    const creatureId = getSelectedCreatureId();
    if (creatureId === null) return;

    selectedTractIdx = null; // clear tract selection, we're doing neuron mode

    Promise.all(relevantTracts.map(t =>
      fetch('/api/creature/' + creatureId + '/brain/tract/' + t.index)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    )).then(results => {
      // Filter dendrites connected to this neuron
      let allDendrites = [];
      for (let i = 0; i < results.length; i++) {
        if (!results[i] || results[i].error) continue;
        const tract = relevantTracts[i];
        const srcLobeIdx = lobeIndexByName(tract.srcLobe);
        const dstLobeIdx = lobeIndexByName(tract.dstLobe);

        for (const d of results[i].dendrites) {
          // Check if this dendrite connects to our neuron
          if ((srcLobeIdx === lobeIdx && d.src === neuronId) ||
              (dstLobeIdx === lobeIdx && d.dst === neuronId)) {
            allDendrites.push({
              srcLobeIdx, dstLobeIdx,
              src: d.src, dst: d.dst,
              weight: d.weights[0],
              tractName: tract.name
            });
          }
        }
      }

      renderNeuronDendrites(allDendrites, lobeIdx, neuronId);
      renderInfoPanel();
    });
  }

  // ── Render dendrite lines for a selected tract ─────────────────────────
  function renderDendriteLines() {
    if (!tractDetail || !tractDetail.dendrites) {
      dendriteSvg.innerHTML = '';
      return;
    }

    const tract = brainData.tracts.find(t => t.index === selectedTractIdx);
    if (!tract) return;

    const srcLobeIdx = lobeIndexByName(tract.srcLobe);
    const dstLobeIdx = lobeIndexByName(tract.dstLobe);

    let svgContent = '';
    const maxDraw = Math.min(tractDetail.dendrites.length, 500);

    for (let i = 0; i < maxDraw; i++) {
      const d = tractDetail.dendrites[i];
      if (d.src < 0 || d.dst < 0) continue;
      if (d.weights[0] < 0.001) continue; // skip zero-weight

      const srcPos = neuronPixelPos(srcLobeIdx, d.src);
      const dstPos = neuronPixelPos(dstLobeIdx, d.dst);
      if (!srcPos || !dstPos) continue;

      const colour = dendriteColour(d.weights[0]);

      svgContent += '<line x1="' + srcPos.x + '" y1="' + srcPos.y +
        '" x2="' + dstPos.x + '" y2="' + dstPos.y + '"' +
        ' stroke="' + colour + '"' +
        ' stroke-width="0.8"' +
        '><title>S' + d.src + ' → D' + d.dst + ': ' + d.weights[0].toFixed(3) + '</title></line>';
    }

    dendriteSvg.innerHTML = svgContent;
  }

  // ── Render dendrite lines for a selected neuron ────────────────────────
  function renderNeuronDendrites(dendrites, lobeIdx, neuronId) {
    if (!dendrites || dendrites.length === 0) {
      dendriteSvg.innerHTML = '';
      return;
    }

    let svgContent = '';

    for (const d of dendrites) {
      const srcPos = neuronPixelPos(d.srcLobeIdx, d.src);
      const dstPos = neuronPixelPos(d.dstLobeIdx, d.dst);
      if (!srcPos || !dstPos) continue;
      if (d.weight < 0.001) continue;

      const colour = dendriteColour(d.weight);

      svgContent += '<line x1="' + srcPos.x + '" y1="' + srcPos.y +
        '" x2="' + dstPos.x + '" y2="' + dstPos.y + '"' +
        ' stroke="' + colour + '"' +
        ' stroke-width="1"' +
        '><title>' + d.tractName + ': S' + d.src + ' → D' + d.dst + ': ' + d.weight.toFixed(3) + '</title></line>';
    }

    // Also highlight the selected neuron with a circle
    const nPos = neuronPixelPos(lobeIdx, neuronId);
    if (nPos) {
      svgContent += '<circle cx="' + nPos.x + '" cy="' + nPos.y + '" r="7"' +
        ' fill="none" stroke="rgba(255,0,255,0.9)" stroke-width="2"/>';
    }

    dendriteSvg.innerHTML = svgContent;
  }

  // ── Info panel ─────────────────────────────────────────────────────────
  function renderInfoPanel() {
    if (!brainData) {
      infoContent.innerHTML = '<div class="crt-empty-hint">Select a creature</div>';
      return;
    }

    let html = '';

    // Dendrite detail section (if a tract or neuron is selected)
    if (selectedTractIdx !== null && tractDetail) {
      html += '<div class="crt-brain-info-section crt-brain-info-section--active">';
      html += '<div class="crt-brain-info-title">⚡ Selected Tract</div>';
      html += '<div class="crt-brain-info-lobe"><span class="crt-brain-info-lobe-name" style="color:var(--magenta)">' +
        tractDetail.name + '</span></div>';
      html += '<div class="crt-brain-info-lobe"><span class="crt-brain-info-lobe-detail">' +
        tractDetail.srcLobe + ' → ' + tractDetail.dstLobe + '</span></div>';
      html += '<div class="crt-brain-info-lobe"><span class="crt-brain-info-lobe-detail">' +
        tractDetail.dendriteCount + ' dendrites' +
        (tractDetail.dendritesReturned < tractDetail.dendriteCount
          ? ' (showing ' + tractDetail.dendritesReturned + ')'
          : '') +
        '</span></div>';
      // Show non-zero weight stats
      if (tractDetail.dendrites) {
        let nonZero = 0, maxW = 0;
        for (const d of tractDetail.dendrites) {
          if (d.weights[0] > 0.001) { nonZero++; maxW = Math.max(maxW, d.weights[0]); }
        }
        html += '<div class="crt-brain-info-lobe"><span class="crt-brain-info-lobe-detail">' +
          nonZero + ' active · max weight: ' + maxW.toFixed(3) + '</span></div>';
      }
      html += '<div class="crt-brain-info-lobe"><span class="crt-brain-info-lobe-detail" style="color:rgba(0,0,0,0.35)">' +
        'Click tract again to dismiss</span></div>';
      html += '</div>';
    }

    if (selectedNeuronKey !== null) {
      const [li, ni] = selectedNeuronKey.split(':').map(Number);
      const lobe = brainData.lobes.find(l => l.index === li);
      const label = lobe && lobe.labels && ni < lobe.labels.length ? lobe.labels[ni] : '';
      html += '<div class="crt-brain-info-section crt-brain-info-section--active">';
      html += '<div class="crt-brain-info-title">⚡ Selected Neuron</div>';
      html += '<div class="crt-brain-info-lobe"><span class="crt-brain-info-lobe-name" style="color:var(--magenta)">' +
        (lobe ? lobe.name : '?') + ' #' + ni + '</span></div>';
      if (label) {
        html += '<div class="crt-brain-info-lobe"><span class="crt-brain-info-lobe-detail">' +
          label + '</span></div>';
      }
      html += '<div class="crt-brain-info-lobe"><span class="crt-brain-info-lobe-detail" style="color:rgba(0,0,0,0.35)">' +
        'Click neuron again to dismiss</span></div>';
      html += '</div>';
    }

    // Lobes section
    html += '<div class="crt-brain-info-section">';
    html += '<div class="crt-brain-info-title">Lobes</div>';
    for (const lobe of brainData.lobes) {
      const winnerLabel = lobe.labels && lobe.winner >= 0 && lobe.winner < lobe.labels.length
        ? lobe.labels[lobe.winner] : '';
      html += '<div class="crt-brain-info-lobe">';
      html += '<span class="crt-brain-info-lobe-name" style="color:' +
        lobeHeaderColour(lobe.colour) + '">' + lobe.name + '</span>';
      html += '<span class="crt-brain-info-lobe-detail">' + lobe.neuronCount + 'n';
      if (lobe.winner >= 0) {
        html += ' · ★' + lobe.winner;
        if (winnerLabel) html += ' ' + winnerLabel;
      }
      html += '</span></div>';
    }
    html += '</div>';

    // Tracts section
    html += '<div class="crt-brain-info-section">';
    html += '<div class="crt-brain-info-title">Tracts (' + brainData.tracts.length + ')</div>';
    for (const tract of brainData.tracts) {
      const isSelected = tract.index === selectedTractIdx;
      html += '<div class="crt-brain-info-tract' + (isSelected ? ' crt-brain-info-tract--selected' : '') +
        '" data-tract-info="' + tract.index + '" style="cursor:pointer">';
      html += '<span class="crt-brain-info-tract-flow">' +
        tract.srcLobe + ' → ' + tract.dstLobe + '</span>';
      html += '<span class="crt-brain-info-tract-count">' +
        tract.dendriteCount + 'd</span>';
      html += '</div>';
    }
    html += '</div>';

    infoContent.innerHTML = html;

    // Attach click handlers to tract items in sidebar
    infoContent.querySelectorAll('[data-tract-info]').forEach(el => {
      el.addEventListener('click', () => {
        handleTractClick(parseInt(el.dataset.tractInfo));
      });
    });
  }

  // ── Clear ──────────────────────────────────────────────────────────────
  function clearBrain() {
    brainData = null;
    lobeNeurons = {};
    cachedLobePositions = {};
    cachedBounds = null;
    selectedTractIdx = null;
    selectedNeuronKey = null;
    tractDetail = null;
    brainCanvas.innerHTML = '<div class="crt-empty-hint">Select a creature and click Brain</div>';
    brainSvg.innerHTML = '';
    dendriteSvg.innerHTML = '';
    infoContent.innerHTML = '<div class="crt-empty-hint">Select a creature</div>';
  }

  // ── Click on viewport background to deselect ───────────────────────────
  const viewport = document.getElementById('crt-brain-viewport');
  viewport.addEventListener('click', (e) => {
    if (e.target.id === 'crt-brain-viewport' || e.target.id === 'crt-brain-canvas') {
      if (selectedTractIdx !== null || selectedNeuronKey !== null) {
        selectedTractIdx = null;
        selectedNeuronKey = null;
        tractDetail = null;
        dendriteSvg.innerHTML = '';
        renderTractLines();
        renderInfoPanel();
      }
    }
  });

  // ── Zoom controls ──────────────────────────────────────────────────────
  function applyZoom(newLevel) {
    zoomLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newLevel));
    updateZoomLabel();
    if (brainData) renderSpatialBrain();
  }

  // Create zoom control overlay
  const zoomControls = document.createElement('div');
  zoomControls.className = 'crt-brain-zoom-controls';
  zoomControls.innerHTML =
    '<button class="crt-brain-zoom-btn" id="crt-brain-zoom-out" title="Zoom out">−</button>' +
    '<span class="crt-brain-zoom-label" id="crt-brain-zoom-label">100%</span>' +
    '<button class="crt-brain-zoom-btn" id="crt-brain-zoom-in" title="Zoom in">+</button>' +
    '<button class="crt-brain-zoom-btn" id="crt-brain-zoom-reset" title="Reset zoom">⟲</button>';
  viewport.appendChild(zoomControls);

  function updateZoomLabel() {
    const label = document.getElementById('crt-brain-zoom-label');
    if (label) label.textContent = Math.round(zoomLevel * 100) + '%';
  }

  document.getElementById('crt-brain-zoom-in').addEventListener('click', (e) => {
    e.stopPropagation();
    applyZoom(zoomLevel + ZOOM_STEP);
  });
  document.getElementById('crt-brain-zoom-out').addEventListener('click', (e) => {
    e.stopPropagation();
    applyZoom(zoomLevel - ZOOM_STEP);
  });
  document.getElementById('crt-brain-zoom-reset').addEventListener('click', (e) => {
    e.stopPropagation();
    applyZoom(1.0);
  });

  // Scroll-wheel zoom on the viewport
  viewport.addEventListener('wheel', (e) => {
    // Only zoom when Ctrl/Meta is held, otherwise allow normal scrolling
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    applyZoom(zoomLevel + delta);
  }, { passive: false });

  // ── Integration ────────────────────────────────────────────────────────
  let lastCreatureId = null;
  let brainTimer = null;

  function isBrainVisible() {
    const panel = document.getElementById('crt-brain');
    return panel && !panel.hidden;
  }

  function checkForCreatureChange() {
    const id = getSelectedCreatureId();
    if (id !== lastCreatureId) {
      lastCreatureId = id;
      if (id !== null) { clearBrain(); fetchBrain(id); }
      else clearBrain();
    }
  }

  function startBrainPolling() {
    stopBrainPolling();
    brainTimer = setInterval(() => {
      if (!isBrainVisible()) return;
      checkForCreatureChange();
      const id = getSelectedCreatureId();
      if (id !== null) fetchBrain(id);
    }, 2000);
  }

  function stopBrainPolling() {
    if (brainTimer) { clearInterval(brainTimer); brainTimer = null; }
  }

  DevToolsEvents.on('tab:activated', (tab) => {
    if (tab === 'creatures') startBrainPolling();
  });

  DevToolsEvents.on('tab:deactivated', (tab) => {
    if (tab === 'creatures') stopBrainPolling();
  });

  document.querySelectorAll('.crt-sub-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.subtab === 'brain') {
        checkForCreatureChange();
        const id = getSelectedCreatureId();
        if (id !== null && !brainData) fetchBrain(id);
      }
    });
  });

  const crtList = document.getElementById('crt-list');
  if (crtList) {
    crtList.addEventListener('click', () => {
      setTimeout(() => {
        if (isBrainVisible()) checkForCreatureChange();
      }, 50);
    });
  }

})();
