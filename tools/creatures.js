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
    29: 'Air',
    30: 'Oxygen',
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
  const initialCreatureSelection = ObservatoryState.getState().selection.creature;
  let selectedId = initialCreatureSelection ? initialCreatureSelection.id : null;
  let chemData = null;
  let chemistryRequestSerial = 0;
  const chemistryRefresh = window.ChemicalInterventionModel
    .createRefreshCoordinator();
  let autoTimer = null;
  let filterGenus = 'all';    // 'all', '1' (Norn), '2' (Grendel), '3' (Ettin)
  let filterQuery = '';       // lowercase text search

  // ── DOM refs ───────────────────────────────────────────────────────────
  const listEl = document.getElementById('crt-list');
  const drivesBars = document.getElementById('crt-drives-bars');
  const chemBars = document.getElementById('crt-chem-bars');
  const summaryContent = document.getElementById('crt-summary-content');
  const optAuto = document.getElementById('opt-creatures-auto');
  const btnRefresh = document.getElementById('btn-creatures-refresh');
  const optNonZero = document.getElementById('opt-chem-nonzero');
  const filterSearch = document.getElementById('crt-filter-search');
  const filterGenusWrap = document.getElementById('crt-filter-genus');
  const btnFocus = document.getElementById('btn-creatures-focus');

  function evidenceBadgeHtml(level) {
    const label = level === 'derived' ? 'Derived' : level === 'inferred' ? 'Inferred' : 'Observed';
    return '<button type="button" class="evidence-badge evidence-badge--' + level +
      '" data-biology-evidence="' + level + '">' + label + '</button>';
  }

  function rawConcentration(value) {
    return value == null ? '—' : Number(value).toFixed(3);
  }

  summaryContent.addEventListener('click', event => {
    const badge = event.target.closest('[data-biology-evidence]');
    if (badge) ObservatoryState.openEvidenceHelp(badge);
    const destination = event.target.closest('[data-crt-open]');
    if (!destination) return;
    const view = destination.dataset.crtOpen;
    if (view === 'debugger') {
      const world = ObservatoryState.getState().world.identity;
      window.DevToolsNavigation.navigate({
        tab: 'debugger',
        view: 'agent',
        worldKey: world && world.key,
        primary: 'agent',
        selections: {
          creature: ObservatoryState.getState().selection.creature,
          agent: ObservatoryState.getState().selection.agent
        }
      });
    } else {
      navigateCreatureSubview(view);
    }
  });

  chemBars.addEventListener('click', event => {
    if (event.target.closest('[data-bio-pin]')) return;
    const row = event.target.closest('[data-chemical-id]');
    if (!row) return;
    const id = Number(row.dataset.chemicalId);
    const world = ObservatoryState.getState().world.identity;
    window.DevToolsNavigation.navigate({
      tab: 'creatures',
      view: 'chemistry',
      worldKey: world && world.key,
      primary: 'chemical',
      selections: {
        chemical: { id, name: getChemicalName(id) }
      }
    });
  });
  chemBars.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target.closest('[data-bio-pin]')) return;
    const row = event.target.closest('[data-chemical-id]');
    if (!row) return;
    event.preventDefault();
    row.click();
  });

  // ── Focus camera ──────────────────────────────────────────────────────
  if (btnFocus) {
    btnFocus.addEventListener('click', async () => {
      if (!selectedId) return;
      try {
        // Fetch full agent state to get coordinates
        const resp = await fetch('/api/agent/' + selectedId);
        const data = await resp.json();
        if (data.posx !== undefined && data.posy !== undefined) {
          await fetch('/api/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ caos: `cmrp ${data.posx} ${data.posy} 0` })
          });
        }
      } catch (e) {
        console.warn('DevTools: Focus camera failed', e);
      }
    });
  }

  // ── Filter wiring ─────────────────────────────────────────────────────
  if (filterSearch) {
    filterSearch.addEventListener('input', () => {
      filterQuery = filterSearch.value.toLowerCase().trim();
      renderList();
    });
  }

  if (filterGenusWrap) {
    filterGenusWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.crt-genus-btn');
      if (!btn) return;
      filterGenus = btn.dataset.genus;
      filterGenusWrap.querySelectorAll('.crt-genus-btn').forEach(b =>
        b.classList.toggle('crt-genus-btn--active', b === btn)
      );
      renderList();
    });
  }

  // ── Sub-tab switching ─────────────────────────────────────────────────
  function activateCreatureSubview(tab) {
    const button = document.querySelector('.crt-sub-btn[data-subtab="' + tab + '"]');
    if (!button) return false;
    document.querySelectorAll('.crt-sub-btn').forEach(b =>
      b.classList.toggle('crt-sub-btn--active', b === button)
    );
    document.querySelectorAll('.crt-subview').forEach(v => {
      v.hidden = true;
      v.classList.remove('crt-subview--active');
    });
    const target = document.getElementById('crt-' + tab);
    if (!target) return false;
    target.hidden = false;
    target.classList.add('crt-subview--active');
    // With the evidence strips open the content can start below the fold, and
    // a click that changes nothing visible looks like a broken tab.
    const content = document.getElementById('crt-detail-content');
    const panel = document.getElementById('crt-detail-panel');
    if (content && panel) {
      const contentTop = content.getBoundingClientRect().top;
      const panelBox = panel.getBoundingClientRect();
      if (contentTop > panelBox.top + panelBox.height * 0.45) {
        content.scrollIntoView({ block: 'start' });
      }
    }
    DevToolsEvents.emit('tab:subview:' + tab);
    return true;
  }

  // ── Evidence strips ───────────────────────────────────────────────────
  // Both strips stay open on a tall screen. On a shorter one they would push
  // the subview off screen, so they start collapsed until the user opens them.
  const STRIP_STORAGE_KEY = 'observatory.creatures.strips';
  const TALL_SCREEN_HEIGHT = 1100;

  function readStripPreferences() {
    try {
      return JSON.parse(localStorage.getItem(STRIP_STORAGE_KEY)) || {};
    } catch (_) {
      return {};
    }
  }

  ['crt-observation-strip', 'crt-bio-monitor'].forEach(id => {
    const strip = document.getElementById(id);
    if (!strip) return;
    const saved = readStripPreferences()[id];
    strip.open = saved == null
      ? window.innerHeight >= TALL_SCREEN_HEIGHT : Boolean(saved);
    strip.querySelector('summary').addEventListener('click', () => {
      // The click lands before the element toggles.
      const next = Object.assign(readStripPreferences(), { [id]: !strip.open });
      try {
        localStorage.setItem(STRIP_STORAGE_KEY, JSON.stringify(next));
      } catch (_) {
        // Private browsing can refuse storage; the strip still toggles.
      }
    });
  });

  function navigateCreatureSubview(tab) {
    const world = ObservatoryState.getState().world.identity;
    if (!window.DevToolsNavigation) return activateCreatureSubview(tab);
    return window.DevToolsNavigation.navigate({
      tab: 'creatures',
      view: tab,
      worldKey: world && world.key
    });
  }

  document.querySelectorAll('.crt-sub-btn').forEach(btn => {
    btn.addEventListener('click', () => navigateCreatureSubview(btn.dataset.subtab));
  });

  // ── Fetch creatures ───────────────────────────────────────────────────
  async function fetchCreatures() {
    try {
      let world = ObservatoryState.getState().world;
      if (!world.identity || world.tick == null) {
        await SessionStatus.refresh(false);
        world = ObservatoryState.getState().world;
      }
      if (!world.identity || world.tick == null) return;

      const sharedSample = await ObservatoryState.requestShared('creatures:list', async () => {
        const response = await fetch('/api/creatures');
        if (!response.ok) throw new Error('Creatures request failed');
        const value = await response.json();
        return ObservatoryState.sample(value, {
          worldKey: world.identity.key,
          tick: world.tick,
          sampleIntervalMs: 2000,
          evidenceLevel: 'observed',
          evidence: { source: 'GET /api/creatures' }
        });
      });
      if (!sharedSample) return;
      creatures = sharedSample.value;
      renderList();
      // Auto-select if our current selection still exists
      const selectedContext = ObservatoryState.getState().selection.creature;
      const sel = creatures.find(c => c.agentId === selectedId);
      const identityMismatch = Boolean(
        sel && selectedContext && selectedContext.moniker &&
        sel.moniker && selectedContext.moniker !== sel.moniker
      );
      if (sel && selectedContext && !selectedContext.missing && !identityMismatch) {
        BiologicalMonitor.setCurrentCreature(sel);
        BiologicalMonitor.ingestDrives(sel, DRIVE_NAMES);
        renderDrives(sel);
        renderSummary(sel);
      } else if (identityMismatch) {
        window.DevToolsNavigation.markMissing(
          'creature',
          selectedId,
          'Agent #' + selectedId + ' now belongs to a different creature; the historical selection was not retargeted'
        );
        window.DevToolsNavigation.markMissing(
          'agent',
          selectedId,
          'Numeric agent ID was reused by a different creature'
        );
        clearDetail();
      } else if (selectedContext && selectedContext.missing) {
        clearDetail();
      } else if (selectedId !== null) {
        // Retain the historical subject. Numeric IDs may be reused later, so
        // the shared context records that this exact target is now missing.
        if (window.DevToolsNavigation && !selectedContext?.missing) {
          window.DevToolsNavigation.markMissing(
            'creature',
            selectedId,
            'Creature is no longer present in the active world'
          );
          window.DevToolsNavigation.markMissing(
            'agent',
            selectedId,
            'Creature agent is no longer present in the active world'
          );
        }
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

  function fetchChemistry(agentId) {
    return chemistryRefresh.run(agentId, () =>
      fetchFreshChemistry(agentId));
  }

  async function fetchFreshChemistry(agentId) {
    const requestSerial = ++chemistryRequestSerial;
    try {
      const resp = await fetch('/api/creature/' + agentId + '/chemistry');
      if (!resp.ok) return false;
      const responseData = await resp.json();
      if (agentId !== selectedId || requestSerial !== chemistryRequestSerial) return false;
      if (responseData.error) {
        chemData = null;
        renderChemicalIntervention();
        return false;
      }
      chemData = responseData;
      const creature = creatures.find(c => c.agentId === agentId);
      if (creature) {
        BiologicalMonitor.setCurrentCreature(creature);
        BiologicalMonitor.ingestChemistry(
          creature,
          chemData.chemicals,
          getChemicalName
        );
      }
      renderChemistry();
      renderChemicalIntervention();
      if (creature) renderSummary(creature);
      return true;
    } catch (e) {
      console.warn('DevTools: chemistry fetch failed', e);
      renderChemicalIntervention();
      return false;
    }
  }

  // ── Render creature list ──────────────────────────────────────────────
  function renderList() {
    // Apply filters
    const filtered = creatures.filter(c => {
      // Genus filter
      if (filterGenus !== 'all' && String(c.genus) !== filterGenus) return false;
      // Text search: match against name, genus label, and moniker
      if (filterQuery) {
        const genus = GENUS_INFO[c.genus] || { name: 'Unknown' };
        const searchable = [
          c.name || '',
          genus.name,
          c.moniker || ''
        ].join(' ').toLowerCase();
        if (!searchable.includes(filterQuery)) return false;
      }
      return true;
    });

    const emptyText = filtered.length > 0 ? ''
      : creatures.length === 0
        ? 'No creatures in world. Import or hatch a Norn to begin.'
        : 'No creatures match the current filter.';
    DomPatch.update(listEl,
      '<div id="crt-list-empty" class="crt-empty-hint"' +
      (emptyText ? '' : ' hidden') + '>' + emptyText + '</div>' +
      filtered.map(c => {
      const genus = GENUS_INFO[c.genus] || { name: 'Unknown', icon: '❓', cls: '' };
      const ageName = AGE_NAMES[c.age] || '?';
      const sexLabel = c.sex === 1 ? '♂' : c.sex === 2 ? '♀' : '?';
      const glycogen = Number.isFinite(c.glycogenReserve) ? c.glycogenReserve : (c.health || 0);
      const glycogenPct = Math.round(Math.min(1, Math.max(0, glycogen)) * 100);

      // Moniker shortened
      const shortMoniker = c.moniker ? c.moniker.substring(0, 4) : '????';

      // Display name: use creature name if available, otherwise genus + short moniker
      const displayName = c.name ? c.name : genus.name + ' ' + shortMoniker;
      const subtitle = c.name
        ? genus.name + ' ' + shortMoniker + ' ' + sexLabel
        : ageName + ' ' + sexLabel;

      return '<div class="crt-list-item' +
          (c.agentId === selectedId ? ' crt-list-item--selected' : '') +
          '" data-id="' + c.agentId + '" data-patch-key="' + c.agentId + '">' +
        '<span class="crt-item-icon">' + genus.icon + '</span>' +
        '<div class="crt-item-info">' +
          '<div class="crt-item-name">' + escHtml(displayName) + '</div>' +
          '<div class="crt-item-meta"><span class="crt-item-subtitle">' + escHtml(subtitle) + '</span>' +
            '<span class="crt-state-badge crt-state--' + escHtml(c.lifeState || 'unknown') + '">' + escHtml(c.lifeState || '?') + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="crt-item-glycogen" title="Glycogen reserve · chemical 4 · raw concentration ' + glycogen.toFixed(3) + '">' +
          '<span>Gly ' + glycogenPct + '%</span>' +
          '<div class="crt-glycogen-bar"><div class="crt-glycogen-fill" style="width:' + glycogenPct + '%"></div></div>' +
        '</div></div>';
    }).join(''));
  }

  listEl.addEventListener('click', event => {
    const item = event.target.closest('.crt-list-item');
    if (item) selectCreature(Number(item.dataset.id));
  });

  // ── Select creature ───────────────────────────────────────────────────
  function selectCreature(agentId) {
    if (selectedId !== agentId) chemData = null;
    selectedId = agentId;
    const creature = creatures.find(c => c.agentId === agentId);
    const genus = creature && GENUS_INFO[creature.genus];
    const details = creature ? {
      name: creature.name || null,
      moniker: creature.moniker || null,
      genus: creature.genus,
      genusName: genus ? genus.name : 'Creature',
      species: creature.species == null ? null : creature.species,
      family: 4
    } : null;
    const activeSubview = document.querySelector(
      '.crt-sub-btn.crt-sub-btn--active'
    );
    const world = ObservatoryState.getState().world.identity;
    window.DevToolsNavigation.navigate({
      tab: 'creatures',
      view: activeSubview ? activeSubview.dataset.subtab : 'drives',
      worldKey: world && world.key,
      primary: 'creature',
      selections: {
        creature: Object.assign({ id: agentId }, details || {}),
        agent: Object.assign({ id: agentId }, details || {}),
        room: creature && creature.roomId != null
          ? { id: creature.roomId, creatureId: agentId }
          : null,
        metaroom: creature && creature.metaRoomId != null
          ? { id: creature.metaRoomId, creatureId: agentId }
          : null
      }
    });
    if (btnFocus) btnFocus.disabled = false;
    // Update list selection
    listEl.querySelectorAll('.crt-list-item').forEach(el => {
      el.classList.toggle('crt-list-item--selected', parseInt(el.dataset.id) === agentId);
    });
    // Notify other modules (e.g. brain.js) about the selection change
    DevToolsEvents.emit('creature:selected', agentId);
    const c = creatures.find(c => c.agentId === agentId);
    if (c) {
      BiologicalMonitor.setCurrentCreature(c);
      renderDrives(c);
      renderSummary(c);
      fetchChemistry(agentId);
    }
  }

  // ── Render drives view ────────────────────────────────────────────────
  function renderDrives(creature) {
    if (!creature.drives) {
      DomPatch.update(drivesBars, '<div class="crt-empty-hint">No drive data</div>');
      return;
    }

    const records = [];
    for (let i = 0; i < creature.drives.length && i < DRIVE_NAMES.length; i++) {
      const view = BiologicalMonitor.currentView('drive:' + i);
      records.push({
        id: 'drive:' + i,
        driveId: i,
        label: DRIVE_NAMES[i],
        value: creature.drives[i],
        previousDelta: view ? view.summary.previousDelta : null,
        group: 'drives and backups'
      });
    }

    let html = '';
    for (const record of BiologicalMonitor.order(records)) {
      const i = record.driveId;
      const val = record.value;
      const pct = Math.round(Math.min(val, 1.0) * 100);
      // Color: green (low) → yellow (mid) → red (high)
      const hue = Math.round(120 * (1 - Math.min(val, 1.0))); // 120=green, 0=red
      const isHighest = (i === creature.highestDrive);

      html += '<div class="crt-drive-row' + (isHighest ? ' crt-drive-row--highest' : '') +
        '" data-patch-key="' + record.id + '">' +
        BiologicalMonitor.pinButtonHtml(record.id, record.label) +
        '<span class="crt-drive-label">' + record.label + '</span>' +
        '<div class="crt-drive-track">' +
          '<div class="crt-drive-fill" style="width:' + pct + '%;background:hsl(' + hue + ',75%,45%)"></div>' +
        '</div>' +
        '<span class="crt-drive-value">' + (val >= 0.01 ? val.toFixed(2) : '0') + '</span>' +
        BiologicalMonitor.trendHtml(record.id, 2) +
      '</div>';
    }
    DomPatch.update(drivesBars, html);
  }

  // ── Render chemistry view ─────────────────────────────────────────────
  function renderChemistry() {
    if (!chemData || !chemData.chemicals) {
      DomPatch.update(chemBars, '<div class="crt-empty-hint">No chemistry data</div>');
      return;
    }

    const nonZeroOnly = optNonZero.checked;

    // Build array of { id, name, value }
    let chems = [];
    for (let i = 0; i < chemData.chemicals.length; i++) {
      const val = chemData.chemicals[i];
      if (nonZeroOnly && val < 0.001) continue;
      const metricId = 'chemical:' + i;
      const view = BiologicalMonitor.currentView(metricId);
      chems.push({
        id: metricId,
        chemicalId: i,
        name: getChemicalName(i),
        label: getChemicalName(i),
        value: val,
        previousDelta: view ? view.summary.previousDelta : null,
        group: BiologicalMonitor.chemicalGroup(i)
      });
    }

    chems = BiologicalMonitor.order(chems);

    if (chems.length === 0) {
      DomPatch.update(chemBars, '<div class="crt-empty-hint">No chemicals detected</div>');
      return;
    }

    let html = '<div class="crt-chem-list">';
    for (const c of chems) {
      const pct = Math.round(Math.min(c.value, 1.0) * 100);
      // Different tints based on chemical type
      let hue = 200; // default blue
      if ((c.chemicalId >= 148 && c.chemicalId <= 162) || (c.chemicalId >= 199 && c.chemicalId <= 203)) hue = 280; // drives: purple
      else if (c.chemicalId >= 82 && c.chemicalId <= 89) hue = 0; // antigens: red
      else if (c.chemicalId >= 24 && c.chemicalId <= 31) hue = 45; // respiratory/waste
      else if (c.chemicalId >= 165 && c.chemicalId <= 184) hue = 150; // smells: green
      else if (c.chemicalId === 35) hue = 55; // ATP: gold
      else if (c.chemicalId === 127) hue = 0; // injury: red

      html += '<div role="button" tabindex="0" class="crt-chem-row" data-patch-key="chemical-' + c.chemicalId +
        '" data-chemical-id="' + c.chemicalId +
        '" data-chemical-value="' + c.value +
        '" title="Select ' + c.name + ' as the primary subject without clearing this creature">' +
        BiologicalMonitor.pinButtonHtml(c.id, c.name) +
        '<span class="crt-chem-id">' + c.chemicalId + '</span>' +
        '<span class="crt-chem-name">' + c.name + '</span>' +
        '<div class="crt-chem-track">' +
          '<div class="crt-chem-fill" style="width:' + pct + '%;background:hsl(' + hue + ',60%,48%)"></div>' +
        '</div>' +
        '<span class="crt-chem-value">' + c.value.toFixed(3) + '</span>' +
        BiologicalMonitor.trendHtml(c.id, 3) +
      '</div>';
    }
    html += '</div>';
    DomPatch.update(chemBars, html);
  }

  // ── Render summary card ───────────────────────────────────────────────
  function renderSummary(creature) {
    const genus = GENUS_INFO[creature.genus] || { name: 'Unknown', icon: '❓' };
    const ageName = AGE_NAMES[creature.age] || '?';
    const sexLabel = creature.sex === 1 ? 'Male ♂' : creature.sex === 2 ? 'Female ♀' : 'Unknown';
    const vitality = BiologicalSemantics.buildVitalityIndicators(creature, chemData);

    let html = '<div class="crt-summary-card">';
    html += '<div class="crt-summary-icon">' + genus.icon + '</div>';
    html += '<div class="crt-summary-genus">' + genus.name + '</div>';
    if (creature.name) {
      html += '<div class="crt-summary-name">' + creature.name + '</div>';
    }
    html += '<table class="crt-summary-table">';
    html += '<tr><td class="crt-sum-key">Moniker</td><td class="crt-sum-val"><code>' + (creature.moniker || '—') + '</code></td></tr>';
    html += '<tr><td class="crt-sum-key">Sex</td><td class="crt-sum-val">' + sexLabel + '</td></tr>';
    html += '<tr><td class="crt-sum-key">Life stage</td><td class="crt-sum-val">' + ageName + ' (stage ' + creature.age + ')</td></tr>';
    html += '<tr><td class="crt-sum-key">Age</td><td class="crt-sum-val">' + (creature.ageInTicks || 0) + ' engine ticks</td></tr>';
    html += '<tr><td class="crt-sum-key">Life State</td><td class="crt-sum-val"><span class="crt-state-badge crt-state--' + (creature.lifeState || 'unknown') + '">' + (creature.lifeState || '?') + '</span></td></tr>';
    html += '<tr><td class="crt-sum-key">Position</td><td class="crt-sum-val">' + (creature.posX || 0) + ', ' + (creature.posY || 0) + '</td></tr>';
    html += '<tr><td class="crt-sum-key">Room</td><td class="crt-sum-val">' +
      (creature.roomId == null ? 'Unknown' : creature.roomId) +
      (creature.metaRoomId == null ? '' : ' · Metaroom ' + creature.metaRoomId) +
      '</td></tr>';
    html += '<tr><td class="crt-sum-key">Agent ID</td><td class="crt-sum-val">' + creature.agentId + '</td></tr>';

    // Highest drive
    if (creature.drives && creature.highestDrive !== undefined) {
      const driveName = DRIVE_NAMES[creature.highestDrive] || ('Drive ' + creature.highestDrive);
      const driveVal = creature.drives[creature.highestDrive];
      html += '<tr><td class="crt-sum-key">Top Drive</td><td class="crt-sum-val">' + driveName + ' (' + (driveVal ? driveVal.toFixed(2) : '0') + ')</td></tr>';
    }

    html += '</table>';
    html += '<div class="crt-context-actions" aria-label="Follow this creature">' +
      '<button type="button" data-crt-open="debugger">Active script</button>' +
      '<button type="button" data-crt-open="brain">Brain</button>' +
      '<button type="button" data-crt-open="chemistry">Chemistry</button>' +
      '<button type="button" data-crt-open="organs">Organs</button>' +
      '<button type="button" data-crt-open="genome">Genome</button>' +
      '</div>';

    html += '<div class="crt-vitality">';
    html += '<div class="crt-vitality-heading"><span>Vitality indicators</span></div>';
    html += '<div class="crt-vitality-note">Separate engine measurements; no combined health score. ' +
      '<span class="crt-vitality-evidence-label">Raw concentrations ' +
      evidenceBadgeHtml(vitality.evidenceLevels.measurements) + '</span></div>';
    html += '<div class="crt-vitality-grid">';
    html += '<div class="crt-vitality-item"><span>Glycogen reserve <code>#4</code></span><strong>' +
      rawConcentration(vitality.reserve.glycogen) + '</strong></div>';
    html += '<div class="crt-vitality-item"><span>Glucose <code>#3</code></span><strong>' +
      rawConcentration(vitality.reserve.glucose) + '</strong></div>';
    html += '<div class="crt-vitality-item"><span>ATP / ADP <code>#35/#36</code></span><strong>' +
      rawConcentration(vitality.energy.atp) + ' / ' + rawConcentration(vitality.energy.adp) + '</strong></div>';
    html += '<div class="crt-vitality-item"><span>O₂ / dissolved CO₂ <code>#30/#24</code></span><strong>' +
      rawConcentration(vitality.respiration.oxygen) + ' / ' +
      rawConcentration(vitality.respiration.carbonDioxide) + '</strong></div>';
    html += '<div class="crt-vitality-item"><span>Injury <code>#127</code></span><strong>' +
      rawConcentration(vitality.injury) + '</strong></div>';
    const organStatus = vitality.organs.total == null
      ? '—'
      : vitality.organs.failed + ' failed · ' +
        vitality.organs.atpUnavailableAtLastActivation +
        ' ATP unavailable at last activation · ' + vitality.organs.total + ' total';
    html += '<div class="crt-vitality-item"><span>Organ activation summary ' +
      evidenceBadgeHtml(vitality.evidenceLevels.organSummary) +
      '</span><strong>' + organStatus + '</strong></div>';
    html += '</div>';
    if (vitality.toxins.length) {
      html += '<div class="crt-vitality-toxins"><span>Detected listed toxins above ' +
        vitality.toxinDetectionThreshold.toFixed(3) + ' ' +
        evidenceBadgeHtml(vitality.evidenceLevels.toxinDetection) + '</span>';
      vitality.toxins.forEach(toxin => {
        html += '<span class="crt-vitality-toxin">' + toxin.label + ' <code>#' + toxin.id +
          '</code> ' + rawConcentration(toxin.concentration) + '</span>';
      });
      html += '</div>';
    } else if (chemData) {
      html += '<div class="crt-vitality-toxins">No listed toxin exceeds ' +
        vitality.toxinDetectionThreshold.toFixed(3) + ' in this sample. ' +
        evidenceBadgeHtml(vitality.evidenceLevels.toxinDetection) + '</div>';
    }
    html += '<div class="crt-vitality-source">Source: ' + vitality.source + '</div>';
    html += '</div>';


    html += '</div>';
    DomPatch.update(summaryContent, html);
  }

  // ── Clear detail panels ───────────────────────────────────────────────
  function clearDetail() {
    DomPatch.update(drivesBars, '<div class="crt-empty-hint">Select a creature to view drives</div>');
    DomPatch.update(chemBars, '<div class="crt-empty-hint">Select a creature to view chemistry</div>');
    DomPatch.update(summaryContent, '<div class="crt-empty-hint">Select a creature</div>');
    chemData = null;
    if (btnFocus) btnFocus.disabled = true;
  }

  // ── Auto-refresh timer ────────────────────────────────────────────────
  function startAutoRefresh() {
    stopAutoRefresh();
    if (optAuto.checked) {
      autoTimer = setInterval(fetchCreatures, BiologicalMonitor.intervalMs());
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

  window.addEventListener('biological-monitor:changed', () => {
    const creature = creatures.find(item => item.agentId === selectedId);
    if (creature) renderDrives(creature);
    if (chemData) renderChemistry();
  });

  window.addEventListener('biological-monitor:interval', () => {
    if (autoTimer) startAutoRefresh();
  });

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

  ObservatoryState.subscribe(
    state => state.selection.creature,
    selection => {
      const nextId = selection ? selection.id : null;
      if (nextId === selectedId) return;
      selectedId = nextId;
      if (nextId === null) {
        clearDetail();
        renderList();
      } else {
        const creature = creatures.find(item => item.agentId === nextId);
        if (creature) {
          renderList();
          renderDrives(creature);
          renderSummary(creature);
          fetchChemistry(nextId);
        } else {
          fetchCreatures();
        }
      }
    }
  );

  ObservatoryState.subscribe(
    state => state.world.status + ':' +
      (state.world.identity ? state.world.identity.key : '') + ':' +
      (state.world.transition ? state.world.transition.targetName : ''),
    () => {
      creatures = [];
      chemData = null;
      selectedId = null;
      clearDetail();
      renderList();
    }
  );

  if (window.DevToolsNavigation) {
    window.DevToolsNavigation.registerWorkspace('creatures', {
      capture() {
        const activeSubview = document.querySelector(
          '.crt-sub-btn.crt-sub-btn--active'
        );
        return {
          filterQuery,
          filterGenus,
          selectedId,
          subview: activeSubview ? activeSubview.dataset.subtab : 'drives',
          listScrollTop: listEl.scrollTop,
          detailScrollTop: document.getElementById('crt-detail-content').scrollTop
        };
      },
      restore(saved) {
        if (!saved) return;
        filterQuery = saved.filterQuery || '';
        filterGenus = saved.filterGenus || 'all';
        filterSearch.value = filterQuery;
        filterGenusWrap.querySelectorAll('.crt-genus-btn').forEach(button =>
          button.classList.toggle(
            'crt-genus-btn--active',
            button.dataset.genus === filterGenus
          )
        );
        if (saved.subview) activateCreatureSubview(saved.subview);
        renderList();
        requestAnimationFrame(() => {
          listEl.scrollTop = Number(saved.listScrollTop) || 0;
          document.getElementById('crt-detail-content').scrollTop =
            Number(saved.detailScrollTop) || 0;
        });
      },
      open(route) {
        const requestedView = route.view === 'chemistry-intervene'
          ? 'chemistry' : route.view;
        if (requestedView && ['drives', 'chemistry', 'organs', 'brain', 'genome']
          .includes(requestedView)) {
          activateCreatureSubview(requestedView);
        }
        if (route.view === 'chemistry-intervene')
          activateChemistryView('syringe');
        const selection = route.selections && route.selections.creature;
        if (selection && String(selection.id) !== String(selectedId)) {
          selectedId = selection.id;
          fetchCreatures();
        }
      }
    });
  }

  // ── Chemistry internal tabs (Monitoring vs Intervene) ─────────────────
  function activateChemistryView(tab) {
    document.querySelectorAll('.crt-chem-tab-btn').forEach(button =>
      button.classList.toggle(
        'crt-chem-tab-btn--active', button.dataset.chemTab === tab)
    );
    document.querySelectorAll('.crt-chem-view').forEach(view => {
      const active = view.id === 'crt-chem-' + tab + '-view';
      view.hidden = !active;
      view.classList.toggle('crt-chem-view--active', active);
    });
  }

  document.querySelectorAll('.crt-chem-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activateChemistryView(btn.dataset.chemTab);
    });
  });

  // ── Reviewed chemical intervention workflow ───────────────────────────
  const InterventionModel = window.ChemicalInterventionModel;
  let selectedChemId = null;
  let syringeShowAll = false;
  let manualBaseline = null;
  let reviewedIntervention = null;
  let submissionState = InterventionModel.createSubmissionState();
  let lastInterventionResult = null;
  const syringeList = document.getElementById('crt-syringe-list');
  const syringeSearch = document.getElementById('crt-syringe-search');
  const syringeAction = document.getElementById('crt-syringe-action');
  const syringeSelectedName = document.getElementById('crt-syringe-selected-name');
  const syringeAmount = document.getElementById('crt-syringe-amount');
  const btnSyringeInject = document.getElementById('btn-syringe-inject');
  const syringeFeedback = document.getElementById('crt-syringe-feedback');
  const interventionDialog = document.getElementById('chemical-intervention-dialog');
  const dialogSummary = document.getElementById('chemical-dialog-summary');
  const dialogApply = document.getElementById('chemical-dialog-apply');
  const extremeConfirmRow = document.getElementById('chemical-extreme-confirm-row');
  const extremeConfirm = document.getElementById('chemical-extreme-confirm');
  const targetCreature = document.getElementById('chemical-target-creature');
  const currentValue = document.getElementById('chemical-current-value');
  const sampleTick = document.getElementById('chemical-sample-tick');
  const selectionFreshness = document.getElementById('chemical-selection-freshness');
  const pauseBehavior = document.getElementById('chemical-pause-behavior');
  const baselineStatus = document.getElementById('chemical-baseline-status');
  const captureBaselineButton = document.getElementById('chemical-capture-baseline');
  const previewBefore = document.getElementById('chemical-preview-before');
  const previewOperation = document.getElementById('chemical-preview-operation');
  const previewDose = document.getElementById('chemical-preview-dose');
  const previewAfter = document.getElementById('chemical-preview-after');
  const previewNote = document.getElementById('chemical-preview-note');
  const interventionWarning = document.getElementById('chemical-intervention-warning');
  const valueLabel = document.getElementById('chemical-value-label');
  const protocolPresetButton = document.querySelector(
    '[data-chemical-preset="protocol"]');

  function escapeInterventionHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function selectedCreature() {
    return creatures.find(creature => creature.agentId === selectedId) || null;
  }

  function selectedCreatureContext() {
    return ObservatoryState.getState().selection.creature || null;
  }

  function selectedOperation() {
    const input = document.querySelector(
      'input[name="chemical-operation"]:checked');
    return input && input.value === 'target' ? 'target' : 'adjust';
  }

  function currentChemicalValue() {
    if (!chemData || !Array.isArray(chemData.chemicals) ||
        selectedChemId == null) return null;
    const value = Number(chemData.chemicals[selectedChemId]);
    return Number.isFinite(value) ? value : null;
  }

  function protocolPreset() {
    const manifest = window.ExperimentWorkspace &&
      ExperimentWorkspace.getManifest();
    return InterventionModel.protocolPreset(manifest, selectedChemId);
  }

  function interventionPreview() {
    const state = ObservatoryState.getState();
    const world = state.world.identity;
    const selection = selectedCreatureContext() || {};
    const observedTick = chemData && Number(chemData.worldTick);
    const currentTick = Math.max(
      Number.isFinite(Number(state.world.tick)) ? Number(state.world.tick) : -1,
      Number.isFinite(observedTick) ? observedTick : -1
    );
    return InterventionModel.preview({
      chemicalId: selectedChemId,
      currentValue: currentChemicalValue(),
      requestedValue: syringeAmount.value,
      operation: selectedOperation(),
      sampleWorldTick: chemData && chemData.worldTick,
      currentWorldTick: currentTick < 0 ? null : currentTick,
      selectedWorldKey: selection.worldKey,
      currentWorldKey: world && world.key,
      creature: selection
    });
  }

  function baselineDescription() {
    const state = ObservatoryState.getState();
    const experiment = state.experiment;
    const world = state.world.identity;
    if (manualBaseline && world &&
        manualBaseline.worldKey === world.key &&
        manualBaseline.creatureId === selectedId &&
        manualBaseline.chemicalId === selectedChemId) {
      return {
        code: manualBaseline.experimentId
          ? 'experiment_baseline_completed' : 'manual_baseline',
        text: (manualBaseline.experimentId
          ? 'Experiment baseline' : 'Manual baseline') +
          ' captured at tick ' + manualBaseline.tick + '.',
        tick: manualBaseline.tick
      };
    }
    if (experiment && experiment.status === 'baseline') {
      return {
        code: 'experiment_baseline_recording',
        text: 'Experiment baseline is recording. Begin treatment before intervening.',
        tick: null
      };
    }
    return {
      code: 'skipped',
      text: 'Baseline not captured; the ledger will record that it was skipped.',
      tick: null
    };
  }

  function renderInterventionResult() {
    if (!lastInterventionResult) {
      syringeFeedback.textContent = '';
      return;
    }
    if (!lastInterventionResult.ok) {
      syringeFeedback.innerHTML =
        '<strong>Not applied.</strong> ' +
        escapeInterventionHtml(lastInterventionResult.error ||
          'The engine rejected the request.') +
        ' Refresh and review the live target again.';
      return;
    }
    const result = lastInterventionResult;
    syringeFeedback.innerHTML =
      '<strong>Engine confirmed:</strong> ' +
      Number(result.beforeValue).toFixed(3) + ' → ' +
      Number(result.afterValue).toFixed(3) +
      ' at world tick ' + escapeInterventionHtml(result.worldTick) +
      ' (' + (result.enginePaused ? 'world paused' : 'world running') + '). ' +
      '<button type="button" class="chemical-inverse-action" ' +
      'data-chemical-inverse>Prepare inverse adjustment ' +
      (Number(result.appliedChange) >= 0 ? '−' : '+') +
      Math.abs(Number(result.appliedChange)).toFixed(3) + '</button>' +
      '<span class="chemical-inverse-note">This is not an undo; metabolism ' +
      'and downstream effects may already have changed.</span>';
  }

  function renderChemicalIntervention() {
    if (!syringeAction || !InterventionModel) return;
    syringeAction.hidden = selectedChemId == null;
    if (selectedChemId == null) return;

    const state = ObservatoryState.getState();
    const creature = selectedCreature();
    const selection = selectedCreatureContext();
    const preview = interventionPreview();
    const baseline = baselineDescription();
    const preset = protocolPreset();
    const operation = selectedOperation();
    const value = currentChemicalValue();
    const age = preview.sampleAgeTicks;

    syringeSelectedName.textContent =
      'Chemical ' + selectedChemId + ' · ' + getChemicalName(selectedChemId) +
      ' (catalogue name)';
    targetCreature.textContent = creature
      ? (creature.name || 'Unnamed creature') + ' · agent #' +
        creature.agentId + ' · ' + (creature.moniker || 'moniker unavailable')
      : selection && selection.id != null
        ? 'Agent #' + selection.id + ' is not currently live'
        : 'No live creature selected';
    currentValue.textContent = value == null ? 'Unavailable' :
      value.toFixed(3) + ' observed';
    sampleTick.textContent = chemData && chemData.worldTick != null
      ? String(chemData.worldTick) : 'Unavailable';
    pauseBehavior.textContent = state.engine.paused
      ? 'Preserve paused state; no automatic resume'
      : state.engine.paused === false
        ? 'Preserve running state; main-thread operation'
        : 'Pause state unavailable; mutation disabled';
    baselineStatus.textContent = baseline.text;

    const freshnessStale = state.connection.status !== 'connected' ||
      age == null || age < 0 ||
      age > InterventionModel.STALE_AFTER_TICKS;
    selectionFreshness.classList.toggle(
      'freshness-chip--stale', freshnessStale);
    selectionFreshness.textContent =
      state.connection.status !== 'connected'
        ? 'Disconnected'
        : age == null
          ? 'No sample'
          : age > InterventionModel.STALE_AFTER_TICKS
            ? 'Stale · ' + age + ' ticks'
            : 'Fresh · ' + age + ' ticks old';

    valueLabel.textContent = operation === 'target'
      ? 'Target concentration' : 'Adjustment';
    syringeAmount.min = operation === 'target' ? '0' : '-1';
    syringeAmount.max = '1';
    previewBefore.textContent = value == null ? '—' : value.toFixed(3);
    previewOperation.textContent = operation === 'target' ? '→' :
      (preview.requestedValue != null && preview.requestedValue < 0 ? '−' : '+');
    previewDose.textContent = preview.requestedValue == null ? '—' :
      (operation === 'adjust'
        ? Math.abs(preview.requestedValue).toFixed(3)
        : preview.requestedValue.toFixed(3));
    previewAfter.textContent = preview.projectedValue == null ? '—' :
      preview.projectedValue.toFixed(3);
    previewNote.textContent = preview.valid
      ? (preview.clamped
        ? 'Derived preview using engine 0–1 clamping. Explicit confirmation required.'
        : 'Derived immediate numeric preview. This does not predict downstream biology.')
      : preview.errors.join(' ');
    interventionWarning.textContent = preview.warnings.join(' ');

    protocolPresetButton.disabled = !preset;
    protocolPresetButton.textContent = preset
      ? 'Protocol: ' + preset.operation + ' ' +
        (preset.requestedValue >= 0 ? '+' : '') + preset.requestedValue
      : 'Protocol-defined';
    btnSyringeInject.disabled = submissionState.pending ||
      !preview.valid || state.connection.status !== 'connected' ||
      state.engine.paused == null;
    btnSyringeInject.textContent = submissionState.pending
      ? 'Applying…' : 'Review intervention';
    captureBaselineButton.disabled = submissionState.pending ||
      selectedId == null || selectedChemId == null ||
      !selectedCreature() || state.connection.status !== 'connected' ||
      (state.experiment && state.experiment.status === 'treatment');
    renderInterventionResult();
  }

  function renderSyringeList() {
    if (!syringeList) return;
    const query = syringeSearch.value.toLowerCase().trim();
    let html = '';
    
    const matches = [];
    for (let i = 1; i < 256; i++) {
        const name = getChemicalName(i);
        const searchStr = `${i} ${name}`.toLowerCase();
        if (query && !searchStr.includes(query)) continue;
        matches.push({ id: i, name });
    }

    const limit = syringeShowAll ? matches.length : Math.min(5, matches.length);
    for (let i = 0; i < limit; i++) {
        const item = matches[i];
        const isSelected = item.id === selectedChemId;
        html += `<button type="button" class="crt-syringe-item ${isSelected ? 'crt-syringe-item--selected' : ''}" data-id="${item.id}" aria-pressed="${isSelected}">
          <span class="crt-chem-id">${item.id}</span> <span class="crt-chem-name">${item.name}</span>
        </button>`;
    }

    if (!syringeShowAll && matches.length > 5) {
        html += `<button type="button" class="crt-syringe-item crt-syringe-show-all">
          Show all ${matches.length} matches...
        </button>`;
    }
    
    DomPatch.update(syringeList, html);
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
      lastInterventionResult = null;
      reviewedIntervention = null;
      renderSyringeList();
      if (selectedId != null) fetchChemistry(selectedId);
      renderChemicalIntervention();
      if (ObservatoryState.getState().experiment.status === 'baseline') {
        captureInterventionBaseline();
      }
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

  async function captureInterventionBaseline() {
    if (selectedId == null || selectedChemId == null) return;
    BiologicalMonitor.pinMetric('chemical:' + selectedChemId);
    const refreshed = await fetchChemistry(selectedId);
    if (!refreshed) {
      lastInterventionResult = {
        ok: false,
        error: 'Could not capture a fresh chemistry sample.'
      };
      renderChemicalIntervention();
      return;
    }
    const tick = BiologicalMonitor.captureBaseline();
    const world = ObservatoryState.getState().world.identity;
    if (tick == null || !world) {
      lastInterventionResult = {
        ok: false,
        error: 'No active biological series was available for the baseline.'
      };
    } else {
      manualBaseline = {
        worldKey: world.key,
        creatureId: selectedId,
        chemicalId: selectedChemId,
        tick,
        experimentId: ObservatoryState.getState().experiment.status ===
          'baseline'
          ? ObservatoryState.getState().experiment.id : null
      };
      lastInterventionResult = null;
      if (window.ExperimentWorkspace &&
          ObservatoryState.getState().experiment.status === 'baseline') {
        ExperimentWorkspace.sampleNow();
      }
    }
    renderChemicalIntervention();
  }

  async function reviewChemicalIntervention() {
    if (submissionState.pending || selectedId == null ||
        selectedChemId == null) return;
    if (ObservatoryState.getState().experiment.status === 'baseline') {
      lastInterventionResult = {
        ok: false,
        error: 'Experiment baseline is still recording. Begin the treatment window before applying the planned intervention.'
      };
      renderChemicalIntervention();
      return;
    }
    btnSyringeInject.disabled = true;
    btnSyringeInject.textContent = 'Refreshing target…';
    const refreshed = await fetchChemistry(selectedId);
    const preview = interventionPreview();
    if (!refreshed || !preview.valid) {
      lastInterventionResult = {
        ok: false,
        error: preview.errors.join(' ') ||
          'The live target could not be refreshed.'
      };
      renderChemicalIntervention();
      return;
    }
    const state = ObservatoryState.getState();
    const selection = selectedCreatureContext();
    const baseline = baselineDescription();
    reviewedIntervention = Object.freeze({
      preview,
      creatureId: Number(selection.id),
      moniker: selection.moniker,
      creatureLabel: (selectedCreature() &&
        (selectedCreature().name || 'Unnamed creature')) || 'Creature',
      chemicalName: getChemicalName(selectedChemId),
      worldName: state.world.identity.name,
      worldSessionId: state.world.identity.sessionId,
      worldKey: state.world.identity.key,
      pauseState: state.engine.paused,
      baseline
    });

    dialogSummary.innerHTML =
      '<dl class="chemical-dialog-facts">' +
      '<div><dt>Creature</dt><dd>' +
      escapeInterventionHtml(reviewedIntervention.creatureLabel) +
      ' · agent #' + reviewedIntervention.creatureId +
      ' · ' + escapeInterventionHtml(reviewedIntervention.moniker) +
      '</dd></div>' +
      '<div><dt>Chemical</dt><dd>' + selectedChemId + ' · ' +
      escapeInterventionHtml(reviewedIntervention.chemicalName) + '</dd></div>' +
      '<div><dt>Operation</dt><dd>' +
      (preview.operation === 'adjust'
        ? 'Adjust concentration by ' +
          (preview.requestedValue >= 0 ? '+' : '') +
          preview.requestedValue.toFixed(3)
        : 'Set target concentration to ' +
          preview.requestedValue.toFixed(3)) + '</dd></div>' +
      '<div><dt>Immediate projection</dt><dd>' +
      preview.currentValue.toFixed(3) + ' → ' +
      preview.projectedValue.toFixed(3) +
      (preview.clamped ? ' · clamped' : '') + '</dd></div>' +
      '<div><dt>Reviewed sample</dt><dd>World tick ' +
      preview.sampleWorldTick + ' · ' +
      escapeInterventionHtml(reviewedIntervention.worldName) + '</dd></div>' +
      '<div><dt>Pause behavior</dt><dd>Preserve ' +
      (reviewedIntervention.pauseState ? 'paused' : 'running') +
      ' state</dd></div>' +
      '<div><dt>Baseline record</dt><dd>' +
      escapeInterventionHtml(baseline.text) + '</dd></div>' +
      '</dl>';
    extremeConfirm.checked = false;
    extremeConfirmRow.hidden = !preview.requiresExtremeConfirmation;
    dialogApply.disabled = preview.requiresExtremeConfirmation;
    interventionDialog.showModal();
  }

  async function applyReviewedIntervention() {
    if (!reviewedIntervention) return;
    if (reviewedIntervention.preview.requiresExtremeConfirmation &&
        !extremeConfirm.checked) return;
    const attempt = InterventionModel.beginSubmission(
      submissionState, reviewedIntervention.preview.token);
    submissionState = attempt.state;
    if (!attempt.accepted) {
      lastInterventionResult = { ok: false, error: attempt.error };
      renderChemicalIntervention();
      return;
    }
    const reviewed = reviewedIntervention;
    const preview = reviewed.preview;
    interventionDialog.close();
    renderChemicalIntervention();
    try {
      const resp = await fetch(
        '/api/creature/' + reviewed.creatureId +
          '/chemical-intervention', {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chemicalId: preview.chemicalId,
            operation: preview.operation,
            requestedValue: preview.requestedValue,
            confirmedWorldName: reviewed.worldName,
            reviewedWorldSessionId: reviewed.worldSessionId,
            expectedMoniker: reviewed.moniker,
            sampleWorldTick: preview.sampleWorldTick,
            expectedConcentration: preview.currentValue,
            extremeConfirmed: preview.requiresExtremeConfirmation,
            pauseMode: 'preserve',
            baselineStatus: reviewed.baseline.code,
            baselineTick: reviewed.baseline.tick,
            followUpMeasurements: [
              'chemical:' + preview.chemicalId,
              'pinned biological signals',
              'drives',
              'attention and decision',
              'behaviour timeline',
              'available organ readings'
            ]
          })
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        lastInterventionResult = {
          ok: false,
          error: data.error || 'The engine rejected the intervention.'
        };
        return;
      }
      lastInterventionResult = data;
      ObservatoryState.addIntervention({
        id: 'chemical-intervention-' + data.correlationId,
        type: 'chemical_intervention',
        target: {
          creatureId: reviewed.creatureId,
          moniker: reviewed.moniker,
          chemicalId: preview.chemicalId,
          chemicalName: reviewed.chemicalName
        },
        worldKey: reviewed.worldKey,
        tick: data.worldTick,
        source: 'Creatures / Chemistry / Intervene',
        parameters: {
          chemicalId: preview.chemicalId,
          operation: preview.operation,
          requestedValue: preview.requestedValue,
          requestedChange: data.requestedChange,
          projectedImmediateValue: data.projectedImmediateValue,
          clamped: data.clamped,
          pauseBehavior: data.pauseBehavior,
          baselineStatus: reviewed.baseline.code,
          baselineTick: reviewed.baseline.tick
        },
        reason: 'Reviewed Developer Tools chemical intervention',
        result: {
          beforeValue: data.beforeValue,
          afterValue: data.afterValue,
          appliedChange: data.appliedChange,
          worldTick: data.worldTick,
          systemTick: data.systemTick,
          enginePaused: data.enginePaused,
          warning: data.warning || null
        }
      });
      BiologicalMonitor.pinMetric('chemical:' + preview.chemicalId);
      await fetchChemistry(reviewed.creatureId);
      [2000, 6000].forEach(delay => {
        setTimeout(() => {
          if (selectedId === reviewed.creatureId &&
              selectedChemId === preview.chemicalId) {
            fetchChemistry(reviewed.creatureId);
          }
        }, delay);
      });
    } catch (error) {
      console.warn('DevTools: chemical intervention request failed', error);
      lastInterventionResult = {
        ok: false,
        error: 'Connection failed during submission; refresh before deciding whether to retry.'
      };
    } finally {
      submissionState = InterventionModel.finishSubmission(submissionState);
      reviewedIntervention = null;
      renderChemicalIntervention();
    }
  }

  document.querySelectorAll('input[name="chemical-operation"]').forEach(input => {
    input.addEventListener('change', renderChemicalIntervention);
  });
  syringeAmount.addEventListener('input', renderChemicalIntervention);
  document.querySelectorAll('[data-chemical-preset]').forEach(button => {
    button.addEventListener('click', () => {
      const presetName = button.dataset.chemicalPreset;
      let operation = 'adjust';
      let value = presetName === 'negative'
        ? -InterventionModel.SMALL_DOSE : InterventionModel.SMALL_DOSE;
      if (presetName === 'protocol') {
        const preset = protocolPreset();
        if (!preset) return;
        operation = preset.operation;
        value = preset.requestedValue;
      }
      const operationInput = document.querySelector(
        'input[name="chemical-operation"][value="' + operation + '"]');
      if (operationInput) operationInput.checked = true;
      syringeAmount.value = String(value);
      renderChemicalIntervention();
    });
  });
  captureBaselineButton.addEventListener('click', captureInterventionBaseline);

  if (btnSyringeInject) {
    btnSyringeInject.addEventListener('click', reviewChemicalIntervention);
  }

  extremeConfirm.addEventListener('change', () => {
    dialogApply.disabled = !extremeConfirm.checked;
  });
  dialogApply.addEventListener('click', applyReviewedIntervention);
  interventionDialog.addEventListener('click', event => {
    if (event.target === interventionDialog) interventionDialog.close();
  });
  interventionDialog.addEventListener('close', () => {
    extremeConfirm.checked = false;
  });
  syringeFeedback.addEventListener('click', event => {
    if (!event.target.closest('[data-chemical-inverse]') ||
        !lastInterventionResult || !lastInterventionResult.ok) return;
    const adjustment = -Number(lastInterventionResult.appliedChange);
    const operationInput = document.querySelector(
      'input[name="chemical-operation"][value="adjust"]');
    operationInput.checked = true;
    syringeAmount.value = adjustment.toFixed(6);
    lastInterventionResult = null;
    renderChemicalIntervention();
    syringeAmount.focus();
  });
  ObservatoryState.subscribe(
    state => [
      state.connection.status,
      state.engine.paused,
      state.world.tick,
      state.world.identity && state.world.identity.key,
      state.experiment.status
    ].join(':'),
    renderChemicalIntervention
  );
  setInterval(renderChemicalIntervention, 1000);

})();
