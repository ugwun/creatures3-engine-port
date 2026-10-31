// comparison_workspace.js — individual, self/range, and cohort comparison UI
"use strict";

(() => {
  const Model = window.CreatureComparison;
  if (!Model) return;

  const history = Model.createHistory({ maxSnapshots: 180 });
  const dom = {
    panel: document.getElementById("tab-compare"),
    refresh: document.getElementById("compare-refresh"),
    interval: document.getElementById("compare-interval"),
    auto: document.getElementById("compare-auto"),
    exportReport: document.getElementById("compare-export-report"),
    exportDefinition:
      document.getElementById("compare-export-definition"),
    modes: document.getElementById("compare-modes"),
    addSelected: document.getElementById("compare-add-selected"),
    selectAll: document.getElementById("compare-select-all"),
    clearSubjects: document.getElementById("compare-clear-subjects"),
    subjects: document.getElementById("compare-subject-list"),
    measures: document.getElementById("compare-measures"),
    warning: document.getElementById("compare-warning"),
    modeLabel: document.getElementById("compare-mode-label"),
    title: document.getElementById("compare-title"),
    sampleSummary: document.getElementById("compare-sample-summary"),
    timeControls: document.getElementById("compare-time-controls"),
    timebase: document.getElementById("compare-timebase"),
    aStart: document.getElementById("compare-a-start"),
    aEnd: document.getElementById("compare-a-end"),
    bStart: document.getElementById("compare-b-start"),
    bEnd: document.getElementById("compare-b-end"),
    anchor: document.getElementById("compare-anchor"),
    applyRanges: document.getElementById("compare-apply-ranges"),
    results: document.getElementById("compare-results"),
    name: document.getElementById("compare-definition-name"),
    save: document.getElementById("compare-save-definition"),
    definitions: document.getElementById("compare-definitions"),
    provenance: document.getElementById("compare-provenance"),
    compareGenomes: document.getElementById("compare-genomes"),
    genomeResult: document.getElementById("compare-genome-result")
  };

  const baseMeasures = [
    { id: "glycogen", label: "Glycogen reserve", unit: "concentration" },
    { id: "failed_organs", label: "Failed organs", unit: "count" },
    { id: "functioning_organs", label: "Functioning organs", unit: "count" },
    { id: "age_ticks", label: "Age", unit: "ticks" },
    { id: "drive:0", label: "Pain", unit: "drive level" },
    { id: "drive:2", label: "Hunger carbohydrate", unit: "drive level" },
    { id: "drive:6", label: "Tiredness", unit: "drive level" },
    { id: "drive:7", label: "Sleepiness", unit: "drive level" },
    { id: "drive:11", label: "Boredom", unit: "drive level" }
  ];

  let mode = "individual";
  let selectedKeys = new Set();
  let metricIds = new Set(["glycogen", "drive:2", "drive:6"]);
  let definitions = [];
  let latest = null;
  let timer = null;
  let tabActive = Boolean(document.querySelector(
    '.tab-btn[data-tab="compare"].tab-btn--active'
  ));
  let requestSerial = 0;
  let previousWorldKey = null;
  let defaultSubjectWorldKey = null;
  let genomeDiff = null;
  let previousTimebase = dom.timebase.value;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function format(value, digits = 3) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "Missing";
    if (Math.abs(number) >= 1000) {
      return Math.round(number).toLocaleString();
    }
    return number.toFixed(digits).replace(/\.?0+$/, "");
  }

  function selectedCreature() {
    return ObservatoryState.getState().selection.creature;
  }

  function world() {
    return ObservatoryState.getState().world.identity;
  }

  function pinnedChemicalMeasures() {
    if (!window.BiologicalMonitor) return [];
    return BiologicalMonitor.store.pinnedMetrics()
      .filter(id => String(id).startsWith("chemical:"))
      .slice(0, 16)
      .map(id => {
        const chemicalId = Number(id.split(":")[1]);
        const selected = selectedCreature();
        const currentWorld = world();
        const view = selected && currentWorld &&
          BiologicalMonitor.store.metricView(
            currentWorld.key,
            "creature:" + (selected.moniker ||
              ("agent-" + selected.id)),
            id,
            2
          );
        return {
          id,
          label: view && view.metric.label ||
            "Chemical #" + chemicalId,
          unit: "concentration"
        };
      });
  }

  function measures() {
    const values = baseMeasures.concat(pinnedChemicalMeasures());
    const seen = new Set();
    return values.filter(measure => {
      if (seen.has(measure.id)) return false;
      seen.add(measure.id);
      return true;
    });
  }

  function measureFor(id) {
    return measures().find(measure => measure.id === id) || {
      id,
      label: id,
      unit: "raw"
    };
  }

  function selectedMembers() {
    return latest ? latest.creatures.filter(creature =>
      selectedKeys.has(creature.key)) : [];
  }

  function timelineSessions(key) {
    const workspace = window.EthologyTimelineWorkspace;
    if (!workspace) return [];
    return workspace.store.allSessions().filter(session =>
      session.subjectKey === key &&
      (!latest || session.worldKey === latest.worldKey));
  }

  function timelineSession(key) {
    const sessions = timelineSessions(key);
    return sessions.length ? sessions[sessions.length - 1] : null;
  }

  function timelineEvents(keys) {
    const workspace = window.EthologyTimelineWorkspace;
    if (!workspace) return [];
    const events = [];
    keys.forEach(key => {
      timelineSessions(key).forEach(session => {
        events.push(...workspace.store.query({
          sessionId: session.id
        }));
      });
    });
    return events;
  }

  function requestedChemicals() {
    return measures().filter(measure =>
      metricIds.has(measure.id) &&
      measure.id.startsWith("chemical:")
    ).map(measure => Number(measure.id.split(":")[1]));
  }

  async function poll(force) {
    if (!tabActive || (!dom.auto.checked && !force)) return;
    const activeWorld = world();
    if (!activeWorld) {
      render();
      return;
    }
    const serial = ++requestSerial;
    const chemicals = requestedChemicals();
    const query = chemicals.length
      ? "?chemicals=" + chemicals.join(",") : "";
    try {
      const response = await fetch("/api/creatures/snapshot" + query);
      if (!response.ok) throw new Error("HTTP " + response.status);
      const payload = await response.json();
      if (serial !== requestSerial) return;
      const currentWorld = world();
      if (!currentWorld ||
          currentWorld.key !== activeWorld.key) return;
      payload.worldKey = currentWorld.key;
      const result = history.ingest(payload);
      latest = result.snapshot;
      if (previousWorldKey && previousWorldKey !== latest.worldKey) {
        selectedKeys = new Set();
      }
      previousWorldKey = latest.worldKey;
      // Offer the shared creature once per world. After that the subject list
      // is the user's: an empty selection must stay empty.
      if (defaultSubjectWorldKey !== latest.worldKey) {
        const selected = selectedCreature();
        const key = selected && "creature:" +
          (selected.moniker || ("agent-" + selected.id));
        if (key && !selectedKeys.size &&
            latest.creatures.some(creature => creature.key === key)) {
          selectedKeys.add(key);
          defaultSubjectWorldKey = latest.worldKey;
        } else if (selectedKeys.size) {
          defaultSubjectWorldKey = latest.worldKey;
        }
      }
      render();
    } catch (error) {
      dom.warning.hidden = false;
      dom.warning.textContent =
        "Comparison snapshot unavailable: " + String(error);
    }
  }

  function restartPolling(immediate) {
    if (timer) clearInterval(timer);
    timer = null;
    if (!tabActive || !dom.auto.checked) return;
    if (immediate) poll();
    timer = setInterval(poll, Number(dom.interval.value) || 5000);
  }

  function renderMeasures() {
    const values = measures();
    DomPatch.update(dom.measures, values.map(measure =>
      '<label class="compare-check" data-patch-key="' +
      escapeHtml(measure.id) + '"><input type="checkbox" ' +
      'data-compare-measure="' + escapeHtml(measure.id) + '"' +
      (metricIds.has(measure.id) ? " checked" : "") + " />" +
      '<span><strong>' + escapeHtml(measure.label) + "</strong>" +
      "<small>" + escapeHtml(measure.unit) +
      "</small></span></label>"
    ).join(""));
  }

  function memberMeta(member) {
    const sex = member.sex === 1 ? "male" :
      member.sex === 2 ? "female" : "sex unknown";
    return sex + " · genus " +
      (member.genus == null ? "?" : member.genus) +
      " · age stage " +
      (member.ageStage == null ? "?" : member.ageStage);
  }

  function renderSubjects() {
    if (!latest) {
      DomPatch.update(dom.subjects,
        '<p class="compare-empty">No cohort snapshot yet.</p>');
      return;
    }
    DomPatch.update(dom.subjects, latest.creatures.map(member =>
      '<label data-patch-key="' + escapeHtml(member.key) +
      '" class="compare-subject compare-subject--' +
      escapeHtml(member.status) + '">' +
      '<input type="' + (mode === "self" ? "radio" : "checkbox") +
      '" name="compare-subject" data-compare-subject="' +
      escapeHtml(member.key) + '"' +
      (selectedKeys.has(member.key) ? " checked" : "") + " />" +
      '<span><strong>' + escapeHtml(member.label) + "</strong>" +
      '<small>#' + escapeHtml(member.agentId) + " · " +
      escapeHtml(memberMeta(member)) + "</small></span>" +
      '<em>' + escapeHtml(member.status) + "</em></label>"
    ).join(""));
  }

  function renderWarning() {
    const messages = [];
    if (!latest) messages.push("Waiting for a coherent cohort snapshot.");
    if (!selectedKeys.size) messages.push("Choose at least one subject.");
    if (mode === "individual" && selectedKeys.size < 2) {
      messages.push("Individual mode needs two or more subjects.");
    }
    if (mode === "self" && selectedKeys.size !== 1) {
      messages.push("Self/ranges mode needs exactly one subject.");
    }
    if (latest && latest.gameSpeed > 1) {
      messages.push("Accelerated snapshot cadence is coarser in world ticks; offsets and missing samples remain visible.");
    }
    if (mode === "self" && dom.timebase.value === "relative" &&
        !anchorEvent()) {
      messages.push("Relative alignment needs a retained intervention anchor.");
    }
    dom.warning.hidden = !messages.length;
    dom.warning.textContent = messages.join(" ");
  }

  function identityRows(member) {
    return [
      ["Status", member.status],
      ["Agent", "#" + member.agentId],
      ["Moniker", member.moniker || "Missing"],
      ["Sex", member.sex === 1 ? "Male" :
        member.sex === 2 ? "Female" : "Unknown"],
      ["Genus / species",
        (member.genus == null ? "?" : member.genus) + " / " +
        (member.species == null ? "?" : member.species)],
      ["Age", "stage " + (member.ageStage == null
        ? "?" : member.ageStage) + " · " +
        format(member.ageInTicks, 0) + " ticks"],
      ["Life state", member.lifeState],
      ["Attention", member.currentAttentionId == null
        ? "Missing" : "neuron " + member.currentAttentionId +
          (member.currentTargetAgentId == null ? "" :
            " · target #" + member.currentTargetAgentId) +
          (member.currentTargetCategory ? " · " +
            member.currentTargetCategory : "")],
      ["Decision", member.currentDecisionId == null
        ? "Missing" : "offset " + member.currentDecisionId],
      ["Action", (member.actionState || "Missing") +
        (member.blockingCommand
          ? " · " + member.blockingCommand : "")],
      ["Room", member.roomId == null
        ? "Missing" : member.roomId + (member.metaRoomId == null
          ? "" : " · metaroom " + member.metaRoomId)]
    ];
  }

  function renderIndividual() {
    const members = selectedMembers();
    if (members.length < 2) {
      return '<p class="compare-empty">Select two or more creatures from the same coherent snapshot. No IDs need to be copied.</p>';
    }
    const identityLabels = identityRows(members[0])
      .map(row => row[0]);
    const identity = identityLabels.map((label, index) =>
      '<tr><th>' + escapeHtml(label) + "</th>" +
      members.map(member =>
        '<td>' + escapeHtml(identityRows(member)[index][1]) +
        "</td>").join("") + "</tr>"
    ).join("");
    const measureRows = Array.from(metricIds).map(metricId => {
      const measure = measureFor(metricId);
      const values = members.map(member =>
        Model.metricValue(member, metricId));
      const baseline = values[0];
      return '<tr><th>' + escapeHtml(measure.label) +
        '<small>' + escapeHtml(measure.unit) + "</small></th>" +
        members.map((member, index) => {
          const value = values[index];
          const delta = index === 0 || value == null ||
            baseline == null ? null : value - baseline;
          return '<td class="' + (value == null
            ? "compare-missing" : "") + '"><strong>' +
            escapeHtml(format(value)) + "</strong>" +
            (index === 0 ? '<small>reference only</small>' :
              '<small>Δ ' + escapeHtml(format(delta)) +
              "</small>") + "</td>";
        }).join("") + "</tr>";
    }).join("");
    const snapshots = history.snapshots();
    const events = timelineEvents(members.map(member => member.key));
    const startTick = snapshots.length
      ? snapshots[0].worldTick : latest.worldTick;
    const historyRows = members.map(member => {
      const motion = Model.movement(
        snapshots, member.key, startTick, latest.worldTick);
      const rates = Model.eventRates(
        events, startTick, latest.worldTick, [member.key]);
      return '<tr><th>' + escapeHtml(member.label) + '</th><td>' +
        motion.n + ' samples · ' +
        escapeHtml(format(motion.movementDistance, 1)) +
        ' px</td><td>' +
        (motion.roomsVisited.length
          ? escapeHtml(motion.roomsVisited.join(", ")) : "Missing") +
        '</td><td>' + (rates.length
          ? rates.map(rate => escapeHtml(rate.key) + " " +
              escapeHtml(format(rate.ratePer1000Ticks)) +
              "/1k").join("<br>")
          : "No retained Timeline events") + "</td></tr>";
    }).join("");
    return '<section class="compare-table-card"><header><div>' +
      '<h2>Same-tick difference table</h2><span>Observed bulk snapshot · tick ' +
      latest.worldTick + '</span></div><p>The first column is a display reference, not a ranked target.</p></header>' +
      '<div class="compare-table-scroll"><table><thead><tr><th>Field</th>' +
      members.map(member =>
        '<th>' + escapeHtml(member.label) +
        '<small>' + (member.missingReason
          ? "last observed tick " +
            member.lastObservedWorldTick + " · offset " +
            (member.lastObservedWorldTick - latest.worldTick) +
            " · n=0"
          : "tick offset 0 · n=1") +
        '</small></th>'
      ).join("") + "</tr></thead><tbody>" + identity +
      measureRows + "</tbody></table></div></section>" +
      '<section class="compare-table-card"><header><div><h2>Recorded activity</h2><span>' +
      startTick + "–" + latest.worldTick +
      ' · cohort snapshots and Timeline events</span></div><p>Movement and event rates use retained history, not the single state row above.</p></header>' +
      '<div class="compare-table-scroll"><table><thead><tr><th>Creature</th><th>Movement</th><th>Rooms visited</th><th>Behavior-event rates</th></tr></thead><tbody>' +
      historyRows + "</tbody></table></div></section>";
  }

  function rangeValues() {
    const value = input => Number(input.value);
    const anchor = anchorEvent();
    const offset = dom.timebase.value === "relative" && anchor
      ? anchor.endTick : 0;
    return {
      a: {
        start: value(dom.aStart) + offset,
        end: value(dom.aEnd) + offset
      },
      b: {
        start: value(dom.bStart) + offset,
        end: value(dom.bEnd) + offset
      },
      anchor
    };
  }

  function rangeStat(samples, start, end) {
    return Model.summarize((samples || [])
      .filter(sample => sample.worldTick >= start &&
        sample.worldTick <= end)
      .map(sample => ({
        id: String(sample.worldTick),
        label: "tick " + sample.worldTick,
        value: sample.value
      })));
  }

  function observationHighestDrive(snapshot) {
    const endpoint = snapshot && snapshot.observation &&
      snapshot.observation.rawSources &&
      snapshot.observation.rawSources.endpoint;
    const pressure = endpoint && endpoint.pressure;
    return pressure ? {
      label: pressure.highestDriveLabel ||
        "Drive " + pressure.highestDriveId,
      value: pressure.highestDriveValue
    } : null;
  }

  function renderSelf() {
    const member = selectedMembers()[0];
    if (!member || selectedKeys.size !== 1) {
      return '<p class="compare-empty">Select one creature. Timeline ranges remain world-qualified and never merge another creature with the same numeric ID.</p>';
    }
    const session = timelineSession(member.key);
    if (!session || !window.EthologyTimelineWorkspace) {
      return '<p class="compare-empty">No retained Timeline session exists for this creature. Record it in Timeline first.</p>';
    }
    const values = rangeValues();
    const timelineStore = EthologyTimelineWorkspace.store;
    const snapA = timelineStore.nearestSnapshot(
      session.id, values.a.end);
    const snapB = timelineStore.nearestSnapshot(
      session.id, values.b.end);
    const driveA = observationHighestDrive(snapA);
    const driveB = observationHighestDrive(snapB);
    const events = timelineStore.query({ sessionId: session.id });
    const ratesA = Model.eventRates(
      events, values.a.start, values.a.end, [member.key]);
    const ratesB = Model.eventRates(
      events, values.b.start, values.b.end, [member.key]);
    const rateKeys = new Set([
      ...ratesA.map(rate => rate.key),
      ...ratesB.map(rate => rate.key)
    ]);
    const seriesRows = Array.from(metricIds).map(metricId => {
      const currentWorld = world();
      const view = currentWorld && BiologicalMonitor.store.metricView(
        currentWorld.key, member.key, metricId, 300
      );
      const a = rangeStat(view && view.samples,
        values.a.start, values.a.end);
      const b = rangeStat(view && view.samples,
        values.b.start, values.b.end);
      const measure = measureFor(metricId);
      return '<tr><th>' + escapeHtml(measure.label) +
        '<small>' + escapeHtml(measure.unit) + '</small></th>' +
        '<td><strong>' + escapeHtml(format(a.median)) +
        '</strong><small>median · n=' + a.n +
        ' · missing ' + a.missing + '</small></td>' +
        '<td><strong>' + escapeHtml(format(b.median)) +
        '</strong><small>median · n=' + b.n +
        ' · missing ' + b.missing + '</small></td>' +
        '<td>' + escapeHtml(a.median == null || b.median == null
          ? "Not comparable" : "Δ " +
            format(b.median - a.median)) + "</td></tr>";
    }).join("");
    const eventRows = Array.from(rateKeys).sort().map(key => {
      const a = ratesA.find(rate => rate.key === key);
      const b = ratesB.find(rate => rate.key === key);
      return '<tr><th>' + escapeHtml(key) + '</th><td>' +
        escapeHtml(a ? format(a.ratePer1000Ticks) : "0") +
        '<small>per 1,000 ticks</small></td><td>' +
        escapeHtml(b ? format(b.ratePer1000Ticks) : "0") +
        '<small>per 1,000 ticks</small></td><td>' +
        escapeHtml("counts " + (a ? a.count : 0) + " / " +
          (b ? b.count : 0)) + "</td></tr>";
    }).join("");
    const intervention = values.anchor &&
      values.anchor.category === "intervention"
      ? '<button class="btn-light" type="button" data-compare-event="' +
        escapeHtml(values.anchor.id) + '" data-compare-session="' +
        escapeHtml(session.id) + '" data-compare-tick="' +
        values.anchor.endTick + '">Open intervention evidence</button>'
      : "";
    return '<section class="compare-self-summary"><header>' +
      '<div><h2>' + escapeHtml(member.label) +
      ' across two ranges</h2><span>Timeline session ' +
      escapeHtml(session.name) + '</span></div>' + intervention +
      '</header><div class="compare-range-cards">' +
      rangeCard("Range A", values.a, snapA, driveA) +
      rangeCard("Range B", values.b, snapB, driveB) +
      '</div></section><section class="compare-table-card"><header>' +
      '<div><h2>Measure distributions</h2><span>Raw retained Task 07 samples</span></div>' +
      '<p>Different n or cadence remains visible.</p></header>' +
      '<div class="compare-table-scroll"><table><thead><tr><th>Measure</th><th>Range A</th><th>Range B</th><th>Difference</th></tr></thead><tbody>' +
      seriesRows + eventRows + "</tbody></table></div></section>";
  }

  function rangeCard(label, range, snapshot, drive) {
    const actual = snapshot ? snapshot.worldTick : null;
    return '<article><span>' + escapeHtml(label) + '</span><strong>' +
      range.start + "–" + range.end + '</strong><dl><div><dt>Nearest observation</dt><dd>' +
      (actual == null ? "Missing" : "tick " + actual +
        " · offset " + (actual - range.end)) +
      '</dd></div><div><dt>Highest drive</dt><dd>' +
      (drive ? escapeHtml(drive.label + " " +
        format(drive.value)) : "Missing") +
      '</dd></div></dl></article>';
  }

  function distributionCard(metricId) {
    const measure = measureFor(metricId);
    const result = Model.distribution(
      latest, metricId, Array.from(selectedKeys));
    const available = result.individuals.filter(item =>
      Number.isFinite(Number(item.value)));
    const min = result.min;
    const span = result.max == null || min == null ||
      result.max === min ? 1 : result.max - min;
    return '<article class="compare-distribution">' +
      '<header><div><h3>' + escapeHtml(measure.label) +
      '</h3><span>' + escapeHtml(measure.unit) +
      '</span></div><strong>n=' + result.n +
      '</strong></header><div class="compare-stat-line">' +
      '<span>median <strong>' + escapeHtml(format(result.median)) +
      '</strong></span><span>IQR <strong>' +
      escapeHtml(format(result.iqr)) + '</strong></span>' +
      '<span>missing <strong>' + result.missing +
      '</strong></span></div><div class="compare-raw-points">' +
      available.map(item => {
        const left = (Number(item.value) - min) / span * 100;
        const outlier = result.outliers.some(value =>
          value.id === item.id);
        return '<button type="button" style="left:' +
          left.toFixed(2) + '%" class="' +
          (outlier ? "compare-point--outlier" : "") +
          '" data-compare-timeline="' + escapeHtml(item.id) +
          '" title="' + escapeHtml(item.label + " · " +
            format(item.value) + (outlier ? " · IQR outlier" : "")) +
          '"></button>';
      }).join("") + '</div><footer><span>' +
      escapeHtml(format(result.min)) + '</span><span>' +
      escapeHtml(format(result.max)) + '</span></footer>' +
      '<details><summary>Raw individuals (' + result.total +
      ')</summary><ul>' + result.individuals.map(item =>
        '<li><button type="button" data-compare-timeline="' +
        escapeHtml(item.id) + '">' + escapeHtml(item.label) +
        '</button><span>' + escapeHtml(format(item.value)) +
        '</span></li>').join("") + "</ul></details></article>";
  }

  function renderCohort() {
    if (!latest || !selectedKeys.size) {
      return '<p class="compare-empty">Choose cohort members. Empty cohorts report n=0 rather than inventing a population value.</p>';
    }
    const demo = Model.demographics(
      latest, Array.from(selectedKeys));
    const snapshots = history.snapshots();
    const events = timelineEvents(Array.from(selectedKeys));
    const rates = Model.eventRates(events,
      snapshots.length ? snapshots[0].worldTick : latest.worldTick,
      latest.worldTick, Array.from(selectedKeys));
    const first = snapshots[0];
    const firstKeys = new Set(first
      ? first.creatures.map(creature => creature.key) : []);
    const appeared = Array.from(selectedKeys).filter(key =>
      !firstKeys.has(key)).length;
    const present = selectedMembers().filter(member =>
      member.status === "present");
    const roomOccupancy = {};
    present.forEach(member => {
      const room = member.roomId == null
        ? "unknown" : String(member.roomId);
      roomOccupancy[room] = (roomOccupancy[room] || 0) + 1;
    });
    const movement = Array.from(selectedKeys).map(key => {
      const member = latest.creatures.find(item => item.key === key);
      return Object.assign({
        key,
        label: member ? member.label : key
      }, Model.movement(
        snapshots, key,
        snapshots.length ? snapshots[0].worldTick : latest.worldTick,
        latest.worldTick
      ));
    });
    const movementSummary = Model.summarize(movement.map(item => ({
      id: item.key,
      label: item.label,
      value: item.n > 1 ? item.movementDistance : null
    })));
    const explicitBirths = events.filter(event =>
      event.category === "lifecycle" &&
      /birth|born/i.test(event.transitionKind + " " + event.label)
    ).length;
    const explicitDeaths = events.filter(event =>
      event.category === "lifecycle" &&
      /death|dead|died/i.test(event.transitionKind + " " + event.label)
    ).length;
    return '<section class="compare-cohort-overview">' +
      '<article><span>Membership</span><strong>n=' +
      demo.n + '</strong><small>' + demo.present +
      ' present · ' + demo.missing + ' missing</small></article>' +
      '<article><span>Survivors</span><strong>' +
      demo.survivors + '</strong><small>' + demo.dead +
      ' dead retained historically</small></article>' +
      '<article><span>Observed arrivals</span><strong>' +
      appeared + '</strong><small>appearance is not automatically labelled birth</small></article>' +
      '<article><span>Explicit lifecycle events</span><strong>' +
      explicitBirths + " births · " + explicitDeaths +
      ' deaths</strong><small>only labelled Timeline events</small></article>' +
      '<article><span>Recorded interval</span><strong>' +
      (snapshots.length ? snapshots[0].worldTick + "–" +
        latest.worldTick : latest.worldTick) +
      '</strong><small>' + snapshots.length +
      ' coherent cohort snapshots</small></article></section>' +
      '<section class="compare-cohort-context"><article><h3>Room occupancy</h3><p>' +
      (Object.keys(roomOccupancy).length
        ? Object.keys(roomOccupancy).sort((a, b) =>
            Number(a) - Number(b)).map(room =>
            "room " + escapeHtml(room) + ": n=" +
            roomOccupancy[room]).join(" · ")
        : "No present members with a room sample") +
      '</p><small>Observed at tick ' + latest.worldTick +
      '</small></article><article><h3>Movement distribution</h3><p>median <strong>' +
      escapeHtml(format(movementSummary.median, 1)) +
      '</strong> px · IQR <strong>' +
      escapeHtml(format(movementSummary.iqr, 1)) +
      '</strong> · n=' + movementSummary.n + ' · missing ' +
      movementSummary.missing +
      '</p><details><summary>Raw individuals</summary><ul>' +
      movement.map(item => '<li><button type="button" data-compare-timeline="' +
        escapeHtml(item.key) + '">' + escapeHtml(item.label) +
        '</button><span>' + (item.n > 1
          ? escapeHtml(format(item.movementDistance, 1)) +
            " px · rooms " +
            escapeHtml(item.roomsVisited.join(", ") || "none")
          : "Missing (fewer than two position samples)") +
        '</span></li>').join("") +
      '</ul></details></article></section>' +
      '<section class="compare-demographics"><header><h2>Distributions</h2><p>Every statistic includes n and raw individuals.</p></header><div class="compare-distribution-grid">' +
      Array.from(metricIds).map(distributionCard).join("") +
      '</div></section><section class="compare-table-card"><header><div><h2>Membership and event rates</h2><span>Sex ' +
      escapeHtml(JSON.stringify(demo.sex)) + " · age " +
      escapeHtml(JSON.stringify(demo.ageStage)) +
      '</span></div><p>Rates are descriptive, not treatment effects.</p></header>' +
      '<div class="compare-table-scroll"><table><thead><tr><th>Event</th><th>Count</th><th>Rate / 1,000 ticks</th><th>Duration</th></tr></thead><tbody>' +
      (rates.length ? rates.map(rate =>
        '<tr><th>' + escapeHtml(rate.key) + '</th><td>' +
        rate.count + '</td><td>' +
        escapeHtml(format(rate.ratePer1000Ticks)) +
        '</td><td>' + rate.durationTicks + " ticks</td></tr>"
      ).join("") :
        '<tr><td colspan="4">No subject Timeline events retained for this cohort range.</td></tr>') +
      "</tbody></table></div></section>";
  }

  function interventionEvents() {
    return timelineEvents(Array.from(selectedKeys))
      .filter(event => event.category === "intervention");
  }

  function anchorEvent() {
    if (!dom.anchor.value) return null;
    return timelineEvents(Array.from(selectedKeys))
      .find(event => event.id === dom.anchor.value) || null;
  }

  function renderTimeControls() {
    dom.timeControls.hidden = mode !== "self";
    if (mode !== "self") return;
    const member = selectedMembers()[0];
    const session = member && timelineSession(member.key);
    const current = dom.anchor.value;
    const interventions = interventionEvents();
    DomPatch.update(dom.anchor, '<option value="">None</option>' +
      interventions.map(event =>
        '<option value="' + escapeHtml(event.id) + '"' +
        (event.id === current ? " selected" : "") + ">" +
        escapeHtml(event.label + " · tick " + event.endTick) +
        "</option>"
      ).join(""));
    if (session && !dom.aStart.value) {
      const midpoint = Math.round(
        (session.firstWorldTick + session.lastWorldTick) / 2
      );
      const anchor = anchorEvent();
      const offset = dom.timebase.value === "relative" && anchor
        ? anchor.endTick : 0;
      dom.aStart.value = session.firstWorldTick - offset;
      dom.aEnd.value = midpoint - offset;
      dom.bStart.value = midpoint - offset;
      dom.bEnd.value = session.lastWorldTick - offset;
    }
  }

  function changeTimebase() {
    const next = dom.timebase.value;
    if (next === previousTimebase) {
      render();
      return;
    }
    const anchor = anchorEvent();
    if (!anchor) {
      dom.timebase.value = previousTimebase;
      render();
      return;
    }
    const adjustment = next === "relative"
      ? -anchor.endTick : anchor.endTick;
    [dom.aStart, dom.aEnd, dom.bStart, dom.bEnd]
      .forEach(input => {
        const value = Number(input.value);
        if (input.value !== "" && Number.isFinite(value)) {
          input.value = value + adjustment;
        }
      });
    previousTimebase = next;
    publishTimeContext();
    render();
  }

  function publishTimeContext() {
    if (!window.DevToolsNavigation ||
        DevToolsNavigation.getActiveTab() !== "compare") return;
    const values = [
      dom.aStart.value, dom.aEnd.value,
      dom.bStart.value, dom.bEnd.value
    ].filter(value => value !== "").map(Number)
      .filter(Number.isFinite);
    DevToolsNavigation.updateRouteContext({
      routeId: "compare",
      time: values.length ? {
        timebase: dom.timebase.value === "relative"
          ? "relativeWorldTicks" : "worldTicks",
        cursorTick: null,
        startTick: Math.min(...values),
        endTick: Math.max(...values)
      } : null
    });
  }

  function currentDefinition() {
    const ranges = {
      rangeA: dom.aStart.value ? {
        start: Number(dom.aStart.value),
        end: Number(dom.aEnd.value)
      } : null,
      rangeB: dom.bStart.value ? {
        start: Number(dom.bStart.value),
        end: Number(dom.bEnd.value)
      } : null
    };
    return Model.normalizeDefinition({
      id: "comparison-" + Date.now(),
      name: dom.name.value || "Untitled comparison",
      mode,
      worldKey: latest && latest.worldKey ||
        (world() && world().key),
      memberKeys: Array.from(selectedKeys),
      metricIds: Array.from(metricIds),
      timebase: dom.timebase.value,
      rangeA: ranges.rangeA,
      rangeB: ranges.rangeB,
      anchorEventId: dom.anchor.value || null
    });
  }

  function applyDefinition(definition) {
    mode = definition.mode;
    selectedKeys = new Set(definition.memberKeys);
    metricIds = new Set(definition.metricIds);
    dom.timebase.value = definition.timebase;
    previousTimebase = definition.timebase;
    dom.aStart.value = definition.rangeA
      ? definition.rangeA.start : "";
    dom.aEnd.value = definition.rangeA
      ? definition.rangeA.end : "";
    dom.bStart.value = definition.rangeB
      ? definition.rangeB.start : "";
    dom.bEnd.value = definition.rangeB
      ? definition.rangeB.end : "";
    dom.anchor.value = definition.anchorEventId || "";
    dom.name.value = definition.name;
    genomeDiff = null;
    publishTimeContext();
    render();
    poll(true);
  }

  function renderDefinitions() {
    DomPatch.update(dom.definitions, definitions.length
      ? definitions.map(definition =>
          '<button type="button" data-compare-definition="' +
          escapeHtml(definition.id) + '"><strong>' +
          escapeHtml(definition.name) + "</strong><span>" +
          escapeHtml(definition.mode + " · " +
            definition.memberKeys.length + " subjects · " +
            definition.metricIds.length + " measures") +
          "</span></button>"
        ).join("")
      : '<p class="compare-empty">Saved definitions remain available while this page is open.</p>');
  }

  function renderProvenance() {
    if (!latest) {
      DomPatch.update(dom.provenance, '<p class="compare-empty">No sample provenance yet.</p>');
      return;
    }
    const session = history.activeSession();
    DomPatch.update(dom.provenance, '<dl class="compare-provenance-list"><div><dt>World</dt><dd>' +
      escapeHtml(latest.worldName) + '</dd></div><div><dt>Tick</dt><dd>' +
      latest.worldTick + '</dd></div><div><dt>System tick</dt><dd>' +
      escapeHtml(latest.systemTick) + '</dd></div><div><dt>Timing</dt><dd>' +
      escapeHtml(latest.contextTiming) + '</dd></div><div><dt>Speed</dt><dd>×' +
      escapeHtml(latest.gameSpeed) + '</dd></div><div><dt>Source</dt><dd>' +
      escapeHtml(latest.source) + '</dd></div><div><dt>Snapshots</dt><dd>' +
      session.snapshotCount + " retained · " +
      session.droppedSnapshots + " trimmed</dd></div><div><dt>Chemicals</dt><dd>" +
      (latest.requestedChemicalIds.length
        ? escapeHtml(latest.requestedChemicalIds.join(", "))
        : "None requested") + "</dd></div></dl>");
  }

  function renderGenome() {
    const members = selectedMembers();
    dom.compareGenomes.disabled = members.length !== 2;
    if (!genomeDiff) {
      DomPatch.update(dom.genomeResult, members.length === 2
        ? '<p>Select to fetch structural fingerprints on demand.</p>'
        : '<p>Select exactly two present creatures.</p>');
      return;
    }
    DomPatch.update(dom.genomeResult, '<dl class="compare-genome-summary"><div><dt>Gene counts</dt><dd>' +
      genomeDiff.left.geneCount + " / " +
      genomeDiff.right.geneCount + '</dd></div><div><dt>Delta</dt><dd>' +
      (genomeDiff.geneCountDelta > 0 ? "+" : "") +
      genomeDiff.geneCountDelta + '</dd></div></dl>' +
      (genomeDiff.structural.length
        ? '<ul>' + genomeDiff.structural.map(row =>
            '<li><code>' + escapeHtml(row.key) +
            '</code><span>' + row.left + " → " + row.right +
            " (Δ " + (row.delta > 0 ? "+" : "") +
            row.delta + ")</span></li>").join("") + "</ul>"
        : '<p>No gene type/count differences. Exact gene bytes were not compared.</p>'));
  }

  function render() {
    dom.modes.querySelectorAll("[data-compare-mode]").forEach(button =>
      button.classList.toggle("compare-mode--active",
        button.dataset.compareMode === mode)
    );
    dom.modeLabel.textContent = mode === "self"
      ? "SELF / RANGES" : mode.toUpperCase();
    dom.title.textContent = mode === "individual"
      ? "Creature comparison" : mode === "self"
        ? "Before / after comparison" : "Cohort comparison";
    dom.sampleSummary.textContent = latest
      ? "Observed tick " + latest.worldTick + " · " +
        latest.creatures.filter(member =>
          member.status === "present").length +
        " present · ×" + latest.gameSpeed
      : "Waiting for a cohort snapshot";
    renderSubjects();
    renderMeasures();
    renderWarning();
    renderTimeControls();
    DomPatch.update(dom.results, mode === "individual"
      ? renderIndividual() : mode === "self"
        ? renderSelf() : renderCohort());
    renderDefinitions();
    renderProvenance();
    renderGenome();
  }

  function openTimeline(key, eventId, tick) {
    const session = timelineSession(key);
    if (!session || !window.EthologyTimelineWorkspace) {
      dom.warning.hidden = false;
      dom.warning.textContent =
        "No retained Timeline session is available for that subject.";
      return;
    }
    EthologyTimelineWorkspace.openSession(
      session.id,
      tick == null ? session.lastWorldTick : tick,
      eventId
    );
    DevToolsNavigation.navigate({
      tab: "timeline",
      worldKey: latest && latest.worldKey,
      primary: "creature",
      selections: {
        creature: {
          id: session.subjectAgentId,
          moniker: key.replace(/^creature:/, ""),
          name: session.subjectLabel
        },
        agent: { id: session.subjectAgentId },
        timelineEvent: eventId
          ? { id: eventId, tick } : null
      }
    });
  }

  function download(name, value, type) {
    const url = URL.createObjectURL(new Blob([value], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }

  dom.modes.addEventListener("click", event => {
    const button = event.target.closest("[data-compare-mode]");
    if (!button) return;
    mode = button.dataset.compareMode;
    if (mode === "self" && selectedKeys.size > 1) {
      selectedKeys = new Set([selectedKeys.values().next().value]);
    }
    genomeDiff = null;
    render();
  });
  dom.subjects.addEventListener("change", event => {
    const input = event.target.closest("[data-compare-subject]");
    if (!input) return;
    if (mode === "self") {
      selectedKeys = new Set(input.checked
        ? [input.dataset.compareSubject] : []);
      dom.aStart.value = "";
    } else if (input.checked) {
      selectedKeys.add(input.dataset.compareSubject);
    } else {
      selectedKeys.delete(input.dataset.compareSubject);
    }
    genomeDiff = null;
    render();
  });
  dom.measures.addEventListener("change", event => {
    const input = event.target.closest("[data-compare-measure]");
    if (!input) return;
    if (input.checked) metricIds.add(input.dataset.compareMeasure);
    else metricIds.delete(input.dataset.compareMeasure);
    restartPolling(true);
    render();
  });
  dom.addSelected.addEventListener("click", () => {
    const selected = selectedCreature();
    if (!selected) return;
    const key = "creature:" +
      (selected.moniker || ("agent-" + selected.id));
    if (mode === "self") selectedKeys = new Set([key]);
    else selectedKeys.add(key);
    render();
  });
  dom.selectAll.addEventListener("click", () => {
    if (!latest) return;
    selectedKeys = new Set(latest.creatures
      .filter(member => member.status === "present")
      .map(member => member.key));
    if (mode === "self" && selectedKeys.size) {
      selectedKeys = new Set([selectedKeys.values().next().value]);
    }
    render();
  });
  dom.clearSubjects.addEventListener("click", () => {
    selectedKeys = new Set();
    render();
  });
  dom.refresh.addEventListener("click", () => poll(true));
  dom.interval.addEventListener("change", () =>
    restartPolling(true));
  dom.auto.addEventListener("change", () =>
    restartPolling(dom.auto.checked));
  dom.timebase.addEventListener("change", changeTimebase);
  [
    dom.aStart, dom.aEnd, dom.bStart, dom.bEnd, dom.anchor
  ].forEach(input => input.addEventListener("change", () => {
    publishTimeContext();
    render();
  }));
  dom.applyRanges.addEventListener("click", () => {
    publishTimeContext();
    render();
  });
  dom.save.addEventListener("click", () => {
    const definition = currentDefinition();
    const index = definitions.findIndex(item =>
      item.name === definition.name);
    if (index >= 0) {
      definition.id = definitions[index].id;
      definitions[index] = definition;
    } else {
      definitions.push(definition);
    }
    renderDefinitions();
  });
  dom.definitions.addEventListener("click", event => {
    const button = event.target.closest("[data-compare-definition]");
    const definition = button && definitions.find(item =>
      item.id === button.dataset.compareDefinition);
    if (definition) applyDefinition(definition);
  });
  dom.exportDefinition.addEventListener("click", () => {
    const definition = currentDefinition();
    download("creature-comparison-definition.json",
      Model.serializeDefinition(definition), "application/json");
  });
  dom.exportReport.addEventListener("click", () => {
    const definition = currentDefinition();
    const report = {
      schemaVersion: Model.SCHEMA_VERSION,
      kind: Model.REPORT_KIND,
      exportedAt: new Date().toISOString(),
      definition,
      provenance: latest ? {
        source: latest.source,
        contextTiming: latest.contextTiming,
        worldKey: latest.worldKey,
        worldName: latest.worldName,
        worldTick: latest.worldTick,
        systemTick: latest.systemTick,
        capturedAtWallTimeMs: latest.capturedAtWallTimeMs,
        enginePaused: latest.enginePaused,
        gameSpeed: latest.gameSpeed
      } : null,
      cohort: latest ? {
        demographics: Model.demographics(
          latest, Array.from(selectedKeys)),
        distributions: Array.from(metricIds).map(metricId => ({
          metric: measureFor(metricId),
          summary: Model.distribution(
            latest, metricId, Array.from(selectedKeys))
        }))
      } : null,
      note: "Descriptive comparison only; no treatment causality is claimed. Genome payloads are not embedded."
    };
    download("creature-comparison-report.json",
      JSON.stringify(report, null, 2) + "\n",
      "application/json");
  });
  dom.results.addEventListener("click", event => {
    const timeline = event.target.closest("[data-compare-timeline]");
    if (timeline) {
      openTimeline(timeline.dataset.compareTimeline);
      return;
    }
    const evidence = event.target.closest("[data-compare-event]");
    if (evidence) {
      const session = EthologyTimelineWorkspace.store.stats(
        evidence.dataset.compareSession);
      if (session) openTimeline(
        session.subjectKey,
        evidence.dataset.compareEvent,
        Number(evidence.dataset.compareTick)
      );
    }
  });
  dom.compareGenomes.addEventListener("click", async () => {
    const members = selectedMembers();
    if (members.length !== 2) return;
    const requestedPair = members.map(member => member.key).join("|");
    const stillSelected = () => requestedPair ===
      selectedMembers().map(member => member.key).join("|");
    dom.genomeResult.textContent = "Loading structural fingerprints…";
    try {
      const genomes = await Promise.all(members.map(member =>
        fetch("/api/creature/" + member.agentId + "/genome")
          .then(response => {
            if (!response.ok) throw new Error("HTTP " + response.status);
            return response.json();
          })
      ));
      if (!stillSelected()) return;
      genomeDiff = Model.diffGenomes(genomes[0], genomes[1]);
      renderGenome();
    } catch (error) {
      if (!stillSelected()) return;
      dom.genomeResult.textContent =
        "Genome comparison failed: " + String(error);
    }
  });

  DevToolsEvents.on("tab:activated", tab => {
    if (tab !== "compare") return;
    tabActive = true;
    restartPolling(true);
    render();
  });
  DevToolsEvents.on("tab:deactivated", tab => {
    if (tab !== "compare") return;
    tabActive = false;
    restartPolling(false);
  });
  ObservatoryState.subscribe(
    state => state.world.identity &&
      state.world.identity.key,
    () => {
      requestSerial += 1;
      latest = null;
      selectedKeys = new Set();
      genomeDiff = null;
      dom.timebase.value = "world_tick";
      previousTimebase = "world_tick";
      dom.aStart.value = "";
      dom.aEnd.value = "";
      dom.bStart.value = "";
      dom.bEnd.value = "";
      dom.anchor.value = "";
      restartPolling(true);
      render();
    }
  );

  if (window.DevToolsNavigation) {
    DevToolsNavigation.registerWorkspace("compare", {
      capture() {
        return {
          definition: currentDefinition(),
          selectedKeys: Array.from(selectedKeys),
          metricIds: Array.from(metricIds),
          scrollTop: dom.panel.scrollTop
        };
      },
      restore(saved) {
        if (!saved) return;
        if (saved.definition) applyDefinition(saved.definition);
        selectedKeys = new Set(saved.selectedKeys || selectedKeys);
        metricIds = new Set(saved.metricIds || metricIds);
        render();
        requestAnimationFrame(() => {
          dom.panel.scrollTop = Number(saved.scrollTop) || 0;
        });
      },
      open(route) {
        if (!route.time) return;
        mode = "self";
        dom.aStart.value = route.time.startTick == null
          ? "" : route.time.startTick;
        dom.aEnd.value = route.time.endTick == null
          ? "" : route.time.endTick;
        dom.timebase.value = route.time.timebase === "relativeWorldTicks"
          ? "relative" : "world_tick";
        previousTimebase = dom.timebase.value;
        render();
      }
    });
  }
  render();
  window.CreatureComparisonWorkspace = Object.freeze({
    history,
    poll,
    render,
    currentDefinition
  });
})();
