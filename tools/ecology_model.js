// ecology_model.js — pure transforms for the read-only world observatory
"use strict";

(function(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.EcologyModel = api;
})(typeof window !== "undefined" ? window :
  (typeof globalThis !== "undefined" ? globalThis : this), function() {
  const TRACE_LIMIT = 80;

  function number(value, fallback) {
    if (value == null || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeSnapshot(payload) {
    const source = payload || {};
    const rooms = Array.isArray(source.rooms) ? source.rooms : [];
    const connections = Array.isArray(source.connections)
      ? source.connections : [];
    const agents = Array.isArray(source.agents) ? source.agents : [];
    const channels = Array.isArray(source.channels) ? source.channels : [];
    return {
      schemaVersion: source.schemaVersion || 1,
      source: source.source || "GET /api/ecology/snapshot",
      worldName: source.worldName || "",
      worldTick: number(source.worldTick, null),
      systemTick: number(source.systemTick, null),
      capturedAtWallTimeMs: number(source.capturedAtWallTimeMs, null),
      selectedMetaRoomId: number(source.selectedMetaRoomId, null),
      metaRooms: Array.isArray(source.metaRooms) ? source.metaRooms : [],
      rooms,
      connections,
      agents,
      channels,
      roomCount: number(source.roomCount, rooms.length),
      matchingRoomCount: number(source.matchingRoomCount, rooms.length),
      matchingAgentCount: number(source.matchingAgentCount, agents.length),
      matchingConnectionCount: number(
        source.matchingConnectionCount, connections.length),
      roomsTruncated: Boolean(source.roomsTruncated),
      agentsTruncated: Boolean(source.agentsTruncated),
      connectionsTruncated: Boolean(source.connectionsTruncated),
      readOnly: source.readOnly === true,
      limits: source.limits || {},
      error: source.error || null
    };
  }

  function channelName(channel) {
    if (!channel) return "No CA channel";
    return channel.worldCategoryLabel
      ? channel.worldCategoryLabel + " · CA " + channel.id
      : "CA " + channel.id + " · meaning unknown";
  }

  function roomPolygon(room) {
    if (!room) return "";
    return [
      [room.left, room.ceilingLeft],
      [room.right, room.ceilingRight],
      [room.right, room.floorRight],
      [room.left, room.floorLeft]
    ].map(point => point.join(",")).join(" ");
  }

  function roomById(snapshot, roomId) {
    if (roomId == null) return null;
    return snapshot.rooms.find(room => Number(room.id) === Number(roomId))
      || null;
  }

  function agentById(snapshot, agentId) {
    if (agentId == null) return null;
    return snapshot.agents.find(agent =>
      Number(agent.agentId) === Number(agentId)) || null;
  }

  function connectionKey(connection) {
    const ends = [number(connection.roomA, -1),
      number(connection.roomB, -1)].sort((a, b) => a - b);
    return connection.kind + ":" + ends.join(":");
  }

  function graph(snapshot, minimumPermeability) {
    const threshold = number(minimumPermeability, 1);
    const knownRooms = new Set(snapshot.rooms.map(room => Number(room.id)));
    const adjacency = new Map();
    knownRooms.forEach(id => adjacency.set(id, []));
    snapshot.connections.forEach(connection => {
      const roomA = number(connection.roomA, -1);
      const roomB = number(connection.roomB, -1);
      if (!knownRooms.has(roomA) || !knownRooms.has(roomB)) return;
      const edge = {
        key: connectionKey(connection),
        kind: connection.kind,
        roomA,
        roomB,
        permeability: number(connection.permeability, 0),
        traversable: number(connection.permeability, 0) >= threshold,
        raw: connection
      };
      adjacency.get(roomA).push(edge);
      adjacency.get(roomB).push(edge);
    });
    return adjacency;
  }

  function candidatePath(snapshot, sourceRoomId, targetRoomId,
      minimumPermeability) {
    const source = number(sourceRoomId, -1);
    const target = number(targetRoomId, -1);
    if (source < 0 || target < 0) {
      return {
        status: "unavailable",
        reason: "Source and target rooms are both required.",
        rooms: [],
        connections: [],
        method: "none"
      };
    }
    if (source === target) {
      return {
        status: "same-room",
        reason: null,
        rooms: [source],
        connections: [],
        method: "same observed room"
      };
    }
    const adjacency = graph(snapshot, minimumPermeability);
    if (!adjacency.has(source) || !adjacency.has(target)) {
      return {
        status: "unavailable",
        reason: "One or both rooms are outside the bounded map sample.",
        rooms: [],
        connections: [],
        method: "none"
      };
    }
    const queue = [source];
    const previous = new Map([[source, null]]);
    while (queue.length) {
      const room = queue.shift();
      const edges = adjacency.get(room) || [];
      for (const edge of edges) {
        if (!edge.traversable) continue;
        const next = edge.roomA === room ? edge.roomB : edge.roomA;
        if (previous.has(next)) continue;
        previous.set(next, { room, edge });
        if (next === target) {
          queue.length = 0;
          break;
        }
        queue.push(next);
      }
    }
    if (!previous.has(target)) {
      const blocked = snapshot.connections.filter(connection => {
        const belowThreshold = number(connection.permeability, 0) <
          number(minimumPermeability, 1);
        return belowThreshold && (
          [source, target].includes(number(connection.roomA, -1)) ||
          [source, target].includes(number(connection.roomB, -1))
        );
      });
      return {
        status: "disconnected",
        reason: "No connection chain meets the chosen permeability threshold.",
        rooms: [],
        connections: [],
        blocked,
        method: "derived breadth-first connectivity"
      };
    }
    const rooms = [target];
    const connections = [];
    let cursor = target;
    while (cursor !== source) {
      const step = previous.get(cursor);
      connections.unshift(step.edge);
      rooms.unshift(step.room);
      cursor = step.room;
    }
    return {
      status: "candidate",
      reason: null,
      rooms,
      connections,
      method: "derived breadth-first connectivity; not an engine-selected route"
    };
  }

  function reachableAgents(snapshot, sourceRoomId, options) {
    const opts = options || {};
    const adjacency = graph(snapshot, opts.minimumPermeability);
    const source = number(sourceRoomId, -1);
    if (!adjacency.has(source)) return [];
    const reached = new Set([source]);
    const queue = [source];
    while (queue.length) {
      const room = queue.shift();
      (adjacency.get(room) || []).forEach(edge => {
        if (!edge.traversable) return;
        const next = edge.roomA === room ? edge.roomB : edge.roomA;
        if (!reached.has(next)) {
          reached.add(next);
          queue.push(next);
        }
      });
    }
    return snapshot.agents.filter(agent => {
      if (!reached.has(number(agent.roomId, -1))) return false;
      if (opts.creaturesOnly && !agent.isCreature) return false;
      if (opts.family != null && Number(agent.family) !== Number(opts.family))
        return false;
      if (opts.genus != null && Number(agent.genus) !== Number(opts.genus))
        return false;
      if (opts.species != null &&
          Number(agent.species) !== Number(opts.species)) return false;
      return true;
    });
  }

  function channelSample(room, channelId) {
    if (!room || !Array.isArray(room.ca)) return null;
    return room.ca.find(sample =>
      Number(sample.channelId) === Number(channelId)) || null;
  }

  function compareRooms(snapshot, sourceRoomId, targetRoomId, channelId) {
    const source = roomById(snapshot, sourceRoomId);
    const target = roomById(snapshot, targetRoomId);
    const sourceSample = channelSample(source, channelId);
    const targetSample = channelSample(target, channelId);
    return {
      source,
      target,
      sourceSample,
      targetSample,
      difference: sourceSample && targetSample &&
          Number.isFinite(Number(sourceSample.value)) &&
          Number.isFinite(Number(targetSample.value))
        ? Number(targetSample.value) - Number(sourceSample.value)
        : null,
      method: "target room sample minus source room sample"
    };
  }

  function creatureRelative(snapshot, observation, channelId) {
    const creature = observation && observation.creature;
    const environment = observation && observation.environment;
    const attention = observation && observation.attention;
    const perception = observation && observation.perception;
    const sourceRoom = roomById(snapshot,
      creature ? creature.roomId : environment && environment.roomId);
    const selectedAgent = creature
      ? agentById(snapshot, creature.agentId) : null;
    const target = attention && attention.currentTarget;
    const targetAgent = target ? agentById(snapshot, target.agentId) : null;
    const roomSample = channelSample(sourceRoom, channelId);
    const sensoryChannel = environment &&
      Array.isArray(environment.caChannels)
      ? environment.caChannels.find(channel =>
          Number(channel.id) === Number(channelId))
      : null;
    const sensoryLobes = perception &&
      Array.isArray(perception.channels) ? perception.channels : [];
    const smellLobe = sensoryLobes.find(channel => channel.lobe === "smel");
    const channels = environment && Array.isArray(environment.caChannels)
      ? environment.caChannels : [];
    const strongestChannel = channels.reduce((best, channel) =>
      Number(channel.value) > Number(best ? best.value : 0) ? channel : best,
    null);
    const strongestSmell = smellLobe && Array.isArray(smellLobe.candidates)
      ? smellLobe.candidates.find(candidate => Number(candidate.activity) > 0) ||
        null
      : null;
    return {
      objective: {
        evidence: "observed",
        creature: selectedAgent,
        target: targetAgent,
        room: sourceRoom,
        roomSample
      },
      sampledAtCreature: {
        evidence: "observed",
        roomId: environment
          ? (environment.caRoomId !== undefined
            ? environment.caRoomId : environment.roomId)
          : null,
        available: channels.length > 0,
        channel: sensoryChannel,
        strongestChannel,
        source: "GET /api/creature/:id/observation"
      },
      sensoryAvailability: smellLobe && smellLobe.available
        ? {
            evidence: "observed",
            available: true,
            winnerId: smellLobe.winnerId,
            winnerLabel: smellLobe.winnerLabel,
            winnerActivity: smellLobe.winnerActivity,
            strongest: strongestSmell,
            note: smellLobe.winnerId == null
              ? "Smell neurons are inputs, so the lobe has no winner. Activity does not prove perception of a particular visible source."
              : "Smell-lobe activity is observed; it does not prove perception of a particular visible source."
          }
        : {
            evidence: "unknown",
            available: false,
            note: "No smell-lobe sample is available."
          },
      inferredRelevance: target
        ? {
            evidence: "inferred",
            label: "Current target may be behaviorally relevant",
            support: "The engine reports this agent as IT at the sample tick; global visibility alone is not used. Attention moves often, so this changes between samples."
          }
        : {
            evidence: "unknown",
            label: "No current target was observed",
            support: "Nothing held the creature's attention at this tick, which is common between targets. No relevance is inferred from map proximity."
          }
    };
  }

  function sampleFreshness(snapshot, now, expectedIntervalMs) {
    const captured = number(snapshot.capturedAtWallTimeMs, null);
    if (captured == null) return {
      status: "unknown", ageMs: null, label: "capture time unknown"
    };
    const ageMs = Math.max(0, number(now, Date.now()) - captured);
    const interval = Math.max(1, number(expectedIntervalMs, 3000));
    return {
      status: ageMs > interval * 2 ? "stale" : "fresh",
      ageMs,
      label: ageMs > interval * 2
        ? "stale · " + Math.round(ageMs / 1000) + " s old"
        : "fresh · " + Math.round(ageMs / 1000) + " s old"
    };
  }

  function updateTrace(history, snapshot, selectedAgentId) {
    const previous = Array.isArray(history) ? history : [];
    const agent = agentById(snapshot, selectedAgentId);
    if (!agent) return previous.slice(-TRACE_LIMIT);
    const point = {
      agentId: Number(selectedAgentId),
      worldTick: snapshot.worldTick,
      metaRoomId: agent.metaRoomId,
      roomId: agent.roomId,
      x: number(agent.posX, 0),
      y: number(agent.posY, 0)
    };
    const last = previous[previous.length - 1];
    if (last && last.worldTick === point.worldTick) return previous;
    if (last && (last.metaRoomId !== point.metaRoomId ||
        snapshot.worldTick < last.worldTick)) return [point];
    return previous.concat([point]).slice(-TRACE_LIMIT);
  }

  return Object.freeze({
    TRACE_LIMIT,
    normalizeSnapshot,
    channelName,
    roomPolygon,
    roomById,
    agentById,
    graph,
    candidatePath,
    reachableAgents,
    compareRooms,
    creatureRelative,
    sampleFreshness,
    updateTrace
  });
});
