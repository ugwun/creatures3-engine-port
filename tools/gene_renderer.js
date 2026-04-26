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
  const CHEMS = {
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
    255: 'Drowsiness'
  };
  const GENERA = { 1: 'Norn', 2: 'Grendel', 3: 'Ettin', 4: 'Geat' };
  const PARTS = { 0: 'Head', 1: 'Body', 2: 'Legs', 3: 'Arms', 4: 'Tail', 5: 'Hair' };
  const PIGMENTS = { 0: 'Red', 1: 'Green', 2: 'Blue' };
  const ACTIONS = { 0: 'Rest', 1: 'Walk', 2: 'Run', 3: 'Approach', 4: 'Retreat', 5: 'Flee', 6: 'Drop', 7: 'Pick Up', 8: 'Push', 9: 'Pull', 10: 'Hit', 11: 'Eat', 12: 'Look', 13: 'Touch', 14: 'Communicate', 15: 'Mating' };

  function getChemName(id) {
    return CHEMS[id] || ('Chem ' + id);
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

  // ── SVRule Constants ─────────────────────────────────────────────────
  const SV_OPCODES = [
    "stop", "nop", "store", "load", "if=0", "if!=0", "add", "sub", "mul", "div",
    "absDiff", "thresh_add", "thresh_set", "rnd", "min", "max",
    "if<0", "if>0", "if<=0", "if>=0",
    "setRate", "tend", "neg", "abs", "dist", "flip",
    "nop", "setSpr", "bound01", "bound±1", "addStore", "tendStore",
    "threshold", "leak", "rest", "gain", "persist", "noise", "wta", "setSTLT",
    "setLTST", "storeAbs",
    "if0Stop", "if!0Stop", "if0Goto", "if!0Goto",
    "divAddNI", "mulAddNI", "goto",
    "if<Stop", "if>Stop", "if<=Stop", "if>=Stop",
    "setRwdThr", "setRwdRate", "setRwdChem", "setPunThr", "setPunRate", "setPunChem",
    "preserve", "restore", "preserveSpr", "restoreSpr",
    "if<0Goto", "if>0Goto"
  ];
  const SV_OPERANDS_UI = [
    "acc", "input", "dend", "neuron", "spare",
    "random",
    "chem[src+]", "chem", "chem[dst+]",
    "0", "1",
    "float", "-float", "float*10", "float/10", "int"
  ];
  const NOOP_OPCODES = new Set([0, 1, 26, 27, 38]);
  const CHEM_OPERANDS = new Set([6, 7, 8]);
  const FLOAT_OPERANDS = new Set([11, 12, 13, 14]);

  function encodeFloatToSVRule(floatVal, operandId) {
    let raw = floatVal;
    if (operandId === 12) raw = -raw;
    else if (operandId === 13) raw = raw / 10.0;
    else if (operandId === 14) raw = raw * 10.0;
    return Math.max(0, Math.min(255, Math.round(raw * 255.0)));
  }

  function decodeFloatFromSVRule(valByte, operandId) {
    let f = valByte / 255.0;
    if (operandId === 12) f = -f;
    else if (operandId === 13) f *= 10.0;
    else if (operandId === 14) f /= 10.0;
    return f;
  }

  // Parse a raw 48-byte SVRule array into the entry format used by formatSVRule.
  // Mirrors the server-side decompileSVRuleByBytes logic.
  function parseSVRuleBytes(bytes) {
    const entries = [];
    for (let i = 0; i < 48; i += 3) {
      const opCode = bytes[i] || 0;
      const operandCode = bytes[i + 1] || 0;
      const valByte = bytes[i + 2] || 0;

      // Skip leading stop
      if (opCode === 0 && i === 0) break;

      const op = (opCode < SV_OPCODES.length) ? SV_OPCODES[opCode] : '???';
      const operand = (operandCode < SV_OPERANDS_UI.length) ? SV_OPERANDS_UI[operandCode] : '???';

      // Float approximation (matches engine logic)
      let val = 0.0;
      if (operandCode >= 11 && operandCode <= 15) {
        val = valByte / 255.0;
        if (operandCode === 12) val = -val;
        else if (operandCode === 13) val *= 10.0;
        else if (operandCode === 14) val /= 10.0;
        else if (operandCode === 15) val = val * 255.0;
      }

      entries.push({ op, operand, idx: valByte, val, opCode, operandCode });
      if (opCode === 0) break;
    }
    return entries;
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function svCombo(cssClass, rowIdx, optionsObj, isArray, selectedVal, extraStyle) {
    let selectedLabel = selectedVal;
    if (optionsObj === CHEMS && selectedVal >= 0 && selectedVal <= 255) {
      selectedLabel = CHEMS[selectedVal] !== undefined ? CHEMS[selectedVal] : 'Chem ' + selectedVal;
    } else if (isArray && optionsObj[selectedVal] !== undefined) {
      selectedLabel = optionsObj[selectedVal];
    } else if (!isArray && optionsObj[selectedVal] !== undefined) {
      selectedLabel = optionsObj[selectedVal];
    }
    const safeSel = escHtml(selectedLabel);

    let h = `<div class="crt-combobox svrule-combo" data-row="${rowIdx}" style="position:relative; display:inline-block; font-family:var(--font-mono); font-size:11px; ${extraStyle || ''}">`;
    h += `<div class="crt-combobox-trigger" style="width:100%; box-sizing:border-box; padding:2px 4px; border:1px solid var(--border, #888); background:var(--bg-input, #fff); color:var(--text, #000); cursor:pointer; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; display:flex; justify-content:space-between; align-items:center;" title="${safeSel}">`;
    h += `<span>${safeSel}</span><span style="font-size:8px; opacity:0.5;">▼</span></div>`;
    h += `<input type="hidden" class="${cssClass}" data-row="${rowIdx}" value="${selectedVal}" />`;
    h += `<div class="crt-combobox-popup" style="display:none; position:absolute; z-index:9999; top:100%; left:0; width:220px; background:var(--bg-panel, #222); border:1px solid var(--border, #444); box-shadow:0 8px 16px rgba(0,0,0,0.5); border-radius:4px; padding:4px; margin-top:2px;">`;
    h += `<input type="text" class="crt-combobox-search" placeholder="Search..." style="width:100%; box-sizing:border-box; padding:4px; margin-bottom:4px; font-family:var(--font-mono); font-size:11px; background:var(--black); color:var(--white); border:1px solid var(--orange);" />`;
    h += `<div class="crt-combobox-list" style="max-height:200px; overflow-y:auto;">`;

    if (isArray) {
      for (let i = 0; i < optionsObj.length; i++) {
        const lbl = escHtml(optionsObj[i]);
        h += `<div class="crt-combobox-item" data-val="${i}" data-label="${lbl}" style="padding:4px 8px; cursor:pointer; font-size:11px; white-space:nowrap; color:var(--white); border-radius:2px;"><span style="opacity:0.5; width:24px; display:inline-block;">${i}</span> ${lbl}</div>`;
      }
    } else if (optionsObj === CHEMS) {
      for (let i = 0; i < 256; i++) {
        const lbl = escHtml(CHEMS[i] !== undefined ? CHEMS[i] : 'Chem ' + i);
        h += `<div class="crt-combobox-item" data-val="${i}" data-label="${lbl}" style="padding:4px 8px; cursor:pointer; font-size:11px; white-space:nowrap; color:var(--white); border-radius:2px;"><span style="opacity:0.5; width:24px; display:inline-block;">${i}</span> ${lbl}</div>`;
      }
    } else {
      for (const k in optionsObj) {
        const lbl = escHtml(optionsObj[k]);
        h += `<div class="crt-combobox-item" data-val="${k}" data-label="${lbl}" style="padding:4px 8px; cursor:pointer; font-size:11px; white-space:nowrap; color:var(--white); border-radius:2px;"><span style="opacity:0.5; width:24px; display:inline-block;">${k}</span> ${lbl}</div>`;
      }
    }
    h += `</div></div></div>`;
    return h;
  }

  function renderSVRuleEditor(keyPath, bytes, geneIdx) {
    let html = `<div class="crt-svrule-editor" data-gene-idx="${geneIdx}" data-rule-key="${keyPath}">`;
    html += `<div class="svrule-grid-header">`;
    html += `<span>#</span><span>Opcode</span><span>Operand</span><span>Value</span></div>`;
    html += `<input type="hidden" class="crt-svrule-hidden-bytes crt-gene-input" data-idx="${geneIdx}" data-key="${keyPath}" value="${(bytes || []).join(',')}" />`;

    for (let i = 0; i < 16; i++) {
      const offset = i * 3;
      const opByte = bytes.length > offset ? bytes[offset] : 0;
      const operandByte = bytes.length > offset + 1 ? bytes[offset + 1] : 0;
      const valByte = bytes.length > offset + 2 ? bytes[offset + 2] : 0;

      const isNoOp = NOOP_OPCODES.has(opByte);
      const isChem = CHEM_OPERANDS.has(operandByte);
      const isFloat = FLOAT_OPERANDS.has(operandByte);
      const hideStyle = isNoOp ? 'opacity:0; pointer-events:none;' : '';

      html += `<div class="svrule-row" data-row="${i}">`;
      html += `<span style="font-size:10px; font-weight:600; color:rgba(0,0,0,0.25); text-align:center;">${String(i + 1).padStart(2, '0')}</span>`;
      html += svCombo('svrule-op', i, SV_OPCODES, true, opByte, 'width:100%;');
      html += `<div class="svrule-operand-wrap" data-row="${i}" style="${hideStyle} transition:opacity 0.15s;">`;
      html += svCombo('svrule-operand', i, SV_OPERANDS_UI, true, operandByte, 'width:100%;');
      html += `</div>`;
      html += `<div class="svrule-val-wrap" data-row="${i}" style="${hideStyle} transition:opacity 0.15s;">`;
      if (isChem) {
        html += svCombo('svrule-val-chem', i, CHEMS, false, valByte, 'width:100%;');
        html += `<input type="number" class="svrule-val-text" data-row="${i}" value="${valByte}" style="display:none;" />`;
      } else if (isFloat) {
        const fv = decodeFloatFromSVRule(valByte, operandByte);
        html += `<input type="number" class="svrule-val-text" data-row="${i}" value="${fv.toFixed(4)}" step="0.01" style="width:100%; padding:2px 4px; font-family:var(--font-mono); font-size:11px; border:1px solid rgba(0,0,0,0.15);" />`;
        html += `<div class="svrule-val-chem-wrap" data-row="${i}" style="display:none;"></div>`;
      } else {
        html += `<input type="number" class="svrule-val-text" data-row="${i}" value="${valByte}" min="0" max="255" style="width:100%; padding:2px 4px; font-family:var(--font-mono); font-size:11px; border:1px solid rgba(0,0,0,0.15);" />`;
        html += `<div class="svrule-val-chem-wrap" data-row="${i}" style="display:none;"></div>`;
      }
      html += `</div>`;
      html += `</div>`;
    }
    html += `</div>`;
    return html;
  }

  function renderGeneData(gene, index = 0, isInteractive = false) {
    const d = gene.data;
    let html = '<div class="crt-gene-grid">';
    function row(label, val, keyPath = null, type = 'text', options = null) {
      if (!isInteractive || !keyPath) {
        let displayVal = val;
        if (options && (type === 'select' || type === 'combo')) {
           if (options === CHEMS && val >= 0 && val <= 255) {
             displayVal = CHEMS[val] !== undefined ? CHEMS[val] : "Chem " + val;
           } else if (options[val] !== undefined) {
             displayVal = options[val];
           }
           if (typeof displayVal === 'string') displayVal = displayVal.replace(/<[^>]*>/g, '');
        }
        return `<div class="crt-gene-row${type === 'combo' ? ' crt-gene-row--wide' : ''}"><span class="crt-gene-label">${label}:</span> <span class="crt-gene-val">${displayVal}</span></div>`;
      }
      
      let html = `<div class="crt-gene-row${type === 'combo' ? ' crt-gene-row--wide' : ''}"><span class="crt-gene-label">${label}:</span> `;
      if (type === 'combo' && options) {
         let selectedLabel = val;
         if (options === CHEMS && val >= 0 && val <= 255) {
            selectedLabel = CHEMS[val] !== undefined ? CHEMS[val] : "Chem " + val;
         } else if (options[val] !== undefined) {
            selectedLabel = options[val];
         }
         if (typeof selectedLabel === 'string') selectedLabel = selectedLabel.replace(/<[^>]*>/g, '');

         html += `<div class="crt-combobox" data-idx="${index}" data-key="${keyPath}" style="width:100%; max-width:160px; position:relative; display:inline-block; font-family:var(--font-mono); font-size:11px;">`;
         
         // Trigger
         html += `<div class="crt-combobox-trigger" style="width:100%; box-sizing:border-box; padding:2px 4px; border:1px solid var(--border, #888); background:var(--bg-input, #fff); color:var(--text, #000); cursor:pointer; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; display:flex; justify-content:space-between; align-items:center;" title="${selectedLabel}">`;
         html += `<span>${selectedLabel}</span><span style="font-size:8px; opacity:0.5;">▼</span></div>`;
         
         html += `<input type="hidden" class="crt-gene-input" data-idx="${index}" data-key="${keyPath}" value="${val}" />`;
         
         // Popup
         html += `<div class="crt-combobox-popup" style="display:none; position:absolute; z-index:9999; top:100%; left:0; width:180px; background:var(--bg-panel, #222); border:1px solid var(--border, #444); box-shadow:0 8px 16px rgba(0,0,0,0.5); border-radius:4px; padding:4px; margin-top:2px;">`;
         html += `<input type="text" class="crt-combobox-search" placeholder="Search..." style="width:100%; box-sizing:border-box; padding:4px; margin-bottom:4px; font-family:var(--font-mono); font-size:11px; background:var(--black); color:var(--white); border:1px solid var(--orange);" />`;
         html += `<div class="crt-combobox-list" style="max-height:200px; overflow-y:auto;">`;
         
         if (options === CHEMS) {
            for (let i = 0; i < 256; i++) {
                let labelText = CHEMS[i] !== undefined ? CHEMS[i] : "Chem " + i;
                if (typeof labelText === 'string') labelText = labelText.replace(/<[^>]*>/g, '');
                let displayHtml = `<span style="opacity:0.5; width:24px; display:inline-block;">${i}</span> ${labelText}`;
                html += `<div class="crt-combobox-item" data-val="${i}" data-label="${labelText}" style="padding:4px 8px; cursor:pointer; font-size:11px; white-space:nowrap; color:var(--white); border-radius:2px;">${displayHtml}</div>`;
            }
         } else {
             for (const k in options) {
                let labelText = options[k];
                if (typeof labelText === 'string') labelText = labelText.replace(/<[^>]*>/g, '');
                let displayHtml = `<span style="opacity:0.5; width:24px; display:inline-block;">${k}</span> ${labelText}`;
                html += `<div class="crt-combobox-item" data-val="${k}" data-label="${labelText}" style="padding:4px 8px; cursor:pointer; font-size:11px; white-space:nowrap; color:var(--white); border-radius:2px;">${displayHtml}</div>`;
             }
         }
         html += `</div></div></div>`;
      } else if (type === 'select' && options) {
         html += `<select class="crt-gene-input" data-idx="${index}" data-key="${keyPath}" style="width: 100%; max-width: 100px; padding: 2px 4px; font-family: var(--font-mono); font-size: 11px;">`;
         for (const k in options) {
            const isSelected = (k == val) ? 'selected' : '';
            let labelText = options[k];
            if (typeof labelText === 'string') {
              labelText = labelText.replace(/<[^>]*>/g, '');
            }
            html += `<option value="${k}" ${isSelected}>${labelText}</option>`;
         }
         html += `</select>`;
      } else {
         html += `<input type="${type}" class="crt-gene-input" data-idx="${index}" data-key="${keyPath}" value="${window.engineFormat ? window.engineFormat.escapeHtml(val.toString()) : val}" style="width: 100%; max-width: 100px; padding: 2px 4px; font-family: var(--font-mono); font-size: 11px;" />`;
      }
      html += `</div>`;
      return html;
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
        if (isInteractive) {
          html += `<details class="svrule-details"><summary class="svrule-summary">✏️ Edit Init Rule</summary>`;
          html += renderSVRuleEditor('initRuleBytes', d.initRuleBytes || [], index);
          html += `</details>`;
        }
        html += `<div class="crt-svrule-title" style="margin-top: 8px">Update Rule (Every ${d.updateTime} ticks)</div>`;
        html += window.formatSVRule ? window.formatSVRule(d.updateRule) : '<div class="crt-empty-hint">svrule plugin missing</div>';
        if (isInteractive) {
          html += `<details class="svrule-details"><summary class="svrule-summary">✏️ Edit Update Rule</summary>`;
          html += renderSVRuleEditor('updateRuleBytes', d.updateRuleBytes || [], index);
          html += `</details>`;
        }
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
        if (isInteractive) {
          html += `<details class="svrule-details"><summary class="svrule-summary">✏️ Edit Init Rule</summary>`;
          html += renderSVRuleEditor('initRuleBytes', d.initRuleBytes || [], index);
          html += `</details>`;
        }
        html += `<div class="crt-svrule-title" style="margin-top: 8px">Update Rule (Every ${d.updateTime} ticks)</div>`;
        html += window.formatSVRule ? window.formatSVRule(d.updateRule) : '<div class="crt-empty-hint">svrule plugin missing</div>';
        if (isInteractive) {
          html += `<details class="svrule-details"><summary class="svrule-summary">✏️ Edit Update Rule</summary>`;
          html += renderSVRuleEditor('updateRuleBytes', d.updateRuleBytes || [], index);
          html += `</details>`;
        }
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
        html += row('Chemical', d.chemical, 'chemical', 'combo', CHEMS);
        html += row('Threshold', d.threshold, 'threshold', 'number');
        html += row('Gain', d.gain, 'gain', 'number');
        if (gene.subtype === 0) html += row('Nominal', d.nominal, 'nominal', 'number');
        else html += row('Rate', d.rate, 'rate', 'number');
        html += row('Flags', d.flags, 'flags', 'number');
      } else if (gene.subtype === 2) { // Reaction
        html += row('R1 Amount', d.r1Amount, 'r1Amount', 'number');
        html += row('R1 Chem', d.r1Chem, 'r1Chem', 'combo', CHEMS);
        html += row('R2 Amount', d.r2Amount, 'r2Amount', 'number');
        html += row('R2 Chem', d.r2Chem, 'r2Chem', 'combo', CHEMS);
        html += row('P1 Amount', d.p1Amount, 'p1Amount', 'number');
        html += row('P1 Chem', d.p1Chem, 'p1Chem', 'combo', CHEMS);
        html += row('P2 Amount', d.p2Amount, 'p2Amount', 'number');
        html += row('P2 Chem', d.p2Chem, 'p2Chem', 'combo', CHEMS);
        html += row('Rate', d.rate, 'rate', 'number');
      } else if (gene.subtype === 3) { // Half lives
         let hlstr = '';
         for (let i=0; i<256; i++) {
           if (d.halfLives[i] < 255) hlstr += `${getChemName(i)}: ${d.halfLives[i]}<br>`;
         }
         if (!hlstr) hlstr = "None defined.";
         html += `<div style="grid-column: 1 / -1; font-size: 11px; max-height: 80px; overflow-y: auto;">${hlstr}</div>`;
      } else if (gene.subtype === 4) { // InitConc
         html += row('Chemical', d.chemical, 'chemical', 'combo', CHEMS);
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
         html += row('Chem 0', d.chem0, 'chem0', 'combo', CHEMS);
         html += row('Amount 0', d.amount0, 'amount0', 'number');
         html += row('Chem 1', d.chem1, 'chem1', 'combo', CHEMS);
         html += row('Amount 1', d.amount1, 'amount1', 'number');
         html += row('Chem 2', d.chem2, 'chem2', 'combo', CHEMS);
         html += row('Amount 2', d.amount2, 'amount2', 'number');
         html += row('Chem 3', d.chem3, 'chem3', 'combo', CHEMS);
         html += row('Amount 3', d.amount3, 'amount3', 'number');
      }
    }

    if (gene.type === 2) { // Creature
      if (gene.subtype === 0) { // Stimulus
        html += row('Stimulus', d.stimulus, 'stimulus', 'number');
        html += row('Significance', d.significance, 'significance', 'number');
        html += row('Input', d.input, 'input', 'number');
        html += row('Intensity', d.intensity, 'intensity', 'number');
        html += `</div><div class="crt-gene-grid" style="margin-top: 5px;">`;
        html += row('Chem 0', d.chem0, 'chem0', 'combo', CHEMS);
        html += row('Amount 0', d.amount0, 'amount0', 'number');
        html += row('Chem 1', d.chem1, 'chem1', 'combo', CHEMS);
        html += row('Amount 1', d.amount1, 'amount1', 'number');
        html += row('Chem 2', d.chem2, 'chem2', 'combo', CHEMS);
        html += row('Amount 2', d.amount2, 'amount2', 'number');
        html += row('Chem 3', d.chem3, 'chem3', 'combo', CHEMS);
        html += row('Amount 3', d.amount3, 'amount3', 'number');
      } else if (gene.subtype === 1) { // Genus
        html += row('Genus', d.genus, 'genus', 'select', GENERA);
        html += row('Mother', d.motherMoniker, 'motherMoniker', 'text');
        html += row('Father', d.fatherMoniker, 'fatherMoniker', 'text');
      } else if (gene.subtype === 2) { // Appearance
        html += row('Part', d.part, 'part', 'select', PARTS);
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
        html += row('Action', d.action, 'action', 'select', ACTIONS);
        html += row('Reinf Chem', d.reinforcementChemical, 'reinforcementChemical', 'combo', CHEMS);
        html += row('Reinf Amt', d.reinforcementAmount, 'reinforcementAmount', 'number');
      } else if (gene.subtype === 6) { // Pigment
        html += row('Pigment', d.pigment, 'pigment', 'select', PIGMENTS);
        html += row('Amount', d.amount, 'amount', 'number');
      } else if (gene.subtype === 7) { // Pigment Bleed
        html += row('Rotation', d.rotation, 'rotation', 'number');
        html += row('Swap', d.swap, 'swap', 'number');
      } else if (gene.subtype === 8) { // Expression
        html += row('Expr Num', d.expression, 'expression', 'number');
        html += row('Weight', d.weight, 'weight', 'number');
        html += `</div><div class="crt-gene-grid" style="margin-top: 5px;">`;
        html += row('Drive 0', d.drive0, 'drive0', 'combo', CHEMS);
        html += row('Amount 0', d.amount0, 'amount0', 'number');
        html += row('Drive 1', d.drive1, 'drive1', 'combo', CHEMS);
        html += row('Amount 1', d.amount1, 'amount1', 'number');
        html += row('Drive 2', d.drive2, 'drive2', 'combo', CHEMS);
        html += row('Amount 2', d.amount2, 'amount2', 'number');
        html += row('Drive 3', d.drive3, 'drive3', 'combo', CHEMS);
        html += row('Amount 3', d.amount3, 'amount3', 'number');
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
    CHEMS,
    SV_OPCODES,
    SV_OPERANDS_UI,
    NOOP_OPCODES,
    CHEM_OPERANDS,
    FLOAT_OPERANDS,
    encodeFloatToSVRule,
    decodeFloatFromSVRule,
    svCombo,
    parseSVRuleBytes
  };
})();
