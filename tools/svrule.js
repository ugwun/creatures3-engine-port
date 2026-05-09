// ── SVRule formatting helper ─────────────────────────────────────────
// Extracted to a shared utility so it can be used by both the brain inspector
// and the genome inspector.

(function() {
  'use strict';

  // Simple HTML escape
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Converts a JSON SVRule array into a formatted HTML string
  function formatSVRule(entries, title) {
    if (!entries || entries.length === 0) {
      return '<div class="crt-nd-svrule-empty">empty (no-op)</div>';
    }
    let html = '<div class="crt-nd-svrule">';
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      // Build formatted line
      let line = '<span class="crt-nd-sv-op">' + escapeHtml(e.op) + '</span>';

      // Determine if operand is meaningful for this opcode
      const noOperandOps = ['stop', 'nop', 'setSpr', 'wta'];
      if (!noOperandOps.includes(e.op)) {
        line += ' <span class="crt-nd-sv-operand">' + escapeHtml(e.operand);
        // Show array index for variable operands
        if (['input', 'dend', 'neuron', 'spare'].includes(e.operand)) {
          line += '[' + e.idx + ']';
        } else if (e.operand === 'chem' || e.operand === 'chem[src+]' || e.operand === 'chem[dst+]') {
          line += '[' + e.idx + ']';
        } else if (e.operand === 'val' || e.operand === '-val' || e.operand === 'val*10' || e.operand === 'val/10') {
          line += '(' + e.val.toFixed(3) + ')';
        }
        line += '</span>';
      }

      html += '<div class="crt-nd-sv-line">' +
        '<span class="crt-nd-sv-num">' + String(i + 1).padStart(2, '0') + '</span> ' +
        line + '</div>';
    }
    html += '</div>';
    return html;
  }

  window.formatSVRule = formatSVRule;

})();
