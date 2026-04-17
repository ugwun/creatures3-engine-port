// ── Creatures Tab ──────────────────────────────────────────────────────────
// Live creature inspector: drives, chemistry, summary card.
// Polls /api/creatures every 2s with optional /api/creature/:id/chemistry.

(() => {
  'use strict';

  // ── Chemical name lookup (hardcoded ~50 well-known chemicals) ───────────
  const CHEMICAL_NAMES = {
    0: '(none)',
    1: 'Lactate',
    2: 'Pyruvate',
    3: 'Glucose',
    4: 'Glycogen',
    5: 'Starch',
    6: 'Fatty Acid',
    7: 'Cholesterol',
    8: 'Triglyceride',
    9: 'Adipose Tissue',
    10: 'Fat',
    11: 'Muscle Tissue',
    12: 'Protein',
    13: 'Amino Acid',
    14: 'Triglyceride',
    17: 'Downatrophin',
    18: 'Upatrophin',
    24: 'Dissolved carbon dioxide',
    25: 'Urea',
    26: 'Ammonia',
    27: 'Antibody 3',
    28: 'Antibody 4',
    29: 'Air',
    30: 'Oxygen',
    31: 'Antibody 7',
    33: 'Water',
    34: 'Energy',
    35: 'ATP',
    36: 'ADP',
    39: 'Arousal Potential',
    40: 'Libido lowerer',
    41: 'Opposite Sex Pheromone',
    46: 'Oestrogen',
    47: 'Oestrogen',
    48: 'Progesterone',
    49: 'Gonadotrophin',
    50: 'EDTA',
    51: 'Sodium Thiosulphate',
    53: 'Testosterone',
    54: 'Inhibin',
    56: 'Geddonase',
    66: 'Heavy Metals',
    67: 'Cyanide',
    68: 'Belladonna',
    69: 'Geddonase',
    70: 'Glycotoxin',
    71: 'Sleep toxin',
    72: 'Fever toxin',
    73: 'Histamine A',
    74: 'Histamine B',
    75: 'Alcohol',
    78: 'ATP Decoupler',
    79: 'Carbon monoxide',
    80: 'Fear toxin',
    81: 'Muscle toxin',
    82: 'Antigen 0',
    83: 'Antigen 1',
    84: 'Antigen 2',
    85: 'Antigen 3',
    86: 'Antigen 4',
    87: 'Antigen 5',
    88: 'Antigen 6',
    89: 'Antigen 7',
    92: 'Medicine one',
    93: 'Anti-oxidant',
    94: 'Prostaglandin',
    95: 'EDTA',
    96: 'Sodium thiosulphite',
    97: 'Arnica',
    98: 'Vitamin E',
    99: 'Vitamin C',
    100: 'Antihistamine',
    102: 'Antibody 0',
    103: 'Antibody 1',
    104: 'Antibody 2',
    105: 'Antibody 3',
    106: 'Antibody 4',
    107: 'Antibody 5',
    108: 'Antibody 6',
    109: 'Antibody 7',
    112: 'Anabolic steroid',
    113: 'Pistle',
    114: 'Insulin',
    115: 'Glycolase',
    116: 'Dehydrogenase',
    117: 'Adrenalin',
    118: 'Grendel nitrate',
    119: 'Ettin nitrate',
    124: 'Activase',
    125: 'Life',
    127: 'Injury',
    128: 'Stress',
    129: 'Sleepase',
    131: 'Pain backup',
    132: 'Hunger for protein backup',
    133: 'Hunger for carb backup',
    134: 'Hunger for fat backup',
    135: 'Coldness backup',
    136: 'Hotness backup',
    137: 'Tiredness backup',
    138: 'Sleepiness backup',
    139: 'Loneliness backup',
    140: 'Crowded backup',
    141: 'Fear backup',
    142: 'Boredom backup',
    143: 'Anger backup',
    144: 'Sex drive backup',
    145: 'Comfort backup',
    148: 'Pain',
    149: 'Hunger for protein',
    150: 'Hunger for carbohydrate',
    151: 'Hunger for fat',
    152: 'Coldness',
    153: 'Hotness',
    154: 'Tiredness',
    155: 'Sleepiness',
    156: 'Loneliness',
    157: 'Crowded',
    158: 'Fear',
    159: 'Boredom',
    160: 'Anger',
    161: 'Sex drive',
    162: 'Comfort',
    163: 'UP',
    164: 'DOWN',
    165: 'Ca smell 0 (sound)',
    166: 'CA smell 1 (light)',
    167: 'CA smell 2 (heat)',
    168: 'Ca smell 3 (water)',
    169: 'CA smell 4 (nutrient)',
    170: 'CA smell 5 (water)',
    171: 'CA smell 6 (protein)',
    172: 'CA smell 7 (carbohydrate)',
    173: 'CA smell 8 (fat)',
    174: 'CA smell 9 (flowers)',
    175: 'CA smell 10 (machinery)',
    176: 'CA smell 11',
    177: 'CA smell 12 (Norn)',
    178: 'CA smell 13 (Grendel)',
    179: 'CA smell 14 (Ettin)',
    180: 'CA smell 15 (Norn home)',
    181: 'CA smell 16 (Grendel home)',
    182: 'CA smell 17 (Ettin home)',
    183: 'CA smell 18',
    184: 'CA smell 19',
    187: 'Stress (H4C)',
    188: 'Stress (H4P)',
    189: 'Stress (H4F)',
    190: 'Stress (Anger)',
    191: 'Stress (Fear)',
    192: 'Stress (Pain)',
    193: 'Stress (Sleep)',
    194: 'Stress (Tired)',
    195: 'Stress (Crowded)',
    198: 'Brain chemical 1',
    199: 'Up',
    200: 'Down',
    201: 'Exit',
    202: 'Enter',
    203: 'Wait',
    204: 'Reward',
    205: 'Punishment',
    206: 'Brain chemical 9',
    207: 'Brain chemical 10',
    208: 'Brain chemical 11',
    209: 'Brain chemical 12',
    210: 'Brain chemical 13',
    211: 'Brain chemical 14',
    212: 'Pre-REM sleep',
    213: 'REM sleep',
    247: 'Alcohol',
    248: 'Defibrillator',
    249: 'Medicine One',
    250: 'Medicine Two',
    251: 'Medicine Three',
    252: 'Arnica',
    253: 'Vitamin E',
    254: 'Vitamin C',
    255: 'Drowsiness',
  };

  function getChemicalName(id) {
    return CHEMICAL_NAMES[id] || ('Chemical ' + id);
  }

  // ── Drive names (matches CreatureConstants.h enum driveoffsets) ─────────
  const DRIVE_NAMES = [
    'Pain', 'Hunger (Protein)', 'Hunger (Carb)', 'Hunger (Fat)',
    'Coldness', 'Hotness', 'Tiredness', 'Sleepiness',
    'Loneliness', 'Crowdedness', 'Fear', 'Boredom',
    'Anger', 'Sex Drive', 'Comfort',
    'Up', 'Down', 'Exit', 'Enter', 'Wait'
  ];

  // ── Age names (matches CreatureConstants.h) ────────────────────────────
  const AGE_NAMES = ['Baby', 'Child', 'Adolescent', 'Youth', 'Adult', 'Old', 'Senile'];

  // ── Genus labels ───────────────────────────────────────────────────────
  const GENUS_INFO = {
    1: { name: 'Norn', icon: '🐣', cls: 'crt-genus-norn' },
    2: { name: 'Grendel', icon: '🦎', cls: 'crt-genus-grendel' },
    3: { name: 'Ettin', icon: '🔧', cls: 'crt-genus-ettin' },
  };

  // ── State ──────────────────────────────────────────────────────────────
  let creatures = [];
  let selectedId = null;
  let chemData = null;
  let autoTimer = null;

  // ── DOM refs ───────────────────────────────────────────────────────────
  const listEl = document.getElementById('crt-list');
  const listEmpty = document.getElementById('crt-list-empty');
  const drivesBars = document.getElementById('crt-drives-bars');
  const chemBars = document.getElementById('crt-chem-bars');
  const summaryContent = document.getElementById('crt-summary-content');
  const optAuto = document.getElementById('opt-creatures-auto');
  const btnRefresh = document.getElementById('btn-creatures-refresh');
  const optNonZero = document.getElementById('opt-chem-nonzero');

  // ── Sub-tab switching ─────────────────────────────────────────────────
  document.querySelectorAll('.crt-sub-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.crt-sub-btn').forEach(b => b.classList.remove('crt-sub-btn--active'));
      btn.classList.add('crt-sub-btn--active');
      const tab = btn.dataset.subtab;
      document.querySelectorAll('.crt-subview').forEach(v => {
        v.hidden = true;
        v.classList.remove('crt-subview--active');
      });
      const target = document.getElementById('crt-' + tab);
      if (target) {
        target.hidden = false;
        target.classList.add('crt-subview--active');
        DevToolsEvents.emit('tab:subview:' + tab);
      }
    });
  });

  // ── Fetch creatures ───────────────────────────────────────────────────
  async function fetchCreatures() {
    try {
      const resp = await fetch('/api/creatures');
      if (!resp.ok) return;
      creatures = await resp.json();
      renderList();
      // Auto-select if our current selection still exists
      const sel = creatures.find(c => c.agentId === selectedId);
      if (sel) {
        renderDrives(sel);
        renderSummary(sel);
      } else if (selectedId !== null) {
        // Selected creature gone
        selectedId = null;
        clearDetail();
      }
      // If a creature is selected, also fetch chemistry
      if (selectedId !== null) {
        fetchChemistry(selectedId);
      }
    } catch (e) {
      console.warn('DevTools: creatures fetch failed', e);
    }
  }

  async function fetchChemistry(agentId) {
    try {
      const resp = await fetch('/api/creature/' + agentId + '/chemistry');
      if (!resp.ok) return;
      chemData = await resp.json();
      if (chemData.error) { chemData = null; return; }
      renderChemistry();
    } catch (e) {
      console.warn('DevTools: chemistry fetch failed', e);
    }
  }

  // ── Render creature list ──────────────────────────────────────────────
  function renderList() {
    // Remove old items (keep #crt-list-empty)
    listEl.querySelectorAll('.crt-list-item').forEach(el => el.remove());

    if (creatures.length === 0) {
      listEmpty.hidden = false;
      return;
    }
    listEmpty.hidden = true;

    creatures.forEach(c => {
      const div = document.createElement('div');
      div.className = 'crt-list-item' + (c.agentId === selectedId ? ' crt-list-item--selected' : '');
      div.dataset.id = c.agentId;

      const genus = GENUS_INFO[c.genus] || { name: 'Unknown', icon: '❓', cls: '' };
      const ageName = AGE_NAMES[c.age] || '?';
      const sexLabel = c.sex === 1 ? '♂' : c.sex === 2 ? '♀' : '?';

      // Moniker shortened
      const shortMoniker = c.moniker ? c.moniker.substring(0, 4) : '????';

      // Display name: use creature name if available, otherwise genus + short moniker
      const displayName = c.name ? c.name : genus.name + ' ' + shortMoniker;
      const subtitle = c.name
        ? genus.name + ' ' + shortMoniker + ' ' + sexLabel
        : ageName + ' ' + sexLabel;

      div.innerHTML =
        '<span class="crt-item-icon">' + genus.icon + '</span>' +
        '<div class="crt-item-info">' +
          '<div class="crt-item-name">' + displayName + '</div>' +
          '<div class="crt-item-meta">' + subtitle + ' · ' +
            '<span class="crt-state-badge crt-state--' + (c.lifeState || 'unknown') + '">' + (c.lifeState || '?') + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="crt-item-health">' +
          '<div class="crt-health-bar"><div class="crt-health-fill" style="width:' + Math.round((c.health || 0) * 100) + '%"></div></div>' +
        '</div>';

      div.addEventListener('click', () => selectCreature(c.agentId));
      listEl.appendChild(div);
    });
  }

  // ── Select creature ───────────────────────────────────────────────────
  function selectCreature(agentId) {
    selectedId = agentId;
    // Update list selection
    listEl.querySelectorAll('.crt-list-item').forEach(el => {
      el.classList.toggle('crt-list-item--selected', parseInt(el.dataset.id) === agentId);
    });
    // Notify other modules (e.g. brain.js) about the selection change
    DevToolsEvents.emit('creature:selected', agentId);
    const c = creatures.find(c => c.agentId === agentId);
    if (c) {
      renderDrives(c);
      renderSummary(c);
      fetchChemistry(agentId);
    }
  }

  // ── Render drives view ────────────────────────────────────────────────
  function renderDrives(creature) {
    if (!creature.drives) {
      drivesBars.innerHTML = '<div class="crt-empty-hint">No drive data</div>';
      return;
    }

    let html = '';
    for (let i = 0; i < creature.drives.length && i < DRIVE_NAMES.length; i++) {
      const val = creature.drives[i];
      const pct = Math.round(Math.min(val, 1.0) * 100);
      // Color: green (low) → yellow (mid) → red (high)
      const hue = Math.round(120 * (1 - Math.min(val, 1.0))); // 120=green, 0=red
      const isHighest = (i === creature.highestDrive);

      html += '<div class="crt-drive-row' + (isHighest ? ' crt-drive-row--highest' : '') + '">' +
        '<span class="crt-drive-label">' + DRIVE_NAMES[i] + '</span>' +
        '<div class="crt-drive-track">' +
          '<div class="crt-drive-fill" style="width:' + pct + '%;background:hsl(' + hue + ',75%,45%)"></div>' +
        '</div>' +
        '<span class="crt-drive-value">' + (val >= 0.01 ? val.toFixed(2) : '0') + '</span>' +
      '</div>';
    }
    drivesBars.innerHTML = html;
  }

  // ── Render chemistry view ─────────────────────────────────────────────
  function renderChemistry() {
    if (!chemData || !chemData.chemicals) {
      chemBars.innerHTML = '<div class="crt-empty-hint">No chemistry data</div>';
      return;
    }

    const nonZeroOnly = optNonZero.checked;

    // Build array of { id, name, value }
    let chems = [];
    for (let i = 0; i < chemData.chemicals.length; i++) {
      const val = chemData.chemicals[i];
      if (nonZeroOnly && val < 0.001) continue;
      chems.push({ id: i, name: getChemicalName(i), value: val });
    }

    // Sort by value descending
    chems.sort((a, b) => b.value - a.value);

    if (chems.length === 0) {
      chemBars.innerHTML = '<div class="crt-empty-hint">No chemicals detected</div>';
      return;
    }

    let html = '<div class="crt-chem-list">';
    for (const c of chems) {
      const pct = Math.round(Math.min(c.value, 1.0) * 100);
      // Different tints based on chemical type
      let hue = 200; // default blue
      if (c.id >= 148 && c.id <= 164) hue = 280; // drives: purple
      else if (c.id >= 82 && c.id <= 89) hue = 0; // antigens: red
      else if (c.id >= 24 && c.id <= 31) hue = 45; // antibodies: orange
      else if (c.id >= 165 && c.id <= 184) hue = 150; // smells: green
      else if (c.id === 35) hue = 55; // ATP: gold
      else if (c.id === 127) hue = 0; // injury: red

      html += '<div class="crt-chem-row">' +
        '<span class="crt-chem-id">' + c.id + '</span>' +
        '<span class="crt-chem-name">' + c.name + '</span>' +
        '<div class="crt-chem-track">' +
          '<div class="crt-chem-fill" style="width:' + pct + '%;background:hsl(' + hue + ',60%,48%)"></div>' +
        '</div>' +
        '<span class="crt-chem-value">' + c.value.toFixed(3) + '</span>' +
      '</div>';
    }
    html += '</div>';
    chemBars.innerHTML = html;
  }

  // ── Render summary card ───────────────────────────────────────────────
  function renderSummary(creature) {
    const genus = GENUS_INFO[creature.genus] || { name: 'Unknown', icon: '❓' };
    const ageName = AGE_NAMES[creature.age] || '?';
    const sexLabel = creature.sex === 1 ? 'Male ♂' : creature.sex === 2 ? 'Female ♀' : 'Unknown';
    const healthPct = Math.round((creature.health || 0) * 100);

    let html = '<div class="crt-summary-card">';
    html += '<div class="crt-summary-icon">' + genus.icon + '</div>';
    html += '<div class="crt-summary-genus">' + genus.name + '</div>';
    if (creature.name) {
      html += '<div class="crt-summary-name">' + creature.name + '</div>';
    }
    html += '<table class="crt-summary-table">';
    html += '<tr><td class="crt-sum-key">Moniker</td><td class="crt-sum-val"><code>' + (creature.moniker || '—') + '</code></td></tr>';
    html += '<tr><td class="crt-sum-key">Sex</td><td class="crt-sum-val">' + sexLabel + '</td></tr>';
    html += '<tr><td class="crt-sum-key">Age</td><td class="crt-sum-val">' + ageName + ' (' + (creature.ageInTicks || 0) + ' ticks)</td></tr>';
    html += '<tr><td class="crt-sum-key">Life State</td><td class="crt-sum-val"><span class="crt-state-badge crt-state--' + (creature.lifeState || 'unknown') + '">' + (creature.lifeState || '?') + '</span></td></tr>';
    html += '<tr><td class="crt-sum-key">Health</td><td class="crt-sum-val">' + healthPct + '%</td></tr>';
    html += '<tr><td class="crt-sum-key">Position</td><td class="crt-sum-val">' + (creature.posX || 0) + ', ' + (creature.posY || 0) + '</td></tr>';
    html += '<tr><td class="crt-sum-key">Agent ID</td><td class="crt-sum-val">' + creature.agentId + '</td></tr>';

    // Highest drive
    if (creature.drives && creature.highestDrive !== undefined) {
      const driveName = DRIVE_NAMES[creature.highestDrive] || ('Drive ' + creature.highestDrive);
      const driveVal = creature.drives[creature.highestDrive];
      html += '<tr><td class="crt-sum-key">Top Drive</td><td class="crt-sum-val">' + driveName + ' (' + (driveVal ? driveVal.toFixed(2) : '0') + ')</td></tr>';
    }

    html += '</table>';



    html += '</div>';
    summaryContent.innerHTML = html;
  }

  // ── Clear detail panels ───────────────────────────────────────────────
  function clearDetail() {
    drivesBars.innerHTML = '<div class="crt-empty-hint">Select a creature to view drives</div>';
    chemBars.innerHTML = '<div class="crt-empty-hint">Select a creature to view chemistry</div>';
    summaryContent.innerHTML = '<div class="crt-empty-hint">Select a creature</div>';
    chemData = null;
  }

  // ── Auto-refresh timer ────────────────────────────────────────────────
  function startAutoRefresh() {
    stopAutoRefresh();
    if (optAuto.checked) {
      autoTimer = setInterval(fetchCreatures, 2000);
    }
  }

  function stopAutoRefresh() {
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
  }

  // ── Event wiring ──────────────────────────────────────────────────────
  optAuto.addEventListener('change', () => {
    if (optAuto.checked) startAutoRefresh();
    else stopAutoRefresh();
  });

  btnRefresh.addEventListener('click', () => fetchCreatures());

  optNonZero.addEventListener('change', () => renderChemistry());

  // ── Tab visibility via DevToolsEvents ────────────────────────────────
  DevToolsEvents.on('tab:activated', (tab) => {
    if (tab === 'creatures') {
      fetchCreatures();
      startAutoRefresh();
    }
  });

  DevToolsEvents.on('tab:deactivated', (tab) => {
    if (tab === 'creatures') {
      stopAutoRefresh();
    }
  });

  // ── Chemistry Internal Tabs (Monitoring vs Syringe) ───────────────────
  document.querySelectorAll('.crt-chem-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.crt-chem-tab-btn').forEach(b => b.classList.remove('crt-chem-tab-btn--active'));
      btn.classList.add('crt-chem-tab-btn--active');
      const tab = btn.dataset.chemTab;
      document.querySelectorAll('.crt-chem-view').forEach(v => {
        v.hidden = true;
        v.classList.remove('crt-chem-view--active');
      });
      const target = document.getElementById('crt-chem-' + tab + '-view');
      if (target) {
        target.hidden = false;
        target.classList.add('crt-chem-view--active');
      }
    });
  });

  // ── Syringe UI Logic ──────────────────────────────────────────────────
  let selectedChemId = null;
  let syringeShowAll = false;
  const syringeList = document.getElementById('crt-syringe-list');
  const syringeSearch = document.getElementById('crt-syringe-search');
  const syringeAction = document.getElementById('crt-syringe-action');
  const syringeSelectedName = document.getElementById('crt-syringe-selected-name');
  const syringeAmount = document.getElementById('crt-syringe-amount');
  const btnSyringeInject = document.getElementById('btn-syringe-inject');

  function renderSyringeList() {
    if (!syringeList) return;
    const query = syringeSearch.value.toLowerCase().trim();
    let html = '';
    
    const matches = [];
    for (let i = 0; i < 256; i++) {
        const name = getChemicalName(i);
        const searchStr = `${i} ${name}`.toLowerCase();
        if (query && !searchStr.includes(query)) continue;
        matches.push({ id: i, name });
    }

    const limit = syringeShowAll ? matches.length : Math.min(5, matches.length);
    for (let i = 0; i < limit; i++) {
        const item = matches[i];
        const isSelected = item.id === selectedChemId;
        html += `<div class="crt-syringe-item ${isSelected ? 'crt-syringe-item--selected' : ''}" data-id="${item.id}">
          <span class="crt-chem-id">${item.id}</span> <span class="crt-chem-name">${item.name}</span>
        </div>`;
    }

    if (!syringeShowAll && matches.length > 5) {
        html += `<div class="crt-syringe-item crt-syringe-show-all" style="justify-content: center; color: var(--orange); font-weight: 600;">
          Show all ${matches.length} matches...
        </div>`;
    }
    
    syringeList.innerHTML = html;
  }

  if (syringeList) {
    syringeList.addEventListener('click', (e) => {
      const showAllBtn = e.target.closest('.crt-syringe-show-all');
      if (showAllBtn) {
          syringeShowAll = true;
          renderSyringeList();
          return;
      }

      const item = e.target.closest('.crt-syringe-item');
      if (!item) return;
      selectedChemId = parseInt(item.dataset.id, 10);
      renderSyringeList();
      syringeAction.hidden = false;
      syringeSelectedName.textContent = `Selected: ${selectedChemId} - ${getChemicalName(selectedChemId)}`;
    });
  }

  if (syringeSearch) {
    syringeSearch.addEventListener('input', () => {
        syringeShowAll = false;
        renderSyringeList();
    });
    // Initial render
    renderSyringeList();
  }

  const syringeFeedback = document.getElementById('crt-syringe-feedback');

  async function injectChemical(agentId, chemId, amount) {
    const caos = `enum 4 0 0\n  doif unid eq ${agentId}\n    setv va00 chem ${chemId}\n    chem ${chemId} ${amount}\n    outv va00\n    outs " "\n    outv chem ${chemId}\n  endi\nnext`;
    try {
      const resp = await fetch("/api/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caos: caos })
      });
      const data = await resp.json();
      if (data.ok) {
          fetchChemistry(agentId);
          if (data.output && data.output.trim() && syringeFeedback) {
              const parts = data.output.trim().split(" ");
              if (parts.length === 2) {
                  const oldVal = parseFloat(parts[0]);
                  const newVal = parseFloat(parts[1]);
                  const name = getChemicalName(chemId);
                  const action = newVal >= oldVal ? "Increased" : "Decreased";
                  syringeFeedback.textContent = `${action} ${name} from ${oldVal.toFixed(2)} to ${newVal.toFixed(2)}`;
                  syringeFeedback.style.opacity = "1";
                  
                  if (syringeFeedback._timeout) clearTimeout(syringeFeedback._timeout);
                  syringeFeedback._timeout = setTimeout(() => {
                      syringeFeedback.style.opacity = "0";
                  }, 4000);
              }
          }
      } else {
          console.warn('DevTools: inject CAOS error', data.error);
      }
    } catch (e) {
      console.warn('DevTools: inject network failed', e);
    }
  }

  if (btnSyringeInject) {
    btnSyringeInject.addEventListener('click', () => {
        if (selectedId === null || selectedChemId === null) return;
        const amount = parseFloat(syringeAmount.value) || 0;
        injectChemical(selectedId, selectedChemId, amount);
    });
  }

})();
