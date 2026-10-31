// timeline_workspace.js — bounded live/offline ethology timeline controller
"use strict";

(() => {
  const Model = window.EthologyTimeline;
  if (!Model) return;

  const store = Model.createStore();
  const categoryLabels = {
    environment: "Environment",
    perception: "Perception",
    neural: "Neural",
    action: "Action",
    physiology: "Physiology",
    lifecycle: "Lifecycle",
    intervention: "Intervention",
    error: "Errors",
    gap: "Gaps"
  };
  const dom = {
    panel: document.getElementById("tab-timeline"),
    record: document.getElementById("timeline-record"),
    background: document.getElementById("timeline-background"),
    interval: document.getElementById("timeline-interval"),
    memory: document.getElementById("timeline-memory"),
    duration: document.getElementById("timeline-duration"),
    exportFormat: document.getElementById("timeline-export-format"),
    exportButton: document.getElementById("timeline-export"),
    importButton: document.getElementById("timeline-import"),
    importFile: document.getElementById("timeline-import-file"),
    session: document.getElementById("timeline-session"),
    name: document.getElementById("timeline-name"),
    nameSave: document.getElementById("timeline-name-save"),
    nameStatus: document.getElementById("timeline-name-status"),
    summary: document.getElementById("timeline-summary"),
    filters: document.getElementById("timeline-category-filters"),
    zoom: document.getElementById("timeline-zoom"),
    follow: document.getElementById("timeline-follow"),
    warning: document.getElementById("timeline-warning"),
    mode: document.getElementById("timeline-mode"),
    cursorLabel: document.getElementById("timeline-cursor-label"),
    live: document.getElementById("timeline-live"),
    scrubber: document.getElementById("timeline-scrubber"),
    ticks: document.getElementById("timeline-ticks"),
    lanes: document.getElementById("timeline-lanes"),
    eventList: document.getElementById("timeline-event-list"),
    displayCount: document.getElementById("timeline-display-count"),
    historical: document.getElementById("timeline-historical"),
    detail: document.getElementById("timeline-event-detail")
  };

  let tabActive = Boolean(document.querySelector(
    '.tab-btn[data-tab="timeline"].tab-btn--active'
  ));
  let recording = true;
  let timer = null;
  let requestSerial = 0;
  let selectedEventId = null;
  let viewingSessionId = null;
  let nameEdited = false;
  let liveSessionId = null;
  let cursorTick = null;
  let lastContextKey = null;
  let lastConnection = null;
  let lastPaused = null;
  let consumedInterventions = new Set();

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function selectedCreature() {
    return ObservatoryState.getState().selection.creature;
  }

  function worldIdentity() {
    return ObservatoryState.getState().world.identity;
  }

  function subjectKey(creature) {
    return creature
      ? "creature:" + (creature.moniker || ("agent-" + creature.id))
      : null;
  }

  function contextKey() {
    const world = worldIdentity();
    const creature = selectedCreature();
    return world && creature
      ? world.key + "/" + subjectKey(creature)
      : null;
  }

  function sampleInterval() {
    return Number(dom.interval.value) || 2000;
  }

  function shouldPoll() {
    return recording && (tabActive || dom.background.checked) &&
      Boolean(worldIdentity() && selectedCreature());
  }

  function statusText(session) {
    if (!session) return "Waiting for a selected creature";
    const range = session.firstWorldTick == null
      ? "no retained ticks"
      : "ticks " + session.retainedFromTick + "–" +
        session.lastWorldTick;
    const dropped = session.droppedEvents + session.droppedSnapshots;
    return session.eventCount + " events · " +
      session.snapshotCount + " snapshots · " + range + " · " +
      (session.byteCount / 1024).toFixed(1) + " KiB" +
      (dropped ? " · " + dropped + " trimmed" : "");
  }

  function physiologyFor(creature, chemistry) {
    const world = worldIdentity();
    if (!world || !creature || !window.BiologicalMonitor) {
      return { metrics: [], organs: [] };
    }
    const metricIds = new Set(
      BiologicalMonitor.store.pinnedMetrics()
        .filter(id => String(id).startsWith("chemical:"))
        .concat(["chemical:204", "chemical:205"])
    );
    const metrics = [];
    metricIds.forEach(id => {
      const chemicalId = Number(String(id).split(":")[1]);
      const value = chemistry &&
        Array.isArray(chemistry.chemicals)
        ? Number(chemistry.chemicals[chemicalId]) : null;
      const view = BiologicalMonitor.store.metricView(
        world.key, subjectKey(creature), id, 4
      );
      if (!Number.isFinite(value)) return;
      metrics.push({
        id,
        label: view && view.metric.label ||
          (chemicalId === 204 ? "Reward" :
            chemicalId === 205 ? "Punishment" :
              "Chemical #" + chemicalId),
        value,
        unit: view && view.metric.unit || "concentration",
        largeDelta: id.startsWith("chemical:") ? 0.05 : 0.1
      });
    });
    const organs = chemistry && Array.isArray(chemistry.organs)
      ? chemistry.organs.map(organ => ({
          id: "organ:" + organ.index,
          label: "Organ " + organ.index,
          status: organ.failed ? "failed" :
            organ.functioning ? "functioning" : "impaired",
          lifeForce: organ.lifeForce
        })) : [];
    const sourceRecords = chemistry ? [{
      type: "creature_chemistry",
      source: chemistry.source ||
        "GET /api/creature/:id/chemistry",
      worldTick: chemistry.worldTick,
      systemTick: chemistry.systemTick,
      capturedAtWallTimeMs: chemistry.capturedAtWallTimeMs,
      contextTiming: chemistry.contextTiming ||
        "engine_main_thread",
      schemaVersion: chemistry.schemaVersion
    }] : [];
    return { metrics, organs, sourceRecords };
  }

  function compose(endpoint, world, creature) {
    return CreatureObservation.composeObservation({
      endpoint,
      worldKey: world.key,
      subjectKey: subjectKey(creature),
      subjectLabel: creature.name || ("Creature #" + creature.id),
      sampleIntervalMs: sampleInterval(),
      capturedAtWallTimeMs: Date.now(),
      eventNames: window.CAOS_EVENT_NAMES || {},
      recentChanges: []
    });
  }

  async function poll() {
    if (!shouldPoll()) return;
    const world = worldIdentity();
    const creature = selectedCreature();
    const expected = contextKey();
    const serial = ++requestSerial;
    try {
      const [response, chemistryResponse] = await Promise.all([
        fetch("/api/creature/" + creature.id + "/observation"),
        fetch("/api/creature/" + creature.id + "/chemistry")
      ]);
      if (!response.ok) throw new Error("HTTP " + response.status);
      const endpoint = await response.json();
      const chemistry = chemistryResponse.ok
        ? await chemistryResponse.json() : null;
      if (serial !== requestSerial || expected !== contextKey()) return;
      const observation = compose(endpoint, world, creature);
      const result = store.ingestObservation(observation, {
        sampleIntervalMs: sampleInterval(),
        physiology: physiologyFor(creature, chemistry)
      });
      if (!result.session) return;
      liveSessionId = result.session.id;
      ingestAvailableInterventions();
      if (!viewingSessionId ||
          !(store.stats(viewingSessionId) || {}).imported) {
        viewingSessionId = liveSessionId;
      }
      if (dom.follow.checked && viewingSessionId === liveSessionId) {
        cursorTick = result.session.lastWorldTick;
      }
      render();
    } catch (error) {
      if (serial !== requestSerial) return;
      const active = store.activeSession();
      if (active && active.id === liveSessionId) {
        store.markGap("connection_lost", {
          sessionId: liveSessionId,
          label: "Observation connection unavailable",
          detail: "Polling failed: " + String(error),
          uncertainty:
            "No observations were retained; this interval is not inactivity."
        });
      }
      render();
    }
  }

  function ingestAvailableInterventions(records) {
    const interventions = records ||
      ObservatoryState.getState().interventions;
    interventions.forEach(record => {
      if (consumedInterventions.has(record.id)) return;
      const event = store.ingestIntervention(record);
      if (event) consumedInterventions.add(record.id);
    });
  }

  function restartPolling(immediate) {
    if (timer) clearInterval(timer);
    timer = null;
    if (!shouldPoll()) return;
    if (immediate) poll();
    timer = setInterval(poll, sampleInterval());
  }

  function selectedCategories() {
    return new Set(Array.from(dom.filters.querySelectorAll(
      "input[data-timeline-category]:checked"
    )).map(input => input.dataset.timelineCategory));
  }

  function visibleRange(session) {
    if (!session || session.firstWorldTick == null) return [0, 0];
    const end = cursorTick == null
      ? session.lastWorldTick : cursorTick;
    const total = Math.max(1,
      session.lastWorldTick - session.retainedFromTick);
    const fraction = Math.max(0.07,
      Math.min(1, 100 / Number(dom.zoom.value)));
    const span = Math.max(20, Math.round(total * fraction));
    return [
      Math.max(session.retainedFromTick, end - span),
      Math.max(session.retainedFromTick, end)
    ];
  }

  function eventStyle(event, start, end) {
    const span = Math.max(1, end - start);
    const left = Math.max(0,
      Math.min(100, (event.startTick - start) / span * 100));
    const right = Math.max(left + 0.7,
      Math.min(100, (event.endTick - start) / span * 100));
    return "--event-left:" + left.toFixed(2) +
      "%;--event-width:" + Math.max(0.7, right - left).toFixed(2) + "%";
  }

  function renderSessionSelector() {
    const sessions = store.allSessions();
    const value = viewingSessionId || "";
    DomPatch.update(dom.session, sessions.length
      ? sessions.map(session =>
          '<option value="' + escapeHtml(session.id) + '"' +
          (session.id === value ? " selected" : "") + ">" +
          escapeHtml((session.imported ? "OFFLINE · " : "") +
            session.name + " · " + session.subjectLabel) +
          "</option>"
        ).join("")
      : '<option value="">No recordings yet</option>');
    dom.session.value = value;
  }

  function renderRuler(session, start, end) {
    dom.scrubber.min = session ? session.retainedFromTick : 0;
    dom.scrubber.max = session ? session.lastWorldTick : 0;
    dom.scrubber.value = cursorTick == null
      ? (session ? session.lastWorldTick : 0) : cursorTick;
    dom.cursorLabel.textContent = session
      ? "Tick " + dom.scrubber.value : "Tick —";
    const historical = session &&
      (session.imported || Number(dom.scrubber.value) <
        session.lastWorldTick);
    dom.mode.textContent = session && session.imported
      ? "OFFLINE" : historical ? "HISTORICAL" : "LIVE";
    dom.mode.dataset.mode = dom.mode.textContent.toLowerCase();
    dom.live.hidden = !historical || Boolean(session && session.imported);
    const tickCount = 5;
    DomPatch.update(dom.ticks,
      Array.from({ length: tickCount }, (_, index) => {
        const tick = Math.round(start +
          (end - start) * index / (tickCount - 1));
        return '<span style="left:' +
          (index / (tickCount - 1) * 100) + '%">' + tick + "</span>";
      }).join(""));
  }

  function renderLanes(events, start, end) {
    DomPatch.update(dom.lanes, Model.CATEGORIES.map(category => {
      const laneEvents = events.filter(event =>
        event.category === category);
      return '<section class="timeline-lane timeline-lane--' +
        category + '"><header>' +
        escapeHtml(categoryLabels[category]) +
        '<span>' + laneEvents.length + '</span></header>' +
        '<div class="timeline-lane__track">' +
        laneEvents.map(event =>
          '<button type="button" data-patch-key="' + escapeHtml(event.id) +
          '" class="timeline-mark timeline-mark--' +
          escapeHtml(event.evidenceLevel) +
          (event.id === selectedEventId
            ? " timeline-mark--selected" : "") +
          '" style="' + eventStyle(event, start, end) +
          '" data-timeline-event="' + escapeHtml(event.id) +
          '" aria-label="' + escapeHtml(event.label + ", " +
            event.evidenceLevel + " evidence, ticks " +
            event.startTick + " through " + event.endTick) +
          '" aria-pressed="' + (event.id === selectedEventId) +
          '" title="' + escapeHtml(event.label + " · ticks " +
            event.startTick + "–" + event.endTick) + '"><span>' +
          escapeHtml(event.label) + "</span></button>"
        ).join("") + "</div></section>";
    }).join(""));
  }

  function renderEventList(events) {
    dom.displayCount.textContent = events.length + " displayed events";
    DomPatch.update(dom.eventList, events.length
      ? events.slice().reverse().map(event =>
          '<article data-patch-key="' + escapeHtml(event.id) +
          '" class="timeline-event timeline-event--' +
          escapeHtml(event.category) +
          (event.id === selectedEventId
            ? " timeline-event--selected" : "") +
          '" data-timeline-event="' + escapeHtml(event.id) +
          '" tabindex="0" role="listitem" aria-label="' +
          escapeHtml(event.label + ", " + event.evidenceLevel +
            " evidence, " + (event.exactTick
              ? "tick " + event.endTick
              : "ticks " + event.startTick + " through " +
                event.endTick)) + '">' +
          '<button type="button" class="timeline-event__bookmark" ' +
          'data-timeline-bookmark="' + escapeHtml(event.id) +
          '" aria-label="' + (event.bookmarked
            ? "Remove bookmark" : "Bookmark event") + '">' +
          (event.bookmarked ? "★" : "☆") + "</button>" +
          '<span class="timeline-event__tick">' +
          (event.exactTick ? "@" + event.endTick :
            event.startTick + "–" + event.endTick) + "</span>" +
          '<span class="timeline-event__evidence timeline-event__evidence--' +
          escapeHtml(event.evidenceLevel) + '">' +
          escapeHtml(event.evidenceLevel) + "</span>" +
          '<strong>' + escapeHtml(event.label) + "</strong>" +
          (event.annotation
            ? '<span class="timeline-event__note">NOTE</span>' : "") +
          "</article>"
        ).join("")
      : '<p class="timeline-empty">No retained events match this view. Sampling continues when recording is active.</p>');
  }

  function stageCards(observation) {
    if (!observation || !Array.isArray(observation.stages)) {
      return '<p class="timeline-empty">No retained observation near this tick.</p>';
    }
    return observation.stages.map(stage =>
      '<article class="timeline-history-stage timeline-history-stage--' +
      escapeHtml(stage.status || "unknown") + '">' +
      '<span>' + escapeHtml(stage.label) + "</span>" +
      '<strong>' + escapeHtml(stage.summary || "Unavailable") +
      "</strong></article>"
    ).join("");
  }

  function renderHistorical(session) {
    if (!session) {
      DomPatch.update(dom.historical,
        '<p class="timeline-empty">No recording selected.</p>');
      return;
    }
    const snapshot = store.nearestSnapshot(
      session.id,
      cursorTick == null ? session.lastWorldTick : cursorTick
    );
    DomPatch.update(dom.historical,
      '<div class="timeline-history-heading">' +
      '<strong>Nearest retained observation</strong>' +
      '<span>' + (snapshot
        ? "tick " + snapshot.worldTick +
          (snapshot.worldTick === Number(dom.scrubber.value)
            ? "" : " · nearest to cursor")
        : "unavailable") + "</span></div>" +
      stageCards(snapshot && snapshot.observation) +
      '<p class="timeline-history-note">' +
      (session.imported
        ? "Offline recording; no engine connection is required."
        : Number(dom.scrubber.value) < session.lastWorldTick
          ? "Historical cursor. The live engine may now differ."
          : "Live edge of the retained recording.") + "</p>");
  }

  function formatJson(value) {
    return value == null
      ? "—" : JSON.stringify(value, null, 2);
  }

  function renderDetail(session) {
    const event = session && selectedEventId
      ? store.getEvent(session.id, selectedEventId) : null;
    if (!event) {
      DomPatch.update(dom.detail,
        '<p class="timeline-empty">Select an event to inspect before/after values, uncertainty, and sources.</p>');
      return;
    }
    // Keyed to the event: disclosures and draft notes belong to one event and
    // must survive a refresh of it, but not carry over to the next.
    DomPatch.update(dom.detail,
      '<article class="timeline-detail-card" data-patch-key="' +
      escapeHtml(event.id) + '">' +
      '<div class="timeline-detail-card__head"><span>' +
      escapeHtml(categoryLabels[event.category]) + "</span><strong>" +
      escapeHtml(event.label) + "</strong></div>" +
      '<dl><div><dt>Ticks</dt><dd>' +
      (event.exactTick ? event.endTick :
        event.startTick + "–" + event.endTick) +
      '</dd></div><div><dt>Evidence</dt><dd>' +
      escapeHtml(event.evidenceLevel +
        (event.explicit ? " · explicit" : " · sampled")) +
      '</dd></div><div><dt>Subject</dt><dd>' +
      escapeHtml(event.subjectLabel + " · #" +
        event.subjectAgentId) + "</dd></div>" +
      (event.correlationId
        ? '<div><dt>Correlation</dt><dd>' +
          escapeHtml(event.correlationId) + "</dd></div>" : "") +
      "</dl>" +
      (event.uncertainty
        ? '<p class="timeline-detail-uncertainty"><strong>Uncertainty</strong> ' +
          escapeHtml(event.uncertainty) + "</p>" : "") +
      '<details><summary>Before / after</summary><div class="timeline-before-after"><pre>' +
      escapeHtml(formatJson(event.before)) + "</pre><pre>" +
      escapeHtml(formatJson(event.after)) +
      "</pre></div></details>" +
      '<details><summary>Source records (' +
      event.sourceRecords.length + ')</summary><pre>' +
      escapeHtml(formatJson(event.sourceRecords)) + "</pre></details>" +
      '<label for="timeline-annotation">Annotation</label>' +
      '<textarea id="timeline-annotation" rows="4" placeholder="Investigative note">' +
      escapeHtml(event.annotation) + "</textarea>" +
      '<div class="timeline-detail-actions">' +
      '<button id="timeline-annotation-save" type="button" class="btn-light">Save note</button>' +
      (event.navigation
        ? '<button id="timeline-open-source" type="button" class="btn-light">Open source inspector</button>'
        : "") + "</div></article>");
  }

  function renderWarning(session) {
    const state = ObservatoryState.getState();
    const messages = [];
    if (!selectedCreature()) {
      messages.push("Select a creature in the Creatures workspace to begin.");
    }
    if (!recording) {
      messages.push("Recording paused; the gap is explicit.");
    } else if (!tabActive && !dom.background.checked) {
      messages.push("Recording is idle outside this tab. Enable background recording to continue.");
    }
    if (Number(state.world.speed) > 1 &&
        sampleInterval() * Number(state.world.speed) >= 4000) {
      messages.push("Accelerated world: this sample interval may miss short actions. Use 1 s for finer resolution.");
    }
    if (state.connection.status === "disconnected") {
      messages.push("Engine disconnected; missing time is not inactivity.");
    }
    if (session && session.droppedEvents + session.droppedSnapshots > 0) {
      messages.push("Older data was trimmed by the configured rolling bounds.");
    }
    dom.warning.hidden = !messages.length;
    dom.warning.textContent = messages.join(" ");
  }

  function render() {
    renderSessionSelector();
    const session = viewingSessionId
      ? store.stats(viewingSessionId) : null;
    if (session && cursorTick == null) cursorTick = session.lastWorldTick;
    if (session && dom.follow.checked && !session.imported &&
        session.id === liveSessionId) {
      cursorTick = session.lastWorldTick;
    }
    if (!nameEdited) dom.name.value = session ? session.name : "";
    dom.name.disabled = !session || session.readOnly;
    dom.nameSave.disabled = !session || session.readOnly || !nameEdited;
    dom.summary.textContent = statusText(session);
    renderWarning(session);
    const [start, end] = visibleRange(session);
    renderRuler(session, start, end);
    const events = session
      ? store.query({
          sessionId: session.id,
          startTick: start,
          endTick: end,
          categories: selectedCategories()
        }) : [];
    const displayed = store.downsample(events, 220);
    renderLanes(displayed, start, end);
    renderEventList(displayed);
    renderHistorical(session);
    renderDetail(session);
    dom.record.textContent = recording
      ? "Pause recording" : "Resume recording";
    dom.record.classList.toggle("btn--active", recording);
  }

  function selectEvent(id) {
    const session = viewingSessionId &&
      store.stats(viewingSessionId);
    const event = session && store.getEvent(session.id, id);
    if (!event) return;
    const focusRegion = dom.lanes.contains(document.activeElement)
      ? dom.lanes
      : dom.eventList.contains(document.activeElement)
        ? dom.eventList : null;
    selectedEventId = event.id;
    cursorTick = event.endTick;
    dom.follow.checked = false;
    ObservatoryState.select("timelineEvent", event.id,
      Object.assign({}, event, { tick: event.endTick }), true);
    publishTimeContext();
    render();
    if (focusRegion) requestAnimationFrame(() => {
      const replacement = focusRegion.querySelector(
        `[data-timeline-event="${CSS.escape(String(event.id))}"]`);
      if (replacement) replacement.focus();
    });
  }

  function publishTimeContext() {
    if (!window.DevToolsNavigation ||
        DevToolsNavigation.getActiveTab() !== "timeline") return;
    const session = viewingSessionId && store.stats(viewingSessionId);
    DevToolsNavigation.updateRouteContext({
      routeId: "timeline",
      time: cursorTick == null && !session ? null : {
        timebase: "worldTicks",
        cursorTick,
        startTick: session && session.firstWorldTick,
        endTick: session && session.lastWorldTick
      }
    });
  }

  function downloadRecording() {
    const session = viewingSessionId &&
      store.stats(viewingSessionId);
    if (!session) return;
    const format = dom.exportFormat.value;
    const payload = store.exportSession(session.id);
    const value = Model.serializeRecording(payload, format);
    const type = format === "csv"
      ? "text/csv" : format === "jsonl"
        ? "application/x-ndjson" : "application/json";
    const url = URL.createObjectURL(new Blob([value], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = session.name.replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-|-$/g, "").toLowerCase() +
      "." + format;
    link.click();
    URL.revokeObjectURL(url);
  }

  function recordBoundary(reason, label) {
    if (!liveSessionId) return;
    const session = store.stats(liveSessionId);
    if (!session || session.readOnly ||
        session.lastWorldTick == null) return;
    store.markGap(reason, {
      sessionId: session.id,
      startTick: session.lastWorldTick,
      endTick: session.lastWorldTick,
      label,
      explicit: true,
      evidenceLevel: "observed",
      uncertainty:
        "This marker identifies a recording boundary, not creature inactivity."
    });
  }

  dom.filters.innerHTML = Model.CATEGORIES.map(category =>
    '<label class="cat-toggle timeline-category timeline-category--' +
    category + '"><input type="checkbox" checked ' +
    'data-timeline-category="' + category + '" />' +
    '<span class="cat-dot"></span>' +
    escapeHtml(categoryLabels[category]) + "</label>"
  ).join("");

  dom.record.addEventListener("click", () => {
    recording = !recording;
    recordBoundary(
      recording ? "recording_resumed" : "recording_paused",
      recording ? "Recording resumed" : "Recording paused"
    );
    restartPolling(recording);
    render();
  });
  dom.background.addEventListener("change", () =>
    restartPolling(dom.background.checked));
  dom.interval.addEventListener("change", () => {
    restartPolling(true);
    render();
  });
  [dom.memory, dom.duration].forEach(input =>
    input.addEventListener("change", () => {
      store.setLimits({
        maxBytes: Number(dom.memory.value) * 1024 * 1024,
        maxDurationTicks: Number(dom.duration.value)
      });
      render();
    })
  );
  dom.filters.addEventListener("change", render);
  dom.zoom.addEventListener("input", render);
  dom.follow.addEventListener("change", () => {
    if (dom.follow.checked) {
      const session = viewingSessionId &&
        store.stats(viewingSessionId);
      if (session) cursorTick = session.lastWorldTick;
    }
    publishTimeContext();
    render();
  });
  dom.scrubber.addEventListener("input", () => {
    cursorTick = Number(dom.scrubber.value);
    dom.follow.checked = false;
    publishTimeContext();
    render();
  });
  dom.live.addEventListener("click", () => {
    if (liveSessionId) {
      viewingSessionId = liveSessionId;
      const session = store.stats(liveSessionId);
      cursorTick = session && session.lastWorldTick;
    }
    dom.follow.checked = true;
    selectedEventId = null;
    publishTimeContext();
    render();
  });
  dom.session.addEventListener("change", () => {
    viewingSessionId = dom.session.value || null;
    nameEdited = false;
    dom.nameStatus.textContent = "";
    const session = viewingSessionId &&
      store.stats(viewingSessionId);
    cursorTick = session && session.lastWorldTick;
    selectedEventId = null;
    dom.follow.checked = Boolean(
      session && !session.imported &&
      session.id === liveSessionId
    );
    publishTimeContext();
    render();
  });
  function saveSessionName() {
    if (!viewingSessionId || !nameEdited) return;
    const name = dom.name.value.trim();
    if (!name) {
      dom.nameStatus.textContent = "Enter a name first.";
      return;
    }
    store.renameSession(viewingSessionId, name);
    nameEdited = false;
    dom.name.value = name;
    dom.nameStatus.textContent = "Saved. Exports and the list above use “" +
      name + "”.";
    render();
  }
  dom.name.addEventListener("input", () => {
    nameEdited = true;
    dom.nameSave.disabled = false;
    dom.nameStatus.textContent = "";
  });
  dom.name.addEventListener("keydown", event => {
    if (event.key === "Enter") saveSessionName();
    if (event.key === "Escape") {
      nameEdited = false;
      dom.nameStatus.textContent = "";
      render();
    }
  });
  dom.nameSave.addEventListener("click", saveSessionName);
  dom.detail.addEventListener("click", event => {
    const session = viewingSessionId && store.stats(viewingSessionId);
    const item = session && selectedEventId
      ? store.getEvent(session.id, selectedEventId) : null;
    if (!item) return;
    if (event.target.closest("#timeline-annotation-save")) {
      store.updateEvent(session.id, item.id, {
        annotation: document.getElementById("timeline-annotation").value
      });
      render();
    } else if (event.target.closest("#timeline-open-source")) {
      DevToolsNavigation.navigate(item.navigation);
    }
  });
  dom.exportButton.addEventListener("click", downloadRecording);
  dom.importButton.addEventListener("click", () => dom.importFile.click());
  dom.importFile.addEventListener("change", async () => {
    const file = dom.importFile.files[0];
    if (!file) return;
    try {
      const session = store.importRecording(await file.text());
      viewingSessionId = session.id;
      cursorTick = session.lastWorldTick;
      selectedEventId = null;
      dom.follow.checked = false;
      render();
    } catch (error) {
      dom.warning.hidden = false;
      dom.warning.textContent = "Import failed: " + String(error);
    }
    dom.importFile.value = "";
  });

  function eventClick(event) {
    const bookmark = event.target.closest("[data-timeline-bookmark]");
    if (bookmark) {
      event.stopPropagation();
      const session = viewingSessionId &&
        store.stats(viewingSessionId);
      const item = session &&
        store.getEvent(session.id, bookmark.dataset.timelineBookmark);
      if (item) {
        store.updateEvent(session.id, item.id, {
          bookmarked: !item.bookmarked
        });
        render();
      }
      return;
    }
    const target = event.target.closest("[data-timeline-event]");
    if (target) selectEvent(target.dataset.timelineEvent);
  }
  dom.lanes.addEventListener("click", eventClick);
  dom.eventList.addEventListener("click", eventClick);
  dom.eventList.addEventListener("keydown", event => {
    if ((event.key === "Enter" || event.key === " ") &&
        event.target.matches("[data-timeline-event]")) {
      event.preventDefault();
      selectEvent(event.target.dataset.timelineEvent);
    }
  });

  DevToolsEvents.on("log:record", record => {
    if (store.ingestLog(record)) render();
  });
  DevToolsEvents.on("tab:activated", tab => {
    if (tab !== "timeline") return;
    tabActive = true;
    restartPolling(true);
    render();
  });
  DevToolsEvents.on("tab:deactivated", tab => {
    if (tab !== "timeline") return;
    tabActive = false;
    if (!dom.background.checked) {
      recordBoundary("workspace_inactive", "Timeline workspace left");
    }
    restartPolling(false);
    render();
  });

  ObservatoryState.subscribe(
    state => {
      const world = state.world.identity;
      const creature = state.selection.creature;
      return (world ? world.key : "") + "/" +
        (creature ? creature.moniker || creature.id : "");
    },
    value => {
      if (lastContextKey && value !== lastContextKey) {
        recordBoundary("subject_or_world_switch",
          "Creature or world selection changed");
      }
      lastContextKey = value || null;
      requestSerial += 1;
      restartPolling(true);
      render();
    }
  );
  ObservatoryState.subscribe(
    state => state.connection.status,
    status => {
      if (lastConnection && status !== lastConnection) {
        recordBoundary(status === "connected"
          ? "connection_resumed" : "connection_lost",
        status === "connected"
          ? "Engine connection resumed" : "Engine disconnected");
      }
      lastConnection = status;
      render();
    }
  );
  ObservatoryState.subscribe(
    state => state.engine.paused,
    paused => {
      if (lastPaused != null && paused !== lastPaused) {
        recordBoundary(paused
          ? "simulation_paused" : "simulation_resumed",
        paused ? "Simulation paused" : "Simulation resumed");
      }
      lastPaused = paused;
      render();
    }
  );
  ObservatoryState.subscribe(
    state => state.world.speed,
    () => render()
  );
  ObservatoryState.subscribe(
    state => state.interventions,
    interventions => {
      ingestAvailableInterventions(interventions);
      render();
    }
  );

  lastContextKey = contextKey();
  lastConnection = ObservatoryState.getState().connection.status;
  lastPaused = ObservatoryState.getState().engine.paused;
  ingestAvailableInterventions();
  render();
  restartPolling(false);
  if (window.DevToolsNavigation) {
    DevToolsNavigation.registerWorkspace("timeline", {
      capture() {
        return {
          sessionId: viewingSessionId,
          cursorTick,
          selectedEventId,
          follow: dom.follow.checked,
          zoom: dom.zoom.value,
          categories: Array.from(dom.filters.querySelectorAll(
            "[data-timeline-category]")).map(input => ({
              category: input.dataset.timelineCategory,
              checked: input.checked
            })),
          scrollTop: dom.panel.scrollTop
        };
      },
      restore(saved) {
        if (!saved) return;
        if (saved.sessionId && store.stats(saved.sessionId))
          viewingSessionId = saved.sessionId;
        cursorTick = saved.cursorTick == null
          ? cursorTick : Number(saved.cursorTick);
        selectedEventId = saved.selectedEventId || null;
        dom.follow.checked = Boolean(saved.follow);
        if (saved.zoom != null) dom.zoom.value = saved.zoom;
        (saved.categories || []).forEach(item => {
          const input = dom.filters.querySelector(
            `[data-timeline-category="${item.category}"]`);
          if (input) input.checked = Boolean(item.checked);
        });
        render();
        requestAnimationFrame(() => {
          dom.panel.scrollTop = Number(saved.scrollTop) || 0;
        });
      },
      open(route) {
        const selected = route.selections &&
          route.selections.timelineEvent;
        const tick = route.time && route.time.cursorTick != null
          ? route.time.cursorTick
          : selected && selected.details &&
            selected.details.tick != null
            ? selected.details.tick : null;
        if (tick != null) {
          cursorTick = Number(tick);
          dom.follow.checked = false;
        }
        if (selected) selectedEventId = String(selected.id);
        render();
      }
    });
  }
  window.EthologyTimelineWorkspace = Object.freeze({
    store,
    poll,
    render,
    exportCurrent: downloadRecording,
    openSession(sessionId, tick, eventId) {
      const session = store.stats(sessionId);
      if (!session) return false;
      viewingSessionId = session.id;
      cursorTick = tick == null
        ? session.lastWorldTick : Number(tick);
      selectedEventId = eventId || null;
      dom.follow.checked = false;
      store.selectSession(session.id);
      render();
      return true;
    }
  });
})();
