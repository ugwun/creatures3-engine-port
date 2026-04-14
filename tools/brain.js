// ── Brain Tab — Spatial Heatmap ───────────────────────────────────────────
// Renders all lobes spatially using genome coordinates. Each neuron is a
// coloured cell; winning neurons get an orange highlight. Tract connections
// are drawn as SVG lines between lobes. Click a tract or neuron to see
// individual dendrite connections.

(() => {
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
  let neuronDetail = null;      // fetched deep neuron detail from /api/.../neuron/:id

  // Zoom state
  let zoomLevel = 1.0;
  const ZOOM_MIN = 0.4;
  const ZOOM_MAX = 3.0;
  const ZOOM_STEP = 0.15;

  // Scale: genome coords → pixels.
  const CELL_SIZE = 12;
  const PADDING = 20;

  // Updated via DevToolsEvents 'creature:selected' — no DOM coupling to creatures.js
  let selectedCreatureId = null;

  function getSelectedCreatureId() {
    return selectedCreatureId;
  }

  // ── DOM refs ───────────────────────────────────────────────────────────
  const brainCanvas = document.getElementById('crt-brain-canvas');
  const brainSvg = document.getElementById('crt-brain-svg');
  const dendriteSvg = document.getElementById('crt-brain-dendrite-svg');
  const infoContent = document.getElementById('crt-brain-info-content');

  // ── Colour mapping ─────────────────────────────────────────────────────
  function neuronColour(val, lobeName) {
    // Apply a visual noise floor (threshold).
    // This normalizes lobes like 'noun' and 'verb' that sit at a 
    // ~0.01 - 0.06 background resting state due to engine SV-Rule hacks.
    let noiseFloor = 0.001;
    if (lobeName === 'noun' || lobeName === 'verb') noiseFloor = 0.07;
    else if (lobeName === 'decn') noiseFloor = 0.008;

    if (val < noiseFloor) return 'rgba(0,0,0,0.15)';
    
    // Remap the valid activation into a clean 0 to 1 range
    const range = 1.0 - noiseFloor;
    const v = Math.max(0, Math.min(1, (val - noiseFloor) / range));
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

      // UI OVERRIDE: Mathematically align the 'noun', 'visn', and 'stim' lobes 
      // perfectly flush with the 'comb' lobe on the X-axis so columns map cleanly,
      // and stack them vertically above comb to group semantic sensory inputs.
      const combLobe = brainData.lobes.find(l => l.name === 'comb');
      if (combLobe) {
        brainData.lobes.forEach(l => {
          if (l.name === 'noun') {
            l.x = combLobe.x;
            l.y = combLobe.y - 12; // Top of the stack
          } else if (l.name === 'visn') {
            l.x = combLobe.x;
            l.y = combLobe.y - 8;
          } else if (l.name === 'stim') {
            l.x = combLobe.x;
            l.y = combLobe.y - 4; // Right above comb
          } else if (l.name === 'move') {
            // Push move lobe under comb to prevent collision with the new stack
            l.x = combLobe.x;
            l.y = combLobe.y + combLobe.height + 4; 
          }
        });
      }

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
      console.warn('DevTools: brain fetch failed', e);
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
      console.warn('DevTools: tract detail fetch failed', e);
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
      const isWTALobe = ['decn', 'attn', 'comb'].includes(lobe.name);
      if (neurons && neurons.neurons) {
        const labels = lobe.labels || [];
        for (let n = 0; n < neurons.neurons.length; n++) {
          const neuron = neurons.neurons[n];
          const activity = neuron.states[0];
          const isWinner = isWTALobe && neuron.id === lobe.winner && activity > 0.001;
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
            'background:' + neuronColour(activity, lobe.name) + ';"' +
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
      neuronDetail = null;
      dendriteSvg.innerHTML = '';
      renderTractLines();
      renderInfoPanel();
      return;
    }

    selectedNeuronKey = key;
    neuronDetail = null; // clear while loading

    // Find all tracts that connect to/from this lobe
    if (!brainData) return;
    const lobe = brainData.lobes.find(l => l.index === lobeIdx);
    if (!lobe) return;

    const creatureId = getSelectedCreatureId();
    if (creatureId === null) return;

    selectedTractIdx = null; // clear tract selection, we're doing neuron mode

    // Fetch both the deep neuron detail and tract dendrites in parallel
    const neuronFetch = fetch('/api/creature/' + creatureId + '/brain/lobe/' + lobeIdx + '/neuron/' + neuronId)
      .then(r => r.ok ? r.json() : null)
      .catch(() => null);

    // Find tracts where this lobe is src or dst
    const relevantTracts = brainData.tracts.filter(
      t => t.srcLobe === lobe.name || t.dstLobe === lobe.name
    );

    const tractFetches = relevantTracts.map(t =>
      fetch('/api/creature/' + creatureId + '/brain/tract/' + t.index)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    );

    Promise.all([neuronFetch, Promise.all(tractFetches)]).then(([nDetail, tractResults]) => {
      // Store neuron detail
      if (nDetail && !nDetail.error) {
        neuronDetail = nDetail;
      }

      // Filter dendrites connected to this neuron (for canvas lines)
      let allDendrites = [];
      for (let i = 0; i < tractResults.length; i++) {
        if (!tractResults[i] || tractResults[i].error) continue;
        const tract = relevantTracts[i];
        const srcLobeIdx = lobeIndexByName(tract.srcLobe);
        const dstLobeIdx = lobeIndexByName(tract.dstLobe);

        for (const d of tractResults[i].dendrites) {
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

      const isDormant = d.weight <= 0.001;
      const colour = isDormant ? 'rgba(0,0,0,0.15)' : dendriteColour(d.weight);
      const strokeWidth = isDormant ? '0.5' : '1';
      const dash = isDormant ? ' stroke-dasharray="2 3"' : '';

      svgContent += '<line x1="' + srcPos.x + '" y1="' + srcPos.y +
        '" x2="' + dstPos.x + '" y2="' + dstPos.y + '"' +
        ' stroke="' + colour + '"' +
        ' stroke-width="' + strokeWidth + '"' + dash +
        '><title>' + d.tractName + ': S' + d.src + ' → D' + d.dst + ': ' + d.weight.toFixed(3) + 
        (isDormant ? ' (Dormant / Unlearned)' : '') + '</title></line>';
    }

    // Also highlight the selected neuron with a circle
    const nPos = neuronPixelPos(lobeIdx, neuronId);
    if (nPos) {
      svgContent += '<circle cx="' + nPos.x + '" cy="' + nPos.y + '" r="7"' +
        ' fill="none" stroke="rgba(255,0,255,0.9)" stroke-width="2"/>';
    }

    dendriteSvg.innerHTML = svgContent;
  }

  // Simple HTML escape
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Info panel ─────────────────────────────────────────────────────────
  function renderInfoPanel() {
    if (!brainData) {
      infoContent.innerHTML = '<div class="crt-empty-hint">Select a creature</div>';
      return;
    }

    let html = '';

    // ── Deep neuron detail panel (replaces simple "Selected Neuron" when data is loaded) ──
    if (selectedNeuronKey !== null && neuronDetail) {
      const nd = neuronDetail;
      const [li, ni] = selectedNeuronKey.split(':').map(Number);
      const lobe = brainData.lobes.find(l => l.index === li);
      const label = lobe && lobe.labels && ni < lobe.labels.length ? lobe.labels[ni] : '';

      html += '<div class="crt-brain-info-section crt-brain-info-section--active crt-nd">';

      // ── Identity ──
      html += '<div class="crt-nd-header">';
      html += '<span class="crt-nd-lobe" style="color:' +
        (lobe ? lobeHeaderColour(lobe.colour) : 'var(--magenta)') + '">' + nd.lobeName + '</span>';
      html += '<span class="crt-nd-id">#' + nd.neuronId + '</span>';
      if (nd.isWinner) html += '<span class="crt-nd-winner">★ winner</span>';
      html += '</div>';
      if (label) {
        html += '<div class="crt-nd-label">' + escapeHtml(label) + '</div>';
      }

      // ── State variables as bars ──
      html += '<div class="crt-nd-section-title">State Variables</div>';
      html += '<div class="crt-nd-states">';
      for (const sv of nd.states) {
        const absVal = Math.min(1, Math.abs(sv.value));
        const isNeg = sv.value < 0;
        const barColour = isNeg ? 'var(--magenta)' : 'var(--orange)';
        html += '<div class="crt-nd-state-row">' +
          '<span class="crt-nd-state-name">' + sv.name + '</span>' +
          '<div class="crt-nd-state-bar-bg">' +
          '<div class="crt-nd-state-bar" style="width:' + (absVal * 100) + '%;background:' + barColour + '"></div>' +
          '</div>' +
          '<span class="crt-nd-state-val">' + sv.value.toFixed(3) + '</span>' +
          '</div>';
      }
      html += '</div>';

      // ── Lobe SVRules ──
      html += '<div class="crt-nd-section-title">Lobe Update Rule</div>';
      html += formatSVRule(nd.updateRule, 'Update');

      html += '<div class="crt-nd-section-title">Lobe Init Rule</div>';
      html += formatSVRule(nd.initRule, 'Init');

      // ── Tract SVRules ──
      if (nd.tractRules && nd.tractRules.length > 0) {
        for (const tr of nd.tractRules) {
          html += '<div class="crt-nd-section-title">Tract: ' + escapeHtml(tr.tractName) + '</div>';
          html += '<div class="crt-nd-subsection">Update Rule</div>';
          html += formatSVRule(tr.updateRule, 'Tract Update');
          html += '<div class="crt-nd-subsection">Init Rule</div>';
          html += formatSVRule(tr.initRule, 'Tract Init');
        }
      }

      // ── Connections ──
      if (nd.connections && nd.connections.length > 0) {
        const incoming = nd.connections.filter(c => c.direction === 'incoming');
        const outgoing = nd.connections.filter(c => c.direction === 'outgoing' || c.direction === 'self');

        if (incoming.length > 0) {
          html += '<div class="crt-nd-section-title">Incoming (' + incoming.length + ')</div>';
          html += renderConnectionTable(incoming, 'incoming');
        }
        if (outgoing.length > 0) {
          html += '<div class="crt-nd-section-title">Outgoing (' + outgoing.length + ')</div>';
          html += renderConnectionTable(outgoing, 'outgoing');
        }
      } else {
        html += '<div class="crt-nd-section-title">Connections</div>';
        html += '<div class="crt-nd-svrule-empty">No dendrites connected</div>';
      }

      html += '<div class="crt-nd-dismiss">Click neuron again to dismiss</div>';
      html += '</div>';

    } else if (selectedNeuronKey !== null) {
      // Loading state while neuronDetail hasn't arrived yet
      const [li, ni] = selectedNeuronKey.split(':').map(Number);
      const lobe = brainData.lobes.find(l => l.index === li);
      const label = lobe && lobe.labels && ni < lobe.labels.length ? lobe.labels[ni] : '';
      html += '<div class="crt-brain-info-section crt-brain-info-section--active">';
      html += '<div class="crt-brain-info-title">⚡ Loading Neuron…</div>';
      html += '<div class="crt-brain-info-lobe"><span class="crt-brain-info-lobe-name" style="color:var(--magenta)">' +
        (lobe ? lobe.name : '?') + ' #' + ni + '</span></div>';
      if (label) {
        html += '<div class="crt-brain-info-lobe"><span class="crt-brain-info-lobe-detail">' +
          label + '</span></div>';
      }
      html += '</div>';
    }

    // Dendrite detail section (if a tract is selected)
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

    // Lobes section
    html += '<div class="crt-brain-info-section">';
    html += '<div class="crt-brain-info-title">Lobes</div>';
    for (const lobe of brainData.lobes) {
      const isWTALobe = ['decn', 'attn', 'comb'].includes(lobe.name);
      const winnerLabel = lobe.labels && lobe.winner >= 0 && lobe.winner < lobe.labels.length
        ? lobe.labels[lobe.winner] : '';
      html += '<div class="crt-brain-info-lobe">';
      html += '<span class="crt-brain-info-lobe-name" style="color:' +
        lobeHeaderColour(lobe.colour) + '">' + lobe.name + '</span>';
      html += '<span class="crt-brain-info-lobe-detail">' + lobe.neuronCount + 'n';
      if (isWTALobe && lobe.winner >= 0) {
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

  // ── Render connection table for neuron detail ──────────────────────────
  function renderConnectionTable(connections, direction) {
    let html = '<div class="crt-nd-conn-table">';
    for (const c of connections) {
      const stw = c.weights[0] ? c.weights[0].value : 0;
      const ltw = c.weights[1] ? c.weights[1].value : 0;
      const str = c.weights[7] ? c.weights[7].value : 0;
      const isDormant = Math.abs(stw) < 0.001 && Math.abs(ltw) < 0.001;

      const peerLobe = direction === 'incoming' ? c.srcLobe : c.dstLobe;
      const peerId = direction === 'incoming' ? c.srcNeuron : c.dstNeuron;

      // Get label for the peer neuron
      const peerLobeIdx = direction === 'incoming' ? c.srcLobeIdx : c.dstLobeIdx;
      const peerLobeData = brainData.lobes.find(l => l.index === peerLobeIdx);
      const peerLabel = peerLobeData && peerLobeData.labels && peerId < peerLobeData.labels.length
        ? peerLobeData.labels[peerId] : '';

      const barW = Math.min(1, Math.abs(stw));
      const barCol = isDormant ? 'rgba(0,0,0,0.1)' : 'var(--magenta)';

      html += '<div class="crt-nd-conn-row' + (isDormant ? ' crt-nd-conn-dormant' : '') + '">' +
        '<div class="crt-nd-conn-peer">' +
          '<span class="crt-nd-conn-lobe">' + escapeHtml(peerLobe) + '</span>' +
          '<span class="crt-nd-conn-id">#' + peerId + '</span>' +
          (peerLabel ? '<span class="crt-nd-conn-label">' + escapeHtml(peerLabel) + '</span>' : '') +
        '</div>' +
        '<div class="crt-nd-conn-weights">' +
          '<div class="crt-nd-conn-bar-bg">' +
            '<div class="crt-nd-conn-bar" style="width:' + (barW * 100) + '%;background:' + barCol + '"></div>' +
          '</div>' +
          '<span class="crt-nd-conn-val" title="STW: ' + stw.toFixed(3) + ' / LTW: ' + ltw.toFixed(3) + ' / STR: ' + str.toFixed(3) + '">' +
            stw.toFixed(3) +
          '</span>' +
        '</div>' +
      '</div>';
    }
    html += '</div>';
    return html;
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
    neuronDetail = null;
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
        neuronDetail = null;
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

  // Listen for creature selection from creatures.js (decoupled via event bus)
  DevToolsEvents.on('creature:selected', (agentId) => {
    selectedCreatureId = agentId;
    if (isBrainVisible()) checkForCreatureChange();
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

})();
