// observatory_navigation.js — shared cross-tool routes and investigation history
"use strict";

(function(root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    if (root) root.ObservatoryNavigation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
    const ROUTE_PREFIX = "#observe?";
    const ROUTE_SELECTION_KINDS = Object.freeze([
        "creature", "agent", "script", "event", "classifier", "gallery",
        "room", "metaroom", "chemical", "brainElement", "neuron", "tract",
        "organ", "reaction", "receptor", "emitter", "genome", "gene",
        "logRecord", "timelineEvent"
    ]);
    const CONTEXT_ORDER = Object.freeze([
        "creature", "agent", "script", "event", "room", "metaroom",
        "chemical", "brainElement", "neuron", "tract", "organ", "reaction",
        "receptor", "emitter", "genome", "gene", "classifier", "gallery",
        "logRecord", "timelineEvent"
    ]);
    const NAVIGATION_GROUPS = Object.freeze([
        Object.freeze({
            id: "observe",
            label: "Observe",
            description: "Orient to the world and follow live evidence."
        }),
        Object.freeze({
            id: "experiment",
            label: "Experiment",
            description: "Plan, review, and record deliberate world changes."
        }),
        Object.freeze({
            id: "develop",
            label: "Develop",
            description: "Author CAOS and diagnose engine execution."
        }),
        Object.freeze({
            id: "learn",
            label: "Learn",
            description: "Use task guides, references, and architecture."
        })
    ]);
    const ROUTE_DEFINITIONS = Object.freeze([
        {
            id: "dashboard", group: "observe", tab: "dashboard",
            view: "overview", label: "Overview",
            description: "Live world, investigation, recording, and diagnostic summary.",
            activity: "observe", capabilities: [],
            help: "observatory_navigation_dashboard.md", defaultForTab: true
        },
        {
            id: "creatures", group: "observe", tab: "creatures",
            view: "drives", label: "Creatures",
            description: "Observe one creature's present biology and behavior.",
            activity: "observe", capabilities: ["connected", "world"],
            help: "tab_creatures.md", defaultForTab: true
        },
        {
            id: "timeline", group: "observe", tab: "timeline",
            label: "Ethology timeline",
            description: "Review retained behavioral evidence on world ticks.",
            activity: "observe", capabilities: ["connected", "world", "creature"],
            help: "ethology_timeline.md", defaultForTab: true
        },
        {
            id: "compare", group: "observe", tab: "compare",
            label: "Compare",
            description: "Compare individuals, retained ranges, or a cohort.",
            activity: "observe", capabilities: ["connected", "world"],
            help: "creature_cohort_comparison.md", defaultForTab: true
        },
        {
            id: "ecology", group: "observe", tab: "ecology",
            label: "World & ecology",
            description: "Inspect rooms, CA fields, agents, and affordances.",
            activity: "observe", capabilities: ["connected", "world"],
            help: "world_ecology_observatory.md", defaultForTab: true
        },
        {
            id: "scripts", group: "observe", tab: "scripts",
            label: "Running scripts",
            description: "Follow active, blocked, paused, and recently finished VMs.",
            activity: "observe", capabilities: ["connected", "world"],
            help: "tab_scripts.md", defaultForTab: true
        },
        {
            id: "logs", group: "observe", tab: "log",
            label: "Logs",
            description: "Inspect tick-correlated engine and API records.",
            activity: "observe", capabilities: ["connected"],
            help: "tab_log.md", defaultForTab: true
        },
        {
            id: "experiments", group: "experiment", tab: "experiments",
            label: "Workspaces",
            description: "Define baselines, treatments, provenance, and exports.",
            activity: "reviewed-change", capabilities: ["connected", "world"],
            help: "experiment_workspaces.md", defaultForTab: true
        },
        {
            id: "chemicals", group: "experiment", tab: "creatures",
            view: "chemistry-intervene", label: "Chemical intervention",
            description: "Preview and record one concentration change.",
            activity: "reviewed-change",
            capabilities: ["connected", "world", "creature"],
            help: "safe_chemical_interventions.md"
        },
        {
            id: "genetics", group: "experiment", tab: "genetics",
            label: "Genetics experiments",
            description: "Copy, diff, save, and inject reviewed genomes.",
            activity: "reviewed-change", capabilities: ["connected", "world"],
            help: "tab_genetics_kit.md", defaultForTab: true
        },
        {
            id: "workbench", group: "develop", tab: "ide",
            label: "CAOS Workbench",
            description: "Evaluate or mutate through explicit reviewed modes.",
            activity: "reviewed-change", capabilities: ["connected", "world"],
            help: "tab_caos_ide.md", defaultForTab: true
        },
        {
            id: "scratchpad", group: "develop", tab: "console",
            label: "Scratchpad",
            description: "Run short compile-checked read-only ownerless queries.",
            activity: "read-only", capabilities: ["connected", "world"],
            help: "tab_console.md", defaultForTab: true
        },
        {
            id: "debugger", group: "develop", tab: "debugger",
            label: "Debugger",
            description: "Inspect and step one selected running agent VM.",
            activity: "develop", capabilities: ["connected", "world"],
            help: "tab_debugger.md", defaultForTab: true
        },
        {
            id: "diagnostics", group: "develop", tab: "log",
            view: "diagnostics", label: "Engine diagnostics",
            description: "Diagnose API gaps, errors, and correlated engine context.",
            activity: "develop", capabilities: ["connected"],
            help: "tab_log.md"
        },
        {
            id: "guides", group: "learn", tab: "docs",
            view: "wiki", document: "observatory_task_guides.md",
            label: "Task guides",
            description: "Start from an investigative goal, not an implementation tab.",
            activity: "learn", capabilities: [],
            help: "observatory_task_guides.md", defaultForTab: true
        },
        {
            id: "caos-reference", group: "learn", tab: "docs",
            view: "wiki", document: "caos_overview.md",
            label: "CAOS reference",
            description: "Browse engine commands, values, and language semantics.",
            activity: "learn", capabilities: [],
            help: "caos_overview.md"
        },
        {
            id: "architecture", group: "learn", tab: "docs",
            view: "graph", label: "Architecture graph",
            description: "Map engine systems and implementation relationships.",
            activity: "learn", capabilities: [],
            help: "tools_overview.md"
        },
        {
            id: "evidence", group: "learn", tab: "docs",
            view: "wiki", document: "observatory_glossary.md",
            label: "Evidence & terms",
            description: "Understand Observed, Derived, Inferred, and Unknown.",
            activity: "learn", capabilities: [],
            help: "observatory_glossary.md"
        }
    ].map(definition => Object.freeze(Object.assign({}, definition, {
        capabilities: Object.freeze(definition.capabilities.slice())
    }))));
    const LEGACY_ROUTE_ALIASES = Object.freeze({
        "#overview": "dashboard",
        "#dashboard": "dashboard",
        "#creatures": "creatures",
        "#timeline": "timeline",
        "#compare": "compare",
        "#world": "ecology",
        "#ecology": "ecology",
        "#experiments": "experiments",
        "#genetics": "genetics",
        "#log": "logs",
        "#console": "scratchpad",
        "#scripts": "scripts",
        "#debugger": "debugger",
        "#ide": "workbench",
        "#docs": "guides"
    });

    function clone(value) {
        if (value == null) return value;
        return JSON.parse(JSON.stringify(value));
    }

    function routeSelection(value) {
        if (value == null) return null;
        if (typeof value === "object" && value.id != null) {
            return {
                id: value.id,
                details: value.details || Object.keys(value).reduce((result, key) => {
                    if (!["id", "key", "worldKey"].includes(key)) result[key] = value[key];
                    return result;
                }, {})
            };
        }
        return { id: value, details: {} };
    }

    function normalizeTime(value) {
        const source = value || {};
        function finite(field) {
            if (source[field] == null || source[field] === "") return null;
            const number = Number(source[field]);
            return Number.isFinite(number) ? Math.trunc(number) : null;
        }
        const time = {
            timebase: source.timebase == null
                ? "worldTicks" : String(source.timebase),
            cursorTick: finite("cursorTick"),
            startTick: finite("startTick"),
            endTick: finite("endTick")
        };
        return time.cursorTick == null &&
            time.startTick == null && time.endTick == null
            ? null
            : time;
    }

    function normalizeRoute(route) {
        const source = route || {};
        const selections = {};
        const incoming = source.selections || {};
        ROUTE_SELECTION_KINDS.forEach(kind => {
            const normalized = routeSelection(incoming[kind]);
            if (normalized) selections[kind] = normalized;
        });
        return {
            routeId: source.routeId == null ? null : String(source.routeId),
            tab: source.tab == null ? null : String(source.tab),
            view: source.view == null ? null : String(source.view),
            worldKey: source.worldKey == null ? null : routeWorld(source.worldKey),
            primary: source.primary == null ? null : String(source.primary),
            selections,
            document: source.document == null ? null : String(source.document),
            section: source.section == null ? null : String(source.section),
            trace: source.trace == null ? null : String(source.trace),
            time: normalizeTime(source.time),
            missing: source.missing == null ? null : clone(source.missing)
        };
    }

    // A link names a world, which outlives any one load of it, so routes drop
    // the session suffix that ObservatoryState adds to world keys.
    function routeWorld(worldKey) {
        return String(worldKey).replace(/@\d+-\d+\.\d+$/, "");
    }

    function parseIdentifier(value) {
        return /^-?\d+$/.test(value) ? Number(value) : value;
    }

    function buildRouteHref(route) {
        const normalized = normalizeRoute(route);
        const params = new URLSearchParams();
        if (normalized.routeId) params.set("route", normalized.routeId);
        if (normalized.tab) params.set("tab", normalized.tab);
        if (normalized.view) params.set("view", normalized.view);
        if (normalized.worldKey) params.set("world", normalized.worldKey);
        if (normalized.primary) params.set("primary", normalized.primary);
        if (normalized.document) params.set("doc", normalized.document);
        if (normalized.section) params.set("section", normalized.section);
        if (normalized.trace) params.set("trace", normalized.trace);
        if (normalized.time) {
            if (normalized.time.timebase !== "worldTicks")
                params.set("tb", normalized.time.timebase);
            if (normalized.time.cursorTick != null)
                params.set("at", normalized.time.cursorTick);
            if (normalized.time.startTick != null)
                params.set("from", normalized.time.startTick);
            if (normalized.time.endTick != null)
                params.set("to", normalized.time.endTick);
        }
        ROUTE_SELECTION_KINDS.forEach(kind => {
            if (normalized.selections[kind]) {
                params.set(kind, String(normalized.selections[kind].id));
            }
        });
        const creature = normalized.selections.creature;
        if (creature && creature.details) {
            if (creature.details.moniker) params.set("cm", creature.details.moniker);
            if (creature.details.genus != null) params.set("cg", creature.details.genus);
            if (creature.details.species != null) params.set("cs", creature.details.species);
        }
        const agent = normalized.selections.agent;
        if (agent && agent.details) {
            if (agent.details.family != null) params.set("af", agent.details.family);
            if (agent.details.genus != null) params.set("ag", agent.details.genus);
            if (agent.details.species != null) params.set("as", agent.details.species);
            if (agent.details.gallery) params.set("agal", agent.details.gallery);
        }
        return ROUTE_PREFIX + params.toString();
    }

    function parseRouteHash(hash) {
        const value = String(hash || "");
        if (value.startsWith("#docs/")) {
            let fragment = value.slice(6);
            try { fragment = decodeURIComponent(fragment); } catch (_) {}
            const colon = fragment.indexOf(":");
            return normalizeRoute({
                tab: "docs",
                view: "wiki",
                document: colon < 0 ? fragment : fragment.slice(0, colon),
                section: colon < 0 ? null : fragment.slice(colon + 1)
            });
        }
        if (LEGACY_ROUTE_ALIASES[value]) {
            return routeForDefinition(LEGACY_ROUTE_ALIASES[value]);
        }
        if (!value.startsWith(ROUTE_PREFIX)) return null;
        const params = new URLSearchParams(value.slice(ROUTE_PREFIX.length));
        const selections = {};
        ROUTE_SELECTION_KINDS.forEach(kind => {
            if (params.has(kind)) {
                selections[kind] = { id: parseIdentifier(params.get(kind)), details: {} };
            }
        });
        if (selections.creature) {
            selections.creature.details = {
                moniker: params.get("cm"),
                genus: params.has("cg") ? parseIdentifier(params.get("cg")) : null,
                species: params.has("cs") ? parseIdentifier(params.get("cs")) : null
            };
        }
        if (selections.agent) {
            selections.agent.details = {
                family: params.has("af") ? parseIdentifier(params.get("af")) : null,
                genus: params.has("ag") ? parseIdentifier(params.get("ag")) : null,
                species: params.has("as") ? parseIdentifier(params.get("as")) : null,
                gallery: params.get("agal")
            };
        }
        return normalizeRoute({
            routeId: params.get("route"),
            tab: params.get("tab"),
            view: params.get("view"),
            worldKey: params.get("world"),
            primary: params.get("primary"),
            document: params.get("doc"),
            section: params.get("section"),
            trace: params.get("trace"),
            time: {
                timebase: params.get("tb") || "worldTicks",
                cursorTick: params.get("at"),
                startTick: params.get("from"),
                endTick: params.get("to")
            },
            selections
        });
    }

    function routeDefinition(id) {
        return ROUTE_DEFINITIONS.find(item => item.id === id) || null;
    }

    function routeForDefinition(id, state, currentRoute) {
        const definition = routeDefinition(id);
        if (!definition) return null;
        const source = state || {};
        const selections = {};
        ROUTE_SELECTION_KINDS.forEach(kind => {
            if (source.selection && source.selection[kind])
                selections[kind] = source.selection[kind];
        });
        return normalizeRoute({
            routeId: definition.id,
            tab: definition.tab,
            view: definition.view,
            document: definition.document,
            section: definition.section,
            worldKey: source.world && source.world.identity
                ? source.world.identity.name : null,
            primary: source.selection && source.selection.primary
                ? source.selection.primary.kind : null,
            selections,
            time: currentRoute && currentRoute.time
        });
    }

    function definitionForRoute(route) {
        const normalized = normalizeRoute(route);
        const explicit = routeDefinition(normalized.routeId);
        if (explicit) return explicit;
        const exact = ROUTE_DEFINITIONS.find(definition =>
            definition.tab === normalized.tab &&
            (definition.view || null) === (normalized.view || null) &&
            (definition.document || null) === (normalized.document || null));
        if (exact) return exact;
        return ROUTE_DEFINITIONS.find(definition =>
            definition.tab === normalized.tab && definition.defaultForTab) ||
            null;
    }

    function routeAvailability(definitionOrId, state) {
        const definition = typeof definitionOrId === "string"
            ? routeDefinition(definitionOrId)
            : definitionOrId;
        if (!definition) {
            return { available: false, missing: ["route"],
                reason: "This workspace route is not registered." };
        }
        const source = state || {};
        const missing = [];
        definition.capabilities.forEach(capability => {
            if (capability === "connected" &&
                (!source.connection ||
                 source.connection.status !== "connected"))
                missing.push("engine connection");
            if (capability === "world" &&
                (!source.world || !source.world.identity ||
                 source.world.identity.name === "Startup"))
                missing.push("loaded world");
            if (capability === "creature" &&
                (!source.selection || !source.selection.creature))
                missing.push("selected creature");
        });
        return {
            available: missing.length === 0,
            missing,
            reason: missing.length
                ? "Needs " + missing.join(" and ") +
                    ". The workspace remains visible with an empty-state explanation."
                : "Available in the current context."
        };
    }

    function defaultLabel(kind, selection) {
        const id = selection.id;
        switch (kind) {
        case "creature":
            return selection.name
                ? (selection.genusName || "Creature") + " “" + selection.name + "”"
                : "Creature #" + id;
        case "agent": return "Agent #" + id;
        case "script":
            return selection.eventName
                ? "Script · " + selection.eventName
                : "Script " + id;
        case "event": return selection.name ? "Event · " + selection.name : "Event " + id;
        case "room": return "Room " + id;
        case "metaroom": return "Metaroom " + id;
        case "chemical": return selection.name ? selection.name + " · Chemical " + id : "Chemical " + id;
        case "brainElement": return selection.label || "Brain " + id;
        case "neuron": return selection.label || "Neuron " + id;
        case "tract": return selection.label || "Tract " + id;
        case "organ": return selection.label || "Organ " + id;
        case "reaction": return "Reaction " + id;
        case "receptor": return "Receptor " + id;
        case "emitter": return "Emitter " + id;
        case "genome": return selection.name || "Genome " + id;
        case "gene": return selection.label || "Gene " + id;
        case "classifier": return "Classifier " + id;
        case "gallery": return "Gallery " + id;
        case "logRecord": return "Log " + id;
        case "timelineEvent": return "Timeline " + id;
        default: return kind + " " + id;
        }
    }

    function routeForSelection(kind, selection, worldKey) {
        const tabByKind = {
            creature: "creatures",
            agent: "debugger",
            script: "debugger",
            event: "debugger",
            room: "creatures",
            metaroom: "creatures",
            chemical: "creatures",
            brainElement: "creatures",
            neuron: "creatures",
            tract: "creatures",
            organ: "creatures",
            reaction: "creatures",
            receptor: "creatures",
            emitter: "creatures",
            genome: "genetics",
            gene: "genetics",
            classifier: "scripts",
            gallery: "scripts",
            logRecord: "log",
            timelineEvent: "creatures"
        };
        const selections = {};
        selections[kind] = selection;
        if (kind === "creature") {
            selections.agent = {
                id: selection.id,
                details: {
                    family: selection.family == null ? 4 : selection.family,
                    genus: selection.genus,
                    species: selection.species,
                    name: selection.name,
                    moniker: selection.moniker
                }
            };
        }
        return normalizeRoute({
            tab: tabByKind[kind] || "creatures",
            view: kind,
            worldKey,
            primary: kind,
            selections
        });
    }

    function buildContextSegments(state, route) {
        const segments = [];
        const world = state.world && state.world.identity;
        if (world) {
            segments.push({
                kind: "world",
                key: world.key,
                label: world.name === "Startup" ? "No world" : world.name,
                title: "World context at tick " +
                    (state.world.tick == null ? "unknown" : state.world.tick),
                primary: false,
                clearable: false,
                missing: false,
                route: normalizeRoute({ tab: "creatures", worldKey: world.name })
            });
        }
        const primary = state.selection && state.selection.primary;
        CONTEXT_ORDER.forEach(kind => {
            const selection = state.selection && state.selection[kind];
            if (!selection) return;
            segments.push({
                kind,
                key: selection.key,
                label: defaultLabel(kind, selection),
                title: selection.missing
                    ? "Historical selection is no longer available: " +
                        (selection.missingReason || "target missing")
                    : "Selected " + kind + "; activate to open its related workspace",
                primary: Boolean(primary &&
                    primary.kind === kind && primary.key === selection.key),
                clearable: true,
                missing: Boolean(selection.missing),
                route: routeForSelection(kind, selection, world && world.key)
            });
        });
        const time = normalizeRoute(route).time;
        if (time) {
            const label = time.startTick != null || time.endTick != null
                ? "Ticks " +
                    (time.startTick == null ? "…" : time.startTick) + "–" +
                    (time.endTick == null ? "…" : time.endTick)
                : "Tick " + time.cursorTick;
            segments.push({
                kind: "time",
                key: [
                    time.timebase, time.cursorTick,
                    time.startTick, time.endTick
                ].join(":"),
                label,
                title: "Preserved " + time.timebase +
                    " investigation time context",
                primary: false,
                clearable: false,
                missing: false,
                route: null
            });
        }
        return segments;
    }

    function extractLogContext(message, recordId) {
        const record = message && typeof message === "object" ? message : null;
        const text = String(record ? record.message || "" : message || "");
        if (record && record.agent && record.agent.id != null) {
            const agent = record.agent;
            const script = record.script;
            const id = recordId == null ? record.id || "current" : recordId;
            const selections = {
                agent: {
                    id: Number(agent.id),
                    family: agent.family,
                    genus: agent.genus,
                    species: agent.species
                },
                logRecord: {
                    id,
                    message: text,
                    worldTick: record.worldTick,
                    wallTimeMs: record.wallTimeMs,
                    correlationId: record.correlationId
                }
            };
            if (script && script.event != null) {
                selections.script = {
                    id: [
                        agent.id,
                        script.family,
                        script.genus,
                        script.species,
                        script.event
                    ].join(":"),
                    agentId: Number(agent.id),
                    family: script.family,
                    genus: script.genus,
                    species: script.species,
                    event: Number(script.event),
                    ip: script.ip
                };
                selections.event = {
                    id: Number(script.event),
                    name: null
                };
            }
            return {
                agentId: Number(agent.id),
                event: script && script.event != null
                    ? Number(script.event)
                    : null,
                structured: true,
                selections
            };
        }
        if (record && !record.legacy) return null;
        const uniqueMatch = text.match(/\bunique\s+id\s+(\d+)\b/i);
        const agentIdMatch = text.match(/\bagent\s+#?(\d+)\b/i);
        const agentId = uniqueMatch
            ? Number(uniqueMatch[1])
            : agentIdMatch
                ? Number(agentIdMatch[1])
                : null;
        if (agentId == null) return null;

        const agentClassifier = text.match(
            /\bagent\s+(\d+)\s+(\d+)\s+(\d+)\s+script\b/i
        );
        const scriptClassifier = text.match(
            /\bscript\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\b/i
        );
        const selections = {
            agent: {
                id: agentId,
                family: agentClassifier ? Number(agentClassifier[1]) : undefined,
                genus: agentClassifier ? Number(agentClassifier[2]) : undefined,
                species: agentClassifier ? Number(agentClassifier[3]) : undefined
            },
            logRecord: {
                id: recordId == null ? "current" : recordId,
                message: text
            }
        };
        if (scriptClassifier) {
            const family = Number(scriptClassifier[1]);
            const genus = Number(scriptClassifier[2]);
            const species = Number(scriptClassifier[3]);
            const event = Number(scriptClassifier[4]);
            selections.script = {
                id: [agentId, family, genus, species, event].join(":"),
                agentId,
                family,
                genus,
                species,
                event
            };
            selections.event = {
                id: event,
                name: null
            };
        }
        return {
            agentId,
            event: scriptClassifier ? Number(scriptClassifier[4]) : null,
            structured: false,
            selections
        };
    }

    function createNavigationService(options) {
        const opts = options || {};
        const store = opts.store;
        const windowObj = opts.window ||
            (typeof window !== "undefined" ? window : null);
        const historyObj = opts.history || (windowObj && windowObj.history);
        const locationObj = opts.location || (windowObj && windowObj.location);
        if (!store) throw new TypeError("Observatory navigation requires the shared store");

        const workspaces = new Map();
        const listeners = new Set();
        let tabActivator = null;
        let activeTab = opts.activeTab || "dashboard";
        let lastRoute = routeForDefinition(
            definitionForRoute({ tab: activeTab })?.id || "dashboard"
        ) || normalizeRoute({ tab: activeTab });
        let historyPosition = 0;
        let started = false;
        let status = {
            missing: null,
            route: lastRoute,
            routeId: (definitionForRoute(lastRoute) || {}).id || null
        };

        function currentWorldKey() {
            const world = store.getState().world.identity;
            return world && world.name;
        }

        function captureWorkspace(tab) {
            const workspace = workspaces.get(tab);
            if (!workspace || typeof workspace.capture !== "function") return null;
            try {
                return clone(workspace.capture());
            } catch (_) {
                return null;
            }
        }

        function routeWithState(route) {
            const source = normalizeRoute(route || { tab: activeTab });
            const state = store.getState();
            const selections = {};
            ROUTE_SELECTION_KINDS.forEach(kind => {
                if (state.selection[kind]) selections[kind] = state.selection[kind];
            });
            return normalizeRoute(Object.assign({}, source, {
                worldKey: currentWorldKey(),
                primary: state.selection.primary
                    ? state.selection.primary.kind
                    : null,
                selections
            }));
        }

        function snapshot(route) {
            const world = store.getState().world.identity;
            return {
                route: routeWithState(route),
                selection: clone(store.getState().selection),
                workspace: captureWorkspace(activeTab),
                position: historyPosition,
                worldSessionKey: world && world.key
            };
        }

        function notify() {
            listeners.forEach(listener => {
                try { listener(status); } catch (_) {}
            });
        }

        function updateStoreNavigation(origin, target) {
            store.dispatch({
                type: "navigation/set",
                payload: {
                    origin: origin == null ? null : clone(origin),
                    returnTarget: target == null ? null : clone(target)
                }
            });
        }

        function saveCurrentEntry() {
            if (!historyObj || typeof historyObj.replaceState !== "function") return;
            const existing = historyObj.state || {};
            const saved = snapshot(lastRoute);
            historyObj.replaceState(
                Object.assign({}, existing, { observatory: saved }),
                "",
                buildRouteHref(saved.route)
            );
        }

        function activateRoute(route, savedWorkspace) {
            const normalized = normalizeRoute(route);
            const worldKey = currentWorldKey();
            if (normalized.worldKey && normalized.worldKey !== worldKey) {
                status = {
                    route: normalized,
                    routeId: (definitionForRoute(normalized) || {}).id || null,
                    missing: {
                        kind: "world",
                        id: normalized.worldKey,
                        reason: "This link belongs to world “" + normalized.worldKey +
                            "”, but “" + (worldKey || "no world") + "” is active."
                    }
                };
                notify();
                return false;
            }

            lastRoute = normalized;
            Object.keys(normalized.selections).forEach(kind => {
                const target = normalized.selections[kind];
                store.select(kind, target.id, target.details);
            });
            if (normalized.primary && store.getState().selection[normalized.primary]) {
                store.setPrimary(normalized.primary);
            }
            if (normalized.tab && tabActivator) {
                tabActivator(normalized.tab, { fromNavigation: true });
                activeTab = normalized.tab;
            }
            const workspace = workspaces.get(normalized.tab || activeTab);
            if (workspace && typeof workspace.open === "function") {
                workspace.open(normalized);
            }
            if (savedWorkspace && workspace &&
                typeof workspace.restore === "function") {
                workspace.restore(clone(savedWorkspace));
            }
            status = {
                missing: normalized.missing,
                route: normalized,
                routeId: (definitionForRoute(normalized) || {}).id || null
            };
            notify();
            return true;
        }

        function navigate(route, navigationOptions) {
            const normalized = normalizeRoute(route);
            const navOptions = navigationOptions || {};
            const origin = snapshot(lastRoute).route;
            saveCurrentEntry();
            updateStoreNavigation(origin, normalized);

            const href = buildRouteHref(normalized);
            if (historyObj) {
                const method = navOptions.replace ? "replaceState" : "pushState";
                if (!navOptions.replace) historyPosition += 1;
                if (typeof historyObj[method] === "function") {
                    historyObj[method](
                        {
                            observatory: {
                                route: normalized,
                                selection: null,
                                workspace: null,
                                position: historyPosition
                            }
                        },
                        "",
                        href
                    );
                }
            }
            const applied = activateRoute(normalized, null);
            if (applied && historyObj && typeof historyObj.replaceState === "function") {
                const saved = snapshot(normalized);
                historyObj.replaceState(
                    { observatory: saved },
                    "",
                    buildRouteHref(saved.route)
                );
            }
            return applied;
        }

        // Links are portable between loads of a world, but a history entry's
        // selections belong to the load they were made in. Going Back across
        // a reload keeps the place and drops the subjects.
        function routeForCurrentSession(saved) {
            const route = saved.route || { tab: activeTab };
            const world = store.getState().world.identity;
            if (!saved.worldSessionKey || !world ||
                saved.worldSessionKey === world.key) return route;
            return Object.assign({}, route, {
                selections: {},
                primary: null,
                missing: {
                    kind: "world",
                    id: world.name,
                    reason: "This world was reloaded after this page, " +
                        "so its selections no longer apply."
                }
            });
        }

        function restoreSnapshot(saved) {
            if (!saved) return false;
            if (Number.isInteger(saved.position)) {
                historyPosition = saved.position;
            }
            if (saved.selection) {
                store.dispatch({
                    type: "selection/restore",
                    payload: { selection: saved.selection }
                });
            }
            const route = routeForCurrentSession(saved);
            // Workspace state holds ids from the same load as the selections.
            const workspace = route === saved.route ? saved.workspace : null;
            const restored = activateRoute(route, workspace);
            if (restored) updateStoreNavigation(null, route);
            return restored;
        }

        function onPopState(event) {
            if (event && event.state && event.state.observatory) {
                restoreSnapshot(event.state.observatory);
                return;
            }
            const route = parseRouteHash(locationObj && locationObj.hash);
            if (route) activateRoute(route, null);
        }

        function start() {
            if (started) return;
            started = true;
            if (windowObj && typeof windowObj.addEventListener === "function") {
                windowObj.addEventListener("popstate", onPopState);
            }
            const deepLink = parseRouteHash(locationObj && locationObj.hash);
            if (!deepLink) {
                saveCurrentEntry();
                return;
            }
            if (deepLink.worldKey && !currentWorldKey()) {
                lastRoute = deepLink;
                status = {
                    route: deepLink,
                    routeId: (definitionForRoute(deepLink) || {}).id || null,
                    missing: {
                        kind: "world",
                        id: deepLink.worldKey,
                        reason: "Waiting for the active world before opening this link."
                    }
                };
                if (historyObj && typeof historyObj.replaceState === "function") {
                    historyObj.replaceState({
                        observatory: {
                            route: deepLink,
                            selection: null,
                            workspace: null,
                            position: historyPosition
                        }
                    }, "", buildRouteHref(deepLink));
                }
                notify();
                const unsubscribe = store.subscribe(
                    state => state.world.identity && state.world.identity.key,
                    worldKey => {
                        if (!worldKey) return;
                        unsubscribe();
                        navigate(deepLink, { replace: true });
                    }
                );
                return;
            }
            navigate(deepLink, { replace: true });
        }

        function registerWorkspace(tab, adapter) {
            const key = String(tab);
            const workspace = adapter || {};
            workspaces.set(key, workspace);
            if (key === activeTab && typeof workspace.open === "function") {
                workspace.open(lastRoute);
            }
            return function unregister() {
                workspaces.delete(key);
            };
        }

        function setTabActivator(activator) {
            tabActivator = activator;
        }

        function setActiveTab(tab) {
            activeTab = String(tab);
            if (lastRoute.tab !== activeTab) {
                lastRoute = normalizeRoute(Object.assign({}, lastRoute, {
                    tab: activeTab
                }));
            }
        }

        function clearSelection(kind) {
            store.select(kind, null);
            saveCurrentEntry();
        }

        function markMissing(kind, id, reason) {
            const selection = store.getState().selection[kind];
            if (!selection || String(selection.id) !== String(id)) return;
            const details = Object.assign({}, selection, {
                missing: true,
                missingReason: reason || "Target no longer exists"
            });
            delete details.id;
            delete details.key;
            delete details.worldKey;
            store.select(kind, id, details);
            status = {
                missing: {
                    kind,
                    id,
                    reason: details.missingReason
                }
            };
            notify();
        }

        function back() {
            if (historyObj && typeof historyObj.back === "function") historyObj.back();
        }

        function openDocs(documentName, section) {
            return navigate({
                routeId: "guides",
                tab: "docs",
                view: "wiki",
                worldKey: currentWorldKey(),
                document: documentName,
                section,
                time: lastRoute.time
            });
        }

        function navigateToRoute(routeId, navigationOptions) {
            const route = routeForDefinition(
                routeId, store.getState(), lastRoute);
            if (!route) return false;
            return navigate(route, navigationOptions);
        }

        function updateRouteContext(patch) {
            const source = patch || {};
            lastRoute = normalizeRoute(Object.assign({}, lastRoute, source, {
                time: source.time === undefined
                    ? lastRoute.time : source.time
            }));
            status = {
                missing: lastRoute.missing,
                route: lastRoute,
                routeId: (definitionForRoute(lastRoute) || {}).id || null
            };
            saveCurrentEntry();
            notify();
            return clone(lastRoute);
        }

        function subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        }

        return Object.freeze({
            start,
            navigate,
            back,
            openDocs,
            navigateToRoute,
            updateRouteContext,
            clearSelection,
            markMissing,
            registerWorkspace,
            setTabActivator,
            setActiveTab,
            subscribe,
            getStatus: () => status,
            getCurrentRoute: () => clone(lastRoute),
            getRouteDefinition: () => definitionForRoute(lastRoute),
            getActiveTab: () => activeTab,
            canGoBack: () => historyPosition > 0,
            buildRouteHref
        });
    }

    return Object.freeze({
        ROUTE_PREFIX,
        ROUTE_SELECTION_KINDS,
        CONTEXT_ORDER,
        NAVIGATION_GROUPS,
        ROUTE_DEFINITIONS,
        LEGACY_ROUTE_ALIASES,
        normalizeRoute,
        buildRouteHref,
        parseRouteHash,
        routeDefinition,
        routeForDefinition,
        definitionForRoute,
        routeAvailability,
        buildContextSegments,
        routeForSelection,
        extractLogContext,
        createNavigationService
    });
});
