// fake_engine.cjs — synthetic Developer Tools server for browser tests
//
// Serves the real tools/ files and answers the REST API with invented data, so
// interaction tests run without proprietary game data. Values tick and drift
// like a live world, because the bugs these tests guard against only appear
// when polled panels re-render underneath the user.
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const TOOLS_DIR = path.resolve(__dirname, "..", "..");
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".md": "text/markdown",
  ".png": "image/png"
};
const DRIVES = [
  "Pain", "Hunger (Protein)", "Hunger (Carb)", "Hunger (Fat)", "Coldness",
  "Hotness", "Tiredness", "Sleepiness", "Loneliness", "Crowdedness", "Fear",
  "Boredom", "Anger", "Sex Drive", "Comfort", "Up", "Down", "Exit", "Enter",
  "Wait"
];

function ruleBytes() {
  return Array(48).fill(0);
}

function geneFixture(id, type, subtype, data, names) {
  return {
    id, type, subtype,
    typeName: names[0],
    subtypeName: names[1],
    generation: 0,
    switchOnTime: 0,
    switchOnLabel: "Baby",
    mutability: 0,
    variant: 0,
    flagsRaw: 0,
    flags: {
      mutable: true, dupable: true, cutable: true,
      maleOnly: false, femaleOnly: false, dormant: false
    },
    data
  };
}

function genomeFixture(name) {
  const lobe = (id, lobeName) => geneFixture(id, 0, 0, {
    lobeName, x: id * 4, y: id * 4, width: 8, height: 4, updateTime: 4,
    red: 200, green: 100, blue: 50, wta: 0, tissue: 0, initAlways: 0,
    initRule: [], initRuleBytes: ruleBytes(),
    updateRule: [], updateRuleBytes: ruleBytes()
  }, ["Brain", "Lobe"]);
  return {
    moniker: name,
    genes: [
      lobe(1, "driv"),
      lobe(2, "smel"),
      lobe(3, "decn"),
      geneFixture(1, 1, 4, { chemical: 3, amount: 128 },
        ["Biochemistry", "InitConc"]),
      geneFixture(1, 2, 1, {
        genus: 1, motherMoniker: "", fatherMoniker: ""
      }, ["Creature", "Genus"])
    ],
    geneCount: 5
  };
}

function createEngine(options) {
  const opts = options || {};
  const state = {
    name: opts.world || "Synthetic World",
    generation: 1,
    tick: 1000,
    systemTick: 200,
    paused: false,
    speed: 1,
    reviews: new Set(),
    worlds: new Set([opts.world || "Synthetic World"]),
    experimental: new Map(),
    requests: [],
    // Knobs for reproducing timing and world conditions.
    genomeDelayMs: 0,
    compileMapDelayMs: 0,
    tractDelayMs: {},
    scriptDelayMs: {},
    ecologyAgentIds: [500],
    downFootOutsideRooms: false,
    breakpoints: []
  };
  const streamId = "1700000000000-4242";
  const sseClients = new Set();
  let logId = 0;
  const creatures = [
    { agentId: 101, moniker: "001-fake-aaaaa", name: "Ada" },
    { agentId: 102, moniker: "002-fake-bbbbb", name: "Boris" },
    { agentId: 103, moniker: "003-fake-ccccc", name: "Cleo" }
  ];

  const sessionId = () => streamId + "." + state.generation;
  const wave = (seed, scale) =>
    0.5 + 0.45 * Math.sin((state.tick + seed * 137) / (scale || 40));
  const creature = id => creatures.find(item => item.agentId === Number(id));

  function creatureRow(item, index) {
    return Object.assign({}, item, {
      family: 4, genus: 1, species: 1, sex: 1 + index % 2,
      age: 4, ageInTicks: 40000 + index,
      lifeState: "alert", dead: false,
      health: 0.8, healthMeaning: "life force",
      glycogenReserve: 0.4, glycogenChemicalId: 4,
      posX: 1000 + index * 50, posY: 2000, roomId: 7, metaRoomId: 3,
      drives: DRIVES.map((_, id) => wave(id + index)),
      highestDrive: 1
    });
  }

  function observation(item) {
    const row = creatureRow(item, creatures.indexOf(item));
    const candidates = [
      { id: 1, label: "fruit", activity: 0.87 },
      { id: 0, label: "self", activity: 0 }
    ];
    const lobe = lobeName => ({
      lobe: lobeName, available: true,
      winnerId: null, winnerLabel: null, winnerActivity: null,
      candidates
    });
    return {
      schemaVersion: 1,
      source: "GET /api/creature/:id/observation",
      contextTiming: "engine_main_thread",
      capturedAtWallTimeMs: Date.now(),
      worldName: state.name,
      worldTick: state.tick,
      systemTick: state.systemTick,
      enginePaused: state.paused,
      gameSpeed: state.speed,
      creature: {
        agentId: item.agentId, moniker: item.moniker, name: item.name,
        lifeState: "alert", ageStage: 4, ageInTicks: 40000,
        posX: row.posX, posY: row.posY, roomId: 7, metaRoomId: 3
      },
      environment: {
        roomId: 7, metaRoomId: 3, nearbySameRoomCount: 1,
        nearby: [{
          agentId: 500, family: 2, genus: 8, species: 1, gallery: "food",
          isCreature: false, posX: 1100, posY: 2000, distanceSquared: 100
        }],
        nearbyTruncated: false,
        caRoomId: state.downFootOutsideRooms ? null : 7,
        caSamplePoint: "down_foot",
        caChannels: state.downFootOutsideRooms ? [] :
          Array.from({ length: 20 }, (_, id) => ({
            id,
            categoryId: id === 0 ? null : id,
            label: id === 0 ? "Sound" : "Category " + id,
            value: id === 0 ? 0 : wave(id)
          }))
      },
      perception: { channels: [lobe("visn"), lobe("smel"), lobe("noun")] },
      pressure: {
        drives: DRIVES.map((label, id) => ({
          id, label, value: wave(id)
        })),
        highestDriveId: 1,
        highestDriveLabel: DRIVES[1],
        highestDriveValue: wave(1)
      },
      attention: {
        available: true, lobe: "attn", winnerId: 11, winnerLabel: "food",
        winnerActivity: 0.4, motorAttentionId: 11, introspective: false,
        candidates: [{ id: 11, label: "food", activity: 0.4 }],
        currentTarget: state.tick % 200 < 100 ? {
          agentId: 500, categoryId: 11, categoryLabel: "food", family: 2,
          genus: 8, species: 1, gallery: "food", isCreature: false,
          metaRoomId: 3, posX: 1100, posY: 2000, roomId: 7
        } : null
      },
      selection: {
        available: true, lobe: "decn", winnerId: 4, winnerLabel: "Approach",
        winnerActivity: 0.3, currentActionOffset: 12,
        currentInvoluntaryAction: -1,
        candidates: [{ id: 4, label: "Approach", activity: 0.3 }]
      },
      action: {
        running: true, state: "blocking", blockReason: "WAIT tick delay",
        blockingCommand: "WAIT", ip: 10, itAtScriptStart: 500,
        targ: item.agentId, sourceStatement: "stop",
        script: { family: 4, genus: 0, species: 0, event: 28 }
      }
    };
  }

  function snapshot() {
    return {
      schemaVersion: 1,
      source: "GET /api/creatures/snapshot",
      contextTiming: "engine_main_thread",
      capturedAtWallTimeMs: Date.now(),
      worldName: state.name,
      worldTick: state.tick,
      systemTick: state.systemTick,
      enginePaused: state.paused,
      gameSpeed: state.speed,
      requestedChemicalIds: [],
      creatures: creatures.map((item, index) => Object.assign(
        creatureRow(item, index), {
          currentAttentionId: 11, currentDecisionId: 4,
          currentTargetAgentId: null, currentTargetCategory: null,
          actionState: "blocking", blockingCommand: "WAIT",
          topChemicals: [{ id: 3, value: 0.4 }], selectedChemicals: [],
          organCount: 2, functioningOrgans: 2, failedOrgans: 0
        }))
    };
  }

  function chemistry() {
    return {
      schemaVersion: 1,
      source: "GET /api/creature/:id/chemistry",
      contextTiming: "engine_main_thread",
      capturedAtWallTimeMs: Date.now(),
      worldName: state.name,
      worldTick: state.tick,
      systemTick: state.systemTick,
      chemicals: Array.from({ length: 256 }, (_, id) =>
        id > 0 && id < 40 ? wave(id, 90) : 0),
      organCount: 2,
      organs: [0, 1].map(index => ({
        index, clockRate: 0.5, lifeForce: 0.9,
        shortTermLifeForce: 900, longTermLifeForce: 950, energyCost: 0.01,
        functioning: true, failed: false,
        receptorCount: 1, emitterCount: 1, reactionCount: 0
      }))
    };
  }

  function organs() {
    return {
      organCount: 2,
      organs: chemistry().organs.map(organ => Object.assign({}, organ, {
        initialLifeForce: 1000, longTermRateOfRepair: 0.1,
        damageDueToZeroEnergy: 0, receptors: [], emitters: [], reactions: []
      }))
    };
  }

  function brain() {
    const lobes = ["driv", "smel", "decn"].map((name, index) => ({
      index, name, neuronCount: 4, winner: 0,
      x: index * 10, y: 5, width: 8, height: 4,
      colour: [200, 100, 50],
      labels: ["self", "fruit", "food", "toy"]
    }));
    return {
      lobes,
      tracts: [
        {
          index: 0, name: "tract-0", dendriteCount: 2,
          srcLobe: "driv", dstLobe: "decn"
        },
        {
          index: 1, name: "tract-1", dendriteCount: 2,
          srcLobe: "smel", dstLobe: "decn"
        }
      ]
    };
  }

  function lobeDetail(index) {
    const lobe = brain().lobes[Number(index)] || brain().lobes[0];
    return {
      name: lobe.name, neuronCount: 4, winner: 0, labels: lobe.labels,
      neurons: lobe.labels.map((label, id) => ({
        id, label,
        states: Array.from({ length: 8 }, (_, slot) => wave(id + slot))
      }))
    };
  }

  function ecology() {
    return {
      schemaVersion: 1,
      source: "GET /api/ecology/snapshot",
      contextTiming: "engine_main_thread",
      readOnly: true,
      capturedAtWallTimeMs: Date.now(),
      worldName: state.name,
      worldTick: state.tick,
      systemTick: state.systemTick,
      enginePaused: state.paused,
      gameSpeed: state.speed,
      selectedMetaRoomId: 3,
      viewport: null,
      limits: {
        agentLimit: 1000, channelLimit: 8, connectionLimit: 1000,
        roomLimit: 1000
      },
      metaRooms: [{
        id: 3, x: 0, y: 0, width: 4000, height: 3000, roomCount: 2,
        current: true
      }],
      roomCount: 2,
      matchingRoomCount: 2,
      roomsTruncated: false,
      rooms: [7, 8].map((id, index) => ({
        id, metaRoomId: 3, type: 1,
        left: index * 1000, right: index * 1000 + 1000,
        ceilingLeft: 1000, ceilingRight: 1000,
        floorLeft: 3000, floorRight: 3000, ca: []
      })),
      matchingConnectionCount: 1,
      connectionsTruncated: false,
      connections: [{
        kind: "door", roomA: 7, roomB: 8, doorType: 0, permeability: 100,
        startX: 1000, startY: 1000, endX: 1000, endY: 3000
      }],
      channels: [],
      matchingAgentCount: state.ecologyAgentIds.length,
      agentsTruncated: false,
      agents: state.ecologyAgentIds.map((agentId, index) => ({
        agentId, family: 2, genus: 8, species: 1, gallery: "food",
        isCreature: false, isVehicle: false, metaRoomId: 3, roomId: 7,
        posX: 1100 + index * 300, posY: 2000, worldCategoryId: 11,
        worldCategoryLabel: "food", caChannelId: null, caEmission: null
      }))
    };
  }

  function genomeFiles() {
    return ["norn.fake.48"].map(name => ({
      name, isCore: true, isExperimental: false, metadataStatus: "absent",
      origin: "protected_original", sourceName: null
    })).concat(Array.from(state.experimental.values()).map(copy => ({
      name: copy.moniker, isCore: false, isExperimental: true,
      metadataStatus: "verified", origin: "copy",
      sourceName: "norn.fake.48"
    })));
  }

  function genomeFile(name) {
    const copy = state.experimental.get(name);
    if (copy) {
      return Object.assign({}, copy, {
        identity: {
          checksum: "fnv1a64:" + String(copy.revision).padStart(16, "0"),
          checksumAlgorithm: "FNV-1a-64",
          currentName: name,
          format: "dna3",
          isExperimental: true,
          isProtected: false,
          metadataStatus: "verified",
          origin: "copy",
          sourceName: "norn.fake.48",
          sourceChecksum: "fnv1a64:0000000000000000",
          secondParentName: null,
          secondParentChecksum: null
        }
      });
    }
    return Object.assign(genomeFixture(name), {
      identity: {
        checksum: "fnv1a64:0000000000000000",
        checksumAlgorithm: "FNV-1a-64",
        currentName: name,
        format: "dna3",
        isExperimental: false,
        isProtected: true,
        metadataStatus: "absent",
        origin: "protected_original",
        sourceName: null,
        sourceChecksum: null
      }
    });
  }

  function respond(response, status, body, type) {
    const data = typeof body === "string" ? body : JSON.stringify(body);
    response.writeHead(status, { "Content-Type": type || "application/json" });
    response.end(data);
  }

  function pushLog(message, categoryMask, extra) {
    const record = Object.assign({
      schemaVersion: 2, kind: "record", source: "flight_recorder",
      legacy: false, categoryMask, severity: "info", subsystem: "caos",
      message, recordId: ++logId, streamId,
      wallTimeMs: Date.now(), receivedAtWallTimeMs: Date.now(),
      worldName: state.name, worldSessionId: sessionId(),
      worldTick: state.tick, systemTick: state.systemTick,
      enginePaused: state.paused, gameSpeed: state.speed,
      agent: null, script: null, correlationId: null,
      contextTiming: "nearest_engine_poll"
    }, extra || {});
    const line = "id: " + record.recordId + "\ndata: " +
      JSON.stringify(record) + "\n\n";
    sseClients.forEach(client => client.write(line));
  }

  function handleGet(url, response) {
    const route = url.pathname;
    const creatureRoute = /^\/api\/creature\/(\d+)\/(.+)$/.exec(route);
    if (creatureRoute) {
      const item = creature(creatureRoute[1]);
      if (!item) return respond(response, 200, { error: "Creature not found" });
      const rest = creatureRoute[2];
      if (rest === "observation") return respond(response, 200, observation(item));
      if (rest === "chemistry") return respond(response, 200, chemistry());
      if (rest === "organs") return respond(response, 200, organs());
      if (rest === "brain") return respond(response, 200, brain());
      if (rest === "genome") {
        return respond(response, 200, Object.assign(
          genomeFixture(item.moniker), { sex: 1, genus: 0 }));
      }
      const lobeRoute = /^brain\/lobe\/(\d+)$/.exec(rest);
      if (lobeRoute) return respond(response, 200, lobeDetail(lobeRoute[1]));
      const tractRoute = /^brain\/tract\/(\d+)$/.exec(rest);
      if (tractRoute) {
        const index = Number(tractRoute[1]);
        setTimeout(() => respond(response, 200, {
          name: "tract-" + index, srcLobe: "driv", dstLobe: "decn",
          dendriteCount: 2, dendritesReturned: 2,
          dendrites: [0, 1].map(id => ({
            id, src: id, dst: id, weights: Array(8).fill(0.2)
          }))
        }), state.tractDelayMs[index] || 0);
        return undefined;
      }
      return respond(response, 404, { error: "Unknown creature route" });
    }
    const agentRoute = /^\/api\/agent\/(\d+)$/.exec(route);
    if (agentRoute) {
      const item = creature(agentRoute[1]);
      if (!item) return respond(response, 200, { error: "Agent not found" });
      return respond(response, 200, {
        id: item.agentId, family: 4, genus: 1, species: 1, gallery: "norn",
        posx: 1000, posy: 2000, running: true, paused: false, blocking: true,
        ip: 0, sourcePos: 0, breakpoints: [],
        scriptFamily: 4, scriptGenus: 0, scriptSpecies: 0, scriptEvent: 28,
        // Each agent runs a different script, so their maps differ.
        source: "setv va00 " + item.agentId + " wait 1 stop"
      });
    }
    const scriptRoute =
      /^\/api\/scriptorium\/(\d+)\/(\d+)\/(\d+)\/(\d+)$/.exec(route);
    if (scriptRoute) {
      const event = Number(scriptRoute[4]);
      setTimeout(() => respond(response, 200, {
        source: "outs \"script " + event + "\"",
        checksum: "fnv1a64:" + String(event).padStart(16, "0")
      }), state.scriptDelayMs[event] || 0);
      return undefined;
    }
    const genomeRoute = /^\/api\/genetics\/file\/(.+)$/.exec(route);
    if (genomeRoute) {
      setTimeout(() => respond(response, 200,
        genomeFile(decodeURIComponent(genomeRoute[1]))), state.genomeDelayMs);
      return undefined;
    }
    switch (route) {
    case "/api/session":
      return respond(response, 200, {
        worldName: state.name,
        worldSessionId: sessionId(),
        worldType: "undocked",
        worldTick: state.tick,
        systemTick: state.systemTick,
        paused: state.paused,
        gameSpeed: state.speed,
        creatureCount: creatures.length,
        loadPending: false,
        requestedWorldName: null,
        requestedWorldType: null
      });
    case "/api/engine-state":
      return respond(response, 200, { paused: state.paused });
    case "/api/creatures":
      return respond(response, 200, creatures.map(creatureRow));
    case "/api/creatures/snapshot":
      return respond(response, 200, snapshot());
    case "/api/ecology/snapshot":
      return respond(response, 200, ecology());
    case "/api/scripts":
      return respond(response, 200, []);
    case "/api/scriptorium":
      return respond(response, 200, [9, 10].map(event => ({
        family: 2, genus: 7, species: 1, event
      })));
    case "/api/agent-names":
      return respond(response, 200, {});
    case "/api/caos-commands":
      return respond(response, 200, []);
    case "/api/worlds":
      return respond(response, 200, {
        currentWorld: state.name,
        worldTick: state.tick,
        worlds: Array.from(state.worlds)
      });
    case "/api/world/tick":
      return respond(response, 200, {
        worldTick: state.tick, systemTick: state.systemTick,
        worldName: state.name
      });
    case "/api/world/stats":
      return respond(response, 200, {
        worldTick: state.tick, systemTick: state.systemTick,
        worldName: state.name, creatureCount: creatures.length, norns: 3,
        grendels: 0, ettins: 0, males: 2, females: 1, babies: 0, children: 0,
        adolescents: 0, adults: 3, old: 0, dead: 0,
        paused: state.paused, gameSpeed: state.speed
      });
    case "/api/experiment/context":
      return respond(response, 200, {
        schemaVersion: 1,
        source: "GET /api/experiment/context",
        capturedAtWallTimeMs: Date.now(),
        worldName: state.name,
        worldSessionId: sessionId(),
        worldTick: state.tick,
        systemTick: state.systemTick,
        enginePaused: state.paused,
        gameSpeed: state.speed,
        engineBuildIdentifier: "fixture",
        engineBuildIdentifierSource: "Synthetic test engine",
        gameBuildIdentifier: null,
        launch: {
          headless: true, developerTools: true, mcp: false, options: [],
          pathValuesOmitted: true
        },
        limitations: []
      });
    case "/api/genetics/files":
      return respond(response, 200, genomeFiles());
    case "/api/events":
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache"
      });
      response.write(": connected\n\n");
      sseClients.add(response);
      response.on("close", () => sseClients.delete(response));
      return undefined;
    default:
      return respond(response, 404, { error: "Unknown fixture route " + route });
    }
  }

  function handlePost(url, body, response) {
    const route = url.pathname;
    let request = {};
    try {
      request = body ? JSON.parse(body) : {};
    } catch (_) {
      request = {};
    }
    state.requests.push({ route, request });
    switch (route) {
    case "/api/compile-map":
      setTimeout(() => {
        const offset = request.caos ? request.caos.indexOf("wait") : 0;
        respond(response, 200, {
          ok: true, map: { 0: 0, [offset + 100]: offset }
        });
      }, state.compileMapDelayMs);
      return undefined;
    case "/api/breakpoint":
      state.breakpoints.push(request);
      return respond(response, 200, { ok: true, breakpoints: [request.ip] });
    case "/api/pause":
      state.paused = true;
      return respond(response, 200, { ok: true, paused: true });
    case "/api/resume":
      state.paused = false;
      return respond(response, 200, { ok: true, paused: false });
    case "/api/engine/tickrate":
      state.speed = Number(request.multiplier) || 1;
      return respond(response, 200, { ok: true, multiplier: state.speed });
    case "/api/caos/validate":
      return respond(response, 200, {
        ok: true,
        validationIsSafety: false,
        sourceChecksum: null,
        error: null,
        location: null,
        risk: {
          level: "read-only", requiresAcknowledgement: false,
          warning: "", operations: [], source: "compiled"
        }
      });
    case "/api/genetics/copy": {
      const derivedName = request.derivedName || request.name ||
        request.newName || "copy";
      state.experimental.set(derivedName, Object.assign(
        genomeFixture(derivedName), { revision: 1 }));
      return respond(response, 200, {
        ok: true, status: "success", moniker: derivedName,
        derivedName, checksum: "fnv1a64:0000000000000001",
        worldTick: state.tick
      });
    }
    case "/api/genetics/save-experiment": {
      const name = request.saveName || request.moniker;
      const copy = state.experimental.get(name);
      if (!copy) {
        return respond(response, 200, {
          ok: false, error: "Ordinary save is restricted"
        });
      }
      copy.genes = request.genes;
      copy.geneCount = request.genes.length;
      copy.revision += 1;
      return respond(response, 200, {
        ok: true, status: "success", moniker: name,
        checksum: "fnv1a64:" + String(copy.revision).padStart(16, "0"),
        worldTick: state.tick
      });
    }
    case "/api/genetics/rename":
      return respond(response, 200, { error: "Cannot rename core genome" });
    case "/api/genetics/inject": {
      if (!request.reviewId || state.reviews.has(request.reviewId)) {
        return respond(response, 200, {
          ok: false,
          error: "This reviewed injection was already used; review it again"
        });
      }
      if (request.reviewedWorldSessionId !== sessionId()) {
        return respond(response, 200, {
          ok: false,
          error: "The world was reloaded after this review; review it again"
        });
      }
      state.reviews.add(request.reviewId);
      return respond(response, 200, {
        ok: true, status: "success", worldTick: state.tick,
        derivedChecksum: request.expectedChecksum,
        result: {
          agentId: 900 + state.reviews.size, isCreature: true,
          moniker: "synthetic-injected"
        }
      });
    }
    case "/api/world/branch":
      if (request.confirmedSourceWorld !== state.name ||
          request.reviewedWorldSessionId !== sessionId()) {
        return respond(response, 200, {
          ok: false, stage: "validation",
          error: "The world was reloaded after this review; review it again"
        });
      }
      state.worlds.add(request.name);
      return respond(response, 200, {
        ok: true, stage: "complete", sourceWorld: state.name,
        branchWorld: request.name, worldTick: state.tick, loaded: false
      });
    case "/api/world/load":
      if (!state.worlds.has(request.name)) {
        return respond(response, 200, { ok: false, error: "Unknown world" });
      }
      state.name = request.name;
      state.generation += 1;
      return respond(response, 200, {
        ok: true, loading: request.name, worldType: "undocked"
      });
    default:
      return respond(response, 404, { ok: false, error: "Unknown route " + route });
    }
  }

  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      if (request.method === "GET") return handleGet(url, response);
      let body = "";
      request.on("data", chunk => { body += chunk; });
      request.on("end", () => handlePost(url, body, response));
      return undefined;
    }
    const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const file = path.normalize(path.join(TOOLS_DIR, relative));
    if (!file.startsWith(TOOLS_DIR) || !fs.existsSync(file) ||
        !fs.statSync(file).isFile()) {
      return respond(response, 404, "Not found", "text/plain");
    }
    response.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] || "application/octet-stream"
    });
    fs.createReadStream(file).pipe(response);
    return undefined;
  });

  const ticker = setInterval(() => {
    if (!state.paused) state.tick += Math.round(5 * state.speed);
    state.systemTick += 1;
  }, 100);
  const logs = setInterval(() => {
    pushLog("Synthetic log line at tick " + state.tick, 8);
  }, 1000);

  return {
    state,
    pushLog,
    reloadWorld(tick) {
      state.generation += 1;
      state.tick = tick == null ? 5 : tick;
    },
    listen() {
      return new Promise(resolve => {
        server.listen(0, "127.0.0.1", () =>
          resolve("http://127.0.0.1:" + server.address().port + "/"));
      });
    },
    close() {
      clearInterval(ticker);
      clearInterval(logs);
      sseClients.forEach(client => client.destroy());
      server.closeAllConnections();
      return new Promise(resolve => server.close(resolve));
    }
  };
}

module.exports = { createEngine };
