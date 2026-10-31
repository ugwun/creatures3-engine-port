// biological_monitor.js — shared biological sampling and trend presentation
"use strict";

(function() {
  const store = BiologicalSeries.createStore();
  const GROUP_ORDER = [
    "energy and metabolism",
    "respiration",
    "digestion and reserves",
    "drives and backups",
    "immunity",
    "smells and environmental channels",
    "reproduction",
    "stress, injury, and toxins",
    "sleep and reinforcement",
    "organs",
    "neural signals",
    "other"
  ];
  const DEFAULT_PINS = [
    "drive:6", "drive:7", "chemical:35", "chemical:30",
    "chemical:127", "chemical:204", "chemical:205"
  ];
  const monitor = document.getElementById("crt-bio-monitor");
  const statusEl = document.getElementById("crt-bio-status");
  const trayEl = document.getElementById("crt-bio-tray");
  const orderEl = document.getElementById("crt-bio-order");
  const intervalEl = document.getElementById("crt-bio-interval");
  const recordButton = document.getElementById("crt-bio-record");
  const baselineButton = document.getElementById("crt-bio-baseline");
  const exportButton = document.getElementById("crt-bio-export");
  let current = null;
  let recording = true;
  let intervalMs = 2000;
  let orderMode = "canonical";
  let lastCaptureMs = null;
  let lastWorldKey = ObservatoryState.getState().world.identity
    ? ObservatoryState.getState().world.identity.key
    : null;
  const metadata = new Map();

  DEFAULT_PINS.forEach(id => store.pin(id));

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function chemicalGroup(id) {
    if ([1, 2, 34, 35, 36, 114, 115, 116, 124, 125].includes(id)) {
      return "energy and metabolism";
    }
    if ([24, 29, 30, 79].includes(id)) return "respiration";
    if ((id >= 3 && id <= 14) || [25, 26, 33].includes(id)) {
      return "digestion and reserves";
    }
    if (id >= 131 && id <= 164) return "drives and backups";
    if ((id >= 82 && id <= 109) || [50, 51, 56, 69, 72, 73, 74, 92, 93, 95, 96, 97, 98, 99, 100].includes(id)) {
      return "immunity";
    }
    if (id >= 165 && id <= 184) return "smells and environmental channels";
    if ([39, 40, 41, 46, 47, 48, 49, 53, 54].includes(id)) {
      return "reproduction";
    }
    if ((id >= 66 && id <= 81) || id === 117 || id === 127 ||
        id === 128 || (id >= 187 && id <= 195)) {
      return "stress, injury, and toxins";
    }
    if ((id >= 198 && id <= 213) || id === 129 || id === 255) {
      return "sleep and reinforcement";
    }
    return "other";
  }

  function context(subject, sourceEndpoint) {
    const state = ObservatoryState.getState();
    const world = state.world;
    if (!world.identity || world.tick == null || !subject) return null;
    return {
      worldKey: world.identity.key,
      worldName: world.identity.name,
      subjectKey: subject.key,
      subjectLabel: subject.label,
      worldTick: world.tick,
      systemTick: world.systemTick,
      wallTimeMs: Date.now(),
      enginePaused: state.engine.paused,
      gameSpeed: world.speed,
      sampleIntervalMs: intervalMs,
      expectedTickDelta: Math.max(1, Math.round(intervalMs / 50)),
      interventions: state.interventions.filter(record => {
        if (record.worldKey !== world.identity.key || record.tick > world.tick) {
          return false;
        }
        const target = record.target;
        if (!target || subject.agentId == null) return true;
        if (typeof target !== "object") return Number(target) === subject.agentId;
        const targetId = target.creatureId == null
          ? (target.agentId == null ? target.id : target.agentId)
          : target.creatureId;
        return targetId == null || Number(targetId) === subject.agentId;
      }),
      sourceEndpoint,
      evidenceLevel: "observed"
    };
  }

  function subjectFor(creature) {
    if (!creature) return null;
    const agentId = creature.agentId == null ? creature.id : creature.agentId;
    const stable = creature.moniker || ("agent-" + agentId);
    return {
      key: "creature:" + stable,
      label: creature.name || ("Creature #" + agentId),
      agentId
    };
  }

  function remember(metric) {
    metadata.set(metric.id, {
      id: metric.id,
      label: metric.label,
      unit: metric.unit,
      group: metric.group
    });
    return metric;
  }

  function capture(subject, sourceEndpoint, metrics) {
    current = subject;
    metrics.forEach(remember);
    if (!recording) {
      render();
      return null;
    }
    const sampleContext = context(subject, sourceEndpoint);
    if (!sampleContext) return null;
    const result = store.ingest(sampleContext, metrics);
    lastCaptureMs = Date.now();
    render();
    return result;
  }

  function ingestDrives(creature, names) {
    const subject = subjectFor(creature);
    if (!subject || !Array.isArray(creature.drives)) return;
    capture(subject, "GET /api/creatures", creature.drives.map((value, id) => ({
      id: "drive:" + id,
      label: names[id] || ("Drive " + id),
      value,
      unit: "drive level",
      group: "drives and backups",
      sourceField: "drives[" + id + "]",
      evidenceLevel: "observed"
    })));
  }

  function ingestChemistry(creature, chemicals, nameForId) {
    const subject = subjectFor(creature);
    if (!subject || !Array.isArray(chemicals)) return;
    const always = new Set([24, 29, 30, 34, 35, 36, 71, 79, 127, 128, 129, 204, 205, 212, 213, 255]);
    const pinned = new Set(store.pinnedMetrics());
    const metrics = [];
    chemicals.forEach((value, id) => {
      const metricId = "chemical:" + id;
      if (!pinned.has(metricId) && !always.has(id)) return;
      metrics.push({
        id: metricId,
        label: nameForId(id),
        value,
        unit: "concentration",
        group: chemicalGroup(id),
        sourceField: "chemicals[" + id + "]",
        evidenceLevel: "observed"
      });
    });
    capture(subject, "GET /api/creature/:id/chemistry", metrics);
  }

  function ingestOrgans(creature, organs) {
    const subject = subjectFor(creature);
    if (!subject || !Array.isArray(organs)) return;
    const metrics = [];
    organs.forEach(organ => {
      [
        ["clockRate", "Clock rate", "rate"],
        ["energyCost", "Energy cost", "cost"],
        ["shortTermLifeForce", "Short-term life force", "raw"],
        ["longTermLifeForce", "Long-term life force", "raw"],
        ["longTermRateOfRepair", "Rate of repair", "rate"],
        ["damageDueToZeroEnergy", "Damage without ATP", "raw"]
      ].forEach(([field, label, unit]) => {
        metrics.push({
          id: "organ:" + organ.index + ":" + field,
          label: "Organ " + organ.index + " · " + label,
          value: organ[field],
          unit,
          group: "organs",
          sourceField: "organs[" + organ.index + "]." + field,
          evidenceLevel: "observed"
        });
      });
    });
    capture(subject, "GET /api/creature/:id/organs", metrics);
  }

  function ingestNeuron(creature, detail) {
    const subject = subjectFor(creature);
    if (!subject || !detail || !Array.isArray(detail.states)) return;
    capture(subject, "GET /api/creature/:id/brain/lobe/:lobe/neuron/:neuron",
      detail.states.map((state, index) => ({
        id: "neuron:" + detail.lobeName + ":" + detail.neuronId + ":state:" + index,
        label: detail.lobeName + " #" + detail.neuronId + " · " + (state.name || ("S" + index)),
        value: state.value,
        unit: "neuron state",
        group: "neural signals",
        sourceField: "states[" + index + "]",
        evidenceLevel: "observed"
      })));
  }

  function currentView(metricId, maxPoints) {
    if (!current) return null;
    const state = ObservatoryState.getState();
    const world = state.world.identity;
    if (!world) return null;
    return store.metricView(world.key, current.key, metricId, maxPoints || 48);
  }

  function sparkline(view) {
    if (!view || view.visibleSamples.length < 2) {
      return '<span class="bio-spark bio-spark--empty" title="Trend begins after two retained samples">···</span>';
    }
    const samples = view.visibleSamples;
    const values = samples.map(sample => sample.value);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const span = maximum - minimum || 1;
    const width = 72;
    const height = 20;
    const points = samples.map((sample, index) => {
      const x = index / (samples.length - 1) * width;
      const y = height - ((sample.value - minimum) / span * (height - 3) + 1.5);
      return x.toFixed(1) + "," + y.toFixed(1);
    }).join(" ");
    const pointTargets = samples.map((sample, index) => {
      const x = index / (samples.length - 1) * width;
      const y = height - ((sample.value - minimum) / span * (height - 3) + 1.5);
      const pointTitle = "Tick " + sample.worldTick + ": " +
        sample.value.toFixed(6) + " " + (sample.unit || "raw") +
        (sample.enginePaused ? " · simulation paused" : "") +
        (sample.gapBefore ? " · follows " + sample.missedIntervals +
          " skipped interval(s)" : "");
      return '<circle class="bio-spark__point" cx="' + x.toFixed(1) +
        '" cy="' + y.toFixed(1) + '" r="2.5"><title>' +
        escapeHtml(pointTitle) + '</title></circle>';
    }).join("");
    const summary = view.summary;
    const title = "Observed samples: " + summary.sampleCount +
      " · min " + minimum.toFixed(3) + " · max " + maximum.toFixed(3) +
      (summary.ratePer100Ticks == null ? "" :
        " · rate " + signed(summary.ratePer100Ticks, 3) + " / 100 ticks");
    const markers = samples.map((sample, index) => {
      const interventions = sample.interventions || [];
      if (!interventions.length) return "";
      const x = index / (samples.length - 1) * width;
      const y = height - ((sample.value - minimum) / span * (height - 3) + 1.5);
      const markerTitle = interventions.map(record =>
        record.type + " at tick " + record.tick + " (" + (record.source || "unknown source") + ")"
      ).join(" · ");
      return '<circle class="bio-spark__intervention" cx="' + x.toFixed(1) +
        '" cy="' + y.toFixed(1) + '" r="2.5"><title>' +
        escapeHtml(markerTitle) + '</title></circle>';
    }).join("");
    return '<svg class="bio-spark" viewBox="0 0 72 20" role="img" aria-label="' +
      escapeHtml(title) + '"><title>' + escapeHtml(title) +
      '</title><polyline points="' + points + '"/>' + pointTargets +
      markers + '</svg>';
  }

  function signed(value, digits) {
    if (value == null || !Number.isFinite(value)) return "—";
    const threshold = Math.pow(10, -digits) / 2;
    if (Math.abs(value) < threshold) return "0";
    return (value > 0 ? "+" : "") + value.toFixed(digits);
  }

  function trendHtml(metricId, digits) {
    const view = currentView(metricId);
    if (!view) {
      return '<span class="bio-trend bio-trend--empty" title="Pin or keep monitoring to build history">No history</span>';
    }
    const summary = view.summary;
    const flags = [];
    if (summary.gapCount) flags.push(summary.missedIntervals + " skipped");
    const latest = view.samples[view.samples.length - 1];
    const staleAfterMs = Math.max(1000, (latest.sampleIntervalMs || intervalMs) * 2);
    const stale = summary.stale || Date.now() - latest.wallTimeMs > staleAfterMs;
    if (view.droppedSamples) flags.push(view.droppedSamples + " retained-limit drops");
    return '<span class="bio-trend' + (stale ? " bio-trend--stale" : "") +
      '" data-metric="' + escapeHtml(metricId) +
      '" data-sampled-at="' + latest.wallTimeMs +
      '" data-stale-after="' + staleAfterMs + '">' +
      sparkline(view) +
      '<span class="bio-delta" title="Change since the immediately previous retained sample">Δprev ' +
      signed(summary.previousDelta, digits) + '</span>' +
      '<span class="bio-delta" title="Change since the selected baseline sample">Δbase ' +
      signed(summary.baselineDelta, digits) + '</span>' +
      (flags.length ? '<span class="bio-gap" title="' + escapeHtml(flags.join(" · ")) +
        '">⚠ ' + escapeHtml(flags.join(" · ")) + '</span>' : '') +
      '</span>';
  }

  function pinButtonHtml(metricId, label) {
    const pinned = store.pinnedMetrics().includes(metricId);
    return '<button type="button" class="bio-pin' + (pinned ? " bio-pin--active" : "") +
      '" data-bio-pin="' + escapeHtml(metricId) + '" aria-pressed="' + pinned +
      '" title="' + (pinned ? "Remove from" : "Pin in") +
      ' biological monitoring tray">' + (pinned ? "◆" : "◇") +
      '<span class="sr-only"> ' + escapeHtml(label || metricId) + '</span></button>';
  }

  function order(records) {
    return store.orderMetrics(records, orderMode, GROUP_ORDER);
  }

  function setCurrentCreature(creature) {
    current = subjectFor(creature);
    render();
  }

  function renderStatus() {
    const stats = store.stats();
    const age = lastCaptureMs == null ? null : Math.max(0, Date.now() - lastCaptureMs);
    statusEl.textContent = current
      ? (recording ? "Recording " : "Live view; history paused · ") +
        current.label + " · " + stats.totalSamples + " retained samples" +
        (age == null ? "" : " · sampled " + Math.round(age / 100) / 10 + "s ago")
      : "Select a creature to start a world-qualified history";
    document.querySelectorAll(".bio-trend[data-sampled-at]").forEach(element => {
      const sampledAt = Number(element.dataset.sampledAt);
      const staleAfter = Number(element.dataset.staleAfter);
      element.classList.toggle(
        "bio-trend--stale",
        Date.now() - sampledAt > staleAfter
      );
    });
  }

  function render() {
    if (!monitor) return;
    recordButton.textContent = recording ? "■ Recording" : "● Start recording";
    recordButton.classList.toggle("bio-monitor__record--active", recording);
    recordButton.setAttribute("aria-pressed", String(recording));
    renderStatus();
    const session = current && ObservatoryState.getState().world.identity
      ? store.activeSession(ObservatoryState.getState().world.identity.key, current.key)
      : null;
    baselineButton.disabled = !session;
    exportButton.disabled = !session;

    const pins = store.pinnedMetrics();
    DomPatch.update(trayEl, pins.map((id, index) => {
      const meta = metadata.get(id) || { label: id, unit: "raw" };
      const view = currentView(id);
      return '<div class="bio-tray__item" data-patch-key="' + escapeHtml(id) +
        '" data-bio-tray-id="' + escapeHtml(id) + '">' +
        '<span class="bio-tray__order">' +
        '<button type="button" data-bio-move="-1" ' + (index === 0 ? "disabled" : "") + ' aria-label="Move earlier">↑</button>' +
        '<button type="button" data-bio-move="1" ' + (index === pins.length - 1 ? "disabled" : "") + ' aria-label="Move later">↓</button>' +
        '</span><span class="bio-tray__identity"><strong>' + escapeHtml(meta.label) +
        '</strong><small>' + escapeHtml(meta.group || "Waiting for first sample") + '</small></span>' +
        '<span class="bio-tray__value">' +
        (view ? Number(view.summary.current).toFixed(3) : "—") +
        '<small>' + escapeHtml(meta.unit) + '</small></span>' +
        trendHtml(id, 3) +
        '<button type="button" class="bio-pin bio-pin--active" data-bio-pin="' +
        escapeHtml(id) + '" aria-label="Unpin ' + escapeHtml(meta.label) + '">×</button>' +
        '</div>';
    }).join("") || '<div class="bio-tray__empty">Pin a drive, chemical, organ value, or selected neuron state.</div>');
  }

  function emitChange() {
    render();
    window.dispatchEvent(new CustomEvent("biological-monitor:changed"));
  }

  recordButton.addEventListener("click", () => {
    recording = !recording;
    emitChange();
  });
  orderEl.addEventListener("change", () => {
    orderMode = orderEl.value;
    emitChange();
  });
  intervalEl.addEventListener("change", () => {
    intervalMs = Number(intervalEl.value) || 2000;
    window.dispatchEvent(new CustomEvent("biological-monitor:interval", {
      detail: { intervalMs }
    }));
    emitChange();
  });
  function captureBaseline() {
    if (!current) return;
    const state = ObservatoryState.getState();
    const world = state.world.identity;
    const session = world && store.activeSession(world.key, current.key);
    if (session && state.world.tick != null) {
      store.setBaseline(session.id, state.world.tick);
      emitChange();
      return state.world.tick;
    }
    return null;
  }

  function pinMetric(id) {
    store.pin(id);
    emitChange();
    return store.pinnedMetrics();
  }

  baselineButton.addEventListener("click", () => {
    captureBaseline();
  });
  exportButton.addEventListener("click", () => {
    if (!current) return;
    const state = ObservatoryState.getState();
    const world = state.world.identity;
    const session = world && store.activeSession(world.key, current.key);
    if (!session) return;
    const payload = store.exportSession(session.id);
    const blob = new Blob([JSON.stringify(payload, null, 2) + "\n"], {
      type: "application/json"
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "biological-series-" +
      String(current.label).replace(/[^a-z0-9]+/gi, "-").toLowerCase() +
      "-tick-" + session.lastWorldTick + ".json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
  });

  document.addEventListener("click", event => {
    const pinButton = event.target.closest("[data-bio-pin]");
    if (pinButton) {
      event.preventDefault();
      event.stopPropagation();
      const id = pinButton.dataset.bioPin;
      if (store.pinnedMetrics().includes(id)) store.unpin(id);
      else store.pin(id);
      emitChange();
      return;
    }
    const moveButton = event.target.closest("[data-bio-move]");
    if (!moveButton) return;
    const item = moveButton.closest("[data-bio-tray-id]");
    const id = item && item.dataset.bioTrayId;
    if (!id) return;
    const pins = store.pinnedMetrics();
    store.movePin(id, pins.indexOf(id) + Number(moveButton.dataset.bioMove));
    emitChange();
  });

  ObservatoryState.subscribe(
    state => (state.world.identity ? state.world.identity.key : "") + ":" +
      state.world.status,
    () => {
      if (lastWorldKey) store.endWorldSession(lastWorldKey);
      const identity = ObservatoryState.getState().world.identity;
      lastWorldKey = identity ? identity.key : null;
      current = null;
      lastCaptureMs = null;
      render();
    }
  );
  setInterval(renderStatus, 1000);
  render();

  window.BiologicalMonitor = Object.freeze({
    store,
    groupOrder: GROUP_ORDER.slice(),
    chemicalGroup,
    ingestDrives,
    ingestChemistry,
    ingestOrgans,
    ingestNeuron,
    currentView,
    trendHtml,
    pinButtonHtml,
    order,
    setCurrentCreature,
    captureBaseline,
    pinMetric,
    intervalMs: () => intervalMs,
    isRecording: () => recording,
    refresh: render
  });
})();
