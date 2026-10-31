// ecology_workspace.js — layered, read-only world and ecology observatory
"use strict";

(() => {
  const Model = window.EcologyModel;
  if (!Model) return;

  const svgNamespace = "http://www.w3.org/2000/svg";
  const dom = {
    metaroom: document.getElementById("ecology-metaroom"),
    channel: document.getElementById("ecology-channel"),
    channelLabel: document.getElementById("ecology-channel-label"),
    permeability: document.getElementById("ecology-permeability"),
    permeabilityValue: document.getElementById("ecology-permeability-value"),
    query: document.getElementById("ecology-query-reachable"),
    queryResult: document.getElementById("ecology-query-result"),
    refresh: document.getElementById("ecology-refresh"),
    interval: document.getElementById("ecology-interval"),
    auto: document.getElementById("ecology-auto"),
    fit: document.getElementById("ecology-fit"),
    copyLink: document.getElementById("ecology-copy-link"),
    warning: document.getElementById("ecology-warning"),
    summary: document.getElementById("ecology-sample-summary"),
    map: document.getElementById("ecology-map"),
    empty: document.getElementById("ecology-map-empty"),
    field: document.getElementById("ecology-field-layer"),
    rooms: document.getElementById("ecology-room-layer"),
    connections: document.getElementById("ecology-connection-layer"),
    trace: document.getElementById("ecology-trace-layer"),
    agents: document.getElementById("ecology-agent-layer"),
    mapText: document.getElementById("ecology-map-text-content"),
    relative: document.getElementById("ecology-relative"),
    inspection: document.getElementById("ecology-inspection"),
    route: document.getElementById("ecology-route"),
    provenance: document.getElementById("ecology-provenance")
  };

  let tabActive = false;
  let timer = null;
  let requestSerial = 0;
  let latest = null;
  let observation = null;
  let inspectedAgentId = null;
  let inspectedRoomId = null;
  let trace = [];
  let fittedMetaRoomId = null;
  let previousConnections = new Map();
  let connectionChanges = [];
  let lastWorldKey = null;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function svgElement(name, attributes) {
    const node = document.createElementNS(svgNamespace, name);
    Object.keys(attributes || {}).forEach(key => {
      if (attributes[key] != null) node.setAttribute(key, attributes[key]);
    });
    return node;
  }

  function selectedCreature() {
    return ObservatoryState.getState().selection.creature;
  }

  function world() {
    return ObservatoryState.getState().world.identity;
  }

  function channelId() {
    return Math.max(0, Math.min(19, Number(dom.channel.value) || 0));
  }

  function threshold() {
    return Number(dom.permeability.value) || 0;
  }

  function enabled(layer) {
    const input = document.querySelector(
      `[data-ecology-layer="${layer}"]`
    );
    return Boolean(input && input.checked);
  }

  function evidence(level) {
    return `<span class="ecology-evidence ecology-evidence--${level}">${escapeHtml(level)}</span>`;
  }

  function metaRoom() {
    if (!latest) return null;
    return latest.metaRooms.find(item =>
      Number(item.id) === Number(latest.selectedMetaRoomId)) || null;
  }

  function fitMap(force) {
    const selected = metaRoom();
    if (!selected) return;
    if (!force && fittedMetaRoomId === selected.id) return;
    const padding = Math.max(40,
      Math.min(selected.width, selected.height) * 0.04);
    dom.map.setAttribute("viewBox", [
      selected.x - padding,
      selected.y - padding,
      selected.width + padding * 2,
      selected.height + padding * 2
    ].join(" "));
    fittedMetaRoomId = selected.id;
  }

  function populateMetaRooms() {
    if (!latest) return;
    const currentValue = dom.metaroom.value;
    DomPatch.updateChildren(dom.metaroom, latest.metaRooms.map(item => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = "Metaroom " + item.id +
        (item.current ? " · camera" : "") +
        " · " + item.roomCount + " rooms";
      return option;
    }));
    const desired = latest.metaRooms.some(item =>
      String(item.id) === String(currentValue))
      ? currentValue : latest.selectedMetaRoomId;
    if (desired != null) dom.metaroom.value = String(desired);
  }

  function fieldValue(room) {
    const sample = Array.isArray(room.ca)
      ? room.ca.find(value =>
          Number(value.channelId) === channelId()) : null;
    return sample && Number.isFinite(Number(sample.value))
      ? Number(sample.value) : null;
  }

  function formatNumber(value, digits) {
    if (value == null || !Number.isFinite(Number(value)))
      return "unavailable";
    return Number(value).toFixed(digits);
  }

  // Layers are drawn off-screen, then patched in, so a refresh does not take
  // a room or agent out from under the pointer.
  function renderMap() {
    const layerNames = ["field", "rooms", "connections", "trace", "agents"];
    const live = {};
    layerNames.forEach(name => {
      live[name] = dom[name];
      dom[name] = svgElement("g");
    });
    try {
      drawMap();
    } finally {
      layerNames.forEach(name => {
        const drawn = dom[name];
        dom[name] = live[name];
        DomPatch.updateChildren(dom[name], Array.from(drawn.childNodes));
      });
    }
  }

  function drawMap() {
    if (!latest || !latest.rooms.length) {
      dom.empty.hidden = false;
      return;
    }
    dom.empty.hidden = true;
    fitMap(false);

    const values = latest.rooms.map(fieldValue)
      .filter(value => value != null);
    const maximum = Math.max(0.00001, ...values.map(Math.abs));
    if (enabled("field")) {
      latest.rooms.forEach(room => {
        const value = fieldValue(room);
        if (value == null) return;
        const polygon = svgElement("polygon", {
          points: Model.roomPolygon(room),
          class: "ecology-field",
          opacity: Math.min(0.78, 0.08 + Math.abs(value) / maximum * 0.7)
        });
        const title = svgElement("title");
        title.textContent = "Room " + room.id + " · CA " + channelId() +
          " = " + value.toFixed(5);
        polygon.append(title);
        dom.field.append(polygon);
      });
    }

    if (enabled("rooms")) {
      latest.rooms.forEach(room => {
        const selected = Number(room.id) === Number(inspectedRoomId) ||
          observation && observation.environment &&
          Number(room.id) === Number(observation.environment.roomId);
        const polygon = svgElement("polygon", {
          "data-patch-key": "room-" + room.id,
          points: Model.roomPolygon(room),
          class: "ecology-room" +
            (selected ? " ecology-room--selected" : ""),
          tabindex: "0",
          role: "button",
          "data-room-id": room.id,
          "aria-label": "Inspect room " + room.id + ", type " + room.type +
            ", CA " + channelId() + " value " +
            formatNumber(fieldValue(room), 5)
        });
        const title = svgElement("title");
        title.textContent = "Room " + room.id + " · type " + room.type;
        polygon.append(title);
        dom.rooms.append(polygon);

        const label = svgElement("text", {
          "data-patch-key": "room-label-" + room.id,
          x: (Number(room.left) + Number(room.right)) / 2,
          y: (Number(room.ceilingLeft) + Number(room.ceilingRight) +
            Number(room.floorLeft) + Number(room.floorRight)) / 4,
          class: "ecology-room-label",
          "text-anchor": "middle"
        });
        label.textContent = String(room.id);
        dom.rooms.append(label);
      });
    }

    if (enabled("connections")) {
      const roomMap = new Map(latest.rooms.map(room => [Number(room.id), room]));
      latest.connections.forEach(connection => {
        const permeability = Number(connection.permeability) || 0;
        const classes = [
          "ecology-connection",
          connection.kind === "link" ? "ecology-connection--link" : "",
          permeability < threshold() ? "ecology-connection--blocked" : ""
        ].filter(Boolean).join(" ");
        let line;
        if (connection.kind === "door" &&
            connection.startX != null && connection.endX != null) {
          line = svgElement("line", {
            x1: connection.startX, y1: connection.startY,
            x2: connection.endX, y2: connection.endY,
            class: classes
          });
        } else {
          const roomA = roomMap.get(Number(connection.roomA));
          const roomB = roomMap.get(Number(connection.roomB));
          if (!roomA || !roomB) return;
          line = svgElement("line", {
            x1: (Number(roomA.left) + Number(roomA.right)) / 2,
            y1: (Number(roomA.floorLeft) + Number(roomA.floorRight)) / 2,
            x2: (Number(roomB.left) + Number(roomB.right)) / 2,
            y2: (Number(roomB.floorLeft) + Number(roomB.floorRight)) / 2,
            class: classes
          });
        }
        const title = svgElement("title");
        title.textContent = connection.kind + " " +
          connection.roomA + " ↔ " + connection.roomB +
          " · permeability " + permeability;
        line.append(title);
        dom.connections.append(line);
      });
    }

    if (enabled("trace") && trace.length > 1) {
      const points = trace.filter(point =>
        Number(point.metaRoomId) === Number(latest.selectedMetaRoomId))
        .map(point => point.x + "," + point.y).join(" ");
      if (points.includes(" ")) {
        dom.trace.append(svgElement("polyline", {
          points,
          class: "ecology-trace"
        }));
      }
    }

    const selected = selectedCreature();
    const currentTarget = observation && observation.attention &&
      observation.attention.currentTarget;
    latest.agents.forEach(agent => {
      const source = agent.caChannelId != null &&
        Number(agent.caChannelId) === channelId() &&
        Number(agent.caEmission) !== 0;
      const visible =
        (!agent.isCreature && !agent.isVehicle && enabled("agents")) ||
        (agent.isCreature && enabled("creatures")) ||
        (agent.isVehicle && enabled("vehicles")) ||
        (source && enabled("sources"));
      if (!visible) return;
      const isSelected = selected &&
        Number(agent.agentId) === Number(selected.id);
      const isTarget = (currentTarget &&
        Number(agent.agentId) === Number(currentTarget.agentId)) ||
        Number(agent.agentId) === Number(inspectedAgentId);
      const classes = [
        "ecology-agent",
        agent.isVehicle ? "ecology-agent--vehicle" :
          agent.isCreature ? "ecology-agent--creature" :
            "ecology-agent--ordinary",
        source && Number(agent.caEmission) > 0 ? "ecology-agent--source" : "",
        source && Number(agent.caEmission) < 0 ? "ecology-agent--sink" : "",
        isSelected ? "ecology-agent--selected" : "",
        isTarget ? "ecology-agent--target" : ""
      ].filter(Boolean).join(" ");
      // Keyed so a focused circle never silently becomes a different agent.
      const circle = svgElement("circle", {
        "data-patch-key": "agent-" + agent.agentId,
        cx: agent.posX,
        cy: agent.posY,
        r: isSelected || isTarget ? 16 : agent.isCreature ? 13 : 9,
        class: classes,
        tabindex: "0",
        role: "button",
        "data-agent-id": agent.agentId,
        "aria-label": "Inspect agent " + agent.agentId + ", " +
          (agent.isCreature ? "creature" :
            agent.isVehicle ? "vehicle" : "world agent") +
          ", room " + agent.roomId
      });
      const title = svgElement("title");
      title.textContent = "Agent " + agent.agentId + " · " +
        [agent.family, agent.genus, agent.species].join(" ") +
        (agent.worldCategoryLabel
          ? " · " + agent.worldCategoryLabel : "") +
        (agent.gallery ? " · " + agent.gallery : "");
      circle.append(title);
      dom.agents.append(circle);
    });
  }

  function renderRelative() {
    const selected = selectedCreature();
    if (!selected) {
      DomPatch.update(dom.relative, `<div class="ecology-evidence-card">${evidence("unknown")}<strong>No creature selected</strong><span>Select a creature in the Creature Inspector, Timeline, or map.</span></div>`);
      return;
    }
    if (!observation || !latest) {
      DomPatch.update(dom.relative, `<div class="ecology-evidence-card">${evidence("unknown")}<strong>Creature sample unavailable</strong><span>Waiting for a coherent observation.</span></div>`);
      return;
    }
    const relative = Model.creatureRelative(latest, observation, channelId());
    const objective = relative.objective;
    const sampled = relative.sampledAtCreature;
    const sensory = relative.sensoryAvailability;
    const inferred = relative.inferredRelevance;
    const sensorySummary = !sensory.available
      ? sensory.note
      : sensory.winnerId != null
        ? "Smell winner " + (sensory.winnerLabel || sensory.winnerId) +
          " · activity " + formatNumber(sensory.winnerActivity, 3)
        : sensory.strongest
          ? "Strongest smell signal " + sensory.strongest.label +
            " · activity " + formatNumber(sensory.strongest.activity, 3)
          : "No smell signal at this tick";
    // Channels with no creature category only have a generic "CA smell N".
    const namedChannel = channel => channel && channel.categoryId != null
      ? " · " + channel.label : "";
    const strongest = sampled.strongestChannel;
    const strongestSummary = !sampled.available
      ? "The creature's down foot is outside every room, so nothing was sampled."
      : !strongest
      ? "Every CA channel reads zero in this room, so a zero here is genuine."
      : strongest === sampled.channel
        ? "This is the strongest channel in the room."
        : "Strongest here: CA " + strongest.id + namedChannel(strongest) +
          " = " + formatNumber(strongest.value, 5) +
          ". Choose it above to map it.";
    DomPatch.update(dom.relative, [
      `<div class="ecology-evidence-card">${evidence("observed")}<strong>Objective world</strong><span>Creature #${escapeHtml(selected.id)} is in room ${escapeHtml(objective.room && objective.room.id)}. Map objects are globally observed, not automatically perceived.</span></div>`,
      sampled.available
        ? `<div class="ecology-evidence-card">${evidence("observed")}<strong>Sampled at creature</strong><span>Room ${escapeHtml(sampled.roomId)} at the down foot · CA ${channelId()}${escapeHtml(namedChannel(sampled.channel))} = ${escapeHtml(formatNumber(sampled.channel && sampled.channel.value, 5))}</span><span>${escapeHtml(strongestSummary)}</span></div>`
        : `<div class="ecology-evidence-card">${evidence("unknown")}<strong>Sampled at creature</strong><span>${escapeHtml(strongestSummary)}</span></div>`,
      `<div class="ecology-evidence-card">${evidence(sensory.evidence)}<strong>Sensory evidence</strong><span>${escapeHtml(sensorySummary)}</span><span>${escapeHtml(sensory.note || "")}</span></div>`,
      `<div class="ecology-evidence-card">${evidence(inferred.evidence)}<strong>${escapeHtml(inferred.label)}</strong><span>${escapeHtml(inferred.support)}</span></div>`
    ].join(""));
  }

  function renderMapText() {
    if (!latest || !latest.rooms.length) {
      DomPatch.update(dom.mapText, '<p class="crt-empty-hint">No room data is available.</p>');
      return;
    }
    const connections = new Map();
    latest.connections.forEach(connection => {
      [connection.roomA, connection.roomB].forEach(roomId => {
        const values = connections.get(Number(roomId)) || [];
        values.push(connection.kind + " to room " +
          (Number(roomId) === Number(connection.roomA)
            ? connection.roomB : connection.roomA) +
          " (" + Number(connection.permeability) + ")");
        connections.set(Number(roomId), values);
      });
    });
    const agents = new Map();
    latest.agents.forEach(agent => {
      const values = agents.get(Number(agent.roomId)) || [];
      values.push("#" + agent.agentId +
        (agent.isCreature ? " creature" :
          agent.isVehicle ? " vehicle" : " agent"));
      agents.set(Number(agent.roomId), values);
    });
    const rows = latest.rooms.map(room => {
      const value = fieldValue(room);
      return "<tr><th scope=\"row\">" + escapeHtml(room.id) +
        "</th><td>" + escapeHtml(room.type) +
        "</td><td>" + escapeHtml(formatNumber(value, 5)) +
        "</td><td>" + escapeHtml(
          (connections.get(Number(room.id)) || []).join("; ") || "None") +
        "</td><td>" + escapeHtml(
          (agents.get(Number(room.id)) || []).join("; ") || "None") +
        "</td></tr>";
    }).join("");
    DomPatch.update(dom.mapText, '<table><caption>Observed tick ' + escapeHtml(latest.worldTick) +
      " · metaroom " + escapeHtml(latest.selectedMetaRoomId) +
      " · CA " + channelId() +
      (latest.roomsTruncated || latest.agentsTruncated ||
       latest.connectionsTruncated ? " · bounded result; see provenance" : "") +
      '</caption><thead><tr><th scope="col">Room</th>' +
      '<th scope="col">Type</th><th scope="col">CA value</th>' +
      '<th scope="col">Connections</th><th scope="col">Agents</th>' +
      "</tr></thead><tbody>" + rows + "</tbody></table>");
  }

  function inspectTarget() {
    if (!latest) return null;
    const currentTarget = observation && observation.attention &&
      observation.attention.currentTarget;
    return Model.agentById(latest, inspectedAgentId) ||
      (currentTarget && Model.agentById(latest, currentTarget.agentId)) ||
      currentTarget ||
      null;
  }

  function renderInspection() {
    if (!latest) {
      dom.inspection.textContent = "No map sample.";
      return;
    }
    const room = Model.roomById(latest, inspectedRoomId) ||
      observation && observation.environment &&
        Model.roomById(latest, observation.environment.roomId);
    const target = inspectTarget();
    const currentTarget = observation && observation.attention &&
      observation.attention.currentTarget;
    const targetKind = target && currentTarget &&
      Number(target.agentId) === Number(currentTarget.agentId)
      ? "Current IT target" : target ? "Inspected map agent" : "";
    const sample = room && Array.isArray(room.ca)
      ? room.ca.find(value => Number(value.channelId) === channelId()) : null;
    DomPatch.update(dom.inspection, `<div class="ecology-inspection-card">${evidence("observed")}<strong>${room ? "Room " + escapeHtml(room.id) : "No room selected"}</strong>` +
      (room ? `<span>Type ${escapeHtml(room.type)} · CA ${channelId()} ${escapeHtml(formatNumber(sample && sample.value, 5))}</span>` : "") +
      `</div><div class="ecology-inspection-card">${evidence(target ? "observed" : "unknown")}<strong>${target ? escapeHtml(targetKind) + " #" + escapeHtml(target.agentId) : "No target observed or inspected"}</strong>` +
      (target ? `<span>Room ${escapeHtml(target.roomId)} · ${escapeHtml(target.worldCategoryLabel || [target.family, target.genus, target.species].join(" "))}</span><span>${escapeHtml(target.gallery || "gallery unavailable")}</span>` : `<span>Click an agent on the map. This does not change the creature's target.</span>`) +
      `</div>`);
  }

  function renderRoute() {
    const selected = selectedCreature();
    const target = inspectTarget();
    const sourceRoom = observation && observation.environment &&
      observation.environment.roomId;
    if (!latest || !selected || !target) {
      DomPatch.update(dom.route, `<div class="ecology-route-card">${evidence("unknown")}<strong>Connection chain unavailable</strong><span>Select a creature and inspect a target agent.</span></div>`);
      return;
    }
    const route = Model.candidatePath(
      latest, sourceRoom, target.roomId, threshold());
    const comparison = Model.compareRooms(
      latest, sourceRoom, target.roomId, channelId());
    const change = connectionChanges[connectionChanges.length - 1];
    const currentTarget = observation && observation.attention &&
      observation.attention.currentTarget;
    const targetNote = currentTarget &&
      Number(currentTarget.agentId) === Number(target.agentId)
      ? "Compared with the engine-reported current IT target."
      : "Compared with an inspected map agent; the creature's IT target was not changed.";
    DomPatch.update(dom.route, `<div class="ecology-route-card">${evidence(route.status === "candidate" ? "derived" : route.status === "same-room" ? "observed" : "unknown")}<strong>${escapeHtml(route.status === "candidate" ? route.rooms.join(" → ") : route.status === "same-room" ? "Same room " + sourceRoom : "No sampled chain")}</strong><span>${escapeHtml(route.reason || route.method)}</span><span>${escapeHtml(targetNote)}</span><span>Threshold: ${threshold()} · CA ${channelId()}${latest.channels[0] && latest.channels[0].caNavigable ? " is configured navigable" : " navigation use unknown"}</span></div>` +
      `<div class="ecology-route-card">${evidence("derived")}<strong>Room field difference</strong><span>Target − source: ${comparison.difference == null ? "unavailable" : escapeHtml(comparison.difference.toFixed(5))}</span><span>${escapeHtml(comparison.method)}</span></div>` +
      `<div class="ecology-route-card">${evidence(change ? "observed" : "unknown")}<strong>Recent connection change</strong><span>${change ? escapeHtml(change.label + " at tick " + change.tick) : "None observed in this browser interval."}</span></div>`);
  }

  function renderProvenance() {
    if (!latest) {
      dom.provenance.textContent = "No sample.";
      return;
    }
    const freshness = Model.sampleFreshness(
      latest, Date.now(), Number(dom.interval.value));
    DomPatch.update(dom.provenance, `<span>${escapeHtml(latest.source)}</span>` +
      `<span>World tick ${escapeHtml(latest.worldTick)} · system tick ${escapeHtml(latest.systemTick)}</span>` +
      `<span>${escapeHtml(freshness.label)} · engine main thread</span>` +
      `<span>${escapeHtml(latest.rooms.length)} / ${escapeHtml(latest.matchingRoomCount)} matching rooms${latest.roomsTruncated ? " · truncated" : ""}</span>` +
      `<span>${escapeHtml(latest.agents.length)} / ${escapeHtml(latest.matchingAgentCount)} matching agents${latest.agentsTruncated ? " · truncated" : ""}</span>` +
      `<span>${escapeHtml(latest.connections.length)} / ${escapeHtml(latest.matchingConnectionCount)} matching connections${latest.connectionsTruncated ? " · truncated" : ""}</span>` +
      `<span>Read-only response: ${latest.readOnly ? "yes" : "not declared"}</span>`);
  }

  function render() {
    populateMetaRooms();
    const channel = latest && latest.channels.find(item =>
      Number(item.id) === channelId());
    dom.channelLabel.textContent = Model.channelName(channel || {
      id: channelId()
    });
    dom.permeabilityValue.textContent = String(threshold());
    if (latest) {
      const freshness = Model.sampleFreshness(
        latest, Date.now(), Number(dom.interval.value));
      dom.summary.textContent = "Tick " + latest.worldTick +
        " · " + freshness.label +
        " · " + latest.rooms.length + " rooms · " +
        latest.agents.length + " agents";
      const warnings = [];
      if (latest.error) warnings.push(latest.error);
      if (latest.roomsTruncated)
        warnings.push("Room result reached the bounded API limit.");
      if (latest.agentsTruncated)
        warnings.push("Agent result reached the bounded API limit.");
      if (latest.connectionsTruncated)
        warnings.push("Connection result reached the bounded API limit.");
      dom.warning.textContent = warnings.join(" ");
    } else {
      dom.summary.textContent = "Waiting for a world sample";
    }
    renderMap();
    renderMapText();
    renderRelative();
    renderInspection();
    renderRoute();
    renderProvenance();
  }

  function recordConnectionChanges(snapshot) {
    const next = new Map();
    const hadPrevious = previousConnections.size > 0;
    snapshot.connections.forEach(connection => {
      const ends = [connection.roomA, connection.roomB].sort().join(" ↔ ");
      const key = connection.kind + ":" + ends;
      next.set(key, Number(connection.permeability));
      if (previousConnections.has(key) &&
          previousConnections.get(key) !== Number(connection.permeability)) {
        connectionChanges.push({
          tick: snapshot.worldTick,
          key,
          label: connection.kind + " " + ends + " permeability " +
            previousConnections.get(key) + " → " +
          Number(connection.permeability)
        });
      } else if (hadPrevious && !previousConnections.has(key)) {
        connectionChanges.push({
          tick: snapshot.worldTick,
          key,
          label: connection.kind + " " + ends + " appeared"
        });
      }
    });
    if (hadPrevious) {
      previousConnections.forEach((permeability, key) => {
        if (!next.has(key)) {
          connectionChanges.push({
            tick: snapshot.worldTick,
            key,
            label: key.replace(/:/g, " ") + " disappeared"
          });
        }
      });
    }
    connectionChanges = connectionChanges.slice(-40);
    previousConnections = next;
  }

  async function poll(force) {
    if (!tabActive || (!dom.auto.checked && !force)) return;
    const activeWorld = world();
    if (!activeWorld) {
      latest = null;
      observation = null;
      render();
      return;
    }
    const serial = ++requestSerial;
    const selected = selectedCreature();
    try {
      let nextObservation = null;
      if (selected) {
        const observed = await fetch(
          "/api/creature/" + encodeURIComponent(selected.id) +
          "/observation"
        );
        if (observed.ok) nextObservation = await observed.json();
      }
      if (serial !== requestSerial) return;
      const preferredMetaRoom = dom.metaroom.value !== ""
        ? Number(dom.metaroom.value)
        : nextObservation && nextObservation.environment
          ? nextObservation.environment.metaRoomId : null;
      const parameters = new URLSearchParams({
        channels: String(channelId()),
        roomLimit: "400",
        agentLimit: "500"
      });
      if (selected) parameters.set("focusAgent", String(selected.id));
      if (preferredMetaRoom != null)
        parameters.set("metaroom", String(preferredMetaRoom));
      const response = await fetch(
        "/api/ecology/snapshot?" + parameters.toString()
      );
      if (!response.ok) throw new Error("HTTP " + response.status);
      const payload = await response.json();
      if (serial !== requestSerial) return;
      const currentWorld = world();
      if (!currentWorld || currentWorld.key !== activeWorld.key) return;
      const next = Model.normalizeSnapshot(payload);
      observation = nextObservation;
      latest = next;
      recordConnectionChanges(next);
      if (selected) trace = Model.updateTrace(trace, next, selected.id);
      render();
    } catch (error) {
      dom.warning.textContent =
        "World ecology sample unavailable: " + String(error);
      render();
    }
  }

  function restartPolling(immediate) {
    if (timer) clearInterval(timer);
    timer = null;
    if (!tabActive) return;
    if (immediate) poll(true);
    timer = setInterval(() => poll(false), Number(dom.interval.value));
  }

  function inspectAgent(agentId) {
    inspectedAgentId = Number(agentId);
    const agent = latest && Model.agentById(latest, inspectedAgentId);
    if (agent) {
      inspectedRoomId = agent.roomId;
      ObservatoryState.select("agent", agent.agentId, {
        family: agent.family,
        genus: agent.genus,
        species: agent.species,
        gallery: agent.gallery
      });
    }
    render();
  }

  function inspectRoom(roomId) {
    inspectedRoomId = Number(roomId);
    ObservatoryState.select("room", inspectedRoomId, {
      metaRoomId: latest && latest.selectedMetaRoomId
    });
    render();
  }

  function activateSvgTarget(target) {
    const agent = target.closest("[data-agent-id]");
    if (agent) {
      const id = agent.dataset.agentId;
      inspectAgent(id);
      requestAnimationFrame(() => {
        const replacement = dom.map.querySelector(
          `[data-agent-id="${CSS.escape(id)}"]`);
        if (replacement) replacement.focus();
      });
      return true;
    }
    const room = target.closest("[data-room-id]");
    if (room) {
      const id = room.dataset.roomId;
      inspectRoom(id);
      requestAnimationFrame(() => {
        const replacement = dom.map.querySelector(
          `[data-room-id="${CSS.escape(id)}"]`);
        if (replacement) replacement.focus();
      });
      return true;
    }
    return false;
  }

  dom.map.addEventListener("click", event => activateSvgTarget(event.target));
  dom.map.addEventListener("keydown", event => {
    if ((event.key === "Enter" || event.key === " ") &&
        activateSvgTarget(event.target)) {
      event.preventDefault();
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
      "Home", "End"].includes(event.key)) return;
    const targets = Array.from(dom.map.querySelectorAll(
      "[data-room-id], [data-agent-id]"));
    const current = targets.indexOf(event.target);
    if (current < 0) return;
    event.preventDefault();
    const forward = event.key === "ArrowRight" ||
      event.key === "ArrowDown";
    const next = event.key === "Home" ? 0 :
      event.key === "End" ? targets.length - 1 :
      (current + (forward ? 1 : -1) + targets.length) % targets.length;
    targets[next].focus();
  });
  dom.refresh.addEventListener("click", () => poll(true));
  dom.interval.addEventListener("change", () => restartPolling(false));
  dom.auto.addEventListener("change", () => restartPolling(dom.auto.checked));
  dom.fit.addEventListener("click", () => fitMap(true));
  dom.metaroom.addEventListener("change", () => {
    fittedMetaRoomId = null;
    trace = [];
    inspectedRoomId = null;
    inspectedAgentId = null;
    poll(true);
  });
  dom.channel.addEventListener("change", () => {
    dom.channel.value = channelId();
    poll(true);
  });
  dom.permeability.addEventListener("input", render);
  document.querySelectorAll("[data-ecology-layer]").forEach(input =>
    input.addEventListener("change", render)
  );
  dom.query.addEventListener("click", () => {
    const sourceRoom = observation && observation.environment
      ? observation.environment.roomId : inspectedRoomId;
    const agents = latest ? Model.reachableAgents(latest, sourceRoom, {
      minimumPermeability: threshold()
    }) : [];
    dom.queryResult.replaceChildren();
    const summary = document.createElement("div");
    summary.textContent = agents.length
      ? agents.length + " sampled agents are connected at threshold " +
        threshold() + ". This is graph reachability, not proof of affordance."
      : "No sampled agents are connected from the selected room at this threshold.";
    dom.queryResult.append(summary);
    agents.slice(0, 20).forEach(agent => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ecology-agent-result";
      button.dataset.agentId = agent.agentId;
      button.textContent = "#" + agent.agentId + " · " +
        (agent.worldCategoryLabel ||
          [agent.family, agent.genus, agent.species].join(" ")) +
        " · room " + agent.roomId;
      dom.queryResult.append(button);
    });
  });
  dom.queryResult.addEventListener("click", event => {
    const target = event.target.closest("[data-agent-id]");
    if (target) inspectAgent(target.dataset.agentId);
  });
  dom.copyLink.addEventListener("click", async () => {
    const activeWorld = world();
    const view = "m" + (latest ? latest.selectedMetaRoomId : "") +
      "-c" + channelId() + "-p" + threshold();
    const href = window.DevToolsNavigation.buildRouteHref({
      tab: "ecology",
      view,
      worldKey: activeWorld && activeWorld.key,
      primary: ObservatoryState.getState().selection.primary &&
        ObservatoryState.getState().selection.primary.kind,
      selections: ObservatoryState.getState().selection
    });
    try {
      await navigator.clipboard.writeText(
        window.location.href.split("#")[0] + href
      );
      dom.copyLink.textContent = "Copied";
    } catch (_) {
      dom.copyLink.textContent = "Copy failed";
    }
    setTimeout(() => { dom.copyLink.textContent = "Copy view link"; }, 1200);
  });

  window.DevToolsNavigation.registerWorkspace("ecology", {
    capture() {
      return {
        metaroom: dom.metaroom.value,
        channel: channelId(),
        permeability: threshold(),
        layers: Array.from(document.querySelectorAll(
          "[data-ecology-layer]"
        )).reduce((result, input) => {
          result[input.dataset.ecologyLayer] = input.checked;
          return result;
        }, {})
      };
    },
    restore(saved) {
      if (!saved) return;
      if (saved.metaroom != null) dom.metaroom.value = saved.metaroom;
      if (saved.channel != null) dom.channel.value = saved.channel;
      if (saved.permeability != null)
        dom.permeability.value = saved.permeability;
      Object.keys(saved.layers || {}).forEach(layer => {
        const input = document.querySelector(
          `[data-ecology-layer="${layer}"]`
        );
        if (input) input.checked = Boolean(saved.layers[layer]);
      });
      fittedMetaRoomId = null;
      restartPolling(true);
    },
    open(route) {
      const match = route && /^m(-?\d*)-c(\d+)-p(\d+)$/.exec(
        route.view || "");
      if (match) {
        if (match[1] !== "") dom.metaroom.value = match[1];
        dom.channel.value = match[2];
        dom.permeability.value = match[3];
      }
      restartPolling(true);
    }
  });

  DevToolsEvents.on("tab:activated", tab => {
    if (tab !== "ecology") return;
    tabActive = true;
    restartPolling(true);
    render();
  });
  DevToolsEvents.on("tab:deactivated", tab => {
    if (tab !== "ecology") return;
    tabActive = false;
    restartPolling(false);
  });
  ObservatoryState.subscribe(
    state => state.world.identity && state.world.identity.key,
    nextWorldKey => {
      if (nextWorldKey === lastWorldKey) return;
      lastWorldKey = nextWorldKey;
      requestSerial += 1;
      latest = null;
      observation = null;
      trace = [];
      previousConnections = new Map();
      connectionChanges = [];
      fittedMetaRoomId = null;
      inspectedAgentId = null;
      inspectedRoomId = null;
      dom.metaroom.replaceChildren();
      restartPolling(true);
      render();
    }
  );
  ObservatoryState.subscribe(
    state => state.selection.creature &&
      state.selection.creature.key,
    () => {
      trace = [];
      inspectedAgentId = null;
      inspectedRoomId = null;
      if (tabActive) poll(true);
    }
  );

  render();
  window.EcologyWorkspace = Object.freeze({
    poll,
    render,
    getSnapshot: () => latest,
    getTrace: () => trace.slice()
  });
})();
