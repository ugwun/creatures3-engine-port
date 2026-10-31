// creature_observation_strip.js — live evidence strip browser controller
"use strict";

(function() {
  const panel = document.getElementById("crt-observation-strip");
  const statusEl = document.getElementById("crt-observation-status");
  const stagesEl = document.getElementById("crt-observation-stages");
  const warningEl = document.getElementById("crt-observation-warning");
  const freezeButton = document.getElementById("crt-observation-freeze");
  const captureButton = document.getElementById("crt-observation-capture");
  const captureName = document.getElementById("crt-observation-name");
  const compareSelect = document.getElementById("crt-observation-compare");
  const rawToggle = document.getElementById("crt-observation-raw");
  const captures = CreatureObservation.createCaptureStore({ limit: 20 });
  let liveObservation = null;
  let frozenObservation = null;
  let pollTimer = null;
  let statusTimer = null;
  let requestSerial = 0;
  let tabActive = Boolean(document.querySelector(
    '.tab-btn[data-tab="creatures"].tab-btn--active'
  ));

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function selectedCreature() {
    return ObservatoryState.getState().selection.creature;
  }

  function subjectKey(selection) {
    if (!selection) return null;
    return "creature:" + (selection.moniker || ("agent-" + selection.id));
  }

  function currentWorld() {
    return ObservatoryState.getState().world.identity;
  }

  function observationActive() {
    return tabActive && panel.open && Boolean(
      currentWorld() && selectedCreature()
    );
  }

  function recentChanges(selection) {
    const world = currentWorld();
    if (!world || !selection) return [];
    const ids = new Set(BiologicalMonitor.store.pinnedMetrics());
    for (let drive = 0; drive < 20; drive += 1) {
      ids.add("drive:" + drive);
    }
    const changes = [];
    ids.forEach(id => {
      const view = BiologicalMonitor.store.metricView(
        world.key,
        subjectKey(selection),
        id,
        48
      );
      if (!view || view.summary.previousDelta == null ||
          !view.samples.length) return;
      const latest = view.samples[view.samples.length - 1];
      changes.push({
        id,
        label: view.metric.label,
        value: view.summary.current,
        previousDelta: view.summary.previousDelta,
        baselineDelta: view.summary.baselineDelta,
        unit: view.metric.unit,
        worldTick: latest.worldTick,
        wallTimeMs: latest.wallTimeMs,
        sourceEndpoint: latest.sourceEndpoint,
        evidenceLevel: latest.evidenceLevel
      });
    });
    return changes;
  }

  function routeSelection(selection) {
    if (!selection) return null;
    const details = {};
    Object.keys(selection).forEach(key => {
      if (!["id", "key", "worldKey"].includes(key)) {
        details[key] = selection[key];
      }
    });
    return Object.assign({ id: selection.id }, details);
  }

  function captureById(id) {
    if (!id) return null;
    return captures.all().find(capture => capture.id === id) || null;
  }

  function displayedObservation() {
    const observation = frozenObservation || liveObservation;
    return observation
      ? CreatureObservation.compareObservation(
          observation,
          captureById(compareSelect.value)
        )
      : null;
  }

  function evidenceBadge(evidence) {
    const level = evidence && evidence.level
      ? evidence.level : "unknown";
    return '<span class="observation-stage__evidence observation-stage__evidence--' +
      escapeHtml(level) + '">' +
      escapeHtml(level.charAt(0).toUpperCase() + level.slice(1)) +
      '</span>';
  }

  function stageHtml(stage, index) {
    const tick = stage.evidence && stage.evidence.worldTick;
    const source = stage.evidence && stage.evidence.source;
    const comparison = stage.comparison && stage.comparison !== "none"
      ? '<span class="observation-stage__comparison observation-stage__comparison--' +
          escapeHtml(stage.comparison) + '">' +
          escapeHtml(stage.comparison) + '</span>'
      : "";
    const facts = stage.facts && stage.facts.length
      ? '<dl>' + stage.facts.map(item =>
          '<div><dt>' + escapeHtml(item.label) + '</dt><dd>' +
          escapeHtml(item.value) +
          '<small>' + escapeHtml(item.evidenceLevel) + '</small></dd></div>'
        ).join("") + '</dl>'
      : "";
    const competition = stage.competition
      ? '<div class="observation-stage__competition">' +
          '<strong>Competing signal</strong> ' +
          escapeHtml(stage.competition.explanation) + ' ' +
          escapeHtml(stage.competition.alternative.label) + ' ' +
          Number(stage.competition.alternative.activity).toFixed(3) +
        '</div>'
      : "";
    const targetLink = stage.targetNavigation
      ? '<button type="button" class="observation-stage__target" ' +
          'data-observation-target="' + escapeHtml(stage.id) + '">' +
          escapeHtml(stage.targetNavigation.label ||
            ("Open IT agent #" + stage.targetNavigation.id)) +
          '</button>'
      : "";
    const raw = rawToggle.checked
      ? '<pre class="observation-stage__raw">' +
          escapeHtml(JSON.stringify(stage.raw, null, 2)) + '</pre>'
      : "";
    return '<article class="observation-stage observation-stage--' +
      escapeHtml(stage.status) + '" role="listitem" data-stage="' +
      escapeHtml(stage.id) + '">' +
      (index ? '<span class="observation-stage__connector" aria-hidden="true">→</span>' : '') +
      '<header><span class="observation-stage__number">' +
      (index + 1) + '</span><h3>' + escapeHtml(stage.label) + '</h3>' +
      comparison + evidenceBadge(stage.evidence) + '</header>' +
      '<div class="observation-stage__tick">Tick ' +
      escapeHtml(tick == null ? "unknown" : tick) + '</div>' +
      '<strong class="observation-stage__summary">' +
      escapeHtml(stage.summary) + '</strong>' +
      '<p>' + escapeHtml(stage.detail) + '</p>' +
      competition + facts +
      '<footer><button type="button" data-observation-open="' +
      escapeHtml(stage.id) + '"' +
      (stage.navigation ? "" : " disabled") + '>' +
      escapeHtml(stage.navigation
        ? "Open source inspector" : "Source unavailable") +
      '</button>' + targetLink +
      '<span title="' + escapeHtml(source || "Source unavailable") + '">' +
      escapeHtml(source || "Source unavailable") + '</span></footer>' +
      raw +
      '</article>';
  }

  function renderCaptures() {
    const selected = compareSelect.value;
    const all = captures.all();
    DomPatch.update(compareSelect, '<option value="">No capture</option>' +
      all.slice().reverse().map(capture =>
        '<option value="' + escapeHtml(capture.id) + '">' +
        escapeHtml(capture.name) + ' · tick ' + capture.worldTick +
        '</option>'
      ).join(""));
    compareSelect.disabled = !all.length;
    if (all.some(capture => capture.id === selected)) {
      compareSelect.value = selected;
    } else if (all.length) {
      compareSelect.value = all[all.length - 1].id;
    }
  }

  function renderStatus() {
    const observation = displayedObservation();
    if (!observation) {
      panel.classList.remove("observation-strip--stale");
      statusEl.textContent = !selectedCreature()
        ? "Select a creature to observe"
        : panel.open
          ? "Waiting for the first coherent sample"
          : "Open to start sampling";
      return;
    }
    const age = observation.capturedAtWallTimeMs == null
      ? null
      : Math.max(0, Date.now() - observation.capturedAtWallTimeMs);
    statusEl.textContent =
      (frozenObservation ? "Frozen view" : "Live") + " · " +
      observation.subjectLabel + " · tick " + observation.worldTick +
      (age == null ? "" : " · sampled " +
        (Math.round(age / 100) / 10).toFixed(1) + "s ago");
    panel.classList.toggle(
      "observation-strip--stale",
      age != null && age > BiologicalMonitor.intervalMs() * 2
    );
  }

  function render() {
    renderStatus();
    captureButton.disabled = !liveObservation ||
      liveObservation.worldTick == null;
    freezeButton.disabled = !liveObservation ||
      liveObservation.worldTick == null;
    freezeButton.textContent = frozenObservation
      ? "Resume live view" : "Freeze view";
    freezeButton.setAttribute(
      "aria-pressed", String(Boolean(frozenObservation))
    );
    const observation = displayedObservation();
    if (!observation) {
      warningEl.textContent = currentWorld() && selectedCreature()
        ? "Waiting for the observation endpoint."
        : "No active world-qualified creature selection.";
      DomPatch.update(stagesEl, CreatureObservation.STAGES.map((stage, index) =>
        stageHtml({
          id: stage.id,
          label: stage.label,
          status: "unknown",
          summary: "Unknown",
          detail: "No source sample is available.",
          facts: [],
          competition: null,
          evidence: { level: "unknown", worldTick: null, source: null },
          navigation: null,
          raw: null
        }, index)
      ).join(""));
      return;
    }
    warningEl.textContent = [
      observation.timing.warning,
      observation.causalWarning
    ].filter(Boolean).join(" ");
    DomPatch.update(stagesEl, observation.stages.map(stageHtml).join(""));
  }

  async function fetchObservation() {
    const selection = selectedCreature();
    const world = currentWorld();
    if (!selection || !world) return;
    const serial = ++requestSerial;
    const expectedWorldKey = world.key;
    const expectedSubjectKey = subjectKey(selection);
    try {
      const response = await fetch(
        "/api/creature/" + selection.id + "/observation"
      );
      const endpoint = response.ok
        ? await response.json()
        : { error: "Observation endpoint returned HTTP " + response.status };
      if (serial !== requestSerial) return;
      const currentSelection = selectedCreature();
      const activeWorld = currentWorld();
      if (!currentSelection || !activeWorld ||
          activeWorld.key !== expectedWorldKey ||
          subjectKey(currentSelection) !== expectedSubjectKey) return;
      liveObservation = CreatureObservation.composeObservation({
        endpoint,
        worldKey: expectedWorldKey,
        subjectKey: expectedSubjectKey,
        subjectLabel: currentSelection.name ||
          ("Creature #" + currentSelection.id),
        sampleIntervalMs: BiologicalMonitor.intervalMs(),
        capturedAtWallTimeMs: Date.now(),
        eventNames: window.CAOS_EVENT_NAMES || {},
        recentChanges: recentChanges(currentSelection)
      });
    } catch (error) {
      if (serial !== requestSerial) return;
      liveObservation = CreatureObservation.composeObservation({
        endpoint: { error: String(error) },
        worldKey: expectedWorldKey,
        subjectKey: expectedSubjectKey,
        subjectLabel: selection.name || ("Creature #" + selection.id),
        sampleIntervalMs: BiologicalMonitor.intervalMs(),
        capturedAtWallTimeMs: Date.now()
      });
    }
    render();
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function startPolling() {
    stopPolling();
    if (!observationActive()) return;
    fetchObservation();
    pollTimer = setInterval(
      fetchObservation,
      BiologicalMonitor.intervalMs()
    );
  }

  function resetForContext() {
    requestSerial += 1;
    liveObservation = null;
    frozenObservation = null;
    const world = currentWorld();
    const selection = selectedCreature();
    captures.setSession(
      world ? world.key : null,
      subjectKey(selection)
    );
    renderCaptures();
    render();
    startPolling();
  }

  function navigate(stage, targetOnly) {
    const state = ObservatoryState.getState();
    const world = state.world.identity;
    const creature = state.selection.creature;
    if (!world || !creature) return;
    const navigation = targetOnly
      ? stage.targetNavigation : stage.navigation;
    if (!navigation || navigation.id == null) return;
    const selections = {
      creature: routeSelection(creature),
      agent: {
        id: creature.id,
        family: 4,
        genus: creature.genus,
        species: creature.species,
        name: creature.name,
        moniker: creature.moniker
      }
    };
    if (navigation.kind === "room") {
      selections.room = { id: navigation.id, creatureId: creature.id };
      const environment = stage.raw || {};
      if (environment.metaRoomId != null) {
        selections.metaroom = {
          id: environment.metaRoomId,
          creatureId: creature.id
        };
      }
    } else {
      selections[navigation.kind] = Object.assign(
        {},
        selections[navigation.kind] || {},
        { id: navigation.id },
        navigation.details || {}
      );
      if (navigation.kind === "script" && navigation.details) {
        selections.event = {
          id: navigation.details.event,
          name: (window.CAOS_EVENT_NAMES || {})[
            navigation.details.event
          ]
        };
      }
    }
    window.DevToolsNavigation.navigate({
      tab: navigation.tab,
      view: navigation.view,
      worldKey: world.key,
      primary: navigation.kind,
      selections
    });
  }

  freezeButton.addEventListener("click", () => {
    frozenObservation = frozenObservation ? null : liveObservation;
    render();
  });

  captureButton.addEventListener("click", () => {
    if (!liveObservation) return;
    const captured = captures.add(
      captureName.value,
      liveObservation,
      Date.now()
    );
    captureName.value = "";
    renderCaptures();
    if (captured) compareSelect.value = captured.id;
    render();
  });

  captureName.addEventListener("keydown", event => {
    if (event.key !== "Enter" || captureButton.disabled) return;
    event.preventDefault();
    captureButton.click();
  });
  compareSelect.addEventListener("change", render);
  rawToggle.addEventListener("change", render);
  panel.addEventListener("toggle", startPolling);

  stagesEl.addEventListener("click", event => {
    const targetButton = event.target.closest("[data-observation-target]");
    const sourceButton = event.target.closest("[data-observation-open]");
    const stageId = targetButton
      ? targetButton.dataset.observationTarget
      : sourceButton && sourceButton.dataset.observationOpen;
    if (!stageId) return;
    const observation = displayedObservation();
    const stage = observation && observation.stages.find(
      item => item.id === stageId
    );
    if (stage) navigate(stage, Boolean(targetButton));
  });

  DevToolsEvents.on("tab:activated", tab => {
    if (tab !== "creatures") return;
    tabActive = true;
    startPolling();
  });
  DevToolsEvents.on("tab:deactivated", tab => {
    if (tab !== "creatures") return;
    tabActive = false;
    stopPolling();
  });
  window.addEventListener("biological-monitor:interval", startPolling);
  ObservatoryState.subscribe(
    state => [
      state.world.identity ? state.world.identity.key : "",
      state.world.status,
      state.selection.creature ? state.selection.creature.key : ""
    ].join("|"),
    resetForContext
  );

  statusTimer = setInterval(renderStatus, 1000);
  window.addEventListener("beforeunload", () => {
    stopPolling();
    if (statusTimer) clearInterval(statusTimer);
  });
  renderCaptures();
  render();
  startPolling();

  window.CreatureObservationStrip = Object.freeze({
    fetchNow: fetchObservation,
    getLive: () => liveObservation,
    getDisplayed: displayedObservation,
    captures
  });
})();
