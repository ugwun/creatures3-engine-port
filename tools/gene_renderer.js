(() => {
  'use strict';

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

  function renderGeneCard(gene, index, isInteractive=false) {
    // Top-row badges format
    const c = getGeneColor(gene.type);
    let html = `<div class="crt-gene-card ${isInteractive ? 'crt-gene-interactive' : ''}" style="border-left: 3px solid ${c}" data-idx="${index}">`;
    html += `<div class="crt-gene-header" ${isInteractive ? 'style="cursor:pointer;" title="Click to expand/collapse"' : ''}>`;
    
    html += `<div style="display:flex; align-items:center; gap: 8px;">`;
    if (isInteractive) {
      // Chevron for expand/collapse
      html += `<span class="crt-gene-chevron" style="color: rgba(0,0,0,0.3); font-size: 10px;">▶</span>`;
    }
    html += `<span class="crt-gene-title">${gene.typeName} — ${gene.subtypeName} <span class="crt-gene-id">#${gene.id}</span></span>`;
    html += `</div>`;
    
    // Badges container
    html += `<div class="crt-gene-badges">`;

    if (isInteractive) {
      html += `<label class="crt-gene-badge crt-gene-badge-active" title="Toggle Injection" onclick="event.stopPropagation()">
                <input type="checkbox" class="g-active" data-idx="${index}" ${gene.active ? 'checked' : ''} /> Active
               </label>`;
      html += `<label class="crt-gene-badge crt-gene-badge-mut" title="Mutable" onclick="event.stopPropagation()">
                <input type="checkbox" class="g-mut" data-idx="${index}" ${gene.flags.mutable ? 'checked' : ''} /> M
               </label>`;
      html += `<label class="crt-gene-badge crt-gene-badge-mut" title="Dupable" onclick="event.stopPropagation()">
                <input type="checkbox" class="g-dup" data-idx="${index}" ${gene.flags.dupable ? 'checked' : ''} /> D
               </label>`;
      html += `<label class="crt-gene-badge crt-gene-badge-mut" title="Cutable" onclick="event.stopPropagation()">
                <input type="checkbox" class="g-cut" data-idx="${index}" ${gene.flags.cutable ? 'checked' : ''} /> C
               </label>`;
    } else {
      const mFlags = [];
      if (gene.flags.mutable) mFlags.push('M');
      if (gene.flags.dupable) mFlags.push('D');
      if (gene.flags.cutable) mFlags.push('C');
      if (mFlags.length) html += `<span class="crt-gene-badge crt-gene-badge-mut">${mFlags.join('')}</span>`;
    }
    
    if (gene.flags.maleOnly) html += `<span class="crt-gene-badge crt-gene-badge-sex">♂</span>`;
    if (gene.flags.femaleOnly) html += `<span class="crt-gene-badge crt-gene-badge-sex">♀</span>`;
    if (gene.flags.dormant) html += `<span class="crt-gene-badge crt-gene-badge-dormant">Dormant</span>`;

    html += `<span class="crt-gene-badge crt-gene-badge-gen">Gen ${gene.generation}</span>`;
    html += `<span class="crt-gene-badge crt-gene-badge-age">@ ${gene.switchOnLabel}</span>`;
    
    if (isInteractive) {
      html += `<div style="display:flex; gap:4px; margin-left:8px;" class="crt-gene-actions">`;
      html += `<button class="btn-light g-btn-up" data-idx="${index}" title="Move Up" onclick="event.stopPropagation()" style="padding: 2px 6px; font-size: 8px;">▲</button>`;
      html += `<button class="btn-light g-btn-down" data-idx="${index}" title="Move Down" onclick="event.stopPropagation()" style="padding: 2px 6px; font-size: 8px;">▼</button>`;
      html += `<button class="btn-light g-btn-dup" data-idx="${index}" title="Duplicate Gene" onclick="event.stopPropagation()" style="padding: 2px 6px; font-size: 10px;">⎘</button>`;
      html += `<button class="btn-light g-btn-del" data-idx="${index}" title="Delete Gene" onclick="event.stopPropagation()" style="padding: 2px 6px; font-size: 10px; color:var(--red); border-color:rgba(255,0,0,0.3);">✖</button>`;
      html += `</div>`;
    }
    
    html += `</div></div>`; // End headers

    html += `<div class="crt-gene-body" ${isInteractive ? 'style="display:none;"' : ''}>`;
    html += renderGeneData(gene, index, isInteractive);
    html += `</div></div>`;
    return html;
  }

  function renderGeneData(gene, index = 0, isInteractive = false) {
    const d = gene.data;
    let html = '<div class="crt-gene-grid">';
    
    function row(label, val, keyPath = null, type = 'text') {
      if (!isInteractive || !keyPath) {
        return `<div class="crt-gene-row"><span class="crt-gene-label">${label}:</span> <span class="crt-gene-val">${val}</span></div>`;
      }
      return `<div class="crt-gene-row"><span class="crt-gene-label">${label}:</span> <input type="${type}" class="crt-gene-input" data-idx="${index}" data-key="${keyPath}" value="${window.engineFormat ? window.engineFormat.escapeHtml(val.toString()) : val}" style="width: 100%; max-width: 100px; padding: 2px 4px; font-family: var(--font-mono); font-size: 11px;" /></div>`;
    }

    if (gene.type === 0) { // Brain
      if (gene.subtype === 0) { // Lobe
        html += row('Lobe Name', window.engineFormat ? window.engineFormat.escapeHtml(d.lobeName) : d.lobeName, 'lobeName', 'text');
        html += row('Bounds X', d.x, 'x', 'number');
        html += row('Bounds Y', d.y, 'y', 'number');
        html += row('Width', d.width, 'width', 'number');
        html += row('Height', d.height, 'height', 'number');
        html += row('Color R', d.red, 'red', 'number');
        html += row('Color G', d.green, 'green', 'number');
        html += row('Color B', d.blue, 'blue', 'number');
        html += row('WTA', d.wta, 'wta', 'number');
        html += `</div>`; // close grid
        
        html += `<div class="crt-svrule-container">`;
        html += `<div class="crt-svrule-title">Init Rule</div>`;
        html += window.formatSVRule ? window.formatSVRule(d.initRule) : '<div class="crt-empty-hint">svrule plugin missing</div>';
        if (isInteractive) html += row('Raw Init Bytes', d.initRuleBytes || [], 'initRuleBytes', 'array');
        html += `<div class="crt-svrule-title" style="margin-top: 8px">Update Rule (Every ${d.updateTime} ticks)</div>`;
        html += window.formatSVRule ? window.formatSVRule(d.updateRule) : '<div class="crt-empty-hint">svrule plugin missing</div>';
        if (isInteractive) html += row('Raw Update Bytes', d.updateRuleBytes || [], 'updateRuleBytes', 'array');
        html += `</div>`;
        return html;
      }
      
      if (gene.subtype === 2) { // Tract
        html += row('Src Lobe', d.srcLobe, 'srcLobe', 'number');
        html += row('Src Var', d.srcVar, 'srcVar', 'number');
        html += row('Dst Lobe', d.dstLobe, 'dstLobe', 'number');
        html += row('Dst Var', d.dstVar, 'dstVar', 'number');
        html += row('Migrates', d.migrates, 'migrates', 'number');
        html += `</div>`;
        
        html += `<div class="crt-svrule-container">`;
        html += `<div class="crt-svrule-title">Init Rule</div>`;
        html += window.formatSVRule ? window.formatSVRule(d.initRule) : '<div class="crt-empty-hint">svrule plugin missing</div>';
        if (isInteractive) html += row('Raw Init Bytes', d.initRuleBytes || [], 'initRuleBytes', 'array');
        html += `<div class="crt-svrule-title" style="margin-top: 8px">Update Rule (Every ${d.updateTime} ticks)</div>`;
        html += window.formatSVRule ? window.formatSVRule(d.updateRule) : '<div class="crt-empty-hint">svrule plugin missing</div>';
        if (isInteractive) html += row('Raw Update Bytes', d.updateRuleBytes || [], 'updateRuleBytes', 'array');
        html += `</div>`;
        return html;
      }

      if (gene.subtype === 1) { // Brain Organ
         html += row('Clock Rate', d.clockRate, 'clockRate', 'number');
         html += row('Damage Rate', d.damageRate, 'damageRate', 'number');
         html += row('Life Force', d.lifeForce, 'lifeForce', 'number');
         html += row('Biotick Start', d.biotickStart, 'biotickStart', 'number');
         html += row('ATP Dmg Coeff', d.atpDamageCoef, 'atpDamageCoef', 'number');
         html += `</div>`;
         return html;
      }
    }
    
    if (gene.type === 1) { // Biochem
      if (gene.subtype === 0 || gene.subtype === 1) { // Receptor / Emitter
        html += row('Organ', d.organ, 'organ', 'number');
        html += row('Tissue', d.tissue, 'tissue', 'number');
        html += row('Locus', d.locus, 'locus', 'number');
        html += row('Chemical', d.chemical, 'chemical', 'number');
        html += row('Threshold', d.threshold, 'threshold', 'number');
        html += row('Gain', d.gain, 'gain', 'number');
        if (gene.subtype === 0) html += row('Nominal', d.nominal, 'nominal', 'number');
        else html += row('Rate', d.rate, 'rate', 'number');
        html += row('Flags', d.flags, 'flags', 'number');
      } else if (gene.subtype === 2) { // Reaction
        html += row('R1 Amount', d.r1Amount, 'r1Amount', 'number');
        html += row('R1 Chem', d.r1Chem, 'r1Chem', 'number');
        html += row('R2 Amount', d.r2Amount, 'r2Amount', 'number');
        html += row('R2 Chem', d.r2Chem, 'r2Chem', 'number');
        html += row('P1 Amount', d.p1Amount, 'p1Amount', 'number');
        html += row('P1 Chem', d.p1Chem, 'p1Chem', 'number');
        html += row('P2 Amount', d.p2Amount, 'p2Amount', 'number');
        html += row('P2 Chem', d.p2Chem, 'p2Chem', 'number');
        html += row('Rate', d.rate, 'rate', 'number');
      } else if (gene.subtype === 3) { // Half lives
         let hlstr = '';
         for (let i=0; i<256; i++) {
           if (d.halfLives[i] < 255) hlstr += `${getChemName(i)}: ${d.halfLives[i]}<br>`;
         }
         if (!hlstr) hlstr = "None defined.";
         html += `<div style="grid-column: 1 / -1; font-size: 11px; max-height: 80px; overflow-y: auto;">${hlstr}</div>`;
      } else if (gene.subtype === 4) { // InitConc
         html += row('Chemical', d.chemical, 'chemical', 'number');
         html += row('Amount', d.amount, 'amount', 'number');
      } else if (gene.subtype === 5) { // Neuroemitter
         html += row('Trig L0', d.lobe0, 'lobe0', 'number');
         html += row('Trig N0', d.neuron0, 'neuron0', 'number');
         html += row('Trig L1', d.lobe1, 'lobe1', 'number');
         html += row('Trig N1', d.neuron1, 'neuron1', 'number');
         html += row('Trig L2', d.lobe2, 'lobe2', 'number');
         html += row('Trig N2', d.neuron2, 'neuron2', 'number');
         html += row('Rate', d.rate, 'rate', 'number');
         html += `</div><div class="crt-gene-grid" style="margin-top: 5px;">`;
         html += row(getChemName(d.chem0), d.amount0, 'amount0', 'number');
         html += row(getChemName(d.chem1), d.amount1, 'amount1', 'number');
         html += row(getChemName(d.chem2), d.amount2, 'amount2', 'number');
         html += row(getChemName(d.chem3), d.amount3, 'amount3', 'number');
      }
    }

    if (gene.type === 2) { // Creature
      if (gene.subtype === 0) { // Stimulus
        html += row('Stimulus', d.stimulus, 'stimulus', 'number');
        html += row('Significance', d.significance, 'significance', 'number');
        html += row('Input', d.input, 'input', 'number');
        html += row('Intensity', d.intensity, 'intensity', 'number');
        html += `</div><div class="crt-gene-grid" style="margin-top: 5px;">`;
        html += row(getChemName(d.chem0), d.amount0, 'amount0', 'number');
        html += row(getChemName(d.chem1), d.amount1, 'amount1', 'number');
        html += row(getChemName(d.chem2), d.amount2, 'amount2', 'number');
        html += row(getChemName(d.chem3), d.amount3, 'amount3', 'number');
      } else if (gene.subtype === 1) { // Genus
        html += row('Genus', d.genus, 'genus', 'number');
        html += row('Mother', d.motherMoniker, 'motherMoniker', 'text');
        html += row('Father', d.fatherMoniker, 'fatherMoniker', 'text');
      } else if (gene.subtype === 2) { // Appearance
        const parts = ["Head", "Body", "Legs", "Arms", "Tail", "Hair"];
        html += row('Part', parts[d.part] || d.part);
        html += row('Variant', d.variant, 'variant', 'number');
        html += row('Species', d.species, 'species', 'number');
      } else if (gene.subtype === 3) { // Pose
        html += row('Pose Number', d.poseNumber, 'poseNumber', 'number');
        html += row('String', d.poseString, 'poseString', 'text');
      } else if (gene.subtype === 4) { // Gait
        html += row('Gait Num', d.gait, 'gait', 'number');
        html += row('Poses', d.poses.join(", "), 'poses', 'text');
      } else if (gene.subtype === 5) { // Instinct
        html += row('Lobe0', `L${d.lobe0} #${d.cell0}`);
        html += row('Lobe1', `L${d.lobe1} #${d.cell1}`);
        html += row('Lobe2', `L${d.lobe2} #${d.cell2}`);
        html += row('Action', d.action, 'action', 'number');
        html += row('Reinforcement', `${d.reinforcementAmount} of ${getChemName(d.reinforcementChemical)}`);
      } else if (gene.subtype === 6) { // Pigment
        const pigments = ["Red", "Green", "Blue"];
        html += row('Pigment', pigments[d.pigment] || d.pigment);
        html += row('Amount', d.amount, 'amount', 'number');
      } else if (gene.subtype === 7) { // Pigment Bleed
        html += row('Rotation', d.rotation, 'rotation', 'number');
        html += row('Swap', d.swap, 'swap', 'number');
      } else if (gene.subtype === 8) { // Expression
        html += row('Expr Num', d.expression, 'expression', 'number');
        html += row('Weight', d.weight, 'weight', 'number');
        html += `</div><div class="crt-gene-grid" style="margin-top: 5px;">`;
        html += row('Drive ' + d.drive0, d.amount0, 'amount0', 'number');
        html += row('Drive ' + d.drive1, d.amount1, 'amount1', 'number');
        html += row('Drive ' + d.drive2, d.amount2, 'amount2', 'number');
        html += row('Drive ' + d.drive3, d.amount3, 'amount3', 'number');
      }
    }

    if (gene.type === 3) { // Organ
       html += row('Clock Rate', d.clockRate, 'clockRate', 'number');
       html += row('Damage Rate', d.damageRate, 'damageRate', 'number');
       html += row('Life Force', d.lifeForce, 'lifeForce', 'number');
       html += row('Biotick Start', d.biotickStart, 'biotickStart', 'number');
       html += row('ATP Dmg Coeff', d.atpDamageCoef, 'atpDamageCoef', 'number');
    }
    
    html += '</div>';
    return html;
  }

  // Export
  window.GeneRenderer = {
    getGeneColor,
    getChemName,
    renderGeneCard,
    renderGeneData,
    CHEMS
  };
})();
