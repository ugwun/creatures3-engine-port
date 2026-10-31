// ── Genetics Kit ──────────────────────────────────────────────────────────────
// Top-level tab for trusted .gen inspection and copy-first experiments.
// Originals remain read-only; only saved, reviewed experimental copies can
// be introduced into a deliberately confirmed world.

(() => {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────
  let availableFiles = [];
  let currentGenome = null;
  let sourceGenome = null;
  let persistedGenome = null;
  let liveReferences = [];
  let lastDiff = null;
  // Gene objects survive re-rendering; their cards do not.
  let expandedGenes = new WeakSet();
  let visibleGeneIndexes = [];
  let genomeLoadSerial = 0;
  let injectionReview = null;
  let lastInjectedResult = null;
  let operationPending = false;

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
  const Model = window.GeneticsExperimentModel;
  const identityKind = document.getElementById('genetics-identity-kind');
  const identityProtection = document.getElementById(
    'genetics-identity-protection');
  const identityCurrent = document.getElementById('genetics-identity-current');
  const identitySource = document.getElementById('genetics-identity-source');
  const identityChecksum = document.getElementById(
    'genetics-identity-checksum');
  const identitySourceChecksum = document.getElementById(
    'genetics-identity-source-checksum');
  const identityFormat = document.getElementById('genetics-identity-format');
  const identityLive = document.getElementById('genetics-identity-live');
  const identityBiography = document.getElementById(
    'genetics-identity-biography');
  const copyName = document.getElementById('genetics-copy-name');
  const copyNameLabel = document.querySelector(
    'label[for="genetics-copy-name"]');
  const btnCreateCopy = document.getElementById(
    'btn-genetics-create-copy');
  const safetyStatus = document.getElementById('genetics-safety-status');
  const workflowSteps = document.getElementById('genetics-workflow-steps');
  const diffSummary = document.getElementById('genetics-diff-summary');
  const diffList = document.getElementById('genetics-diff-list');
  const injectionDialog = document.getElementById(
    'genetics-injection-dialog');
  const injectionSummary = document.getElementById(
    'genetics-injection-summary');
  const disposableConfirm = document.getElementById(
    'genetics-disposable-confirm');
  const finalConfirm = document.getElementById('genetics-final-confirm');
  const injectionErrors = document.getElementById(
    'genetics-injection-errors');
  const injectionApply = document.getElementById(
    'genetics-injection-apply');

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

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function deepClone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function fileIdentity() {
    return currentGenome && currentGenome.identity || {};
  }

  function isExperimental() {
    return Boolean(currentGenome &&
      (currentGenome._draft || fileIdentity().isExperimental));
  }

  function hasUnsavedChanges() {
    if (!currentGenome || !persistedGenome) return false;
    return Model.checksum(currentGenome) !== Model.checksum(persistedGenome);
  }

  function normalizedImportedGenome(payload) {
    if (!payload || typeof payload !== 'object' ||
        !Array.isArray(payload.genes) ||
        typeof payload.moniker !== 'string' ||
        payload.genes.length > 10000) {
      throw new Error(
        'Expected a genome object with a moniker and no more than 10,000 genes.');
    }
    const ageLabels = [
      'Baby', 'Child', 'Adolescent', 'Youth',
      'Adult', 'Old', 'Senile'
    ];
    const genes = payload.genes.map((raw, index) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('Gene ' + index + ' is not a structured object.');
      }
      const type = Number.isInteger(raw.type) ? raw.type : -1;
      const subtype = Number.isInteger(raw.subtype) ? raw.subtype : -1;
      const gene = Model.createBlankGene(type, subtype);
      ['id', 'generation', 'switchOnTime', 'mutability',
        'variant', 'flagsRaw'].forEach(key => {
        if (raw[key] != null) gene[key] = raw[key];
      });
      gene.active = raw.active !== false;
      gene.switchOnLabel =
        ageLabels[gene.switchOnTime] || String(gene.switchOnTime);
      const flags = raw.flags &&
        typeof raw.flags === 'object' && !Array.isArray(raw.flags)
        ? raw.flags : {};
      gene.flags = {
        mutable: Boolean(flags.mutable),
        dupable: Boolean(flags.dupable),
        cutable: Boolean(flags.cutable),
        maleOnly: Boolean(flags.maleOnly),
        femaleOnly: Boolean(flags.femaleOnly),
        dormant: Boolean(flags.dormant)
      };
      const importedData = raw.data &&
        typeof raw.data === 'object' && !Array.isArray(raw.data)
        ? raw.data : {};
      const data = Object.assign({}, gene.data);
      Object.keys(importedData).forEach(key => {
        if (key !== '__proto__' && key !== 'constructor' &&
            key !== 'prototype') {
          data[key] = deepClone(importedData[key]);
        }
      });
      gene.data = data;
      return gene;
    });
    return {
      moniker: payload.moniker.slice(0, 160),
      geneCount: genes.length,
      genes
    };
  }

  // ── Tab activation — load file list on first visit ─────────────────────
  DevToolsEvents.on('tab:activated', (tab) => {
    if (tab === 'genetics') {
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
      const newGene = Model.createBlankGene(parseInt(typeStr, 10), parseInt(subtypeStr, 10));
      newGene.id = Model.nextGeneId(currentGenome.genes, newGene.type, newGene.subtype);
      if (newGene.id == null) {
        safetyStatus.textContent =
          'Not added: all 256 ' + newGene.subtypeName +
          ' gene IDs are in use.';
        return;
      }
      currentGenome.genes.push(newGene);
      currentGenome.geneCount = currentGenome.genes.length;
      expandedGenes.add(newGene);
      renderGenome();
      safetyStatus.textContent = 'Added ' + newGene.subtypeName +
        ' gene #' + newGene.id + ' to the draft. Save the copy to keep it.';
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
        const safeName = escapeHtml(item.name);
        html += `<div class="genetics-file-item ${isSelected ? 'genetics-file-item--selected' : ''}" data-id="${safeName}">
          <span style="color:rgba(0,0,0,0.35); font-family:monospace; min-width: 24px;">${i}</span> <span style="font-weight:600; flex:1;">${safeName}</span>
          ${item.isCore ? '<span style="font-size: 0.7em; background: var(--black); color: var(--white); border-radius: 4px; padding: 2px 4px; margin-left: 8px;">CORE</span>' : ''}
          ${item.isExperimental ? '<span class="genetics-copy-badge">COPY</span>' : ''}
          ${item.metadataStatus === 'invalid_or_stale'
            ? '<span class="genetics-stale-badge" title="Experimental provenance is invalid or stale; writes are blocked">STALE META</span>'
            : ''}
          ${item.isExperimental ? `
            <div class="genetics-file-actions" style="margin-left:auto; display:flex; gap:4px;">
              <button class="btn-genetics-rename-inline" data-id="${safeName}" title="Rename experimental copy" aria-label="Rename experimental copy ${safeName}">✏️</button>
              <button class="btn-genetics-delete-inline" data-id="${safeName}" title="Delete experimental copy" aria-label="Delete experimental copy ${safeName}">🗑️</button>
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
        const safeName = escapeHtml(item.name);
        html += `<div class="genetics-file-item ${isSelected ? 'genetics-file-item--selected' : ''}" data-id="${safeName}">
          <span style="color:rgba(0,0,0,0.35); font-family:monospace; min-width: 24px;">${i}</span> <span style="font-weight:600;">${safeName}</span>
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
      selectedName.textContent = 'Loading ' + selectedFile + '…';

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
    childName.value = Model.suggestCopyName(
      currentGenome.moniker + '_cross',
      availableFiles.map(file => file.name));
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
    const checkedName = Model.validateName(childName.value);
    const c = checkedName.name;
    if (!a || !b || !checkedName.valid) {
      safetyStatus.textContent = checkedName.error ||
        'Select two parent genomes.';
      return;
    }

    btnCrossRun.textContent = "Splicing\u2026";
    try {
      const resp = await fetch('/api/genetics/crossover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentA: a, parentB: b, child: c })
      });
      const data = await resp.json();
      if (data.status === 'success') {
        safetyStatus.textContent =
          'Derived crossover created with checksum ' +
          (data.childChecksum || 'unavailable') + '.';
        await fetchFiles();
        selectedFile = data.child;
        fileShowAll = false;
        if (fileSearch) fileSearch.value = '';
        renderFileList();
        if (emptyState) emptyState.style.display = 'none';
        if (inspectorContent) inspectorContent.style.display = 'flex';
        selectedName.textContent = 'Loading ' + data.child + '…';
        loadGenome(data.child);
        modalCross.hidden = true;
      } else {
        safetyStatus.textContent =
          'Crossover not created: ' + (data.error || 'Unknown error.');
      }
    } catch (e) {
      safetyStatus.textContent =
        'Crossover request failed; no success was assumed.';
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
          Model.createBlankGene(2, 1), // Genus
          Model.createBlankGene(2, 2)  // Appearance (Head)
        ]
      };
      g.genes[0].id = 1;
      g.genes[1].id = 2;
      g.genes.forEach(gene => gene._originalStr = getGeneState(gene));
      g._draft = true;
      g._draftOrigin = 'new';
      g.identity = {
        currentName: null,
        sourceName: null,
        sourceChecksum: null,
        checksum: null,
        checksumAlgorithm: 'FNV-1a-64',
        format: 'dna3',
        isProtected: false,
        isExperimental: true,
        origin: 'new'
      };
      genomeLoadSerial += 1; // a pending load must not replace the draft
      currentGenome = g;
      sourceGenome = { genes: [] };
      persistedGenome = deepClone(g);
      selectedFile = null;
      safetyStatus.textContent =
        'New browser draft. Choose a unique name to create its first experimental file.';
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
          const parsed = JSON.parse(e.target.result);
          const loaded = normalizedImportedGenome(parsed);
          if (loaded.genes && loaded.moniker) {
             loaded.genes.forEach(g => g._originalStr = getGeneState(g));
             loaded._draft = true;
             loaded._draftOrigin = 'import';
             loaded.identity = {
               currentName: null,
               sourceName: 'Imported JSON ' + file.name,
               sourceChecksum: Model.checksum(loaded),
               checksum: null,
               checksumAlgorithm: 'FNV-1a-64 model fingerprint',
               format: loaded.format || 'dna3-compatible JSON',
               isProtected: false,
               isExperimental: true,
               origin: 'import'
             };
             genomeLoadSerial += 1;
             currentGenome = loaded;
             sourceGenome = deepClone(loaded);
             persistedGenome = deepClone(loaded);
             selectedFile = null;
             if (emptyState) emptyState.style.display = 'none';
             if (inspectorContent) inspectorContent.style.display = 'flex';
             safetyStatus.textContent =
               'Imported JSON is a browser draft; no source file was modified.';
             renderGenome();
          } else {
             safetyStatus.textContent =
               'Import rejected: invalid genome JSON format.';
          }
        } catch (err) {
          safetyStatus.textContent =
            'Import rejected: ' + (err.message || 'malformed JSON') + '.';
        }
        fileImport.value = '';
      };
      reader.readAsText(file);
    });
  }

  btnCreateCopy.addEventListener('click', async () => {
    if (!currentGenome || isExperimental() || operationPending) return;
    const identity = fileIdentity();
    const checked = Model.validateName(copyName.value);
    if (!checked.valid) {
      safetyStatus.textContent = checked.error;
      return;
    }
    if (availableFiles.some(file => file.name === checked.name)) {
      safetyStatus.textContent =
        'That genome name already exists. Choose a new experimental name.';
      return;
    }
    operationPending = true;
    btnCreateCopy.textContent = 'Creating copy…';
    renderIdentityAndDiff();
    try {
      const response = await fetch('/api/genetics/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceName: identity.currentName || currentGenome.moniker,
          derivedName: checked.name
        })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Engine rejected the copy.');
      }
      safetyStatus.textContent =
        'Experimental copy created at tick ' + result.worldTick +
        '. Source ' + result.sourceChecksum + ' → copy ' +
        result.derivedChecksum + '.';
      await fetchFiles();
      selectedFile = result.derivedName;
      renderFileList();
      await loadGenome(result.derivedName);
    } catch (error) {
      safetyStatus.textContent =
        'Copy not created: ' + (error.message || 'request failed') +
        '. The source genome was not modified.';
    } finally {
      operationPending = false;
      btnCreateCopy.textContent = 'Create experimental copy';
      if (currentGenome) renderGenome();
    }
  });

  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      if (!currentGenome || !isExperimental() || operationPending) return;
      const writeCheck = Model.writeReadiness(currentGenome);
      if (!writeCheck.ready) {
        safetyStatus.textContent =
          'Not saved: ' + writeCheck.errors.join(' ');
        return;
      }
      btnSave.textContent = "Saving\u2026";
      operationPending = true;
      try {
        let endpoint = '/api/genetics/save-experiment';
        let saveName = fileIdentity().currentName || currentGenome.moniker;
        if (currentGenome._draft) {
          saveName = prompt(
            'Create experimental genome file as:',
            Model.suggestCopyName(
              currentGenome.moniker || 'genome',
              availableFiles.map(file => file.name)));
          if (!saveName) return;
          const checked = Model.validateName(saveName);
          if (!checked.valid) throw new Error(checked.error);
          saveName = checked.name;
          endpoint = '/api/genetics/save';
        } else if (!hasUnsavedChanges()) {
          safetyStatus.textContent =
            'The experimental copy already matches its saved checksum.';
          return;
        }
        const dataOut = Object.assign({}, currentGenome, {
          saveName,
          expectedChecksum: fileIdentity().checksum,
          draftOrigin: currentGenome._draftOrigin || 'new'
        });
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataOut)
        });
        const data = await resp.json();
        if (resp.ok && data.status === "success") {
          await fetchFiles();
          selectedFile = data.moniker || saveName;
          safetyStatus.textContent =
            'Engine saved the experimental copy at tick ' +
            (data.worldTick == null ? 'unknown' : data.worldTick) +
            ' with checksum ' + (data.checksum || 'unavailable') + '.';
          await loadGenome(selectedFile);
        } else {
          throw new Error(data.error || 'Engine rejected the save.');
        }
      } catch (e) {
        safetyStatus.textContent =
          'Not saved: ' + (e.message || 'request failed') +
          '. The source file was not changed.';
      } finally {
        operationPending = false;
        btnSave.textContent = "Save copy";
        renderGenome();
      }
    });
  }

  async function doDelete(moniker) {
    if (!moniker) return;
    const typed = prompt(
      'Deletion is separate from editing and is never required. Type DELETE ' +
      moniker + ' to remove this experimental copy:');
    if (typed !== 'DELETE ' + moniker) return;
    try {
      const inspected = selectedFile === moniker && currentGenome
        ? currentGenome
        : await (await fetch(
          '/api/genetics/file/' + encodeURIComponent(moniker))).json();
      const expectedChecksum = inspected.identity &&
        inspected.identity.checksum;
      const resp = await fetch(
        '/api/genetics/delete/' + encodeURIComponent(moniker), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmed: true, expectedChecksum })
        });
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
        safetyStatus.textContent =
          'Experimental copy ' + moniker +
          ' was deleted. Its source was not removed.';
      } else {
        safetyStatus.textContent =
          'Not deleted: ' + (data.error || 'Unknown error.');
      }
    } catch (e) {
      safetyStatus.textContent =
        'Deletion request failed; no success was assumed.';
    }
  }

  async function doRename(moniker) {
    if (!moniker) return;
    const newName = prompt("Enter new genome name:", moniker);
    if (!newName || newName === moniker) return;
    const checked = Model.validateName(newName);
    if (!checked.valid) {
      safetyStatus.textContent = checked.error;
      return;
    }
    try {
      const inspected = selectedFile === moniker && currentGenome
        ? currentGenome
        : await (await fetch(
          '/api/genetics/file/' + encodeURIComponent(moniker))).json();
      const expectedChecksum = inspected.identity &&
        inspected.identity.checksum;
      const resp = await fetch('/api/genetics/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldName: moniker,
          newName: checked.name,
          expectedChecksum,
          confirmed: true
        })
      });
      const data = await resp.json();
      if (data.status === "success") {
        if (selectedFile === moniker) {
          selectedFile = checked.name;
          if (currentGenome) currentGenome.moniker = checked.name;
          if (selectedName) {
            selectedName.textContent =
              'Loading ' + selectedFile + '…';
          }
          loadGenome(selectedFile);
        }
        await fetchFiles();
        safetyStatus.textContent =
          'Experimental copy renamed to ' + checked.name +
          '; its source identity is unchanged.';
      } else {
        safetyStatus.textContent =
          'Not renamed: ' + (data.error || 'Unknown error.');
      }
    } catch (e) {
      safetyStatus.textContent =
        'Rename request failed; no success was assumed.';
    }
  }

  // ── Inject ─────────────────────────────────────────────────────────────
  function experimentAllowsInjection(worldName) {
    const manifest = window.ExperimentWorkspace &&
      ExperimentWorkspace.getManifest();
    return Boolean(manifest && manifest.metadata &&
      manifest.metadata.sourceWorld &&
      manifest.metadata.sourceWorld.name === worldName &&
      manifest.metadata.sourceWorld.explicitlyDisposableOrBranched);
  }

  function updateInjectionReadiness() {
    if (!currentGenome) return;
    const state = ObservatoryState.getState();
    const identity = fileIdentity();
    const readiness = Model.injectionReadiness({
      connected: state.connection.status === 'connected',
      worldName: state.world.identity && state.world.identity.name,
      isExperimentalCopy: Boolean(identity.isExperimental),
      savedChecksum: identity.checksum,
      currentChecksum: hasUnsavedChanges()
        ? Model.checksum(currentGenome) : identity.checksum,
      disposableOrBranchedConfirmed: disposableConfirm.checked,
      reviewConfirmed: finalConfirm.checked
    });
    injectionApply.disabled = operationPending || !readiness.ready;
    injectionErrors.textContent = readiness.errors.join(' ');
  }

  function reviewInjection() {
    if (!currentGenome || !fileIdentity().isExperimental ||
        hasUnsavedChanges() || operationPending) return;
    const state = ObservatoryState.getState();
    const world = state.world.identity;
    const injectModeSelect = document.getElementById('genetics-inject-mode');
    const injectGenderSelect = document.getElementById('genetics-inject-gender');
    const mode = injectModeSelect ? injectModeSelect.value : 'creature';
    const genderLabel = injectGenderSelect
      ? injectGenderSelect.options[injectGenderSelect.selectedIndex].text
      : 'Random';
    lastDiff = Model.structuredDiff(sourceGenome || { genes: [] },
      currentGenome);
    injectionSummary.innerHTML =
      '<dl class="genetics-review-facts">' +
      '<div><dt>Active world</dt><dd>' +
      escapeHtml(world && world.name || 'Unavailable') + '</dd></div>' +
      '<div><dt>Derived file</dt><dd>' +
      escapeHtml(fileIdentity().currentName) + '</dd></div>' +
      '<div><dt>Derived checksum</dt><dd>' +
      escapeHtml(fileIdentity().checksum || 'Unavailable') + '</dd></div>' +
      '<div><dt>Source</dt><dd>' +
      escapeHtml(fileIdentity().sourceName || 'New/imported material') +
      ' · ' + escapeHtml(fileIdentity().sourceChecksum ||
        'source checksum unavailable') +
      (fileIdentity().secondParentName
        ? '<br>' + escapeHtml(fileIdentity().secondParentName) +
          ' · ' + escapeHtml(fileIdentity().secondParentChecksum ||
            'second-parent checksum unavailable')
        : '') + '</dd></div>' +
      '<div><dt>Structured diff</dt><dd>' +
      lastDiff.summary.total + ' records · ' +
      lastDiff.summary.fieldChanges + ' field changes</dd></div>' +
      '<div><dt>Operation</dt><dd>' +
      (mode === 'egg' ? 'Create egg' : 'Create hatched creature') +
      ' · ' + escapeHtml(genderLabel) + '</dd></div>' +
      '<div><dt>Pause behavior</dt><dd>Preserve ' +
      (state.engine.paused ? 'paused' : 'running') +
      ' state</dd></div></dl>';
    disposableConfirm.checked = experimentAllowsInjection(
      world && world.name);
    finalConfirm.checked = false;
    // One review authorizes one injection in this load of this world.
    injectionReview = {
      id: randomId(),
      worldSessionId: world && world.sessionId,
      worldTick: state.world.tick
    };
    updateInjectionReadiness();
    injectionDialog.showModal();
  }

  btnInject.addEventListener('click', reviewInjection);

  async function applyReviewedInjection() {
    if (!currentGenome || operationPending) return;
    updateInjectionReadiness();
    if (injectionApply.disabled) return;
    const state = ObservatoryState.getState();
    const world = state.world.identity;
    const injectModeSelect = document.getElementById('genetics-inject-mode');
    const injectGenderSelect = document.getElementById('genetics-inject-gender');
    const mode = injectModeSelect ? injectModeSelect.value : 'creature';
    const gender = injectGenderSelect
      ? parseInt(injectGenderSelect.value, 10) : 0;
    operationPending = true;
    btnInject.textContent = "Injecting\u2026";
    injectionApply.disabled = true;
    try {
      const resp = await fetch('/api/genetics/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          derivedName: fileIdentity().currentName,
          expectedChecksum: fileIdentity().checksum,
          reviewedSourceName: fileIdentity().sourceName || null,
          reviewedSourceChecksum: fileIdentity().sourceChecksum || null,
          reviewedSecondParentName:
            fileIdentity().secondParentName || null,
          reviewedSecondParentChecksum:
            fileIdentity().secondParentChecksum || null,
          confirmedWorldName: world && world.name,
          reviewId: injectionReview && injectionReview.id,
          reviewedWorldSessionId:
            injectionReview && injectionReview.worldSessionId,
          reviewedWorldTick: injectionReview && injectionReview.worldTick,
          disposableConfirmed: disposableConfirm.checked,
          reviewConfirmed: finalConfirm.checked,
          injectMode: mode,
          gender
        })
      });
      const data = await resp.json();
      if (resp.ok && data.ok && data.status === "success") {
        lastInjectedResult = data;
        injectionDialog.close();
        injectStatus.style.opacity = "1";
        if (injectStatus._timeout) clearTimeout(injectStatus._timeout);
        injectStatus._timeout = setTimeout(() => injectStatus.style.opacity = "0", 3000);
        const created = data.result || {};
        safetyStatus.innerHTML =
          '<strong>Engine confirmed:</strong> ' +
          (created.isCreature ? 'creature' : 'egg') +
          ' agent #' + escapeHtml(created.agentId) +
          ' at world tick ' + escapeHtml(data.worldTick) +
          ' from checksum ' + escapeHtml(data.derivedChecksum) +
          (created.isCreature
            ? ' <button type="button" data-genetics-open-result>Open resulting creature</button>'
            : '');
        ObservatoryState.addIntervention({
          id: 'genome-injection-' + data.correlationId,
          type: 'genome_injection',
          source: 'Genetics / reviewed experimental injection',
          worldKey: world && world.key,
          tick: data.worldTick,
          target: {
            derivedName: fileIdentity().currentName,
            derivedChecksum: data.derivedChecksum,
            agentId: created.agentId,
            moniker: created.moniker,
            isCreature: created.isCreature
          },
          parameters: {
            sourceName: fileIdentity().sourceName,
            sourceChecksum: fileIdentity().sourceChecksum,
            secondParentName: fileIdentity().secondParentName,
            secondParentChecksum: fileIdentity().secondParentChecksum,
            diffSummary: lastDiff.summary,
            injectMode: mode,
            gender
          },
          result: created
        });
        await fetchFiles();
      } else {
        throw new Error(data.error || 'Engine rejected the injection.');
      }
    } catch (e) {
      injectionErrors.textContent =
        'Not confirmed: ' + (e.message || 'request failed') +
        '. Refresh the genome and world before retrying.';
    } finally {
      operationPending = false;
      btnInject.textContent = "Review injection";
      updateInjectionReadiness();
      renderGenome();
    }
  }

  [disposableConfirm, finalConfirm].forEach(input =>
    input.addEventListener('change', updateInjectionReadiness));
  injectionApply.addEventListener('click', applyReviewedInjection);
  injectionDialog.addEventListener('click', event => {
    if (event.target === injectionDialog) injectionDialog.close();
  });
  injectionDialog.addEventListener('close', () => {
    disposableConfirm.checked = false;
    finalConfirm.checked = false;
    injectionErrors.textContent = '';
    injectionReview = null;
  });
  safetyStatus.addEventListener('click', event => {
    if (!event.target.closest('[data-genetics-open-result]') ||
        !lastInjectedResult || !lastInjectedResult.result ||
        !lastInjectedResult.result.isCreature) return;
    const created = lastInjectedResult.result;
    ObservatoryState.select('creature', created.agentId, {
      moniker: created.moniker,
      genus: created.classifier && created.classifier.genus,
      species: created.classifier && created.classifier.species,
      name: ''
    }, true);
    DevToolsNavigation.navigate({
      tab: 'creatures',
      view: 'genome',
      worldKey: ObservatoryState.getState().world.identity &&
        ObservatoryState.getState().world.identity.key,
      primary: 'creature',
      selections: {
        creature: ObservatoryState.getState().selection.creature
      }
    });
  });

  // ── Fetch available .gen files ─────────────────────────────────────────
  async function fetchFiles() {
    try {
      const [fileResponse, creatureResponse] = await Promise.all([
        fetch('/api/genetics/files'),
        fetch('/api/creatures')
      ]);
      const filePayload = await fileResponse.json();
      if (!Array.isArray(filePayload)) {
        throw new Error(filePayload.error || 'Malformed genome file list');
      }
      availableFiles = filePayload;
      const creaturePayload = await creatureResponse.json();
      liveReferences = Array.isArray(creaturePayload)
        ? creaturePayload : [];
      renderFileList();
      renderParentBList();
      if (currentGenome) renderGenome();
    } catch (e) {
      console.warn("DevTools: genetics file list fetch failed", e);
      safetyStatus.textContent =
        'Genome library unavailable: ' + (e.message || 'request failed');
    }
  }

  // ── Load & parse a genome ──────────────────────────────────────────────
  async function fetchGenome(moniker) {
    const resp = await fetch(
      '/api/genetics/file/' + encodeURIComponent(moniker));
    const data = await resp.json();
    if (!resp.ok || data.error) {
      throw new Error(data.error || 'Could not load genome');
    }
    data.genes.forEach(gene => {
      gene.active = true;
      gene._originalStr = getGeneState(gene);
    });
    return data;
  }

  async function loadGenome(moniker) {
    const serial = ++genomeLoadSerial;
    const superseded = () => serial !== genomeLoadSerial;
    genesContent.innerHTML = '<div class="crt-empty-hint">Loading\u2026</div>';
    try {
      const data = await fetchGenome(moniker);
      if (superseded()) return;
      const fileInfo = availableFiles.find(f => f.name === moniker);
      data.isCore = fileInfo ? fileInfo.isCore : false;
      expandedGenes = new WeakSet();
      currentGenome = data;
      persistedGenome = deepClone(data);
      ObservatoryState.select('genome', moniker, {
        name: moniker,
        checksum: data.identity && data.identity.checksum,
        sourceName: data.identity && data.identity.sourceName,
        isExperimental: data.identity &&
          data.identity.isExperimental
      }, true);
      const sourceName = data.identity && data.identity.sourceName;
      if (data.identity && data.identity.isExperimental) {
        if (sourceName) {
          try {
            const loadedSource = await fetchGenome(sourceName);
            if (superseded()) return;
            sourceGenome = loadedSource;
          } catch (sourceError) {
            if (superseded()) return;
            sourceGenome = null;
            safetyStatus.textContent =
              'Experimental copy loaded, but source ' + sourceName +
              ' is unavailable: ' + sourceError.message +
              '. Structured comparison is Unknown.';
          }
        } else {
          sourceGenome = { genes: [] };
        }
      } else {
        sourceGenome = deepClone(data);
      }
      copyName.value = Model.suggestCopyName(
        moniker, availableFiles.map(file => file.name));
      lastInjectedResult = null;
      renderGenome();
    } catch (e) {
      if (superseded()) return;
      if (selectedName) {
        selectedName.textContent = 'Failed to load genome';
      }
      genesContent.textContent =
        'Genome could not be decoded: ' + (e.message || 'unknown error');
      currentGenome = null;
      sourceGenome = null;
      persistedGenome = null;
      safetyStatus.textContent =
        'Malformed or unavailable genome left unchanged.';
    }
  }

  // ── Render gene cards ──────────────────────────────────────────────────
  function renderIdentityAndDiff() {
    if (!currentGenome) return;
    const identity = fileIdentity();
    const currentName = identity.currentName ||
      (currentGenome._draft ? 'Unsaved browser draft' : currentGenome.moniker);
    const savedChecksum = identity.checksum || null;
    const confirmedResult = lastInjectedResult &&
      lastInjectedResult.derivedChecksum === savedChecksum &&
      lastInjectedResult.result &&
      lastInjectedResult.result.isCreature
      ? lastInjectedResult.result : null;
    const live = confirmedResult
      ? liveReferences.find(creature =>
        String(creature.agentId) ===
          String(confirmedResult.agentId)) || null
      : null;
    const primarySourceName = identity.sourceName ||
      (currentGenome._draftOrigin === 'import'
        ? 'Imported JSON' : 'No engine source file');
    const sourceName = identity.secondParentName
      ? primarySourceName + ' + ' + identity.secondParentName
      : primarySourceName;
    const modelChecksum = Model.checksum(currentGenome);
    const writeReadiness = Model.writeReadiness(currentGenome);
    const primarySourceChecksum = identity.sourceChecksum ||
      (sourceGenome ? Model.checksum(sourceGenome) : null);
    const sourceChecksum = identity.secondParentChecksum
      ? (primarySourceChecksum || 'Unknown') + ' + ' +
        identity.secondParentChecksum
      : primarySourceChecksum;

    identityKind.textContent = identity.metadataStatus === 'invalid_or_stale'
      ? 'Blocked genome · experimental provenance is invalid or stale'
      : currentGenome._draft
      ? 'Unsaved experimental draft'
      : identity.isExperimental
        ? 'Derived experimental genome'
        : identity.isProtected
          ? 'Protected original genome'
          : 'Original genome · read-only in ordinary workflow';
    identityProtection.textContent =
      identity.metadataStatus === 'invalid_or_stale'
      ? 'Write blocked'
      : identity.isProtected
      ? 'Protected'
      : identity.isExperimental || currentGenome._draft
        ? 'Copy / derived' : 'Source';
    identityProtection.dataset.state =
      identity.metadataStatus === 'invalid_or_stale'
      ? 'protected'
      : identity.isProtected
      ? 'protected'
      : identity.isExperimental || currentGenome._draft
        ? 'experimental' : 'source';
    identityCurrent.textContent = currentName;
    identitySource.textContent = sourceName;
    identityChecksum.textContent = savedChecksum
      ? savedChecksum + (hasUnsavedChanges()
        ? ' · unsaved model ' + modelChecksum : '')
      : 'Not saved · model ' + modelChecksum;
    identitySourceChecksum.textContent =
      sourceChecksum || 'Unknown';
    identityFormat.textContent =
      (identity.format || 'dna3') + ' · ' +
      currentGenome.genes.length + ' decoded genes' +
      (writeReadiness.ready ? '' : ' · write blocked: ' +
        writeReadiness.errors.join(' '));
    identityLive.textContent = live
      ? 'Engine-confirmed injection result: creature #' + live.agentId +
        ' · ' + (live.moniker || 'moniker unavailable')
      : 'Unknown · the engine exposes no persistent live-to-file reference';
    const sex = live && live.sex === 1 ? 'Male'
      : live && live.sex === 2 ? 'Female' : 'Unknown';
    identityBiography.textContent = live
      ? 'Species ' + (live.species == null ? 'Unknown' : live.species) +
        ' / ' + sex + ' / generation Unknown'
      : 'Unknown / Unknown / Unknown';

    const experimental = isExperimental();
    copyName.disabled = experimental || operationPending;
    btnCreateCopy.disabled = operationPending || experimental ||
      !identity.currentName;
    btnCreateCopy.hidden = experimental;
    copyName.hidden = experimental;
    if (copyNameLabel) copyNameLabel.hidden = experimental;

    lastDiff = sourceGenome
      ? Model.structuredDiff(sourceGenome, currentGenome) : null;
    if (!lastDiff) {
      diffSummary.textContent = 'Source unavailable · Unknown';
      diffList.textContent =
        'The recorded source could not be loaded. No difference is inferred.';
    } else {
      const summary = lastDiff.summary;
      diffSummary.textContent = summary.total
        ? summary.total + ' records · ' + summary.fieldChanges +
          ' field changes'
        : 'No source differences';
      const changes = lastDiff.changes.slice(0, 120);
      DomPatch.update(diffList, changes.length ? changes.map(change => {
        const gene = change.gene || {};
        const label = (gene.typeName || 'Unknown type ' + gene.type) +
          ' / ' + (gene.subtypeName ||
            'Unknown subtype ' + gene.subtype) +
          ' · gene ID ' + (gene.id == null ? 'Unknown' : gene.id);
        const fields = change.fields.length
          ? '<ul>' + change.fields.map(field =>
            '<li><code>' + escapeHtml(field.path) + '</code> ' +
            '<span>' + escapeHtml(JSON.stringify(field.before)) +
            '</span> → <strong>' +
            escapeHtml(JSON.stringify(field.after)) +
            '</strong></li>').join('') + '</ul>'
          : '<p>Source index ' +
            escapeHtml(change.sourceIndex == null
              ? '—' : change.sourceIndex) +
            ' → derived index ' +
            escapeHtml(change.derivedIndex == null
              ? '—' : change.derivedIndex) + '.</p>';
        return '<article class="genetics-diff-entry" data-kind="' +
          escapeHtml(change.kind) + '" data-patch-key="' +
          escapeHtml(change.key + ':' + change.kind) + '">' +
          '<header><span>' + escapeHtml(change.kind) +
          '</span><strong>' + escapeHtml(label) + '</strong>' +
          '<small>' + escapeHtml(change.decoding.evidenceLevel) +
          '</small></header>' + fields +
          (change.decoding.limitation
            ? '<p class="genetics-diff-limitation">' +
              escapeHtml(change.decoding.limitation) + '</p>' : '') +
          '<details><summary>Raw before/after evidence</summary><pre>' +
          escapeHtml(JSON.stringify({
            sourceIndex: change.sourceIndex,
            derivedIndex: change.derivedIndex,
            fields: change.fields,
            gene: change.gene
          }, null, 2)) + '</pre></details>' +
          (change.relatedView && live
            ? '<button type="button" class="btn-light" ' +
              'data-genetics-related="' +
              escapeHtml(change.relatedView) + '" data-agent-id="' +
              escapeHtml(live.agentId) + '">Open related ' +
              escapeHtml(change.relatedView) + ' inspector</button>' : '') +
          '</article>';
      }).join('') +
        (lastDiff.changes.length > changes.length
          ? '<p>' + (lastDiff.changes.length - changes.length) +
            ' additional diff records are omitted from this view.</p>' : '')
        : '<p class="genetics-diff-empty">The derived genome currently ' +
          'matches its recorded source.</p>');
    }

    const state = ObservatoryState.getState();
    const saved = Boolean(identity.isExperimental && identity.checksum &&
      !hasUnsavedChanges());
    btnSave.disabled = operationPending || !experimental ||
      !writeReadiness.ready ||
      (!currentGenome._draft && !hasUnsavedChanges());
    btnInject.disabled = operationPending || !saved ||
      !writeReadiness.ready ||
      state.connection.status !== 'connected' ||
      !state.world.identity || state.world.identity.name === 'Startup';
    btnInject.title = !identity.isExperimental
      ? 'Create and save an experimental copy first'
      : hasUnsavedChanges()
        ? 'Save the reviewed diff before injection'
        : 'Review the exact world and saved genome before injection';

    const completed = {
      source: true,
      copy: experimental,
      edit: experimental,
      diff: Boolean(lastDiff),
      save: saved,
      inject: Boolean(lastInjectedResult)
    };
    workflowSteps.querySelectorAll('[data-genetics-step]').forEach(step => {
      const id = step.dataset.geneticsStep;
      step.dataset.status = completed[id] ? 'complete' :
        (id === 'copy' && !experimental) ||
        (id === 'save' && experimental && hasUnsavedChanges())
          ? 'current' : 'pending';
    });
  }

  function renderGenome() {
    if (!currentGenome) return;

    if (selectedName) {
      selectedName.textContent = 'Selected: ' +
        (fileIdentity().currentName || currentGenome.moniker ||
          'unsaved draft') + ' · ' +
        currentGenome.genes.length + ' genes';
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
    visibleGeneIndexes = [];

    const isInteractive = isExperimental();
    if (btnAddGene) btnAddGene.disabled = !isInteractive;
    if (addGeneType) addGeneType.disabled = !isInteractive;

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
      visibleGeneIndexes.push(i);
      count++;
    });

    if (count === 0) {
      genesContent.innerHTML = '<div class="crt-empty-hint">No genes match the current filters.</div>';
    } else {
      genesContent.innerHTML = html;
      restoreGeneCardState();
    }

    updateModifiedSection();
    renderIdentityAndDiff();
  }

  function restoreGeneCardState() {
    genesContent.querySelectorAll('.crt-gene-card').forEach(card => {
      const index = Number(card.dataset.idx);
      if (expandedGenes.has(currentGenome.genes[index])) {
        const body = card.querySelector('.crt-gene-body');
        const chevron = card.querySelector('.crt-gene-chevron');
        if (body) body.style.display = 'block';
        if (chevron) chevron.textContent = '▼';
      }
    });
    const first = visibleGeneIndexes[0];
    const last = visibleGeneIndexes[visibleGeneIndexes.length - 1];
    const disable = (index, selector) => {
      const button = genesContent.querySelector(
        '.crt-gene-card[data-idx="' + index + '"] ' + selector);
      if (button) button.disabled = true;
    };
    disable(first, '.g-btn-up');
    disable(last, '.g-btn-down');
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
          ${escapeHtml(g.typeName)} — ${escapeHtml(g.subtypeName)} <span style="opacity:0.5">#${escapeHtml(g.id)}</span>
        </div>`;
      }
    });

    if (hasModified) {
      modifiedSection.style.display = 'flex';
      DomPatch.update(modifiedList, html);
    } else {
      modifiedSection.style.display = 'none';
      DomPatch.update(modifiedList, '');
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

  diffList.addEventListener('click', event => {
    const button = event.target.closest('[data-genetics-related]');
    if (!button) return;
    const creature = liveReferences.find(item =>
      String(item.agentId) === String(button.dataset.agentId));
    if (!creature) {
      safetyStatus.textContent =
        'The related live creature is no longer available.';
      return;
    }
    ObservatoryState.select('creature', creature.agentId, {
      moniker: creature.moniker,
      genus: creature.genus,
      species: creature.species,
      name: creature.name
    }, true);
    DevToolsNavigation.navigate({
      tab: 'creatures',
      view: button.dataset.geneticsRelated,
      worldKey: ObservatoryState.getState().world.identity &&
        ObservatoryState.getState().world.identity.key,
      primary: 'creature',
      selections: {
        creature: ObservatoryState.getState().selection.creature
      }
    });
  });

  // ── Event Delegation for Genes ───────────────────────────────────────
  genesContent.addEventListener('click', (e) => {
    const target = e.target;

    // Gene Actions
    if (!currentGenome) return;
    const action = target.closest('button[data-idx]');
    if (action) {
      const idx = parseInt(action.dataset.idx, 10);
      if (isNaN(idx)) return;
      applyGeneAction(action, idx);
      return;
    }

    // Expand / collapse cards
    const header = target.closest('.crt-gene-header');
    if (header) {
      const body = header.nextElementSibling;
      const chevron = header.querySelector('.crt-gene-chevron');
      if (body && body.classList.contains('crt-gene-body')) {
        const card = header.closest('.crt-gene-card');
        const gene = card && currentGenome.genes[Number(card.dataset.idx)];
        if (body.style.display === 'none') {
          body.style.display = 'block';
          if (chevron) chevron.textContent = '▼';
          if (gene) expandedGenes.add(gene);
        } else {
          body.style.display = 'none';
          if (chevron) chevron.textContent = '▶';
          if (gene) expandedGenes.delete(gene);
        }
      }
      return;
    }
  });

  function applyGeneAction(button, idx) {
    const genes = currentGenome.genes;
    const gene = genes[idx];
    if (!gene) return;
    const label = gene.subtypeName + ' gene #' + gene.id;
    let outcome = null;
    if (button.classList.contains('g-btn-up') ||
        button.classList.contains('g-btn-down')) {
      // Moves are between genes the user can see; a filter hides the rest.
      const position = visibleGeneIndexes.indexOf(idx);
      const offset = button.classList.contains('g-btn-up') ? -1 : 1;
      const destination = visibleGeneIndexes[position + offset];
      if (position < 0 || destination == null) return;
      genes[idx] = genes[destination];
      genes[destination] = gene;
      outcome = 'Moved ' + label + '.';
    } else if (button.classList.contains('g-btn-dup')) {
      const cloned = deepClone(gene);
      cloned.id = Model.nextGeneId(genes, gene.type, gene.subtype);
      if (cloned.id == null) {
        safetyStatus.textContent =
          'Not duplicated: all 256 ' + gene.subtypeName +
          ' gene IDs are in use.';
        return;
      }
      cloned.generation = Math.min(255, (cloned.generation || 0) + 1);
      delete cloned._originalStr;
      genes.splice(idx + 1, 0, cloned);
      outcome = 'Duplicated ' + label + ' as #' + cloned.id + '.';
    } else if (button.classList.contains('g-btn-del')) {
      genes.splice(idx, 1);
      outcome = 'Removed ' + label + '.';
    } else {
      return;
    }
    currentGenome.geneCount = genes.length;
    renderGenome();
    safetyStatus.textContent = outcome + ' Save the copy to keep this change.';
  }

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
      renderIdentityAndDiff();
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
      renderIdentityAndDiff();
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
      renderIdentityAndDiff();
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

  ObservatoryState.subscribe(
    state => [
      state.connection.status,
      state.world.identity && state.world.identity.key,
      state.world.tick,
      state.engine.paused,
      state.experiment.id,
      state.experiment.status
    ].join(':'),
    () => {
      if (currentGenome) renderIdentityAndDiff();
      if (injectionDialog.open) updateInjectionReadiness();
    }
  );

  if (window.DevToolsNavigation) {
    window.DevToolsNavigation.registerWorkspace('genetics', {
      capture() {
        return {
          selectedFile,
          fileQuery: fileSearch && fileSearch.value,
          geneQuery: currentSearch,
          geneFilter: currentFilter,
          ageFilter: currentAgeFilter,
          listScrollTop: fileList.scrollTop,
          geneScrollTop: genesContent.scrollTop
        };
      },
      restore(saved) {
        if (!saved) return;
        if (fileSearch) fileSearch.value = saved.fileQuery || '';
        if (genomeSearch) genomeSearch.value = saved.geneQuery || '';
        currentSearch = saved.geneQuery || '';
        currentFilter = saved.geneFilter || 'all';
        currentAgeFilter = saved.ageFilter || 'all';
        filterRadios.forEach(input => {
          input.checked = input.value === currentFilter;
        });
        if (genomeAge) genomeAge.value = currentAgeFilter;
        renderFileList();
        if (saved.selectedFile &&
            saved.selectedFile !== selectedFile) {
          selectedFile = saved.selectedFile;
          loadGenome(selectedFile);
        }
        requestAnimationFrame(() => {
          fileList.scrollTop = Number(saved.listScrollTop) || 0;
          genesContent.scrollTop = Number(saved.geneScrollTop) || 0;
        });
      },
      open(route) {
        const genomeSelection = route.selections &&
          route.selections.genome;
        if (genomeSelection &&
            String(genomeSelection.id) !== String(selectedFile)) {
          selectedFile = String(genomeSelection.id);
          loadGenome(selectedFile);
        }
        const geneSelection = route.selections &&
          route.selections.gene;
        if (geneSelection) {
          currentSearch = String(geneSelection.id);
          if (genomeSearch) genomeSearch.value = currentSearch;
          renderGenome();
        }
      }
    });
  }

})();
