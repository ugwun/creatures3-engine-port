// ── Organs Sub-Tab ────────────────────────────────────────────────────────
// Live organ inspector: shows receptors, emitters, reactions per organ.
// Fetches /api/creature/:id/organs on creature selection and sub-tab switch.

(() => {
  'use strict';

  // ── Chemical name lookup (shared with creatures.js) ─────────────────
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
  function chemName(id) {
    return CHEMICAL_NAMES[id] || ('Chemical ' + id);
  }

  // ── Organ target names ─────────────────────────────────────────────
  const ORGAN_NAMES = { 0: 'Brain', 1: 'Creature', 2: 'Organ', 3: 'Reaction' };
  const TISSUE_NAMES = {
    0: 'Somatic', 1: 'Circulatory', 2: 'Reproductive',
    3: 'Immune', 4: 'Sensorimotor', 5: 'Drives'
  };

  // Receptor effect flags
  function receptorEffectStr(e) {
    const parts = [];
    if (e & 1) parts.push('Reduce');
    else parts.push('Raise');
    if (e & 2) parts.push('Digital');
    else parts.push('Analogue');
    return parts.join(', ');
  }

  // Emitter effect flags
  function emitterEffectStr(e) {
    const parts = [];
    if (e & 1) parts.push('Clear source');
    if (e & 2) parts.push('Digital');
    else parts.push('Analogue');
    if (e & 4) parts.push('Inverted');
    return parts.join(', ');
  }

  // ── Locus name resolution ──────────────────────────────────────────
  function locusLabel(organId, tissue, locus) {
    if (organId === 2) { // ORGAN_ORGAN
      const names = ['Clock Rate', 'Rate of Repair', 'Injury'];
      return names[locus] || ('Locus ' + locus);
    }
    if (organId === 3) { // ORGAN_REACTION
      return 'Reaction ' + tissue + ' Rate';
    }
    if (organId === 0) { // BRAIN
      return 'Lobe ' + tissue + ' Neuron ' + locus;
    }
    if (organId === 1) { // CREATURE
      const tissueName = TISSUE_NAMES[tissue] || ('Tissue ' + tissue);
      return tissueName + ':' + locus;
    }
    return ORGAN_NAMES[organId] + ':' + tissue + ':' + locus;
  }

  // ── Biochemical Duck Typing ────────────────────────────────────────
  function guessOrganName(organ) {
    if (organ.index === 0) return "Brain";
    
    const chemicals = new Set();
    if (organ.reactions) {
        for (const r of organ.reactions) {
            chemicals.add(r.r1); chemicals.add(r.r2); chemicals.add(r.p1); chemicals.add(r.p2);
        }
    }
    if (organ.emitters) {
        for (const e of organ.emitters) chemicals.add(e.chemical);
    }
    if (organ.receptors) {
        for (const r of organ.receptors) chemicals.add(r.chemical);
    }
    chemicals.delete(0); // Ignore '(none)'

    // Lungs: Exchanging Air (29) / Oxygen (30)
    if (chemicals.has(29) && chemicals.has(30)) return "Lungs";
    
    // Stomach: Starch (5)/Protein (12) to Glucose (3)/Amino Acid (13)
    if (chemicals.has(5) && chemicals.has(3)) return "Stomach / Digestion";
    if (chemicals.has(12) && chemicals.has(13)) return "Stomach / Digestion";
    
    // Liver: Detoxes Heavy Metals (66), Belladonna (68), Glycotoxin (70), Alcohol (75, 247)
    if (chemicals.has(66) || chemicals.has(68) || chemicals.has(70) || chemicals.has(75) || chemicals.has(247)) return "Liver / Detox";
    
    // Immune System: Antibodies (102-109, 27, 28, 31)
    for (const c of [27, 28, 31, 102, 103, 104, 105, 106, 107, 108, 109]) {
        if (chemicals.has(c)) return "Immune System / Bone Marrow";
    }
    
    // Muscle: ATP (35) to ADP (36)
    if (chemicals.has(35) && chemicals.has(36)) return "Muscle Tissue";
    
    // Reproductive: Testosterone (53), Oestrogen (46, 47), Progesterone (48)
    if (chemicals.has(53) || chemicals.has(46) || chemicals.has(47) || chemicals.has(48)) return "Reproductive System";

    // Skin/Adipose: Adipose Tissue (9)
    if (chemicals.has(9)) return "Adipose (Fat Stores)";
    
    // Spleen/Blood: Antigens (82-89)
    for (let c=82; c<=89; c++) {
        if (chemicals.has(c)) return "Blood / Spleen";
    }
    
    if (organ.index === 1) return "Heart / Core";

    return null;
  }

  // ── State ──────────────────────────────────────────────────────────
  let organsData = null;
  let selectedCreatureId = null;
  let expandedOrgans = new Set();

  const contentEl = document.getElementById('crt-organs-content');

  // ── Fetch organs ───────────────────────────────────────────────────
  async function fetchOrgans(agentId) {
    if (!agentId) return;
    try {
      const resp = await fetch('/api/creature/' + agentId + '/organs');
      if (!resp.ok) return;
      organsData = await resp.json();
      if (organsData.error) { organsData = null; return; }
      renderOrgans();
    } catch (e) {
      console.warn('DevTools: organs fetch failed', e);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────
  function renderOrgans() {
    if (!organsData || !organsData.organs) {
      contentEl.innerHTML = '<div class="crt-empty-hint">No organ data</div>';
      return;
    }

    let html = '<div class="org-list">';
    for (const organ of organsData.organs) {
      const isExpanded = expandedOrgans.has(organ.index);
      const status = organ.failed ? 'failed' : (organ.functioning ? 'ok' : 'impaired');
      const statusCls = 'org-status--' + status;
      const healthPct = organ.initialLifeForce > 0
        ? Math.round((organ.longTermLifeForce / organ.initialLifeForce) * 100)
        : 0;

      html += '<div class="org-card' + (isExpanded ? ' org-card--expanded' : '') + '" data-organ="' + organ.index + '">';

      // Card header
      const guessedName = guessOrganName(organ);
      const titleStr = guessedName ? `Organ ${organ.index}: ${guessedName}` : `Organ ${organ.index}`;

      html += '<div class="org-card-header" data-organ-toggle="' + organ.index + '">';
      html += '<span class="org-expand-icon">' + (isExpanded ? '▾' : '▸') + '</span>';
      html += '<span class="org-card-title">' + titleStr + '</span>';
      html += '<span class="org-status-badge ' + statusCls + '">' + status.toUpperCase() + '</span>';
      html += '<span class="org-health-mini">';
      html += '<span class="org-health-bar-mini"><span class="org-health-fill-mini" style="width:' + healthPct + '%"></span></span>';
      html += healthPct + '%</span>';
      html += '<span class="org-counts">';
      html += '<span class="org-count-badge org-count-r" title="Receptors">R:' + organ.receptorCount + '</span>';
      html += '<span class="org-count-badge org-count-e" title="Emitters">E:' + organ.emitterCount + '</span>';
      html += '<span class="org-count-badge org-count-x" title="Reactions">X:' + organ.reactionCount + '</span>';
      html += '</span>';
      html += '</div>';

      // Expanded detail
      if (isExpanded) {
        html += '<div class="org-card-detail">';

        // Organ stats
        html += '<div class="org-stats">';
        html += '<div class="org-stat"><span class="org-stat-label">Clock Rate</span><span class="org-stat-value">' + organ.clockRate.toFixed(3) + '</span></div>';
        html += '<div class="org-stat"><span class="org-stat-label">Energy Cost</span><span class="org-stat-value">' + organ.energyCost.toFixed(4) + '</span></div>';
        html += '<div class="org-stat"><span class="org-stat-label">Life Force (ST)</span><span class="org-stat-value">' + organ.shortTermLifeForce.toFixed(0) + '</span></div>';
        html += '<div class="org-stat"><span class="org-stat-label">Life Force (LT)</span><span class="org-stat-value">' + organ.longTermLifeForce.toFixed(0) + '</span></div>';
        html += '<div class="org-stat"><span class="org-stat-label">Rate of Repair</span><span class="org-stat-value">' + organ.longTermRateOfRepair.toFixed(4) + '</span></div>';
        html += '<div class="org-stat"><span class="org-stat-label">Damage (0 ATP)</span><span class="org-stat-value">' + organ.damageDueToZeroEnergy.toFixed(0) + '</span></div>';
        html += '</div>';

        // Reactions
        if (organ.reactions && organ.reactions.length > 0) {
          html += '<div class="org-section">';
          html += '<div class="org-section-title">Reactions <span class="org-section-count">' + organ.reactions.length + '</span></div>';
          for (let ri = 0; ri < organ.reactions.length; ri++) {
            const rn = organ.reactions[ri];
            html += '<div class="org-reaction">';
            html += renderReaction(rn, ri);
            html += '</div>';
          }
          html += '</div>';
        }

        // Receptors
        if (organ.receptors && organ.receptors.length > 0) {
          html += '<div class="org-section">';
          html += '<div class="org-section-title">Receptors <span class="org-section-count">' + organ.receptors.length + '</span></div>';
          html += '<div class="org-table-wrap"><table class="org-table">';
          html += '<thead><tr><th>Chemical</th><th>Target Locus</th><th>Threshold</th><th>Nominal</th><th>Gain</th><th>Effect</th></tr></thead><tbody>';
          for (const r of organ.receptors) {
            const chemLabel = r.chemical === 0 ? '<span class="org-muted">(none)</span>' : '<span class="org-chem-tag">' + chemName(r.chemical) + '</span>';
            html += '<tr>';
            html += '<td>' + chemLabel + '</td>';
            html += '<td class="org-locus">' + locusLabel(r.organ, r.tissue, r.locus) + '</td>';
            html += '<td>' + r.threshold.toFixed(2) + '</td>';
            html += '<td>' + r.nominal.toFixed(2) + '</td>';
            html += '<td>' + r.gain.toFixed(2) + '</td>';
            html += '<td class="org-effect">' + receptorEffectStr(r.effect) + '</td>';
            html += '</tr>';
          }
          html += '</tbody></table></div>';
          html += '</div>';
        }

        // Emitters
        if (organ.emitters && organ.emitters.length > 0) {
          html += '<div class="org-section">';
          html += '<div class="org-section-title">Emitters <span class="org-section-count">' + organ.emitters.length + '</span></div>';
          html += '<div class="org-table-wrap"><table class="org-table">';
          html += '<thead><tr><th>Source Locus</th><th>Emits Chemical</th><th>Threshold</th><th>Gain</th><th>Rate</th><th>Effect</th></tr></thead><tbody>';
          for (const em of organ.emitters) {
            const chemLabel = em.chemical === 0 ? '<span class="org-muted">(none)</span>' : '<span class="org-chem-tag">' + chemName(em.chemical) + '</span>';
            html += '<tr>';
            html += '<td class="org-locus">' + locusLabel(em.organ, em.tissue, em.locus) + '</td>';
            html += '<td>' + chemLabel + '</td>';
            html += '<td>' + em.threshold.toFixed(2) + '</td>';
            html += '<td>' + em.gain.toFixed(2) + '</td>';
            html += '<td>' + em.bioTickRate.toFixed(3) + '</td>';
            html += '<td class="org-effect">' + emitterEffectStr(em.effect) + '</td>';
            html += '</tr>';
          }
          html += '</tbody></table></div>';
          html += '</div>';
        }

        html += '</div>';
      }
      html += '</div>';
    }
    html += '</div>';
    contentEl.innerHTML = html;

    // Wire up expand/collapse toggles
    contentEl.querySelectorAll('[data-organ-toggle]').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.organToggle);
        if (expandedOrgans.has(idx)) expandedOrgans.delete(idx);
        else expandedOrgans.add(idx);
        renderOrgans();
      });
    });
  }

  // ── Render a single reaction as a formula ──────────────────────────
  function renderReaction(rn, index) {
    let html = '<span class="org-rxn-index">#' + index + '</span> ';

    // Reactants side
    const reactants = [];
    if (rn.r1 !== 0) {
      reactants.push((rn.propR1 > 1 ? rn.propR1.toFixed(0) : '') + '<span class="org-chem-tag">' + chemName(rn.r1) + '</span>');
    }
    if (rn.r2 !== 0) {
      reactants.push((rn.propR2 > 1 ? rn.propR2.toFixed(0) : '') + '<span class="org-chem-tag">' + chemName(rn.r2) + '</span>');
    }
    if (reactants.length === 0) reactants.push('<span class="org-muted">∅</span>');

    // Products side
    const products = [];
    if (rn.p1 !== 0) {
      products.push((rn.propP1 > 1 ? rn.propP1.toFixed(0) : '') + '<span class="org-chem-tag">' + chemName(rn.p1) + '</span>');
    }
    if (rn.p2 !== 0) {
      products.push((rn.propP2 > 1 ? rn.propP2.toFixed(0) : '') + '<span class="org-chem-tag">' + chemName(rn.p2) + '</span>');
    }
    if (products.length === 0) products.push('<span class="org-muted">∅</span>');

    // Rate indicator
    const ratePct = Math.round((1 - rn.rate) * 100);
    const rateHue = Math.round(120 * (1 - rn.rate)); // green=slow, red=fast

    html += '<span class="org-rxn-formula">';
    html += reactants.join(' + ');
    html += ' <span class="org-rxn-arrow">→</span> ';
    html += products.join(' + ');
    html += '</span>';
    html += '<span class="org-rxn-rate" title="Rate (0%=fast, 100%=slow)"><span class="org-rxn-rate-bar" style="width:' + ratePct + '%;background:hsl(' + rateHue + ',60%,45%)"></span>' + ratePct + '%</span>';

    return html;
  }

  // ── Listen for creature selection ──────────────────────────────────
  DevToolsEvents.on('creature:selected', (agentId) => {
    selectedCreatureId = agentId;
    // Only fetch if Organs sub-tab is currently visible
    const organsView = document.getElementById('crt-organs');
    if (organsView && !organsView.hidden) {
      fetchOrgans(agentId);
    }
  });

  // ── Listen for sub-tab switches ────────────────────────────────────
  document.querySelectorAll('.crt-sub-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.subtab === 'organs' && selectedCreatureId) {
        fetchOrgans(selectedCreatureId);
      }
    });
  });

})();
