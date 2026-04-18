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

  // ── DOM Refs ───────────────────────────────────────────────────────────
  const fileSearch = document.getElementById('genetics-file-search');
  const fileList = document.getElementById('genetics-file-list');
  const fileAction = document.getElementById('genetics-file-action');
  const selectedName = document.getElementById('genetics-selected-name');
  const btnRefresh = document.getElementById('btn-genetics-refresh');
  const tbody = document.getElementById('genetics-genes-body');

  const btnCrossover = document.getElementById('btn-genetics-crossover');
  const btnInject = document.getElementById('btn-genetics-inject');
  const injectStatus = document.getElementById('genetics-inject-status');

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

  function renderFileList() {
    if (!fileList) return;
    const query = fileSearch ? fileSearch.value.toLowerCase().trim() : '';
    const matches = availableFiles.filter(f => f.toLowerCase().includes(query));
    
    let html = '';
    const limit = fileShowAll ? matches.length : Math.min(5, matches.length);
    for (let i = 0; i < limit; i++) {
        const item = matches[i];
        const isSelected = item === selectedFile;
        // Match the layout seen in Syringe (e.g. index followed by moniker name)
        html += `<div class="genetics-file-item ${isSelected ? 'genetics-file-item--selected' : ''}" data-id="${item}">
          <span style="color:rgba(0,0,0,0.35); font-family:monospace; min-width: 24px;">${i}</span> <span style="font-weight:600;">${item}</span>
        </div>`;
    }

    if (!fileShowAll && matches.length > 5) {
        html += `<div class="genetics-file-item genetics-file-show-all" style="justify-content: center; color: var(--orange); font-weight: 600;">
          Show all ${matches.length} matches...
        </div>`;
    }
    
    fileList.innerHTML = html;
  }

  function renderParentBList() {
    if (!parentBList) return;
    const query = parentBSearch ? parentBSearch.value.toLowerCase().trim() : '';
    const matches = availableFiles.filter(f => f.toLowerCase().includes(query));
    
    let html = '';
    const limit = parentBShowAll ? matches.length : Math.min(5, matches.length);
    for (let i = 0; i < limit; i++) {
        const item = matches[i];
        const isSelected = item === selectedParentB;
        html += `<div class="genetics-file-item ${isSelected ? 'genetics-file-item--selected' : ''}" data-id="${item}">
          <span style="color:rgba(0,0,0,0.35); font-family:monospace; min-width: 24px;">${i}</span> <span style="font-weight:600;">${item}</span>
        </div>`;
    }

    if (!parentBShowAll && matches.length > 5) {
        html += `<div class="genetics-file-item genetics-file-show-all-b" style="justify-content: center; color: var(--orange); font-weight: 600;">
          Show all ${matches.length} matches...
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
      const showAllBtn = e.target.closest('.genetics-file-show-all');
      if (showAllBtn) {
          fileShowAll = true;
          renderFileList();
          return;
      }
      const item = e.target.closest('.genetics-file-item');
      if (!item) return;
      selectedFile = item.dataset.id;
      renderFileList();
      fileAction.hidden = false;
      selectedName.innerHTML = `Loading <strong>${selectedFile}</strong>...`;
      if (selectedFile) loadGenome(selectedFile);
    });
  }

  if (parentBList) {
    parentBList.addEventListener('click', (e) => {
      const showAllBtn = e.target.closest('.genetics-file-show-all-b');
      if (showAllBtn) {
          parentBShowAll = true;
          renderParentBList();
          return;
      }
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
        fileAction.hidden = false;
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

  // ── Inject ─────────────────────────────────────────────────────────────
  btnInject.addEventListener('click', async () => {
    if (!currentGenome) return;
    btnInject.textContent = "Injecting\u2026";
    try {
      const resp = await fetch('/api/genetics/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentGenome)
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
    tbody.innerHTML = '<tr><td colspan="9" style="padding:12px; text-align:center; color:rgba(0,0,0,0.4);">Loading\u2026</td></tr>';
    try {
      const resp = await fetch('/api/genetics/file/' + moniker);
      const data = await resp.json();
      if (data.error) {
        if (selectedName) selectedName.innerHTML = `<span style="color:var(--red);">Error: ${data.error}</span>`;
        tbody.innerHTML = '';
        currentGenome = null;
        return;
      }
      // Attach active flag (prevents "Slider Syndrome" — soft-delete, not array mutation)
      data.genes.forEach(g => g.active = true);
      currentGenome = data;
      renderGenome();
    } catch (e) {
      if (selectedName) selectedName.innerHTML = `<span style="color:var(--red);">Failed to load genome</span>`;
    }
  }

  // ── Render gene grid ───────────────────────────────────────────────────
  function renderGenome() {
    if (!currentGenome) return;

    if (selectedName) {
      selectedName.innerHTML = `Selected: <strong>${currentGenome.moniker}</strong> &mdash; <span style="color:var(--orange);">${currentGenome.geneCount} genes</span>`;
    }

    tbody.innerHTML = '';
    currentGenome.genes.forEach((g, i) => {
      const tr = document.createElement('tr');

      tr.innerHTML =
        `<td style="color:rgba(0,0,0,0.35);">${i}</td>` +
        `<td style="font-weight:700; color:${getGeneCol(g.type)}">${g.typeName}</td>` +
        `<td>${g.subtypeName}</td>` +
        `<td>${g.id}</td>` +
        `<td>${g.switchOnLabel}</td>` +
        `<td style="text-align:center;"><input type="checkbox" class="g-active" data-idx="${i}" ${g.active ? 'checked' : ''} /></td>` +
        `<td style="text-align:center;"><input type="checkbox" class="g-mut" data-idx="${i}" ${g.flags.mutable ? 'checked' : ''} /></td>` +
        `<td style="text-align:center;"><input type="checkbox" class="g-dup" data-idx="${i}" ${g.flags.dupable ? 'checked' : ''} /></td>` +
        `<td style="text-align:center;"><input type="checkbox" class="g-cut" data-idx="${i}" ${g.flags.cutable ? 'checked' : ''} /></td>`;

      tbody.appendChild(tr);
    });

    // Bind checkbox changes back to data model
    tbody.querySelectorAll('.g-active').forEach(cb => cb.addEventListener('change', (e) => {
      currentGenome.genes[e.target.dataset.idx].active = e.target.checked;
    }));
    tbody.querySelectorAll('.g-mut').forEach(cb => cb.addEventListener('change', (e) => {
      currentGenome.genes[e.target.dataset.idx].flags.mutable = e.target.checked;
    }));
    tbody.querySelectorAll('.g-dup').forEach(cb => cb.addEventListener('change', (e) => {
      currentGenome.genes[e.target.dataset.idx].flags.dupable = e.target.checked;
    }));
    tbody.querySelectorAll('.g-cut').forEach(cb => cb.addEventListener('change', (e) => {
      currentGenome.genes[e.target.dataset.idx].flags.cutable = e.target.checked;
    }));
  }

  // ── Gene type colour mapping ───────────────────────────────────────────
  function getGeneCol(type) {
    if (type === 0) return 'var(--magenta)'; // Brain
    if (type === 1) return 'var(--orange)';  // Biochemistry
    if (type === 2) return 'var(--blue)';    // Creature
    if (type === 3) return '#00AA44';        // Organ
    return 'rgba(0,0,0,0.5)';
  }

})();
