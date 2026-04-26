// ── Genetics Kit ──────────────────────────────────────────────────────────────
// Top-level tab for standalone .gen file inspection, editing, crossover,
// and injection into the running engine. Not tied to a specific creature.

(() => {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────
  let availableFiles = [];
  let currentGenome = null;

  let selectedFile = null;
  let fileShowAll = false;

  let selectedParentB = null;
  let parentBShowAll = false;

  let currentFilter = 'all';
  let currentSearch = '';
  let currentAgeFilter = 'all';

  // ── DOM Refs ───────────────────────────────────────────────────────────
  const fileSearch = document.getElementById('genetics-file-search');
  const fileList = document.getElementById('genetics-file-list');
  const fileAction = document.getElementById('genetics-file-action');
  const selectedName = document.getElementById('genetics-selected-name');
  const btnRefresh = document.getElementById('btn-genetics-refresh');
  const genesContent = document.getElementById('genetics-genes-content');

  const filterRadios = document.querySelectorAll('input[name="genetics-gfilter"]');
  const genomeSearch = document.getElementById('genetics-genome-search');
  const genomeAge = document.getElementById('genetics-genome-age');
  const btnAddGene = document.getElementById('btn-genetics-add-gene');
  const addGeneType = document.getElementById('genetics-add-gene-type');

  const btnCrossover = document.getElementById('btn-genetics-crossover');
  const btnInject = document.getElementById('btn-genetics-inject');
  const injectStatus = document.getElementById('genetics-inject-status');
  const btnNew = document.getElementById('btn-genetics-new');
  const btnExport = document.getElementById('btn-genetics-export');
  const btnImport = document.getElementById('btn-genetics-import');
  const fileImport = document.getElementById('genetics-import-file');
  const btnSave = document.getElementById('btn-genetics-save');

  const emptyState = document.getElementById('genetics-empty-state');
  const inspectorContent = document.getElementById('genetics-inspector-content');
  const modifiedSection = document.getElementById('genetics-modified-section');
  const modifiedList = document.getElementById('genetics-modified-list');

  const modalCross = document.getElementById('modal-crossover');
  const parentALbl = document.getElementById('cross-parent-a-lbl');
  const parentBSearch = document.getElementById('cross-parent-b-search');
  const parentBList = document.getElementById('cross-parent-b-list');
  const childName = document.getElementById('cross-child-name');
  const btnCrossRun = document.getElementById('btn-cross-run');
  const btnCrossCancel = document.getElementById('btn-cross-cancel');

  // ── Tab activation — load file list on first visit ─────────────────────
  DevToolsEvents.on('tab:activated', (tab) => {
    if (tab === 'genetics' && availableFiles.length === 0) {
      fetchFiles();
    }
  });

  // ── Controls ───────────────────────────────────────────────────────────
  btnRefresh.addEventListener('click', fetchFiles);

  filterRadios.forEach(r => r.addEventListener('change', () => {
    currentFilter = r.value;
    renderGenome();
  }));

  if (genomeSearch) {
    genomeSearch.addEventListener('input', (e) => {
      currentSearch = e.target.value.toLowerCase();
      renderGenome();
    });
  }

  if (genomeAge) {
    genomeAge.addEventListener('change', (e) => {
      currentAgeFilter = e.target.value;
      renderGenome();
    });
  }

  if (btnAddGene && addGeneType) {
    btnAddGene.addEventListener('click', () => {
      if (!currentGenome) return;
      const [typeStr, subtypeStr] = addGeneType.value.split('/');
      const newGene = createBlankGene(parseInt(typeStr, 10), parseInt(subtypeStr, 10));
      // Give it a new ID (highest ID + 1)
      const maxId = currentGenome.genes.length > 0 ? Math.max(...currentGenome.genes.map(g => g.id || 0)) : 0;
      newGene.id = maxId + 1;
      currentGenome.genes.push(newGene);
      currentGenome.geneCount = currentGenome.genes.length;
      renderGenome();
      // Scroll roughly to bottom
      genesContent.scrollTop = genesContent.scrollHeight;
    });
  }

  function renderFileList() {
    if (!fileList) return;
    const query = fileSearch ? fileSearch.value.toLowerCase().trim() : '';
    const matches = availableFiles.filter(f => f.name.toLowerCase().includes(query));
    
    let html = '';
    const limit = matches.length;
    for (let i = 0; i < limit; i++) {
        const item = matches[i];
        const isSelected = item.name === selectedFile;
        // Match the layout seen in Syringe (e.g. index followed by moniker name)
        html += `<div class="genetics-file-item ${isSelected ? 'genetics-file-item--selected' : ''}" data-id="${item.name}">
          <span style="color:rgba(0,0,0,0.35); font-family:monospace; min-width: 24px;">${i}</span> <span style="font-weight:600; flex:1;">${item.name}</span>
          ${item.isCore ? '<span style="font-size: 0.7em; background: var(--black); color: var(--white); border-radius: 4px; padding: 2px 4px; margin-left: 8px;">CORE</span>' : ''}
          ${!item.isCore ? `
            <div class="genetics-file-actions" style="margin-left:auto; display:flex; gap:4px;">
              <button class="btn-genetics-rename-inline" data-id="${item.name}" title="Rename" style="background:transparent; border:none; cursor:pointer; font-size:12px;">✏️</button>
              <button class="btn-genetics-delete-inline" data-id="${item.name}" title="Delete" style="background:transparent; border:none; cursor:pointer; font-size:12px;">🗑️</button>
            </div>
          ` : ''}
        </div>`;
    }
    
    fileList.innerHTML = html;
  }

  function renderParentBList() {
    if (!parentBList) return;
    const query = parentBSearch ? parentBSearch.value.toLowerCase().trim() : '';
    const matches = availableFiles.filter(f => f.name.toLowerCase().includes(query));
    
    let html = '';
    const limit = matches.length;
    for (let i = 0; i < limit; i++) {
        const item = matches[i];
        const isSelected = item.name === selectedParentB;
        html += `<div class="genetics-file-item ${isSelected ? 'genetics-file-item--selected' : ''}" data-id="${item.name}">
          <span style="color:rgba(0,0,0,0.35); font-family:monospace; min-width: 24px;">${i}</span> <span style="font-weight:600;">${item.name}</span>
          ${item.isCore ? '<span style="font-size: 0.7em; background: var(--black); color: var(--white); border-radius: 4px; padding: 2px 4px; margin-left: 8px;">CORE</span>' : ''}
        </div>`;
    }
    
    parentBList.innerHTML = html;
  }

  if (fileSearch) {
    fileSearch.addEventListener('input', () => {
      fileShowAll = false;
      renderFileList();
    });
  }

  if (parentBSearch) {
    parentBSearch.addEventListener('input', () => {
      parentBShowAll = false;
      renderParentBList();
    });
  }

  if (fileList) {
    fileList.addEventListener('click', (e) => {
      const btnRenameInline = e.target.closest('.btn-genetics-rename-inline');
      if (btnRenameInline) {
         e.stopPropagation();
         doRename(btnRenameInline.dataset.id);
         return;
      }
      const btnDeleteInline = e.target.closest('.btn-genetics-delete-inline');
      if (btnDeleteInline) {
         e.stopPropagation();
         doDelete(btnDeleteInline.dataset.id);
         return;
      }

      const item = e.target.closest('.genetics-file-item');
      if (!item) return;
      selectedFile = item.dataset.id;
      renderFileList();
      if (emptyState) emptyState.style.display = 'none';
      if (inspectorContent) inspectorContent.style.display = 'flex';
      selectedName.innerHTML = `Loading <strong>${selectedFile}</strong>...`;

      if (selectedFile) loadGenome(selectedFile);
    });
  }

  if (parentBList) {
    parentBList.addEventListener('click', (e) => {
      const item = e.target.closest('.genetics-file-item');
      if (!item) return;
      selectedParentB = item.dataset.id;
      renderParentBList();
    });
  }

  // ── Crossover Modal ────────────────────────────────────────────────────
  btnCrossover.addEventListener('click', () => {
    if (!currentGenome) return;
    parentALbl.innerText = currentGenome.moniker;
    if (parentBSearch) parentBSearch.value = '';
    parentBShowAll = false;
    renderParentBList();
    modalCross.hidden = false;
  });

  btnCrossCancel.addEventListener('click', () => modalCross.hidden = true);

  // Close on backdrop click
  const backdrop = modalCross.querySelector('.modal-crossover-backdrop');
  if (backdrop) backdrop.addEventListener('click', () => modalCross.hidden = true);

  btnCrossRun.addEventListener('click', async () => {
    const a = currentGenome ? currentGenome.moniker : '';
    const b = selectedParentB;
    const c = childName.value;
    if (!a || !b || !c) return;

    btnCrossRun.textContent = "Splicing\u2026";
    try {
      const resp = await fetch('/api/genetics/crossover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentA: a, parentB: b, child: c })
      });
      const data = await resp.json();
      if (data.status === 'success') {
        await fetchFiles();
        selectedFile = data.child;
        fileShowAll = false;
        if (fileSearch) fileSearch.value = '';
        renderFileList();
        if (emptyState) emptyState.style.display = 'none';
        if (inspectorContent) inspectorContent.style.display = 'flex';
        selectedName.innerHTML = `Loading <strong>${data.child}</strong>...`;
        loadGenome(data.child);
        modalCross.hidden = true;
      } else {
        alert('Error: ' + (data.error || 'Unknown'));
      }
    } catch (e) {
      alert("Request failed");
    } finally {
      btnCrossRun.textContent = "Cross";
    }
  });

  // ── New/Import/Export/Save ─────────────────────────────────────────────
  if (btnNew) {
    btnNew.addEventListener('click', () => {
      if (emptyState) emptyState.style.display = 'none';
      if (inspectorContent) inspectorContent.style.display = 'flex';
      const g = {
        moniker: "NewGenome",
        geneCount: 2,
        genes: [
          createBlankGene(2, 1), // Genus
          createBlankGene(2, 2)  // Appearance (Head)
        ]
      };
      g.genes[0].id = 1;
      g.genes[1].id = 2;
      g.genes.forEach(gene => gene._originalStr = getGeneState(gene));
      currentGenome = g;
      renderGenome();
    });
  }

  if (btnExport) {
    btnExport.addEventListener('click', () => {
      if (!currentGenome) return;
      const json = JSON.stringify(currentGenome, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = currentGenome.moniker + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  if (btnImport && fileImport) {
    btnImport.addEventListener('click', () => fileImport.click());
    fileImport.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const loaded = JSON.parse(e.target.result);
          if (loaded.genes && loaded.moniker) {
             loaded.genes.forEach(g => g._originalStr = getGeneState(g));
             currentGenome = loaded;
             if (emptyState) emptyState.style.display = 'none';
             if (inspectorContent) inspectorContent.style.display = 'flex';
             renderGenome();
          } else {
             alert('Invalid genome JSON format.');
          }
        } catch (err) {
          alert('Error parsing JSON');
        }
        fileImport.value = '';
      };
      reader.readAsText(file);
    });
  }

  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      if (!currentGenome) return;
      btnSave.textContent = "Saving\u2026";
      
      const saveName = prompt("Save as:", currentGenome.moniker);
      if (!saveName) {
         btnSave.textContent = "SAVE";
         return;
      }
      const dataOut = { ...currentGenome, saveName: saveName };
      
      try {
        const resp = await fetch('/api/genetics/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataOut)
        });
        const data = await resp.json();
        if (data.status === "success") {
          await fetchFiles();
          currentGenome.moniker = saveName;
          currentGenome.genes.forEach(g => g._originalStr = getGeneState(g));
          renderGenome();
        } else {
          alert("Error: " + (data.error || 'Unknown'));
        }
      } catch (e) {
        alert("Save failed");
      } finally {
        btnSave.textContent = "SAVE";
      }
    });
  }

  async function doDelete(moniker) {
    if (!moniker) return;
    if (!confirm(`Are you sure you want to delete ${moniker}.gen?`)) return;
    
    try {
      const resp = await fetch('/api/genetics/delete/' + encodeURIComponent(moniker), { method: 'POST' });
      const data = await resp.json();
      if (data.status === "success") {
        if (selectedFile === moniker) {
          currentGenome = null;
          selectedFile = null;
          if (emptyState) emptyState.style.display = 'flex';
          if (inspectorContent) inspectorContent.style.display = 'none';
          genesContent.innerHTML = '';
          if (selectedName) selectedName.innerHTML = 'Selected: none';
        }
        await fetchFiles();
      } else {
        alert("Error: " + (data.error || 'Unknown'));
      }
    } catch (e) {
      alert("Delete failed");
    }
  }

  async function doRename(moniker) {
    if (!moniker) return;
    const newName = prompt("Enter new genome name:", moniker);
    if (!newName || newName === moniker) return;
    
    try {
      const resp = await fetch('/api/genetics/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName: moniker, newName: newName })
      });
      const data = await resp.json();
      if (data.status === "success") {
        if (selectedFile === moniker) {
          selectedFile = newName;
          if (currentGenome) currentGenome.moniker = newName;
          if (selectedName) selectedName.innerHTML = `Loading <strong>${selectedFile}</strong>...`;
          loadGenome(selectedFile);
        }
        await fetchFiles();
      } else {
        alert("Error: " + (data.error || 'Unknown'));
      }
    } catch (e) {
      alert("Rename failed");
    }
  }

  // ── Inject ─────────────────────────────────────────────────────────────
  btnInject.addEventListener('click', async () => {
    if (!currentGenome) return;
    const injectModeSelect = document.getElementById('genetics-inject-mode');
    const mode = injectModeSelect ? injectModeSelect.value : 'creature';
    btnInject.textContent = "Injecting\u2026";
    try {
      const resp = await fetch('/api/genetics/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...currentGenome, injectMode: mode })
      });
      const data = await resp.json();
      if (data.status === "success") {
        injectStatus.style.opacity = "1";
        if (injectStatus._timeout) clearTimeout(injectStatus._timeout);
        injectStatus._timeout = setTimeout(() => injectStatus.style.opacity = "0", 3000);
        await fetchFiles();
      } else {
        alert("Error: " + (data.error || 'Unknown'));
      }
    } catch (e) {
      alert("Injection failed");
    } finally {
      btnInject.textContent = "Inject to Engine";
    }
  });

  // ── Fetch available .gen files ─────────────────────────────────────────
  async function fetchFiles() {
    try {
      const resp = await fetch('/api/genetics/files');
      availableFiles = await resp.json();
      
      renderFileList();
      renderParentBList();
    } catch (e) {
      console.warn("DevTools: genetics file list fetch failed", e);
    }
  }

  // ── Load & parse a genome ──────────────────────────────────────────────
  async function loadGenome(moniker) {
    genesContent.innerHTML = '<div class="crt-empty-hint">Loading\u2026</div>';
    try {
      const resp = await fetch('/api/genetics/file/' + moniker);
      const data = await resp.json();
      if (data.error) {
        if (selectedName) selectedName.innerHTML = `<span style="color:var(--red);">Error: ${data.error}</span>`;
        genesContent.innerHTML = '<div class="crt-empty-hint">Error: ' + data.error + '</div>';
        currentGenome = null;
        return;
      }
      // Attach active flag (prevents "Slider Syndrome" — soft-delete, not array mutation)
      data.genes.forEach(g => {
        g.active = true;
        g._originalStr = getGeneState(g);
      });
      const fileInfo = availableFiles.find(f => f.name === moniker);
      data.isCore = fileInfo ? fileInfo.isCore : false;
      currentGenome = data;
      renderGenome();
    } catch (e) {
      if (selectedName) selectedName.innerHTML = `<span style="color:var(--red);">Failed to load genome</span>`;
    }
  }

  // ── Render gene cards ──────────────────────────────────────────────────
  function renderGenome() {
    if (!currentGenome) return;

    if (selectedName) {
      selectedName.innerHTML = `Selected: <strong>${currentGenome.moniker}</strong> &mdash; <span style="color:var(--orange);">${currentGenome.geneCount} genes</span>`;
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

    const isInteractive = !currentGenome.isCore;
    if (btnAddGene) btnAddGene.style.display = isInteractive ? '' : 'none';
    if (btnSave) btnSave.style.display = isInteractive ? '' : 'none';
    if (addGeneType) addGeneType.style.display = isInteractive ? '' : 'none';

    currentGenome.genes.forEach((g, i) => {
      if (reqType !== -1 && g.type !== reqType) return;
      if (currentAgeFilter !== 'all') {
         if (g.switchOnTime.toString() !== currentAgeFilter) return;
      }

      const cardHtml = window.GeneRenderer.renderGeneCard(g, i, isInteractive);

      if (currentSearch) {
        // Extract input values so they aren't destroyed when stripping HTML tags
        let textWithInputs = cardHtml.replace(/<input\b[^>]*\bvalue="([^"]*)"[^>]*>/gi, ' $1 ');
        const rawText = textWithInputs.replace(/<[^>]*>/g, ' ').toLowerCase();
        if (!rawText.includes(currentSearch)) return;
      }

      html += cardHtml;
      count++;
    });

    if (count === 0) {
      genesContent.innerHTML = '<div class="crt-empty-hint">No genes match the current filters.</div>';
    } else {
      genesContent.innerHTML = html;
    }
    
    updateModifiedSection();
  }

  function getGeneState(g) {
    const clone = { ...g };
    delete clone._originalStr;
    return JSON.stringify(clone);
  }

  function updateModifiedSection() {
    if (!modifiedSection || !modifiedList || !currentGenome) return;
    
    let html = '';
    let hasModified = false;
    currentGenome.genes.forEach((g, i) => {
      if (getGeneState(g) !== g._originalStr) {
        hasModified = true;
        html += `<div class="crt-gene-badge" style="cursor:pointer; background: var(--white); border: 1px solid var(--orange);" onclick="window.highlightGene(${i})">
          ${g.typeName} — ${g.subtypeName} <span style="opacity:0.5">#${g.id}</span>
        </div>`;
      }
    });

    if (hasModified) {
      modifiedSection.style.display = 'flex';
      modifiedList.innerHTML = html;
    } else {
      modifiedSection.style.display = 'none';
      modifiedList.innerHTML = '';
    }
  }

  window.highlightGene = function(idx) {
    const el = document.querySelector(`.crt-gene-card[data-idx='${idx}']`);
    if (el) {
      el.scrollIntoView({behavior: 'smooth', block: 'center'});
      el.classList.remove('gene-highlight-anim');
      void el.offsetWidth; // trigger reflow to restart animation
      el.classList.add('gene-highlight-anim');
    }
  };

  // ── Event Delegation for Genes ───────────────────────────────────────
  genesContent.addEventListener('click', (e) => {
    const target = e.target;
    
    // Gene Actions
    if (!currentGenome) return;
    if (target.tagName === 'BUTTON' && target.dataset.idx) {
      const idx = parseInt(target.dataset.idx, 10);
      if (isNaN(idx)) return;
      
      const genes = currentGenome.genes;
      if (target.classList.contains('g-btn-up')) {
        if (idx > 0) {
          const temp = genes[idx];
          genes[idx] = genes[idx - 1];
          genes[idx - 1] = temp;
          renderGenome();
        }
        return;
      }
      
      if (target.classList.contains('g-btn-down')) {
        if (idx < genes.length - 1) {
          const temp = genes[idx];
          genes[idx] = genes[idx + 1];
          genes[idx + 1] = temp;
          renderGenome();
        }
        return;
      }
      
      if (target.classList.contains('g-btn-dup')) {
        const cloned = JSON.parse(JSON.stringify(genes[idx]));
        cloned.generation += 1;
        const maxId = currentGenome.genes.length > 0 ? Math.max(...currentGenome.genes.map(g => g.id || 0)) : 0;
        cloned.id = maxId + 1;
        genes.splice(idx + 1, 0, cloned);
        currentGenome.geneCount = genes.length;
        renderGenome();
        return;
      }
      
      if (target.classList.contains('g-btn-del')) {
        genes.splice(idx, 1);
        currentGenome.geneCount = genes.length;
        renderGenome();
        return;
      }
    }

    // Expand / collapse cards
    const header = target.closest('.crt-gene-header');
    if (header) {
      const body = header.nextElementSibling;
      const chevron = header.querySelector('.crt-gene-chevron');
      if (body && body.classList.contains('crt-gene-body')) {
        if (body.style.display === 'none') {
          body.style.display = 'block';
          if (chevron) chevron.textContent = '▼';
        } else {
          body.style.display = 'none';
          if (chevron) chevron.textContent = '▶';
        }
      }
      return;
    }
  });

  genesContent.addEventListener('change', (e) => {
    // Bind input changes back to data model
    if (!currentGenome) return;
    const el = e.target;
    if (el.tagName !== 'INPUT' && el.tagName !== 'SELECT') return;

    // ── SVRule Editor: handle opcode/operand/value changes ──────────
    const isSVR = el.classList.contains('svrule-op') ||
                  el.classList.contains('svrule-operand') ||
                  el.classList.contains('svrule-val-text') ||
                  el.classList.contains('svrule-val-chem');
    if (isSVR) {
      const editor = el.closest('.crt-svrule-editor');
      if (!editor) return;
      const hiddenInput = editor.querySelector('.crt-svrule-hidden-bytes');
      if (!hiddenInput) return;

      const GR = window.GeneRenderer;
      const keyPath = hiddenInput.dataset.key;
      const geneIdx = parseInt(hiddenInput.dataset.idx, 10);
      if (isNaN(geneIdx) || !currentGenome.genes[geneIdx]) return;
      const gene = currentGenome.genes[geneIdx];

      // If opcode changed, toggle operand/value visibility
      if (el.classList.contains('svrule-op')) {
        const rowIdx = el.dataset.row;
        const opVal = parseInt(el.value, 10);
        const isNoOp = GR.NOOP_OPCODES.has(opVal);
        const opdWrap = editor.querySelector(`.svrule-operand-wrap[data-row="${rowIdx}"]`);
        const valWrap = editor.querySelector(`.svrule-val-wrap[data-row="${rowIdx}"]`);
        if (opdWrap) {
          opdWrap.style.opacity = isNoOp ? '0' : '1';
          opdWrap.style.pointerEvents = isNoOp ? 'none' : 'auto';
        }
        if (valWrap) {
          valWrap.style.opacity = isNoOp ? '0' : '1';
          valWrap.style.pointerEvents = isNoOp ? 'none' : 'auto';
        }
      }

      // If operand changed, swap value cell between text/number and chemical combobox
      if (el.classList.contains('svrule-operand')) {
        const rowIdx = el.dataset.row;
        const operandVal = parseInt(el.value, 10);
        const isChem = GR.CHEM_OPERANDS.has(operandVal);
        const isFloat = GR.FLOAT_OPERANDS.has(operandVal);
        const valWrap = editor.querySelector(`.svrule-val-wrap[data-row="${rowIdx}"]`);
        if (valWrap) {
          const existingText = valWrap.querySelector('.svrule-val-text');
          const existingChem = valWrap.querySelector('.svrule-combo');
          const existingChemWrap = valWrap.querySelector('.svrule-val-chem-wrap');
          const currentValByte = existingText ? parseInt(existingText.value, 10) || 0 :
                                 (existingChem ? parseInt(existingChem.querySelector('.svrule-val-chem')?.value, 10) || 0 : 0);

          if (isChem) {
            // Need chemical combobox: rebuild the entire value cell
            valWrap.innerHTML = GR.svCombo('svrule-val-chem', rowIdx, GR.CHEMS, false, currentValByte, 'width:100%;') +
              `<input type="number" class="svrule-val-text" data-row="${rowIdx}" value="${currentValByte}" style="display:none;" />`;
          } else if (isFloat) {
            const fv = GR.decodeFloatFromSVRule(currentValByte, operandVal);
            valWrap.innerHTML = `<input type="number" class="svrule-val-text" data-row="${rowIdx}" value="${fv.toFixed(4)}" step="0.01" style="width:100%; padding:2px 4px; font-family:var(--font-mono); font-size:11px; border:1px solid rgba(0,0,0,0.15);" />` +
              `<div class="svrule-val-chem-wrap" data-row="${rowIdx}" style="display:none;"></div>`;
          } else {
            valWrap.innerHTML = `<input type="number" class="svrule-val-text" data-row="${rowIdx}" value="${currentValByte}" min="0" max="255" style="width:100%; padding:2px 4px; font-family:var(--font-mono); font-size:11px; border:1px solid rgba(0,0,0,0.15);" />` +
              `<div class="svrule-val-chem-wrap" data-row="${rowIdx}" style="display:none;"></div>`;
          }
        }
      }

      // Rebuild the 48-byte array from the 16 rows
      const newBytes = [];
      for (let r = 0; r < 16; r++) {
        const opInput = editor.querySelector(`.svrule-op[data-row="${r}"]`);
        const opdInput = editor.querySelector(`.svrule-operand[data-row="${r}"]`);
        const valText = editor.querySelector(`.svrule-val-text[data-row="${r}"]`);
        const valChem = editor.querySelector(`.svrule-val-chem[data-row="${r}"]`);

        const opByte = opInput ? parseInt(opInput.value, 10) : 0;
        const opdByte = opdInput ? parseInt(opdInput.value, 10) : 0;

        let valByte = 0;
        if (GR.CHEM_OPERANDS.has(opdByte) && valChem) {
          valByte = parseInt(valChem.value, 10) || 0;
        } else if (GR.FLOAT_OPERANDS.has(opdByte) && valText) {
          valByte = GR.encodeFloatToSVRule(parseFloat(valText.value) || 0, opdByte);
        } else if (valText) {
          valByte = Math.max(0, Math.min(255, parseInt(valText.value, 10) || 0));
        }

        newBytes.push(opByte, opdByte, valByte);
      }

      // Update the hidden input and data model
      hiddenInput.value = newBytes.join(',');
      gene.data[keyPath] = newBytes;

      // Re-render the human-readable SVRule display above the editor
      const parsedKey = keyPath.replace('Bytes', ''); // initRuleBytes → initRule, updateRuleBytes → updateRule
      const entries = GR.parseSVRuleBytes(newBytes);
      gene.data[parsedKey] = entries;

      // Find the .crt-nd-svrule display: editor → svrule-details → previous sibling
      const details = editor.closest('.svrule-details');
      if (details) {
        let sibling = details.previousElementSibling;
        while (sibling && !sibling.classList.contains('crt-nd-svrule') && !sibling.classList.contains('crt-nd-svrule-empty')) {
          sibling = sibling.previousElementSibling;
        }
        if (sibling && window.formatSVRule) {
          sibling.outerHTML = window.formatSVRule(entries);
        }
      }

      updateModifiedSection();
      return;
    }

    // ── Standard gene field handling ────────────────────────────────
    const idx = parseInt(el.dataset.idx, 10);
    if (isNaN(idx)) return;
    const g = currentGenome.genes[idx];

    if (el.type === 'checkbox') {
      if (el.classList.contains('g-active')) {
        g.active = el.checked;
      } else if (el.classList.contains('g-mut')) {
        g.flags.mutable = el.checked;
      } else if (el.classList.contains('g-dup')) {
        g.flags.dupable = el.checked;
      } else if (el.classList.contains('g-cut')) {
        g.flags.cutable = el.checked;
      }
      updateModifiedSection();
      return;
    }

    if (el.classList.contains('crt-gene-input')) {
      const keyPath = el.dataset.key;
      if (!keyPath || !g.data) return;
      
      let val = el.value;
      if (el.type === 'number' || el.tagName === 'SELECT' || (el.type === 'hidden' && !isNaN(val))) {
        const num = parseFloat(val);
        if (!isNaN(num)) val = num;
      }

      if (keyPath === 'poses') {
         g.data[keyPath] = String(val).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      } else {
         g.data[keyPath] = val;
      }
      
      updateModifiedSection();
      // Note: We don't call renderGenome() here to avoid stealing focus from the user while typing.
    }
  });

  // ── Combobox Event Handling ───────────────────────────────────────────
  genesContent.addEventListener('click', (e) => {
    // 1. Click on the trigger
    const trigger = e.target.closest('.crt-combobox-trigger');
    if (trigger) {
      const combobox = trigger.closest('.crt-combobox');
      const popup = combobox.querySelector('.crt-combobox-popup');
      const search = combobox.querySelector('.crt-combobox-search');
      const list = combobox.querySelector('.crt-combobox-list');
      
      const isVisible = popup.style.display === 'block';
      
      // Close all other popups
      document.querySelectorAll('.crt-combobox-popup').forEach(p => p.style.display = 'none');
      
      if (!isVisible) {
        popup.style.display = 'block';
        
        // Reset filter and always scroll to top so human-readable items are visible
        search.value = '';
        list.querySelectorAll('.crt-combobox-item').forEach(item => item.style.display = 'block');
        list.scrollTop = 0;
        
        search.focus();
      }
      return;
    }

    // 2. Click on an item
    const item = e.target.closest('.crt-combobox-item');
    if (item) {
      const combobox = item.closest('.crt-combobox');
      const hiddenInput = combobox.querySelector('input[type="hidden"]');
      const triggerSpan = combobox.querySelector('.crt-combobox-trigger span');
      const popup = combobox.querySelector('.crt-combobox-popup');
      
      const val = item.dataset.val;
      const label = item.dataset.label;
      
      if (hiddenInput) hiddenInput.value = val;
      if (triggerSpan) triggerSpan.textContent = label;
      combobox.querySelector('.crt-combobox-trigger').title = label;
      popup.style.display = 'none';
      
      // Dispatch change event to trigger saving
      if (hiddenInput) hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
  });

  genesContent.addEventListener('input', (e) => {
    if (e.target.classList.contains('crt-combobox-search')) {
      const combobox = e.target.closest('.crt-combobox');
      const list = combobox.querySelector('.crt-combobox-list');
      
      const filter = e.target.value.toLowerCase();
      const items = list.querySelectorAll('.crt-combobox-item');
      items.forEach(item => {
        const textToSearch = (item.dataset.val + ' ' + item.dataset.label).toLowerCase();
        if (textToSearch.includes(filter)) {
          item.style.display = 'block';
        } else {
          item.style.display = 'none';
        }
      });
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.crt-combobox')) {
      document.querySelectorAll('.crt-combobox-popup').forEach(popup => {
        popup.style.display = 'none';
      });
    }
  });

  function createBlankGene(type, subtype) {
    const typeNames = ["Brain", "Biochemistry", "Creature", "Organ"];
    const subtypeNames = {
      0: ["Lobe", "Brain Organ", "Tract"],
      1: ["Receptor", "Emitter", "Reaction", "Half-lives", "InitConc", "Neuroemitter"],
      2: ["Stimulus", "Genus", "Appearance", "Pose", "Gait", "Instinct", "Pigment", "Pigment Bleed", "Expression"],
      3: ["Organ"]
    };

    const g = {
      id: 0,
      type: type,
      subtype: subtype,
      typeName: typeNames[type] || "Unknown",
      subtypeName: subtypeNames[type]?.[subtype] || "Unknown",
      generation: 1,
      switchOnTime: 1,
      switchOnLabel: "Baby",
      active: true,
      flags: { mutable: true, dupable: true, cutable: true, maleOnly: false, femaleOnly: false, dormant: false },
      data: {}
    };

    // Sensible defaults
    if (type === 0 && subtype === 0) g.data = { lobeName: "lob", x: 0, y: 0, width: 1, height: 1, red: 255, green: 255, blue: 255, wta: 0, updateTime: 1, initRule: [0], updateRule: [0] };
    if (type === 0 && subtype === 2) g.data = { srcLobe: 0, srcVar: 0, dstLobe: 0, dstVar: 0, migrates: 0, updateTime: 1, initRule: [0], updateRule: [0] };
    if (type === 0 && subtype === 1) g.data = { clockRate: 0, damageRate: 0, lifeForce: 0, biotickStart: 0, atpDamageCoef: 0 };
    if (type === 1 && (subtype === 0 || subtype === 1)) g.data = { organ: 0, tissue: 0, locus: 0, chemical: 0, threshold: 0, gain: 128, nominal: 0, rate: 0, flags: 0 };
    if (type === 1 && subtype === 2) g.data = { r1Amount: 0, r1Chem: 0, r2Amount: 0, r2Chem: 0, p1Amount: 0, p1Chem: 0, p2Amount: 0, p2Chem: 0, rate: 0 };
    if (type === 1 && subtype === 4) g.data = { chemical: 0, amount: 128 };
    if (type === 1 && subtype === 5) g.data = { lobe0: 0, neuron0: 0, lobe1: 0, neuron1: 0, lobe2: 0, neuron2: 0, rate: 0, chem0: 0, amount0: 0, chem1: 0, amount1: 0, chem2: 0, amount2: 0, chem3: 0, amount3: 0 };
    if (type === 2 && subtype === 0) g.data = { stimulus: 0, significance: 0, input: 0, intensity: 0, chem0: 0, amount0: 0, chem1: 0, amount1: 0, chem2: 0, amount2: 0, chem3: 0, amount3: 0 };
    if (type === 2 && subtype === 1) g.data = { genus: 1, motherMoniker: "", fatherMoniker: "" };
    if (type === 2 && subtype === 2) g.data = { part: 0, variant: 0, species: 0 };
    if (type === 2 && subtype === 3) g.data = { poseNumber: 0, poseString: "0" };
    if (type === 2 && subtype === 4) g.data = { gait: 0, poses: [0,0,0,0,0,0,0,0] };
    if (type === 2 && subtype === 5) g.data = { lobe0: 0, cell0: 0, lobe1: 0, cell1: 0, lobe2: 0, cell2: 0, action: 0, reinforcementAmount: 0, reinforcementChemical: 0 };
    if (type === 2 && subtype === 6) g.data = { pigment: 0, amount: 0 };
    if (type === 2 && subtype === 7) g.data = { rotation: 0, swap: 0 };
    if (type === 2 && subtype === 8) g.data = { expression: 0, weight: 0, drive0: 0, amount0: 0, drive1: 0, amount1: 0, drive2: 0, amount2: 0, drive3: 0, amount3: 0 };
    if (type === 3 && subtype === 0) g.data = { clockRate: 0, damageRate: 0, lifeForce: 0, biotickStart: 0, atpDamageCoef: 0 };

    return g;
  }

})();
