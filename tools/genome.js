// ── Genome Tab — Gene Inspector ──────────────────────────────────────────
// Linear gene-by-gene viewer for a creature's genetics, matching the old
// Genetics Kit functionality but using Bright-Fi styling.

(() => {
  'use strict';

  // State
  let genomeData = null; 
  let currentFilter = 'all'; // all, brain, biochemistry, creature, organ
  let currentSearch = '';
  let currentAgeFilter = 'all'; // all, 0-6
  let selectedCreatureId = null;
  let isFetching = false;

  // DOM Refs
  const genomeContent = document.getElementById('crt-genome-content');
  const genomeSearch = document.getElementById('crt-genome-search');
  const genomeAge = document.getElementById('crt-genome-age');
  const filterRadios = document.querySelectorAll('input[name="gfilter"]');

  // We are updated from devtools events
  DevToolsEvents.on('creature:selected', (id) => {
    selectedCreatureId = id;
    if (document.getElementById('crt-genome').classList.contains('crt-subview--active')) {
      fetchGenome();
    } else {
      genomeData = null; // Stale, require refetch
    }
  });

  DevToolsEvents.on('tab:subview:genome', () => {
    if (!genomeData && selectedCreatureId) {
      fetchGenome();
    }
  });

  // Event Listeners for Filters
  filterRadios.forEach(r => r.addEventListener('change', () => {
    currentFilter = r.value;
    renderGenome();
  }));

  genomeSearch.addEventListener('input', (e) => {
    currentSearch = e.target.value.toLowerCase();
    renderGenome();
  });

  genomeAge.addEventListener('change', (e) => {
    currentAgeFilter = e.target.value;
    renderGenome();
  });

  async function fetchGenome() {
    if (!selectedCreatureId || isFetching) return;
    isFetching = true;
    genomeContent.innerHTML = '<div class="crt-empty-hint">Loading genetics...</div>';

    try {
      const resp = await fetch('/api/creature/' + selectedCreatureId + '/genome');
      if (!resp.ok) throw new Error('API Error');
      const data = await resp.json();
      
      if (data.error) {
        genomeContent.innerHTML = '<div class="crt-empty-hint">Error: ' + data.error + '</div>';
        genomeData = null;
      } else {
        genomeData = data;
        renderGenome();
      }
    } catch (e) {
      console.warn('DevTools: genome fetch failed', e);
      genomeContent.innerHTML = '<div class="crt-empty-hint">Failed to load genome.</div>';
    } finally {
      isFetching = false;
    }
  }

  // Colours per Main Type
  function getGeneColor(type) {
    if (type === 0) return 'var(--magenta)'; // Brain
    if (type === 1) return 'var(--orange)'; // Biochemistry
    if (type === 2) return 'var(--blue)'; // Creature
    if (type === 3) return '#00ff88'; // Organ
    return '#888';
  }

  // Chemical Names
  const CHEMS = [
    '<span class="chem-placeholder">0</span>', // 0 is empty/unused
    "Pain", "Need for Pleasure", "Hunger", "Coldness", "Hotness", "Tiredness", "Sleepiness", "Loneliness",
    "Crowdedness", "Fear", "Boredom", "Anger", "Arousal", "Pain (14)", "Pain (15)", "Pain (16)", 
    "Reward", "Punishement", "Arousal (19)", "Anticipation", "Creatin", "Muscle Toxins", "N.S Toxins", "Blood Toxins",
    "Bacterial Toxins", "Starch", "Protein", "Fat", "Sugar", "Glycogen", "Adipose", "ATP", 
    "Cholesterol", "Water", "Calcium", "Phosphorus", "Zincali", "Prostaglandin", "C1", "C2",
    "Antibody 1", "Antibody 2", "Antibody 3", "Antibody 4", "Antibody 5", "Antibody 6", "Antibody 7", "Antigen 1",
    "Antigen 2", "Antigen 3", "Antigen 4", "Antigen 5", "Antigen 6", "Antigen 7", "Sleep Toxin", "Air", 
    "Carbon Dioxide", "Hexokinase", "Glucokinase", "G-6-Ptase", "P-fructokinase", "Fuctosediphosphatase", "G-3-P Dehydrognse", "Pyruvate Kinase",
    "PEP Carboxykinase", "Pyruvate Cboxylse", "A-K Glutarate DHase", "Transaminase", "Acyl-CoA-Synthetase", "Lactosedehydrognse", "Lipase", "Diglyceride AcylXse",
    "Glucogen Synthetase", "Glycogen P-ylase", "Protease", "Histamine", "Estrogen", "Progesterone", "Lutenizing Hormone", "F.S.Hormone",
    "Testosterone", "Prostiglandin 82", "Prostiglandin 83"
  ];
  function getChemName(id) {
    if (id < CHEMS.length) return CHEMS[id];
    return "Chem " + id;
  }

  function renderGeneCard(gene) {
    // Top-row badges format
    const c = getGeneColor(gene.type);
    let html = `<div class="crt-gene-card" style="border-left: 3px solid ${c}">`;
    html += `<div class="crt-gene-header">`;
    html += `<span class="crt-gene-title">${gene.typeName} — ${gene.subtypeName} <span class="crt-gene-id">#${gene.id}</span></span>`;
    
    // Badges container
    html += `<div class="crt-gene-badges">`;
    const mFlags = [];
    if (gene.flags.mutable) mFlags.push('M');
    if (gene.flags.dupable) mFlags.push('D');
    if (gene.flags.cutable) mFlags.push('C');
    if (mFlags.length) html += `<span class="crt-gene-badge crt-gene-badge-mut">${mFlags.join('')}</span>`;
    
    if (gene.flags.maleOnly) html += `<span class="crt-gene-badge crt-gene-badge-sex">♂</span>`;
    if (gene.flags.femaleOnly) html += `<span class="crt-gene-badge crt-gene-badge-sex">♀</span>`;
    if (gene.flags.dormant) html += `<span class="crt-gene-badge crt-gene-badge-dormant">Dormant</span>`;

    html += `<span class="crt-gene-badge crt-gene-badge-gen">Gen ${gene.generation}</span>`;
    html += `<span class="crt-gene-badge crt-gene-badge-age">@ ${gene.switchOnLabel}</span>`;
    html += `</div></div>`; // End headers

    html += `<div class="crt-gene-body">`;
    html += renderGeneData(gene);
    html += `</div></div>`;
    return html;
  }

  function renderGeneData(gene) {
    const d = gene.data;
    let html = '<div class="crt-gene-grid">';
    
    function row(label, val) {
      return `<div class="crt-gene-row"><span class="crt-gene-label">${label}:</span> <span class="crt-gene-val">${val}</span></div>`;
    }

    if (gene.type === 0) { // Brain
      if (gene.subtype === 0) { // Lobe
        html += row('Lobe Name', window.engineFormat ? window.engineFormat.escapeHtml(d.lobeName) : d.lobeName);
        html += row('Bounds', `${d.x}, ${d.y} (${d.width}x${d.height})`);
        html += row('Color', `rgb(${d.red}, ${d.green}, ${d.blue})`);
        html += row('WTA', d.wta);
        html += `</div>`; // close grid
        
        html += `<div class="crt-svrule-container">`;
        html += `<div class="crt-svrule-title">Init Rule</div>`;
        html += window.formatSVRule ? window.formatSVRule(d.initRule) : '<div class="crt-empty-hint">svrule plugin missing</div>';
        html += `<div class="crt-svrule-title" style="margin-top: 8px">Update Rule (Every ${d.updateTime} ticks)</div>`;
        html += window.formatSVRule ? window.formatSVRule(d.updateRule) : '<div class="crt-empty-hint">svrule plugin missing</div>';
        html += `</div>`;
        return html;
      }
      
      if (gene.subtype === 2) { // Tract
        html += row('Source', `${d.srcLobe} (Var ${d.srcVar})`);
        html += row('Destination', `${d.dstLobe} (Var ${d.dstVar})`);
        html += row('Migrates', d.migrates);
        html += `</div>`;
        
        html += `<div class="crt-svrule-container">`;
        html += `<div class="crt-svrule-title">Init Rule</div>`;
        html += window.formatSVRule ? window.formatSVRule(d.initRule) : '<div class="crt-empty-hint">svrule plugin missing</div>';
        html += `<div class="crt-svrule-title" style="margin-top: 8px">Update Rule (Every ${d.updateTime} ticks)</div>`;
        html += window.formatSVRule ? window.formatSVRule(d.updateRule) : '<div class="crt-empty-hint">svrule plugin missing</div>';
        html += `</div>`;
        return html;
      }

      if (gene.subtype === 1) { // Brain Organ
         html += row('Clock Rate', d.clockRate);
         html += row('Damage Rate', d.damageRate);
         html += row('Life Force', d.lifeForce);
         html += row('Biotick Start', d.biotickStart);
         html += row('ATP Damage Coeff', d.atpDamageCoef);
         html += `</div>`;
         return html;
      }
    }
    
    if (gene.type === 1) { // Biochem
      if (gene.subtype === 0 || gene.subtype === 1) { // Receptor / Emitter
        html += row('Location', `Organ ${d.organ}, Tissue ${d.tissue}, Locus ${d.locus}`);
        html += row('Chemical', getChemName(d.chemical));
        html += row('Threshold', d.threshold);
        html += row('Gain', d.gain);
        if (gene.subtype === 0) html += row('Nominal', d.nominal);
        else html += row('Rate', d.rate);
        html += row('Flags', d.flags);
      } else if (gene.subtype === 2) { // Reaction
        html += row('Reactants', `${d.r1Amount} of ${getChemName(d.r1Chem)} + ${d.r2Amount} of ${getChemName(d.r2Chem)}`);
        html += row('Products', `${d.p1Amount} of ${getChemName(d.p1Chem)} + ${d.p2Amount} of ${getChemName(d.p2Chem)}`);
        html += row('Rate', d.rate);
      } else if (gene.subtype === 3) { // Half lives
         let hlstr = '';
         for (let i=0; i<256; i++) {
           if (d.halfLives[i] < 255) hlstr += `${getChemName(i)}: ${d.halfLives[i]}<br>`;
         }
         if (!hlstr) hlstr = "None defined.";
         html += `<div style="grid-column: 1 / -1; font-size: 11px; max-height: 80px; overflow-y: auto;">${hlstr}</div>`;
      } else if (gene.subtype === 4) { // InitConc
         html += row('Chemical', getChemName(d.chemical));
         html += row('Amount', d.amount);
      } else if (gene.subtype === 5) { // Neuroemitter
         html += row('Trigger N0', `L${d.lobe0} #${d.neuron0}`);
         html += row('Trigger N1', `L${d.lobe1} #${d.neuron1}`);
         html += row('Trigger N2', `L${d.lobe2} #${d.neuron2}`);
         html += row('Rate', d.rate);
         html += `</div><div class="crt-gene-grid" style="margin-top: 5px;">`;
         if (d.amount0) html += row(getChemName(d.chem0), d.amount0);
         if (d.amount1) html += row(getChemName(d.chem1), d.amount1);
         if (d.amount2) html += row(getChemName(d.chem2), d.amount2);
         if (d.amount3) html += row(getChemName(d.chem3), d.amount3);
      }
    }

    if (gene.type === 2) { // Creature
      if (gene.subtype === 0) { // Stimulus
        html += row('Stimulus', d.stimulus);
        html += row('Significance', d.significance);
        html += row('Input', d.input);
        html += row('Intensity', d.intensity);
        html += `</div><div class="crt-gene-grid" style="margin-top: 5px;">`;
        if (d.amount0 !== 0) html += row(getChemName(d.chem0), d.amount0.toFixed(2));
        if (d.amount1 !== 0) html += row(getChemName(d.chem1), d.amount1.toFixed(2));
        if (d.amount2 !== 0) html += row(getChemName(d.chem2), d.amount2.toFixed(2));
        if (d.amount3 !== 0) html += row(getChemName(d.chem3), d.amount3.toFixed(2));
      } else if (gene.subtype === 1) { // Genus
        html += row('Genus', d.genus);
        html += row('Mother', d.motherMoniker);
        html += row('Father', d.fatherMoniker);
      } else if (gene.subtype === 2) { // Appearance
        const parts = ["Head", "Body", "Legs", "Arms", "Tail", "Hair"];
        html += row('Part', parts[d.part] || d.part);
        html += row('Variant', d.variant);
        html += row('Species', d.species);
      } else if (gene.subtype === 3) { // Pose
        html += row('Pose Number', d.poseNumber);
        html += row('String', d.poseString);
      } else if (gene.subtype === 4) { // Gait
        html += row('Gait Num', d.gait);
        html += row('Poses', d.poses.join(", "));
      } else if (gene.subtype === 5) { // Instinct
        html += row('Lobe0', `L${d.lobe0} #${d.cell0}`);
        html += row('Lobe1', `L${d.lobe1} #${d.cell1}`);
        html += row('Lobe2', `L${d.lobe2} #${d.cell2}`);
        html += row('Action', d.action);
        html += row('Reinforcement', `${d.reinforcementAmount} of ${getChemName(d.reinforcementChemical)}`);
      } else if (gene.subtype === 6) { // Pigment
        const pigments = ["Red", "Green", "Blue"];
        html += row('Pigment', pigments[d.pigment] || d.pigment);
        html += row('Amount', d.amount);
      } else if (gene.subtype === 7) { // Pigment Bleed
        html += row('Rotation', d.rotation);
        html += row('Swap', d.swap);
      } else if (gene.subtype === 8) { // Expression
        html += row('Expression Num', d.expression);
        html += row('Weight', d.weight);
        html += `</div><div class="crt-gene-grid" style="margin-top: 5px;">`;
        if (d.amount0) html += row('Drive ' + d.drive0, d.amount0);
        if (d.amount1) html += row('Drive ' + d.drive1, d.amount1);
        if (d.amount2) html += row('Drive ' + d.drive2, d.amount2);
        if (d.amount3) html += row('Drive ' + d.drive3, d.amount3);
      }
    }

    if (gene.type === 3) { // Organ
       html += row('Clock Rate', d.clockRate);
       html += row('Damage Rate', d.damageRate);
       html += row('Life Force', d.lifeForce);
       html += row('Biotick Start', d.biotickStart);
       html += row('ATP Damage Coeff', d.atpDamageCoef);
    }
    
    html += '</div>';
    return html;
  }

  function renderGenome() {
    if (!genomeData || !genomeData.genes) {
      genomeContent.innerHTML = '<div class="crt-empty-hint">No gene data available.</div>';
      return;
    }

    const typeMap = {
      'all': -1,
      'brain': 0,
      'biochemistry': 1,
      'creature': 2,
      'organ': 3
    };
    const reqType = typeMap[currentFilter];

    let html = '';
    let count = 0;

    for (const gene of genomeData.genes) {
      if (reqType !== -1 && gene.type !== reqType) continue;
      
      if (currentAgeFilter !== 'all') {
         if (gene.switchOnTime.toString() !== currentAgeFilter) continue;
      }

      const cardHtml = renderGeneCard(gene);

      if (currentSearch) {
        const rawText = cardHtml.replace(/<[^>]*>/g, ' ').toLowerCase();
        if (!rawText.includes(currentSearch)) continue;
      }

      html += cardHtml;
      count++;
    }

    if (count === 0) {
      genomeContent.innerHTML = '<div class="crt-empty-hint">No genes match the current filters.</div>';
    } else {
      genomeContent.innerHTML = html;
    }
  }

})();
