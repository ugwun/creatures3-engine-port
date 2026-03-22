// ── Creatures Tab ──────────────────────────────────────────────────────────
// Live creature inspector: drives, chemistry, summary card.
// Polls /api/creatures every 2s with optional /api/creature/:id/chemistry.

(function () {
  'use strict';

  // ── Chemical name lookup (hardcoded ~50 well-known chemicals) ───────────
  const CHEMICAL_NAMES = {
    0: '(none)',
    1: 'Antioxidant', 2: 'ASH2Dehydrogenase', 3: 'AIR',
    4: 'Glycogen', 5: 'Glucose', 6: 'Amino Acid',
    7: 'Starch', 8: 'Fat', 9: 'Protein',
    10: 'Carbon Dioxide', 11: 'Urea', 12: 'Ammonia',
    13: 'Glucogen', 14: 'Triglyceride',
    24: 'Antibody 0', 25: 'Antibody 1', 26: 'Antibody 2', 27: 'Antibody 3',
    28: 'Antibody 4', 29: 'Antibody 5', 30: 'Antibody 6', 31: 'Antibody 7',
    33: 'Histamine A', 34: 'Histamine B',
    35: 'ATP', 36: 'ADP',
    40: 'Prostaglandin', 41: 'Adipose Tissue',
    46: 'Testosterone', 47: 'Oestrogen',
    48: 'Progesterone', 49: 'Gonadotrophin',
    50: 'EDTA', 51: 'Sodium Thiosulphate',
    56: 'Geddonase',
    82: 'Antigen 0', 83: 'Antigen 1', 84: 'Antigen 2', 85: 'Antigen 3',
    86: 'Antigen 4', 87: 'Antigen 5', 88: 'Antigen 6', 89: 'Antigen 7',
    127: 'Injury',
    148: 'Pain', 149: 'Need for Pleasure',
    150: 'Hunger', 151: 'Hunger for Protein',
    152: 'Hunger for Carb', 153: 'Hunger for Fat',
    154: 'Tiredness', 155: 'Sleepiness',
    156: 'Loneliness', 157: 'Crowdedness',
    158: 'Fear', 159: 'Boredom',
    160: 'Anger', 161: 'Sex Drive',
    162: 'Comfort',
    163: 'UP', 164: 'DOWN',
    165: 'Smell 0', 166: 'Smell 1', 167: 'Smell 2', 168: 'Smell 3',
    169: 'Smell 4', 170: 'Smell 5', 171: 'Smell 6', 172: 'Smell 7',
    173: 'Smell 8', 174: 'Smell 9', 175: 'Smell 10', 176: 'Smell 11',
    177: 'Smell 12', 178: 'Smell 13', 179: 'Smell 14', 180: 'Smell 15',
    181: 'Smell 16', 182: 'Smell 17', 183: 'Smell 18', 184: 'Smell 19',
    209: 'Reward', 210: 'Punishment',
    211: 'Reinforcement', 212: 'ConASH1',
    247: 'Alcohol', 248: 'Defibrillator', 249: 'Medicine One',
    250: 'Medicine Two', 251: 'Medicine Three',
    252: 'Arnica', 253: 'Vitamin E', 254: 'Vitamin C', 255: 'Drowsiness',
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
      // Network error — ignore
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
      // ignore
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

    // Organ status  (if chemistry data loaded)
    if (chemData && chemData.organs && chemData.organs.length > 0) {
      html += '<div class="crt-summary-section-title">Organs</div>';
      html += '<div class="crt-organ-list">';
      for (const organ of chemData.organs) {
        const status = organ.failed ? 'failed' : (organ.functioning ? 'ok' : 'impaired');
        const statusCls = organ.failed ? 'crt-organ--failed' : (organ.functioning ? 'crt-organ--ok' : 'crt-organ--impaired');
        html += '<div class="crt-organ-item ' + statusCls + '">' +
          '<span class="crt-organ-idx">Organ ' + organ.index + '</span>' +
          '<span class="crt-organ-status">' + status + '</span>' +
          '<span class="crt-organ-lf">LF: ' + (organ.longTermLifeForce ? organ.longTermLifeForce.toFixed(2) : '?') + '</span>' +
        '</div>';
      }
      html += '</div>';
    }

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

})();
