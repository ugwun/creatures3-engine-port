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
  const initialCreatureSelection = ObservatoryState.getState().selection.creature;
  let selectedCreatureId = initialCreatureSelection ? initialCreatureSelection.id : null;
  let requestSerial = 0;

  // DOM Refs
  const genomeContent = document.getElementById('crt-genome-content');
  const genomeSearch = document.getElementById('crt-genome-search');
  const genomeAge = document.getElementById('crt-genome-age');
  const filterRadios = document.querySelectorAll('input[name="gfilter"]');

  // Selection is shared across tabs and invalidated centrally on world changes.
  ObservatoryState.subscribe(state => state.selection.creature, selection => {
    selectedCreatureId = selection ? selection.id : null;
    if (document.getElementById('crt-genome').classList.contains('crt-subview--active')) {
      if (selectedCreatureId) fetchGenome();
      else {
        genomeData = null;
        genomeContent.innerHTML = '<div class="crt-empty-hint">Select a creature to view genetics</div>';
      }
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
    if (!selectedCreatureId) return;
    // Only the latest request may render: an older response belongs to a
    // subject the user has left, even if its data looks valid.
    const serial = ++requestSerial;
    const creatureId = selectedCreatureId;
    const isCurrent = () =>
      serial === requestSerial && creatureId === selectedCreatureId;
    genomeContent.innerHTML = '<div class="crt-empty-hint">Loading genetics...</div>';

    try {
      const resp = await fetch('/api/creature/' + creatureId + '/genome');
      if (!resp.ok) throw new Error('API Error');
      const data = await resp.json();
      if (!isCurrent()) return;

      if (data.error) {
        genomeContent.innerHTML = '<div class="crt-empty-hint">Error: ' + escHtml(data.error) + '</div>';
        genomeData = null;
      } else {
        genomeData = data;
        renderGenome();
      }
    } catch (e) {
      if (!isCurrent()) return;
      console.warn('DevTools: genome fetch failed', e);
      genomeContent.innerHTML = '<div class="crt-empty-hint">Failed to load genome.</div>';
    }
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

      const cardHtml = window.GeneRenderer.renderGeneCard(gene);

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
