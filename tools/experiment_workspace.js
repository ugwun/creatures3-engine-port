// experiment_workspace.js — reproducible before/after experiment workflow
"use strict";

(() => {
  const Model = window.ExperimentModel;
  if (!Model) return;

  const DRAFT_KEY = "creatures3.observatory.experiment.draft.v1";
  const dom = {
    title: document.getElementById("experiment-title"),
    question: document.getElementById("experiment-question"),
    hypothesis: document.getElementById("experiment-hypothesis"),
    baselineTicks: document.getElementById("experiment-baseline-ticks"),
    controlSubjects: document.getElementById("experiment-control-subjects"),
    treatmentSubjects: document.getElementById(
      "experiment-treatment-subjects"),
    addControl: document.getElementById("experiment-add-control"),
    addTreatment: document.getElementById("experiment-add-treatment"),
    interval: document.getElementById("experiment-interval"),
    intervention: document.getElementById("experiment-intervention"),
    durationTicks: document.getElementById("experiment-duration-ticks"),
    stopping: document.getElementById("experiment-stopping"),
    differences: document.getElementById("experiment-differences"),
    disposable: document.getElementById("experiment-disposable"),
    create: document.getElementById("experiment-create"),
    newButton: document.getElementById("experiment-new"),
    importButton: document.getElementById("experiment-import"),
    importFile: document.getElementById("experiment-import-file"),
    exportButton: document.getElementById("experiment-export"),
    start: document.getElementById("experiment-start"),
    treatment: document.getElementById("experiment-treatment"),
    stop: document.getElementById("experiment-stop"),
    warning: document.getElementById("experiment-warning"),
    heading: document.getElementById("experiment-heading-title"),
    phase: document.getElementById("experiment-phase"),
    world: document.getElementById("experiment-world"),
    startTick: document.getElementById("experiment-start-tick"),
    sampleCount: document.getElementById("experiment-sample-count"),
    gapCount: document.getElementById("experiment-gap-count"),
    controlCount: document.getElementById("experiment-control-count"),
    treatmentCount: document.getElementById("experiment-treatment-count"),
    controlSeries: document.getElementById("experiment-control-series"),
    treatmentSeries: document.getElementById("experiment-treatment-series"),
    recordingState: document.getElementById("experiment-recording-state"),
    observations: document.getElementById("experiment-observation-list"),
    branchSource: document.getElementById("experiment-branch-source"),
    branchName: document.getElementById("experiment-branch-name"),
    branchPreview: document.getElementById("experiment-branch-preview"),
    branchResult: document.getElementById("experiment-branch-result"),
    note: document.getElementById("experiment-note"),
    addNote: document.getElementById("experiment-add-note"),
    addBookmark: document.getElementById("experiment-add-bookmark"),
    annotations: document.getElementById("experiment-annotations"),
    ledger: document.getElementById("experiment-ledger"),
    provenance: document.getElementById("experiment-provenance"),
    personalDialog: document.getElementById("experiment-personal-warning"),
    personalContinue: document.getElementById(
      "experiment-personal-continue"),
    branchDialog: document.getElementById("experiment-branch-dialog"),
    branchConfirmSource: document.getElementById(
      "experiment-branch-confirm-source"),
    branchConfirmName: document.getElementById(
      "experiment-branch-confirm-name"),
    branchConfirm: document.getElementById("experiment-branch-confirm"),
    branchCreate: document.getElementById("experiment-branch-create")
  };

  let manifest = null;
  let recording = false;
  let timer = null;
  let pollInFlight = false;
  let requestSerial = 0;
  let treatmentStartTick = null;
  let tabActive = false;
  let latestBranchName = null;
  let branchReview = null;
  let lastConnection = ObservatoryState.getState().connection.status;
  let lastWorldKey = ObservatoryState.getState().world.identity &&
    ObservatoryState.getState().world.identity.key;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function state() {
    return ObservatoryState.getState();
  }

  function world() {
    return state().world.identity;
  }

  function timing(reason) {
    const current = state();
    return {
      worldTick: current.world.tick,
      systemTick: current.world.systemTick,
      wallTime: new Date().toISOString(),
      timeUnavailableReason: current.world.tick == null
        ? reason || "No active world tick was available" : null
    };
  }

  function parseSubjects(value) {
    return Array.from(new Set(String(value || "").split(",")
      .map(item => item.trim()).filter(Boolean)));
  }

  function selectedMeasurements() {
    return Array.from(document.querySelectorAll(
      "[data-experiment-measurement]:checked"
    )).map(input => input.dataset.experimentMeasurement);
  }

  function protocolDefinition() {
    return {
      title: dom.title.value,
      question: dom.question.value,
      hypothesis: dom.hypothesis.value,
      explicitlyDisposableOrBranched: dom.disposable.checked,
      worldName: world() && world().name,
      worldType: world() && world().type,
      protocol: {
        baselineDurationTicks: dom.baselineTicks.value,
        arms: {
          control: { subjects: parseSubjects(dom.controlSubjects.value) },
          treatment: {
            subjects: parseSubjects(dom.treatmentSubjects.value)
          }
        },
        measurements: selectedMeasurements(),
        samplingIntervalMs: dom.interval.value,
        plannedInterventions: dom.intervention.value.trim()
          ? [{
              id: "planned-1",
              label: "Planned intervention",
              operation: dom.intervention.value
            }]
          : [],
        observationDurationTicks: dom.durationTicks.value,
        stoppingCondition: dom.stopping.value,
        unavoidableDifferences: dom.differences.value,
        desiredExports: ["json"]
      }
    };
  }

  function persist() {
    if (!manifest) {
      localStorage.removeItem(DRAFT_KEY);
      return;
    }
    try {
      const value = JSON.stringify(manifest);
      if (value.length > 900000) {
        dom.warning.textContent =
          "The browser draft exceeds the local metadata limit. Export now.";
        return;
      }
      localStorage.setItem(DRAFT_KEY, value);
    } catch (_) {
      dom.warning.textContent =
        "Browser draft storage failed. Export the manifest now.";
    }
  }

  function updateSharedState() {
    ObservatoryState.dispatch({
      type: "experiment/set",
      payload: manifest ? {
        id: manifest.id,
        name: manifest.metadata.title,
        status: manifest.status,
        startedAt: manifest.metadata.startedAt
      } : {
        id: null, name: null, status: "idle", startedAt: null
      }
    });
    ObservatoryState.dispatch({
      type: "recording/set",
      payload: {
        active: recording,
        startedAt: manifest && manifest.metadata.startedAt,
        sampleIntervalMs: manifest &&
          manifest.protocol.samplingIntervalMs
      }
    });
  }

  function apply(next, options) {
    manifest = next;
    if (!options || options.persist !== false) persist();
    updateSharedState();
    render();
  }

  function formatTick(value) {
    return value == null ? "time unavailable" :
      Number(value).toLocaleString();
  }

  function formatValue(point) {
    if (!point) return "No sample";
    if (point.valueLabel) return point.valueLabel;
    if (point.value == null) return "Unavailable";
    if (typeof point.value === "number")
      return Number(point.value).toFixed(3);
    return String(point.value);
  }

  function renderArm(armId, container, countNode) {
    const points = manifest
      ? manifest.observations.filter(point => point.arm === armId) : [];
    countNode.textContent = points.length +
      (points.length === 1 ? " point" : " points");
    if (!points.length) {
      container.className = "experiment-series-empty";
      container.textContent = "No " + armId + " observations.";
      return;
    }
    const latest = new Map();
    points.forEach(point => latest.set(point.signalId, point));
    container.className = "experiment-series";
    DomPatch.update(container, Array.from(latest.values()).map(point =>
      `<div><span>${escapeHtml(point.signalLabel)}</span>` +
      `<strong>${escapeHtml(formatValue(point))}</strong>` +
      `<small>Tick ${escapeHtml(formatTick(point.worldTick))} · ` +
      `${escapeHtml(point.evidence.level)}</small></div>`
    ).join(""));
  }

  function renderObservations() {
    if (!manifest) {
      dom.observations.textContent = "Create a protocol to begin.";
      return;
    }
    const rows = manifest.observations.slice(-16).reverse().map(point =>
      `<div class="experiment-observation-row" data-arm="${point.arm}">` +
      `<span>${escapeHtml(point.arm)}</span>` +
      `<strong>#${escapeHtml(point.subject && point.subject.id)} · ` +
      `${escapeHtml(point.signalLabel)}</strong>` +
      `<span>${escapeHtml(formatValue(point))}</span>` +
      `<small>Tick ${escapeHtml(formatTick(point.worldTick))}</small></div>`
    );
    manifest.gaps.slice(-4).reverse().forEach(gap => {
      rows.unshift(
        `<div class="experiment-gap-row"><span>GAP</span>` +
        `<strong>${escapeHtml(gap.reason)}</strong>` +
        `<small>${escapeHtml(formatTick(gap.startTick))} → ` +
        `${escapeHtml(formatTick(gap.endTick))} · no interpolation</small></div>`
      );
    });
    DomPatch.update(dom.observations, rows.join("") ||
      "Recording has not produced a point yet.");
  }

  function renderLedger() {
    if (!manifest || !manifest.ledger.length) {
      dom.ledger.textContent = "No recorded interventions.";
      return;
    }
    DomPatch.update(dom.ledger, manifest.ledger.slice(-50).reverse().map(entry =>
      `<article class="experiment-ledger-entry" data-patch-key="${escapeHtml(entry.id)}">` +
      `<header><span>${escapeHtml(entry.type)}</span>` +
      `<small>Tick ${escapeHtml(formatTick(entry.requestedTick))}</small></header>` +
      `<strong>${escapeHtml(entry.userAction)}</strong>` +
      `<code>${escapeHtml(entry.requestedOperation)}</code>` +
      `<details><summary>Request and observed result</summary>` +
      `<pre>${escapeHtml(JSON.stringify({
        parameters: entry.parameters,
        outcome: entry.outcome,
        observedResult: entry.observedResult
      }, null, 2))}</pre></details>` +
      `<footer data-verification="${escapeHtml(entry.verification.state)}">` +
      `${escapeHtml(entry.verification.state)} · ` +
      `${escapeHtml(entry.verification.method)}</footer></article>`
    ).join(""));
  }

  function renderAnnotations() {
    if (!manifest || !manifest.annotations.length) {
      dom.annotations.textContent = "No annotations.";
      return;
    }
    DomPatch.update(dom.annotations, manifest.annotations.slice(-12).reverse()
      .map(item =>
        `<div class="experiment-annotation"><span>${escapeHtml(item.type)}</span>` +
        `<strong>${escapeHtml(item.text)}</strong>` +
        `<small>Tick ${escapeHtml(formatTick(item.worldTick))}</small></div>`
      ).join(""));
  }

  function renderProvenance() {
    if (!manifest) {
      dom.provenance.textContent = "No manifest.";
      return;
    }
    const engine = manifest.metadata.engine;
    const launch = engine.launch || {};
    DomPatch.update(dom.provenance, `<span>Schema ${manifest.schemaVersion} · ${escapeHtml(manifest.kind)}</span>` +
      `<span>Engine ${escapeHtml(engine.buildIdentifier)}</span>` +
      `<span>Game build ${escapeHtml(engine.gameBuildIdentifier || "unknown")}</span>` +
      `<span>Launch ${escapeHtml((launch.options || []).join(" ") || "unavailable")}</span>` +
      `<span>Local paths omitted: ${launch.pathValuesOmitted ? "yes" : "not declared"}</span>` +
      `<span>World references only; no saves, genomes, creatures, or assets embedded.</span>`);
  }

  function render() {
    const currentWorld = world();
    const summary = manifest ? Model.summaries(manifest) : null;
    dom.heading.textContent = manifest
      ? manifest.metadata.title : "No experiment open";
    dom.phase.textContent = manifest ? manifest.status.toUpperCase() : "IDLE";
    dom.world.textContent = manifest
      ? manifest.metadata.sourceWorld.name || "Unavailable" : "—";
    dom.startTick.textContent = manifest
      ? formatTick(manifest.metadata.initial.worldTick) : "—";
    dom.sampleCount.textContent = summary ? summary.observationCount : "0";
    dom.gapCount.textContent = summary ? summary.gapCount : "0";
    dom.recordingState.textContent = recording
      ? "Recording " + manifest.status + " · every " +
        manifest.protocol.samplingIntervalMs / 1000 + " s"
      : "Not recording";
    dom.recordingState.dataset.active = recording ? "true" : "false";
    renderArm("control", dom.controlSeries, dom.controlCount);
    renderArm("treatment", dom.treatmentSeries, dom.treatmentCount);
    renderObservations();
    renderLedger();
    renderAnnotations();
    renderProvenance();

    dom.exportButton.disabled = !manifest;
    dom.create.disabled = recording;
    dom.importButton.disabled = recording;
    dom.start.disabled = !manifest || recording ||
      manifest.status !== "draft";
    dom.treatment.disabled = !recording ||
      !manifest || manifest.status !== "baseline";
    dom.stop.disabled = !recording;
    dom.branchPreview.disabled = !manifest || !currentWorld ||
      currentWorld.name === "Startup" || recording;
    dom.branchSource.textContent = currentWorld &&
      currentWorld.name !== "Startup"
      ? "Active source: " + currentWorld.name +
        ". Branching saves it before copying."
      : "Load a non-Startup world before branching.";
  }

  async function createDraft() {
    if (recording) {
      dom.warning.textContent =
        "Stop or cancel the active recording before replacing its draft.";
      return;
    }
    dom.create.disabled = true;
    dom.warning.textContent = "Reading engine and launch provenance…";
    try {
      const response = await fetch("/api/experiment/context");
      if (!response.ok) throw new Error("HTTP " + response.status);
      const context = await response.json();
      const activeWorld = world();
      context.worldType = activeWorld && activeWorld.type;
      apply(Model.createManifest(protocolDefinition(), context));
      dom.warning.textContent =
        "Browser draft created. Export it for a durable record.";
    } catch (error) {
      dom.warning.textContent =
        "Could not create experiment draft: " + error.message;
    } finally {
      dom.create.disabled = false;
    }
  }

  function armSubjects() {
    const result = [];
    (manifest && manifest.protocol.arms || []).forEach(arm => {
      arm.subjects.forEach(subject =>
        result.push({ arm: arm.id, subject }));
    });
    return result;
  }

  function validateRun() {
    const activeWorld = world();
    if (!activeWorld || activeWorld.name === "Startup")
      return "Load a non-Startup world before recording.";
    if (manifest.metadata.sourceWorld.name !== activeWorld.name)
      return "The active world differs from the manifest source. Create or load the intended branch first.";
    const subjects = armSubjects();
    const controls = subjects.filter(item => item.arm === "control");
    const treatments = subjects.filter(item => item.arm === "treatment");
    if (!controls.length || !treatments.length)
      return "Record at least one control and one treatment subject.";
    const overlap = controls.some(control =>
      treatments.some(treatment =>
        String(treatment.subject.id) === String(control.subject.id)));
    if (overlap)
      return "The same creature cannot be both control and treatment.";
    if (!manifest.protocol.measurements.length)
      return "Select at least one measurement.";
    return null;
  }

  function startRecording() {
    const error = validateRun();
    if (error) {
      dom.warning.textContent = error;
      return;
    }
    if (!manifest.metadata.sourceWorld.explicitlyDisposableOrBranched) {
      dom.personalDialog.showModal();
      return;
    }
    beginBaseline();
  }

  function beginBaseline() {
    const current = state();
    const next = JSON.parse(JSON.stringify(manifest));
    next.metadata.initial = {
      worldTick: current.world.tick,
      systemTick: current.world.systemTick,
      gameSpeed: current.world.speed,
      enginePaused: current.engine.paused,
      capturedAtWallTimeMs: Date.now()
    };
    recording = true;
    treatmentStartTick = null;
    apply(Model.setPhase(next, "baseline", timing()));
    restartTimer(true);
    dom.warning.textContent =
      "Baseline recording started. Tool mutations will enter the ledger.";
  }

  function beginTreatment() {
    treatmentStartTick = state().world.tick;
    apply(Model.setPhase(manifest, "treatment", timing()));
    dom.warning.textContent =
      "Treatment window started. Apply only the planned intervention.";
    sampleNow();
  }

  function stopRecording(status) {
    if (!manifest) return;
    recording = false;
    if (timer) clearInterval(timer);
    timer = null;
    requestSerial++;
    pollInFlight = false;
    const next = status === "cancelled"
      ? Model.setPhase(manifest, "cancelled", timing())
      : Model.setPhase(manifest, "stopped", timing());
    apply(next);
    dom.warning.textContent = status === "cancelled"
      ? "Experiment cancelled. The manifest retains samples and gaps."
      : "Recording stopped. Export the manifest for a durable record.";
  }

  function signalPoints(observation, arm, subject) {
    const points = [];
    manifest.protocol.measurements.forEach(measurement => {
      let value = null;
      let valueLabel = "Unavailable";
      let level = "unknown";
      if (measurement.id === "highest_drive") {
        const pressure = observation.pressure || {};
        value = pressure.highestDriveValue;
        valueLabel = pressure.highestDriveLabel
          ? pressure.highestDriveLabel + " · " +
            (value == null ? "unavailable" : Number(value).toFixed(3))
          : "Highest drive unavailable";
        level = value == null ? "unknown" : "observed";
      } else if (measurement.id === "decision") {
        const selection = observation.selection || {};
        value = selection.winnerId;
        valueLabel = selection.winnerLabel ||
          (value == null ? "Decision unavailable" : "Decision " + value);
        level = value == null ? "unknown" : "observed";
      } else if (measurement.id === "room") {
        value = observation.environment &&
          observation.environment.roomId;
        valueLabel = value == null ? "Room unavailable" : "Room " + value;
        level = value == null ? "unknown" : "observed";
      }
      points.push({
        phase: manifest.status,
        arm,
        subject: { kind: subject.kind, id: subject.id },
        signalId: measurement.id,
        signalLabel: measurement.label,
        value,
        valueLabel,
        worldTick: observation.worldTick,
        systemTick: observation.systemTick,
        wallTime: new Date(
          observation.capturedAtWallTimeMs || Date.now()).toISOString(),
        timeUnavailableReason: observation.worldTick == null
          ? "Creature observation had no world tick" : null,
        evidenceLevel: level,
        source: measurement.source,
        sampleIntervalMs: manifest.protocol.samplingIntervalMs
      });
    });
    return points;
  }

  async function sampleNow() {
    if (!recording || pollInFlight || !manifest) return;
    if (state().connection.status !== "connected") {
      apply(Model.openGap(
        manifest, "Engine connection unavailable", timing()), {
          persist: true
        });
      return;
    }
    pollInFlight = true;
    const serial = ++requestSerial;
    try {
      const subjects = armSubjects();
      const results = await Promise.all(subjects.map(async item => {
        try {
          const response = await fetch(
            "/api/creature/" + encodeURIComponent(item.subject.id) +
            "/observation"
          );
          if (!response.ok) throw new Error("HTTP " + response.status);
          return { item, observation: await response.json() };
        } catch (error) {
          return { item, error };
        }
      }));
      if (!recording || serial !== requestSerial) return;
      let next = manifest;
      let failures = 0;
      results.forEach(result => {
        if (result.error) {
          failures++;
          next = Model.addObservation(next, {
            phase: next.status,
            arm: result.item.arm,
            subject: result.item.subject,
            signalId: "availability",
            signalLabel: "Subject availability",
            value: null,
            valueLabel: "Observation request failed",
            worldTick: null,
            timeUnavailableReason: result.error.message,
            wallTime: new Date().toISOString(),
            evidenceLevel: "unknown",
            source: "GET /api/creature/:id/observation",
            sampleIntervalMs: next.protocol.samplingIntervalMs
          });
          return;
        }
        signalPoints(
          result.observation,
          result.item.arm,
          result.item.subject
        ).forEach(point => {
          next = Model.addObservation(next, point);
        });
      });
      if (!failures) next = Model.closeGap(next, timing());
      apply(next);
      if (manifest.status === "treatment" &&
          treatmentStartTick != null &&
          manifest.protocol.observationDurationTicks > 0 &&
          state().world.tick >= treatmentStartTick +
            manifest.protocol.observationDurationTicks) {
        stopRecording("stopped");
      }
    } finally {
      pollInFlight = false;
    }
  }

  function restartTimer(immediate) {
    if (timer) clearInterval(timer);
    timer = null;
    if (!recording || !manifest) return;
    if (immediate) sampleNow();
    timer = setInterval(
      sampleNow, manifest.protocol.samplingIntervalMs);
  }

  function addSelected(input) {
    const selected = state().selection.creature;
    if (!selected) {
      dom.warning.textContent =
        "Select a creature before adding it to a protocol arm.";
      return;
    }
    const values = parseSubjects(input.value);
    if (!values.includes(String(selected.id)))
      values.push(String(selected.id));
    input.value = values.join(", ");
  }

  function addAnnotation(type) {
    if (!manifest) return;
    const value = dom.note.value.trim();
    if (!value) {
      dom.warning.textContent = "Write a note before saving it.";
      return;
    }
    apply(Model.addAnnotation(manifest, Object.assign(timing(), {
      type,
      text: value
    })));
    dom.note.value = "";
  }

  async function previewBranch() {
    const activeWorld = world();
    const name = dom.branchName.value.trim();
    if (!manifest || !activeWorld || activeWorld.name === "Startup") return;
    if (!name) {
      dom.branchResult.textContent = "Enter a new branch name.";
      return;
    }
    dom.branchResult.textContent = "Checking world names…";
    try {
      const response = await fetch("/api/worlds");
      if (!response.ok) throw new Error("HTTP " + response.status);
      const payload = await response.json();
      if ((payload.worlds || []).includes(name)) {
        dom.branchResult.textContent =
          "Name collision: that world already exists. Nothing was changed.";
        return;
      }
      latestBranchName = name;
      branchReview = {
        sourceName: activeWorld.name,
        sessionId: activeWorld.sessionId
      };
      dom.branchConfirmSource.textContent = activeWorld.name;
      dom.branchConfirmName.textContent = name;
      dom.branchConfirm.checked = false;
      dom.branchCreate.disabled = true;
      dom.branchDialog.showModal();
      dom.branchResult.textContent = "";
    } catch (error) {
      dom.branchResult.textContent =
        "Could not check branch name: " + error.message;
    }
  }

  async function createBranch() {
    if (!branchReview || !latestBranchName ||
        !dom.branchConfirm.checked) return;
    dom.branchCreate.disabled = true;
    dom.branchCreate.textContent = "Saving and copying…";
    try {
      const response = await fetch("/api/world/branch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: latestBranchName,
          // What the dialog showed, not whatever is active now: the engine
          // must refuse if the two differ.
          confirmedSourceWorld: branchReview.sourceName,
          reviewedWorldSessionId: branchReview.sessionId
        })
      });
      const result = await response.json();
      if (!result.ok) throw new Error(
        (result.stage ? result.stage + ": " : "") +
        (result.error || "Branch failed"));
      apply(Model.addBranch(manifest, {
        sourceWorld: result.sourceWorld,
        branchWorld: result.branchWorld,
        createdAt: new Date().toISOString(),
        worldTick: result.worldTick,
        status: "created_not_loaded"
      }));
      dom.branchDialog.close();
      dom.branchResult.replaceChildren();
      const message = document.createElement("span");
      message.textContent = result.branchWorld +
        " created and not loaded. ";
      const load = document.createElement("button");
      load.type = "button";
      load.className = "btn-light";
      load.textContent = "Load branch";
      load.addEventListener("click", () => loadBranch(result.branchWorld));
      dom.branchResult.append(message, load);
    } catch (error) {
      dom.branchResult.textContent = "Branch failed: " + error.message +
        ". No existing world was overwritten.";
    } finally {
      dom.branchCreate.textContent = "Create branch";
      dom.branchCreate.disabled = !dom.branchConfirm.checked;
    }
  }

  async function loadBranch(name) {
    dom.branchResult.textContent = "Requesting branch load…";
    try {
      const response = await fetch("/api/world/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      const result = await response.json();
      if (!result.ok) throw new Error(result.error || "Load failed");
      dom.branchResult.textContent =
        "Load requested. Wait for the session ribbon to confirm " + name + ".";
    } catch (error) {
      dom.branchResult.textContent =
        "Branch load failed: " + error.message;
    }
  }

  function verifyMutation(entry) {
    if (!manifest) return manifest;
    if (entry.type === "world_branch" &&
        entry.observedResult && entry.observedResult.ok &&
        entry.observedResult.copied) {
      return Model.verifyLedgerEntry(manifest, entry.id, {
        state: "verified",
        method: "Branch endpoint verified the copied world archive",
        worldTick: entry.observedResult.worldTick,
        wallTime: entry.completedAt
      });
    }
    if ((entry.type === "simulation_pause" ||
        entry.type === "simulation_resume") &&
        entry.observedResult &&
        typeof entry.observedResult.paused === "boolean") {
      return Model.verifyLedgerEntry(manifest, entry.id, {
        state: "verified",
        method: "Engine pause endpoint returned the resulting state",
        worldTick: state().world.tick,
        wallTime: entry.completedAt
      });
    }
    if (entry.type === "simulation_speed" &&
        entry.observedResult &&
        entry.observedResult.multiplier != null) {
      return Model.verifyLedgerEntry(manifest, entry.id, {
        state: "verified",
        method: "Engine tick-rate endpoint returned the applied multiplier",
        worldTick: state().world.tick,
        wallTime: entry.completedAt
      });
    }
    if (entry.type === "chemical_intervention" &&
        entry.observedResult && entry.observedResult.ok &&
        entry.observedResult.beforeValue != null &&
        entry.observedResult.afterValue != null &&
        entry.observedResult.worldTick != null) {
      return Model.verifyLedgerEntry(manifest, entry.id, {
        state: "verified",
        method: "Engine returned the observed before and after concentrations",
        worldTick: entry.observedResult.worldTick,
        wallTime: entry.completedAt
      });
    }
    if (entry.type === "genome_copy" &&
        entry.observedResult && entry.observedResult.ok &&
        entry.observedResult.sourceChecksum &&
        entry.observedResult.derivedChecksum) {
      return Model.verifyLedgerEntry(manifest, entry.id, {
        state: "verified",
        method: "Engine copied the source and returned both file checksums",
        worldTick: entry.observedResult.worldTick,
        wallTime: entry.completedAt
      });
    }
    if (entry.type === "genome_save" &&
        entry.observedResult && entry.observedResult.ok &&
        entry.observedResult.checksum) {
      return Model.verifyLedgerEntry(manifest, entry.id, {
        state: "verified",
        method: "Engine returned the saved experimental genome checksum",
        worldTick: entry.observedResult.worldTick,
        wallTime: entry.completedAt
      });
    }
    if (entry.type === "genome_injection" &&
        entry.observedResult && entry.observedResult.ok &&
        entry.observedResult.result &&
        entry.observedResult.result.agentId != null &&
        entry.observedResult.worldTick != null) {
      return Model.verifyLedgerEntry(manifest, entry.id, {
        state: "verified",
        method: "Engine returned the created agent and operation tick",
        worldTick: entry.observedResult.worldTick,
        wallTime: entry.completedAt
      });
    }
    if (entry.type === "caos_evaluation" &&
        entry.observedResult && entry.observedResult.ok &&
        entry.observedResult.sourceChecksum &&
        entry.observedResult.correlationId) {
      return Model.verifyLedgerEntry(manifest, entry.id, {
        state: "verified",
        method: "Engine evaluated the reviewed checksum and returned execution context",
        worldTick: entry.observedResult.worldTickEnd,
        wallTime: entry.completedAt
      });
    }
    if (["script_install", "script_replace", "script_remove"]
        .includes(entry.type) &&
        entry.observedResult && entry.observedResult.ok &&
        entry.observedResult.sourceChecksum &&
        entry.observedResult.correlationId) {
      return Model.verifyLedgerEntry(manifest, entry.id, {
        state: "verified",
        method: "Engine applied the reviewed script operation and returned its checksum",
        worldTick: entry.observedResult.worldTick,
        wallTime: entry.completedAt
      });
    }
    return manifest;
  }

  function recordMutation(record) {
    if (!manifest || manifest.status === "imported" ||
        !record.experimentId ||
        record.experimentId !== manifest.id) return;
    let next = Model.addLedgerEntry(manifest, record);
    manifest = next;
    next = verifyMutation(next.ledger.find(item => item.id === record.id));
    apply(next);
  }

  function exportManifest() {
    if (!manifest) return;
    const exported = Model.portableManifest(
      manifest, new Date().toISOString());
    const value = JSON.stringify(exported, null, 2);
    apply(exported);
    const url = URL.createObjectURL(
      new Blob([value], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = manifest.metadata.title
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-|-$/g, "").toLowerCase() +
      "-experiment.json";
    link.click();
    URL.revokeObjectURL(url);
    dom.warning.textContent =
      "Portable manifest exported without worlds, saves, genomes, creatures, or assets.";
  }

  function resetWorkspace() {
    if (recording && !window.confirm(
      "Cancel and discard the active browser draft? Export first if you need to keep it.")) {
      return;
    }
    if (recording) stopRecording("cancelled");
    manifest = null;
    latestBranchName = null;
    treatmentStartTick = null;
    dom.question.value = "";
    dom.hypothesis.value = "";
    dom.controlSubjects.value = "";
    dom.treatmentSubjects.value = "";
    dom.intervention.value = "";
    dom.differences.value = "";
    dom.disposable.checked = false;
    dom.branchResult.textContent = "";
    persist();
    updateSharedState();
    render();
  }

  dom.create.addEventListener("click", createDraft);
  dom.newButton.addEventListener("click", resetWorkspace);
  dom.start.addEventListener("click", startRecording);
  dom.treatment.addEventListener("click", beginTreatment);
  dom.stop.addEventListener("click", () => stopRecording("stopped"));
  dom.addControl.addEventListener("click", () =>
    addSelected(dom.controlSubjects));
  dom.addTreatment.addEventListener("click", () =>
    addSelected(dom.treatmentSubjects));
  dom.addNote.addEventListener("click", () => addAnnotation("note"));
  dom.addBookmark.addEventListener("click", () =>
    addAnnotation("bookmark"));
  dom.branchPreview.addEventListener("click", previewBranch);
  dom.branchConfirm.addEventListener("change", () => {
    dom.branchCreate.disabled = !dom.branchConfirm.checked;
  });
  dom.branchCreate.addEventListener("click", createBranch);
  dom.personalContinue.addEventListener("click", () => {
    dom.personalDialog.close();
    apply(Model.addAnnotation(manifest, Object.assign(timing(), {
      type: "note",
      text: "User acknowledged that the active world was not marked disposable or branched before recording."
    })));
    beginBaseline();
  });
  document.querySelectorAll("[data-experiment-dialog-cancel]")
    .forEach(button => button.addEventListener("click", () =>
      button.closest("dialog").close()
    ));
  [dom.personalDialog, dom.branchDialog].forEach(dialog =>
    dialog.addEventListener("click", event => {
      if (event.target === dialog) dialog.close();
    })
  );
  dom.exportButton.addEventListener("click", exportManifest);
  dom.importButton.addEventListener("click", () => dom.importFile.click());
  dom.importFile.addEventListener("change", async () => {
    const file = dom.importFile.files[0];
    if (!file) return;
    try {
      recording = false;
      if (timer) clearInterval(timer);
      timer = null;
      apply(Model.importManifest(await file.text()));
      dom.warning.textContent =
        "Manifest reopened for offline review. Imported runs cannot resume recording.";
    } catch (error) {
      dom.warning.textContent = "Manifest import failed: " + error.message;
    }
    dom.importFile.value = "";
  });

  DevToolsEvents.on("provenance:mutation", recordMutation);
  window.DevToolsNavigation.registerWorkspace("experiments", {
    capture() {
      return {
        experimentId: manifest && manifest.id,
        status: manifest && manifest.status
      };
    },
    restore() {
      render();
    },
    open() {
      render();
    }
  });
  DevToolsEvents.on("tab:activated", tab => {
    if (tab !== "experiments") return;
    tabActive = true;
    render();
  });
  DevToolsEvents.on("tab:deactivated", tab => {
    if (tab !== "experiments") return;
    tabActive = false;
  });

  ObservatoryState.subscribe(
    value => value.connection.status,
    status => {
      if (recording && status !== lastConnection) {
        apply(status === "connected"
          ? Model.closeGap(manifest, timing())
          : Model.openGap(
            manifest, "Engine connection lost", timing()));
        if (status === "connected") sampleNow();
      }
      lastConnection = status;
    }
  );
  ObservatoryState.subscribe(
    value => value.world.identity && value.world.identity.key,
    worldKey => {
      const worldName = worldKey && world() && world().name;
      if (recording && lastWorldKey && worldKey !== lastWorldKey) {
        apply(Model.openGap(
          manifest, "Active world changed during recording", timing()));
        stopRecording("cancelled");
      } else if (manifest && manifest.status === "draft" &&
          latestBranchName && worldName === latestBranchName) {
        const next = JSON.parse(JSON.stringify(manifest));
        next.metadata.sourceWorld.name = latestBranchName;
        next.metadata.sourceWorld.type = world() && world().type;
        next.metadata.sourceWorld.explicitlyDisposableOrBranched = true;
        apply(next);
        dom.disposable.checked = true;
        dom.warning.textContent =
          "Branch load confirmed. The draft now records this branch as its source.";
      }
      lastWorldKey = worldKey;
      render();
    }
  );

  window.addEventListener("beforeunload", () => {
    if (!recording || !manifest) return;
    manifest = Model.openGap(
      manifest, "Browser page closed while recording", timing());
    persist();
  });

  try {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
      const restored = Model.validate(JSON.parse(saved));
      if (!restored.valid)
        throw new Error(restored.errors.join("; "));
      manifest = restored.manifest;
      if (["baseline", "treatment"].includes(manifest.status)) {
        manifest = Model.openGap(
          Model.setPhase(manifest, "stopped", timing()),
          "Browser draft reopened after recording ended", timing());
      }
    }
  } catch (_) {
    localStorage.removeItem(DRAFT_KEY);
  }

  updateSharedState();
  render();
  window.ExperimentWorkspace = Object.freeze({
    getManifest: () => manifest &&
      JSON.parse(JSON.stringify(manifest)),
    createDraft,
    sampleNow,
    recordMutation,
    isRecording: () => recording,
    isActive: () => tabActive
  });
})();
