// observatory_state.js — shared session, selection, sample, and evidence state
// Zero-dependency observable store for the Developer Tools observatory.
"use strict";

(function(root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    if (root) root.ObservatoryState = api.defaultStore;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
    const HISTORY_LIMIT = 120;
    const INTERVENTION_LIMIT = 200;
    const REQUEST_CACHE_LIMIT = 64;
    const SELECTION_KINDS = Object.freeze([
        "creature", "agent", "script", "event", "classifier", "gallery",
        "room", "metaroom", "chemical", "brainElement", "neuron", "tract",
        "organ", "reaction", "receptor", "emitter", "genome", "gene",
        "logRecord", "timelineEvent"
    ]);
    const GLOBAL_SELECTIONS = new Set(["chemical", "classifier", "gallery"]);
    const WORLD_SCOPED_SELECTIONS = Object.freeze([
        "creature", "agent", "script", "event", "room", "metaroom",
        "brainElement", "neuron", "tract", "organ", "reaction", "receptor",
        "emitter", "genome", "gene", "logRecord", "timelineEvent"
    ]);

    const EVIDENCE_LEVELS = Object.freeze({
        observed: Object.freeze({
            label: "Observed",
            description: "Read directly from the engine at the stated world tick.",
            accessibleName: "Observed evidence: read directly from the engine",
            example: "A Norn's glucose concentration returned by the chemistry endpoint."
        }),
        derived: Object.freeze({
            label: "Derived",
            description: "Calculated from observed engine values using a stated method.",
            accessibleName: "Derived evidence: calculated from observed engine values",
            example: "Change in hunger calculated from two polled drive samples."
        }),
        inferred: Object.freeze({
            label: "Inferred",
            description: "A labelled interpretation supported by evidence, not a direct engine fact.",
            accessibleName: "Inferred evidence: an interpretation supported by engine evidence",
            example: "Likely seeking food, inferred from hunger, the winning decision, and movement."
        }),
        unknown: Object.freeze({
            label: "Unknown",
            description: "The source, time, or interpretation is not known well enough to classify.",
            accessibleName: "Unknown evidence: source or interpretation is not established",
            example: "A legacy panel value whose capture tick was not recorded."
        })
    });

    function isoTime(value) {
        const date = value == null ? new Date() : new Date(value);
        if (!Number.isFinite(date.getTime())) {
            throw new TypeError("Wall time must be a valid ISO-8601 date");
        }
        return date.toISOString();
    }

    function integerTick(value, fieldName) {
        if (value == null || value === "") {
            throw new TypeError((fieldName || "tick") + " must be a finite number");
        }
        const tick = Number(value);
        if (!Number.isFinite(tick)) {
            throw new TypeError((fieldName || "tick") + " must be a finite number");
        }
        return Math.trunc(tick);
    }

    function compoundKey(worldName, localId) {
        if (worldName == null || String(worldName).length === 0) {
            throw new TypeError("A world name is required for a compound key");
        }
        if (localId == null || String(localId).length === 0) {
            throw new TypeError("A local identity is required for a compound key");
        }
        return String(worldName) + ":" + String(localId);
    }

    function deepFreeze(value, seen) {
        if (value == null || typeof value !== "object" || Object.isFrozen(value)) return value;
        const visited = seen || new Set();
        if (visited.has(value)) return value;
        visited.add(value);
        Object.keys(value).forEach(key => deepFreeze(value[key], visited));
        return Object.freeze(value);
    }

    function createEvidence(level, options) {
        const opts = options || {};
        if (!Object.prototype.hasOwnProperty.call(EVIDENCE_LEVELS, level)) {
            throw new TypeError("Evidence level must be observed, derived, inferred, or unknown");
        }
        if (!opts.source || typeof opts.source !== "string") {
            throw new TypeError("Evidence requires a source endpoint or engine event");
        }
        if (level === "inferred") {
            if (!opts.inferenceLabel || typeof opts.inferenceLabel !== "string") {
                throw new TypeError("Inferred evidence requires an inference label");
            }
            if (!Array.isArray(opts.supportingEvidence) || opts.supportingEvidence.length === 0) {
                throw new TypeError("Inferred evidence requires supporting evidence");
            }
        }
        if (opts.heuristic && opts.confidence == null) {
            throw new TypeError("Heuristic evidence requires confidence");
        }
        if (opts.confidence != null &&
            (!Number.isFinite(Number(opts.confidence)) ||
             Number(opts.confidence) < 0 || Number(opts.confidence) > 1)) {
            throw new TypeError("Evidence confidence must be between 0 and 1");
        }

        const evidence = {
            level,
            label: EVIDENCE_LEVELS[level].label,
            source: opts.source,
            worldKey: opts.worldKey == null ? null : String(opts.worldKey),
            tick: opts.tick == null ? null : integerTick(opts.tick),
            capturedAt: isoTime(opts.capturedAt),
            sampleIntervalMs: opts.sampleIntervalMs == null
                ? null
                : Math.max(0, integerTick(opts.sampleIntervalMs, "sampleIntervalMs")),
            method: opts.method == null ? null : String(opts.method),
            inferenceLabel: opts.inferenceLabel == null ? null : String(opts.inferenceLabel),
            supportingEvidence: Array.isArray(opts.supportingEvidence)
                ? opts.supportingEvidence.slice()
                : [],
            confidence: opts.confidence == null ? null : Number(opts.confidence),
            heuristic: Boolean(opts.heuristic)
        };
        return deepFreeze(evidence);
    }

    function emptySelections() {
        const selection = { primary: null };
        SELECTION_KINDS.forEach(kind => { selection[kind] = null; });
        return selection;
    }

    function createInitialState() {
        return deepFreeze({
            connection: {
                status: "disconnected",
                changedAt: null,
                error: null
            },
            engine: {
                paused: null
            },
            world: {
                identity: null,
                status: "none",
                tick: null,
                systemTick: null,
                speed: null,
                transition: null
            },
            selection: emptySelections(),
            samples: {
                current: {},
                history: {}
            },
            recording: {
                active: false,
                startedAt: null,
                sampleIntervalMs: null
            },
            experiment: {
                id: null,
                name: null,
                status: "idle",
                startedAt: null
            },
            interventions: [],
            navigation: {
                origin: null,
                returnTarget: null
            },
            preferences: {
                timebase: "worldTicks",
                freshnessMultiplier: 2,
                reducedMotion: false,
                density: "comfortable",
                shortcutsEnabled: true
            }
        });
    }

    function staleSamples(samples, reason) {
        const current = {};
        Object.keys(samples.current).forEach(key => {
            current[key] = Object.assign({}, samples.current[key], {
                stale: true,
                staleReason: reason
            });
        });
        return { current, history: samples.history };
    }

    function clearWorldState(state, world) {
        const selection = Object.assign({}, state.selection);
        WORLD_SCOPED_SELECTIONS.forEach(kind => { selection[kind] = null; });
        if (selection.primary &&
            WORLD_SCOPED_SELECTIONS.includes(selection.primary.kind)) {
            selection.primary = null;
        }
        return Object.assign({}, state, {
            world,
            selection,
            samples: { current: {}, history: {} },
            recording: Object.assign({}, state.recording, {
                active: false,
                startedAt: null
            }),
            navigation: { origin: null, returnTarget: null }
        });
    }

    function worldFromPayload(payload, previous) {
        const rawName = payload && (payload.name != null ? payload.name : payload.worldName);
        const name = rawName == null || String(rawName).length === 0 ? null : String(rawName);
        const type = payload && (payload.type != null ? payload.type : payload.worldType);
        const previousIdentity = previous && previous.identity;
        const sessionId = payload && payload.worldSessionId != null
            ? String(payload.worldSessionId)
            : (previousIdentity && previousIdentity.name === name
                ? previousIdentity.sessionId
                : null);
        // The key names one load of a world, not the world: reloading a save
        // rewinds time, so everything keyed to it must be discarded.
        const identity = name == null ? null : {
            name,
            type: type == null ? (name === "Startup" ? "startup" : null) : String(type),
            sessionId,
            key: sessionId ? name + "@" + sessionId : name
        };
        return {
            identity,
            status: name == null ? "none" : (name === "Startup" ? "startup" : "loaded"),
            tick: payload && payload.tick != null
                ? integerTick(payload.tick)
                : payload && payload.worldTick != null
                    ? integerTick(payload.worldTick)
                    : (previous ? previous.tick : null),
            systemTick: payload && payload.systemTick != null
                ? integerTick(payload.systemTick, "systemTick")
                : (previous ? previous.systemTick : null),
            speed: payload && payload.speed != null
                ? Number(payload.speed)
                : payload && payload.gameSpeed != null
                    ? Number(payload.gameSpeed)
                    : (previous ? previous.speed : null),
            transition: null
        };
    }

    function normalizedSelection(kind, value, state, details) {
        if (!SELECTION_KINDS.includes(kind)) {
            throw new TypeError("Unknown selection kind: " + kind);
        }
        if (value == null) return null;
        if (GLOBAL_SELECTIONS.has(kind)) {
            return deepFreeze(Object.assign({}, details || {}, {
                id: value,
                key: String(value)
            }));
        }
        if (!state.world.identity) {
            throw new Error("Cannot select " + kind + " without an active world");
        }
        return deepFreeze(Object.assign({}, details || {}, {
            id: value,
            worldKey: state.world.identity.key,
            key: compoundKey(state.world.identity.key, value)
        }));
    }

    function restoredSelections(snapshot, state) {
        const restored = emptySelections();
        const source = snapshot || {};
        SELECTION_KINDS.forEach(kind => {
            const selection = source[kind];
            if (!selection) return;
            if (selection.worldKey &&
                (!state.world.identity ||
                 selection.worldKey !== state.world.identity.key)) {
                return;
            }
            restored[kind] = Object.assign({}, selection);
        });
        const primary = source.primary;
        if (primary && SELECTION_KINDS.includes(primary.kind)) {
            const selected = restored[primary.kind];
            if (selected && selected.key === primary.key) {
                restored.primary = {
                    kind: primary.kind,
                    key: primary.key
                };
            }
        }
        return restored;
    }

    function normalizedIntervention(record, state) {
        if (!record.id || !record.type || !record.source) {
            throw new TypeError("Interventions require id, type, and source provenance");
        }
        const worldKey = record.worldKey ||
            (state.world.identity && state.world.identity.key);
        if (!worldKey) throw new Error("Interventions require world identity");
        return {
            id: String(record.id),
            type: String(record.type),
            target: record.target == null ? null : record.target,
            worldKey: String(worldKey),
            tick: integerTick(
                record.tick != null ? record.tick : state.world.tick,
                "intervention tick"
            ),
            performedAt: isoTime(record.performedAt),
            source: String(record.source),
            parameters: record.parameters == null ? {} : record.parameters,
            reason: record.reason == null ? null : String(record.reason),
            result: record.result == null ? null : record.result
        };
    }

    function reduce(state, action) {
        if (!action || typeof action.type !== "string") {
            throw new TypeError("Actions require a type");
        }
        const payload = action.payload || {};
        let next = state;

        switch (action.type) {
        case "connection/status": {
            const status = payload.status;
            if (!["connecting", "connected", "disconnected"].includes(status)) {
                throw new TypeError("Unknown connection status: " + status);
            }
            const error = payload.error == null ? null : String(payload.error);
            if (state.connection.status === status &&
                state.connection.error === error) {
                return state;
            }
            next = Object.assign({}, state, {
                connection: {
                    status,
                    changedAt: isoTime(payload.changedAt),
                    error
                }
            });
            if (status === "disconnected" && state.connection.status !== "disconnected") {
                next = clearWorldState(next, Object.assign({}, state.world, {
                    status: state.world.status === "loading"
                        ? "loading"
                        : (state.world.identity ? "disconnected" : "none"),
                    transition: state.world.status === "loading"
                        ? state.world.transition
                        : null
                }));
                next = Object.assign({}, next, {
                    samples: staleSamples(state.samples, "disconnected")
                });
            }
            break;
        }
        case "engine/pause": {
            const paused = Boolean(payload.paused);
            if (state.engine.paused === paused) return state;
            next = Object.assign({}, state, {
                engine: { paused }
            });
            break;
        }
        case "world/loading": {
            const targetName = payload.name == null ? null : String(payload.name);
            const targetType = payload.type == null ? null : String(payload.type);
            const existing = state.world.transition;
            const startedAt = existing && existing.targetName === targetName
                ? existing.startedAt
                : isoTime(payload.startedAt);
            next = clearWorldState(state, Object.assign({}, state.world, {
                status: "loading",
                transition: {
                    targetName,
                    targetType,
                    startedAt
                }
            }));
            break;
        }
        case "world/session": {
            const world = worldFromPayload(payload, state.world);
            const targetName = payload.requestedWorldName == null
                ? null
                : String(payload.requestedWorldName);
            const hasPendingLoad = Boolean(payload.loadPending) && targetName;
            const enteringTransition = hasPendingLoad &&
                (!state.world.transition ||
                 state.world.transition.targetName !== targetName);
            if (hasPendingLoad) {
                const existing = state.world.transition;
                world.status = "loading";
                world.transition = {
                    targetName,
                    targetType: payload.requestedWorldType == null
                        ? null
                        : String(payload.requestedWorldType),
                    startedAt: existing && existing.targetName === targetName
                        ? existing.startedAt
                        : isoTime(payload.capturedAt)
                };
            }
            const oldKey = state.world.identity && state.world.identity.key;
            const newKey = world.identity && world.identity.key;
            next = oldKey !== newKey || enteringTransition
                ? clearWorldState(state, world) :
                Object.assign({}, state, { world });
            break;
        }
        case "world/sync": {
            const world = worldFromPayload(payload, state.world);
            const oldKey = state.world.identity && state.world.identity.key;
            const newKey = world.identity && world.identity.key;
            next = oldKey !== newKey ? clearWorldState(state, world) :
                Object.assign({}, state, { world });
            break;
        }
        case "selection/set": {
            const selection = Object.assign({}, state.selection);
            selection[payload.kind] = normalizedSelection(
                payload.kind, payload.value, state, payload.details
            );
            if (selection.primary &&
                selection.primary.kind === payload.kind &&
                selection[payload.kind] == null) {
                selection.primary = null;
            }
            next = Object.assign({}, state, { selection });
            break;
        }
        case "selection/primary": {
            if (payload.kind == null) {
                next = Object.assign({}, state, {
                    selection: Object.assign({}, state.selection, { primary: null })
                });
                break;
            }
            const kind = String(payload.kind);
            if (!SELECTION_KINDS.includes(kind) || !state.selection[kind]) {
                throw new Error("Primary selection must reference an active selection");
            }
            next = Object.assign({}, state, {
                selection: Object.assign({}, state.selection, {
                    primary: {
                        kind,
                        key: state.selection[kind].key
                    }
                })
            });
            break;
        }
        case "selection/restore":
            next = Object.assign({}, state, {
                selection: restoredSelections(payload.selection, state)
            });
            break;
        case "sample/received": {
            const sample = payload.sample;
            if (!sample || !sample.key || !sample.evidence) {
                throw new TypeError("Stored samples require a key and evidence metadata");
            }
            if (!state.world.identity || sample.worldKey !== state.world.identity.key) {
                return state;
            }
            const previous = state.samples.current[sample.key];
            if (previous && previous.worldKey === sample.worldKey && previous.tick > sample.tick) {
                return state;
            }
            const current = Object.assign({}, state.samples.current, {
                [sample.key]: sample
            });
            const oldHistory = state.samples.history[sample.key] || [];
            const history = Object.assign({}, state.samples.history, {
                [sample.key]: oldHistory.concat([sample]).slice(-HISTORY_LIMIT)
            });
            next = Object.assign({}, state, { samples: { current, history } });
            break;
        }
        case "sample/stale": {
            const key = String(payload.key || "");
            const sample = state.samples.current[key];
            if (!sample || sample.stale) return state;
            const current = Object.assign({}, state.samples.current, {
                [key]: Object.assign({}, sample, {
                    stale: true,
                    staleReason: payload.reason == null
                        ? "poll-failed"
                        : String(payload.reason)
                })
            });
            next = Object.assign({}, state, {
                samples: {
                    current,
                    history: state.samples.history
                }
            });
            break;
        }
        case "recording/set":
            next = Object.assign({}, state, {
                recording: Object.assign({}, state.recording, payload)
            });
            break;
        case "experiment/set":
            next = Object.assign({}, state, {
                experiment: Object.assign({}, state.experiment, payload)
            });
            break;
        case "intervention/add":
            next = Object.assign({}, state, {
                interventions: state.interventions
                    .concat([normalizedIntervention(payload, state)])
                    .slice(-INTERVENTION_LIMIT)
            });
            break;
        case "navigation/set":
            next = Object.assign({}, state, {
                navigation: {
                    origin: payload.origin == null ? null : payload.origin,
                    returnTarget: payload.returnTarget == null ? null : payload.returnTarget
                }
            });
            break;
        case "preference/set": {
            if (!payload.key) throw new TypeError("Preference updates require a key");
            next = Object.assign({}, state, {
                preferences: Object.assign({}, state.preferences, {
                    [payload.key]: payload.value
                })
            });
            break;
        }
        default:
            throw new TypeError("Unknown ObservatoryState action: " + action.type);
        }

        return next === state ? state : deepFreeze(next);
    }

    function sampleFreshness(sample, state, options) {
        const opts = options || {};
        if (!sample) return deepFreeze({ status: "unknown", reason: "no-sample", ageMs: null });
        if (!state || state.connection.status !== "connected") {
            return deepFreeze({ status: "stale", reason: "disconnected", ageMs: null });
        }
        if (!state.world.identity || sample.worldKey !== state.world.identity.key) {
            return deepFreeze({ status: "stale", reason: "different-world", ageMs: null });
        }
        if (sample.stale) {
            return deepFreeze({ status: "stale", reason: sample.staleReason || "marked-stale", ageMs: null });
        }
        const nowMs = opts.now == null ? Date.now() : new Date(opts.now).getTime();
        const ageMs = Math.max(0, nowMs - new Date(sample.capturedAt).getTime());
        const interval = sample.sampleIntervalMs == null ? 0 : sample.sampleIntervalMs;
        const multiplier = state.preferences.freshnessMultiplier || 2;
        const threshold = opts.staleAfterMs == null
            ? Math.max(1000, interval * multiplier)
            : Math.max(0, Number(opts.staleAfterMs));
        return deepFreeze({
            status: ageMs <= threshold ? "fresh" : "stale",
            reason: ageMs <= threshold ? "within-interval" : "age-exceeded",
            ageMs,
            staleAfterMs: threshold
        });
    }

    function createStore(options) {
        const opts = options || {};
        let state = opts.initialState ? deepFreeze(opts.initialState) : createInitialState();
        const subscriptions = new Set();
        const inFlight = new Map();
        const requestCache = new Map();

        function getState() {
            return state;
        }

        function dispatch(action) {
            const previous = state;
            const next = reduce(previous, action);
            if (next === previous) return state;
            state = next;
            subscriptions.forEach(subscription => {
                const selected = subscription.selector(state);
                if (!subscription.equals(selected, subscription.value)) {
                    const priorValue = subscription.value;
                    subscription.value = selected;
                    try {
                        subscription.listener(selected, priorValue, state);
                    } catch (error) {
                        if (typeof console !== "undefined" && console.error) {
                            console.error("ObservatoryState subscription error:", error);
                        }
                    }
                }
            });
            return state;
        }

        function subscribe(selector, listener, equals) {
            if (typeof listener !== "function") {
                listener = selector;
                selector = value => value;
            }
            if (typeof selector !== "function" || typeof listener !== "function") {
                throw new TypeError("subscribe requires a selector and listener");
            }
            const subscription = {
                selector,
                listener,
                equals: equals || Object.is,
                value: selector(state)
            };
            subscriptions.add(subscription);
            return function unsubscribe() {
                subscriptions.delete(subscription);
            };
        }

        function select(kind, value, details, makePrimary) {
            dispatch({
                type: "selection/set",
                payload: { kind, value, details }
            });
            if (state.selection[kind] && makePrimary) {
                dispatch({
                    type: "selection/primary",
                    payload: { kind }
                });
            }
            return state.selection[kind];
        }

        function setPrimary(kind) {
            dispatch({
                type: "selection/primary",
                payload: { kind }
            });
            return state.selection.primary;
        }

        function addIntervention(record) {
            const next = dispatch({
                type: "intervention/add",
                payload: record
            });
            return next.interventions[next.interventions.length - 1];
        }

        function recordSample(key, value, metadata) {
            const meta = metadata || {};
            const worldKey = meta.worldKey ||
                (state.world.identity && state.world.identity.key);
            if (!worldKey) throw new Error("Stored samples require world identity");
            const tick = integerTick(
                meta.tick != null ? meta.tick : state.world.tick,
                "sample tick"
            );
            const capturedAt = isoTime(meta.capturedAt);
            const evidenceOptions = Object.assign({}, meta.evidence || {}, {
                worldKey,
                tick,
                capturedAt,
                sampleIntervalMs: meta.sampleIntervalMs
            });
            const evidence = createEvidence(meta.evidenceLevel || "unknown", evidenceOptions);
            const sample = deepFreeze({
                key: String(key),
                value,
                worldKey: String(worldKey),
                tick,
                capturedAt,
                sampleIntervalMs: meta.sampleIntervalMs == null
                    ? null
                    : Math.max(0, integerTick(meta.sampleIntervalMs, "sampleIntervalMs")),
                evidence,
                stale: false,
                staleReason: null
            });
            dispatch({ type: "sample/received", payload: { sample } });
            return state.samples.current[key] || null;
        }

        function requestShared(key, loader, metadata) {
            const requestKey = String(key);
            const requestedMetadata = metadata || {};
            const cached = requestCache.get(requestKey);
            if (requestedMetadata.store === false &&
                requestedMetadata.cacheForMs > 0 &&
                cached &&
                Date.now() - cached.storedAt <= requestedMetadata.cacheForMs) {
                return Promise.resolve(cached.value);
            }
            if (inFlight.has(requestKey)) return inFlight.get(requestKey);
            if (typeof loader !== "function") {
                return Promise.reject(new TypeError("requestShared requires a loader"));
            }
            const promise = Promise.resolve()
                .then(loader)
                .then(result => {
                    const envelope = result && result.__observatorySample === true
                        ? result
                        : { value: result, metadata: {} };
                    const combined = Object.assign({}, requestedMetadata, envelope.metadata || {});
                    if (combined.store === false) {
                        if (combined.cacheForMs > 0) {
                            requestCache.delete(requestKey);
                            requestCache.set(requestKey, {
                                value: envelope.value,
                                storedAt: Date.now()
                            });
                            while (requestCache.size > REQUEST_CACHE_LIMIT) {
                                requestCache.delete(requestCache.keys().next().value);
                            }
                        }
                        return envelope.value;
                    }
                    return recordSample(requestKey, envelope.value, combined);
                })
                .finally(() => {
                    if (inFlight.get(requestKey) === promise) inFlight.delete(requestKey);
                });
            inFlight.set(requestKey, promise);
            return promise;
        }

        function sample(value, metadata) {
            return {
                __observatorySample: true,
                value,
                metadata: metadata || {}
            };
        }

        return Object.freeze({
            getState,
            dispatch,
            subscribe,
            select,
            setPrimary,
            addIntervention,
            recordSample,
            requestShared,
            sample,
            freshness(sampleValue, freshnessOptions) {
                return sampleFreshness(sampleValue, state, freshnessOptions);
            }
        });
    }

    function positionEvidenceHelp(dialog, anchor) {
        if (!anchor || typeof anchor.getBoundingClientRect !== "function") return;
        const viewportPadding = 12;
        const gap = 8;
        const anchorRect = anchor.getBoundingClientRect();
        const dialogWidth = dialog.offsetWidth;
        const availableHeight = Math.max(
            180,
            window.innerHeight - anchorRect.bottom - gap - viewportPadding
        );
        dialog.style.maxHeight = availableHeight + "px";

        const left = Math.max(
            viewportPadding,
            Math.min(
                anchorRect.right - dialogWidth,
                window.innerWidth - dialogWidth - viewportPadding
            )
        );
        dialog.style.left = left + "px";
        dialog.style.top = (anchorRect.bottom + gap) + "px";
    }

    function openEvidenceHelp(anchorOrEvent) {
        if (typeof document === "undefined") return;
        const anchor = anchorOrEvent && anchorOrEvent.currentTarget
            ? anchorOrEvent.currentTarget
            : anchorOrEvent && typeof anchorOrEvent.getBoundingClientRect === "function"
                ? anchorOrEvent
                : document.getElementById("btn-evidence-help");
        if (typeof window !== "undefined" && window.ContextualHelp) {
            window.ContextualHelp.open("concept.evidence-levels", anchor);
            return;
        }
        let dialog = document.getElementById("observatory-evidence-help");
        if (!dialog) {
            dialog = document.createElement("dialog");
            dialog.id = "observatory-evidence-help";
            dialog.className = "evidence-help";
            dialog.setAttribute("aria-labelledby", "observatory-evidence-help-title");
            const title = document.createElement("h2");
            title.id = "observatory-evidence-help-title";
            title.textContent = "Evidence levels";
            dialog.appendChild(title);
            Object.keys(EVIDENCE_LEVELS).forEach(level => {
                const definition = EVIDENCE_LEVELS[level];
                const section = document.createElement("section");
                const heading = document.createElement("h3");
                heading.textContent = definition.label;
                const description = document.createElement("p");
                description.textContent = definition.description;
                const example = document.createElement("p");
                example.className = "evidence-help__example";
                example.textContent = "Creatures example: " + definition.example;
                section.append(heading, description, example);
                dialog.appendChild(section);
            });
            const close = document.createElement("button");
            close.type = "button";
            close.className = "btn";
            close.textContent = "Close";
            close.addEventListener("click", () => {
                if (typeof dialog.close === "function") dialog.close();
                else dialog.removeAttribute("open");
            });
            dialog.appendChild(close);
            dialog.addEventListener("click", event => {
                const rect = dialog.getBoundingClientRect();
                const outside = event.clientX < rect.left ||
                    event.clientX > rect.right ||
                    event.clientY < rect.top ||
                    event.clientY > rect.bottom;
                if (!outside) return;
                if (typeof dialog.close === "function") dialog.close();
                else dialog.removeAttribute("open");
            });
            window.addEventListener("resize", () => {
                if (dialog.open && dialog.__evidenceAnchor) {
                    positionEvidenceHelp(dialog, dialog.__evidenceAnchor);
                }
            });
            document.body.appendChild(dialog);
        }
        dialog.__evidenceAnchor = anchor;
        if (typeof dialog.showModal === "function") dialog.showModal();
        else dialog.setAttribute("open", "");
        positionEvidenceHelp(dialog, anchor);
    }

    function createEvidenceBadge(evidenceOrLevel) {
        if (typeof document === "undefined") return null;
        const level = typeof evidenceOrLevel === "string"
            ? evidenceOrLevel
            : evidenceOrLevel && evidenceOrLevel.level;
        const definition = EVIDENCE_LEVELS[level] || EVIDENCE_LEVELS.unknown;
        const badge = document.createElement("button");
        badge.type = "button";
        badge.className = "evidence-badge evidence-badge--" +
            (EVIDENCE_LEVELS[level] ? level : "unknown");
        badge.dataset.helpId = "concept.evidence-levels";
        badge.textContent = definition.label;
        badge.setAttribute("aria-label", definition.accessibleName + ". Open evidence help.");
        badge.setAttribute("aria-keyshortcuts", "F1");
        badge.title = definition.description;
        badge.addEventListener("click", openEvidenceHelp);
        return badge;
    }

    const defaultStoreCore = createStore();
    const defaultStore = Object.freeze(Object.assign({}, defaultStoreCore, {
        EVIDENCE_LEVELS,
        createEvidence,
        createEvidenceBadge,
        openEvidenceHelp,
        compoundKey,
        sampleFreshness,
        HISTORY_LIMIT,
        SELECTION_KINDS,
        WORLD_SCOPED_SELECTIONS
    }));

    return {
        createStore,
        createInitialState,
        reduce,
        createEvidence,
        sampleFreshness,
        compoundKey,
        EVIDENCE_LEVELS,
        HISTORY_LIMIT,
        SELECTION_KINDS,
        WORLD_SCOPED_SELECTIONS,
        defaultStore
    };
});
