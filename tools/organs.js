// ── Organs Sub-Tab ────────────────────────────────────────────────────────
// Live organ inspector: shows receptors, emitters, reactions per organ.
// Fetches /api/creature/:id/organs on creature selection and sub-tab switch.

(() => {
  'use strict';

  // ── Chemical name lookup (shared with creatures.js) ─────────────────
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
      html += '<div class="org-card-header" data-organ-toggle="' + organ.index + '">';
      html += '<span class="org-expand-icon">' + (isExpanded ? '▾' : '▸') + '</span>';
      html += '<span class="org-card-title">Organ ' + organ.index + '</span>';
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
