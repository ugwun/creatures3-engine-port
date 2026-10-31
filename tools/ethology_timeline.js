// ethology_timeline.js — pure bounded ethology event and recording model
"use strict";

(function(root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    if (root) root.EthologyTimeline = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
    const SCHEMA_VERSION = 1;
    const RECORDING_KIND = "creatures3-ethology-recording";
    const CATEGORIES = Object.freeze([
        "environment", "perception", "neural", "action", "physiology",
        "lifecycle", "intervention", "error", "gap"
    ]);
    const DEFAULT_MAX_EVENTS = 3000;
    const DEFAULT_MAX_SNAPSHOTS = 600;
    const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;
    const DEFAULT_MAX_DURATION_TICKS = 50000;
    const DRIVE_THRESHOLDS = [0.5, 0.8];
    const PULSE_CHEMICALS = new Map([
        ["chemical:204", "Reward"],
        ["chemical:205", "Punishment"]
    ]);

    function finite(value) {
        if (value == null || value === "") return null;
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }

    function clone(value) {
        if (value == null) return value;
        return JSON.parse(JSON.stringify(value));
    }

    function approximateBytes(value) {
        try {
            return JSON.stringify(value).length * 2;
        } catch (_) {
            return String(value).length * 2;
        }
    }

    function text(value, fallback) {
        const result = String(value == null ? "" : value).trim();
        return result || fallback;
    }

    function sameValue(left, right) {
        return JSON.stringify(left) === JSON.stringify(right);
    }

    function publicEvent(event) {
        const result = {};
        Object.keys(event || {}).forEach(key => {
            if (key[0] !== "_") result[key] = clone(event[key]);
        });
        return result;
    }

    function sourceReference(observation) {
        const raw = observation && observation.rawSources &&
            observation.rawSources.endpoint || {};
        return {
            type: "creature_observation",
            source: raw.source || "GET /api/creature/:id/observation",
            worldTick: finite(raw.worldTick),
            systemTick: finite(raw.systemTick),
            capturedAtWallTimeMs: finite(raw.capturedAtWallTimeMs),
            contextTiming: raw.contextTiming || "engine_main_thread",
            schemaVersion: finite(raw.schemaVersion)
        };
    }

    function csvCell(value) {
        const textValue = value == null
            ? "" : typeof value === "string"
                ? value : JSON.stringify(value);
        return '"' + String(textValue).replace(/"/g, '""') + '"';
    }

    function serializeRecording(payload, format) {
        if (!payload) return "";
        if (format === "jsonl") {
            const lines = [{
                recordType: "metadata",
                schemaVersion: payload.schemaVersion,
                kind: payload.kind,
                exportedAt: payload.exportedAt,
                limits: payload.limits,
                session: payload.session
            }];
            (payload.events || []).forEach(event =>
                lines.push({ recordType: "event", value: event }));
            (payload.snapshots || []).forEach(snapshot =>
                lines.push({ recordType: "snapshot", value: snapshot }));
            return lines.map(value => JSON.stringify(value)).join("\n") +
                "\n";
        }
        if (format === "csv") {
            const header = [
                "id", "worldKey", "subjectKey", "category",
                "transitionKind", "label", "evidenceLevel", "explicit",
                "exactTick", "startTick", "endTick", "sampleIntervalMs",
                "uncertainty", "before", "after", "sourceRecords",
                "relatedAgents", "eventCode", "correlationId",
                "navigation", "annotation"
            ];
            const rows = [header.map(csvCell).join(",")];
            (payload.events || []).forEach(event => {
                rows.push(header.map(key => csvCell(event[key])).join(","));
            });
            return rows.join("\n") + "\n";
        }
        return JSON.stringify(payload, null, 2) + "\n";
    }

    function parseRecording(value) {
        if (typeof value !== "string") return clone(value);
        const source = value.trim();
        if (!source) throw new TypeError("Recording file is empty");
        try {
            const document = JSON.parse(source);
            if (!document.recordType) return document;
        } catch (_) {
            // JSONL is expected to fail whole-document parsing.
        }
        const records = source.split(/\r?\n/)
            .filter(Boolean).map(line => JSON.parse(line));
        const metadata = records.find(record =>
            record.recordType === "metadata");
        if (!metadata) {
            throw new TypeError("JSONL recording has no metadata record");
        }
        return {
            schemaVersion: metadata.schemaVersion,
            kind: metadata.kind,
            exportedAt: metadata.exportedAt,
            limits: metadata.limits,
            session: metadata.session,
            events: records.filter(record =>
                record.recordType === "event").map(record => record.value),
            snapshots: records.filter(record =>
                record.recordType === "snapshot")
                .map(record => record.value)
        };
    }

    function observationState(observation, physiology) {
        const raw = observation && observation.rawSources &&
            observation.rawSources.endpoint || {};
        const creature = raw.creature || {};
        const environment = raw.environment || {};
        const pressure = raw.pressure || {};
        const attention = raw.attention || {};
        const selection = raw.selection || {};
        const action = raw.action || {};
        const actionStage = observation && Array.isArray(observation.stages)
            ? observation.stages.find(stage => stage.id === "action")
            : null;
        const metrics = {};
        const supplied = physiology && Array.isArray(physiology.metrics)
            ? physiology.metrics
            : [];
        supplied.forEach(metric => {
            const value = finite(metric && metric.value);
            if (!metric || metric.id == null || value == null) return;
            metrics[String(metric.id)] = {
                id: String(metric.id),
                label: text(metric.label, String(metric.id)),
                value,
                unit: text(metric.unit, "raw"),
                largeDelta: finite(metric.largeDelta)
            };
        });
        const organs = {};
        const suppliedOrgans = physiology && Array.isArray(physiology.organs)
            ? physiology.organs
            : [];
        suppliedOrgans.forEach(organ => {
            if (!organ || organ.id == null) return;
            organs[String(organ.id)] = {
                id: String(organ.id),
                label: text(organ.label, "Organ " + organ.id),
                status: text(organ.status, "unknown"),
                lifeForce: finite(organ.lifeForce)
            };
        });
        return {
            worldTick: finite(observation && observation.worldTick),
            systemTick: finite(observation && observation.systemTick),
            wallTimeMs: finite(observation && observation.capturedAtWallTimeMs),
            enginePaused: observation && observation.enginePaused == null
                ? null : Boolean(observation && observation.enginePaused),
            gameSpeed: finite(observation && observation.gameSpeed),
            creature: {
                agentId: finite(creature.agentId),
                moniker: creature.moniker || null,
                name: creature.name || null,
                lifeState: text(creature.lifeState, "unknown"),
                ageStage: finite(creature.ageStage != null
                    ? creature.ageStage : creature.age),
                ageInTicks: finite(creature.ageInTicks),
                roomId: finite(creature.roomId != null
                    ? creature.roomId : environment.roomId),
                metaRoomId: finite(creature.metaRoomId != null
                    ? creature.metaRoomId : environment.metaRoomId),
                posX: finite(creature.posX),
                posY: finite(creature.posY)
            },
            pressure: {
                highestDriveId: finite(pressure.highestDriveId),
                highestDriveLabel: pressure.highestDriveLabel || null,
                highestDriveValue: finite(pressure.highestDriveValue),
                drives: Array.isArray(pressure.drives)
                    ? pressure.drives.map(drive => ({
                        id: finite(drive.id),
                        label: drive.label || null,
                        value: finite(drive.value)
                    })).filter(drive =>
                        drive.id != null && drive.value != null)
                    : []
            },
            attention: {
                winnerId: finite(attention.winnerId),
                winnerLabel: attention.winnerLabel || null,
                winnerActivity: finite(attention.winnerActivity),
                target: attention.currentTarget ? {
                    agentId: finite(attention.currentTarget.agentId),
                    family: finite(attention.currentTarget.family),
                    genus: finite(attention.currentTarget.genus),
                    species: finite(attention.currentTarget.species),
                    gallery: attention.currentTarget.gallery || null,
                    categoryId: finite(attention.currentTarget.categoryId),
                    categoryLabel:
                        attention.currentTarget.categoryLabel || null
                } : null
            },
            selection: {
                winnerId: finite(selection.winnerId),
                winnerLabel: selection.winnerLabel || null,
                winnerActivity: finite(selection.winnerActivity),
                currentActionOffset:
                    finite(selection.currentActionOffset)
            },
            action: {
                running: Boolean(action.running),
                state: text(action.state, "idle"),
                blockingCommand: action.blockingCommand || null,
                blockReason: action.blockReason || null,
                script: action.script ? clone(action.script) : null,
                eventLabel: actionStage
                    ? String(actionStage.summary || "").split(" · ")[0]
                    : null,
                sourceStatement: action.sourceStatement || null,
                targ: finite(action.targ),
                itAtScriptStart: finite(action.itAtScriptStart)
            },
            physiologySources: clone(
                physiology && physiology.sourceRecords || []
            ),
            metrics,
            organs
        };
    }

    function actionKey(action) {
        if (!action || !action.running || !action.script) return null;
        return [
            action.script.family,
            action.script.genus,
            action.script.species,
            action.script.event
        ].join(":");
    }

    function intervalUncertainty(previous, current) {
        return "Transition occurred between sampled ticks " +
            previous.worldTick + " and " + current.worldTick +
            "; the exact engine tick is unknown.";
    }

    function navigationFor(category, current, details) {
        const agentId = current && current.creature &&
            current.creature.agentId;
        if (category === "action") {
            const script = details && details.script;
            return {
                tab: "scripts",
                view: "activity",
                primary: "script",
                selections: {
                    creature: { id: agentId },
                    agent: { id: agentId },
                    script: {
                        id: script ? [
                            agentId, script.family, script.genus,
                            script.species, script.event
                        ].join(":") : agentId,
                        details: script || {}
                    }
                }
            };
        }
        if (category === "perception" || category === "neural") {
            return {
                tab: "creatures",
                view: "brain",
                primary: "creature",
                selections: {
                    creature: { id: agentId },
                    agent: { id: agentId }
                }
            };
        }
        if (category === "physiology") {
            const metricId = details && details.metricId || "";
            const chemical = String(metricId).startsWith("chemical:");
            const selections = {
                creature: { id: agentId },
                agent: { id: agentId }
            };
            if (chemical) {
                selections.chemical = {
                    id: Number(String(metricId).split(":")[1])
                };
            }
            return {
                tab: "creatures",
                view: chemical ? "chemistry" : "drives",
                primary: chemical ? "chemical" : "creature",
                selections
            };
        }
        if (category === "environment") {
            const roomId = current && current.creature.roomId;
            const selections = {
                creature: { id: agentId },
                agent: { id: agentId }
            };
            if (roomId != null) selections.room = { id: roomId };
            if (current && current.creature.metaRoomId != null) {
                selections.metaroom = {
                    id: current.creature.metaRoomId
                };
            }
            return {
                tab: "creatures",
                view: "drives",
                primary: roomId == null ? "creature" : "room",
                selections
            };
        }
        return null;
    }

    const MAX_RETAINED_SESSIONS = 24;

    function createStore(options) {
        const opts = options || {};
        const entryBytes = new WeakMap();
        function entrySize(value) {
            if (!value || typeof value !== "object") return 0;
            if (!entryBytes.has(value)) {
                entryBytes.set(value, approximateBytes(value));
            }
            return entryBytes.get(value);
        }
        let limits = {
            maxEvents: Math.max(10, Math.trunc(
                finite(opts.maxEvents) || DEFAULT_MAX_EVENTS
            )),
            maxSnapshots: Math.max(2, Math.trunc(
                finite(opts.maxSnapshots) || DEFAULT_MAX_SNAPSHOTS
            )),
            maxBytes: Math.max(4096, Math.trunc(
                finite(opts.maxBytes) || DEFAULT_MAX_BYTES
            )),
            maxDurationTicks: Math.max(0, Math.trunc(
                finite(opts.maxDurationTicks) == null
                    ? DEFAULT_MAX_DURATION_TICKS
                    : finite(opts.maxDurationTicks)
            ))
        };
        const sessions = new Map();
        const epochs = new Map();
        let activeSessionId = null;
        let nextEventId = 1;
        let nextSessionOrder = 1;

        function sessionKey(context) {
            return JSON.stringify([
                String(context.worldKey),
                String(context.subjectKey)
            ]);
        }

        function createSession(context, imported) {
            const key = sessionKey(context);
            const epoch = (epochs.get(key) || 0) + 1;
            epochs.set(key, epoch);
            const id = (imported ? "imported:" : "timeline:") +
                nextSessionOrder++ + ":" + epoch;
            const session = {
                schemaVersion: SCHEMA_VERSION,
                id,
                order: nextSessionOrder - 1,
                epoch,
                imported: Boolean(imported),
                readOnly: Boolean(imported),
                name: text(context.name,
                    (imported ? "Imported" : "Rolling") + " observation"),
                worldKey: String(context.worldKey),
                worldName: text(context.worldName, String(context.worldKey)),
                subjectKey: String(context.subjectKey),
                subjectLabel: text(context.subjectLabel,
                    String(context.subjectKey)),
                subjectAgentId: finite(context.subjectAgentId),
                createdAtWallTimeMs: finite(context.createdAtWallTimeMs) ||
                    Date.now(),
                firstWorldTick: finite(context.worldTick),
                lastWorldTick: finite(context.worldTick),
                sampleIntervalMs: finite(context.sampleIntervalMs),
                events: [],
                snapshots: [],
                droppedEvents: 0,
                droppedSnapshots: 0,
                retainedFromTick: finite(context.worldTick),
                _lastState: null,
                _hasDerivedEvents: false,
                _bytes: approximateBytes({
                    name: text(context.name, "Rolling observation"),
                    worldKey: String(context.worldKey),
                    subjectKey: String(context.subjectKey)
                })
            };
            sessions.set(id, session);
            activeSessionId = id;
            discardOldestSessions();
            return session;
        }

        // Each session is bounded, but selecting creatures creates sessions.
        // Older recordings are dropped once they are not being viewed; imported
        // ones were put there on purpose, so they stay.
        function discardOldestSessions() {
            const recorded = Array.from(sessions.values())
                .filter(session => !session.imported &&
                    session.id !== activeSessionId)
                .sort((left, right) => left.order - right.order);
            while (recorded.length > MAX_RETAINED_SESSIONS) {
                sessions.delete(recorded.shift().id);
            }
        }

        function findReusableSession(context) {
            const candidates = Array.from(sessions.values())
                .filter(session =>
                    !session.imported &&
                    session.worldKey === String(context.worldKey) &&
                    session.subjectKey === String(context.subjectKey))
                .sort((left, right) => right.order - left.order);
            const candidate = candidates[0];
            const tick = finite(context.worldTick);
            if (!candidate || tick == null ||
                (candidate.lastWorldTick != null &&
                    tick < candidate.lastWorldTick)) {
                return null;
            }
            return candidate;
        }

        function setContext(context) {
            if (!context || !context.worldKey || !context.subjectKey) {
                activeSessionId = null;
                return null;
            }
            const active = activeSessionId && sessions.get(activeSessionId);
            if (active && !active.imported &&
                active.worldKey === String(context.worldKey) &&
                active.subjectKey === String(context.subjectKey) &&
                (finite(context.worldTick) == null ||
                    active.lastWorldTick == null ||
                    finite(context.worldTick) >= active.lastWorldTick)) {
                if (context.subjectLabel) {
                    active.subjectLabel = String(context.subjectLabel);
                }
                if (context.subjectAgentId != null) {
                    active.subjectAgentId =
                        finite(context.subjectAgentId);
                }
                return active;
            }
            const reusable = findReusableSession(context);
            if (reusable) {
                activeSessionId = reusable.id;
                return reusable;
            }
            return createSession(context, false);
        }

        function recalculateBytes(session) {
            session._bytes = approximateBytes({
                name: session.name,
                worldKey: session.worldKey,
                subjectKey: session.subjectKey
            }) + session.events.reduce(
                (sum, event) => sum + entrySize(event), 0
            ) + session.snapshots.reduce(
                (sum, snapshot) => sum + entrySize(snapshot), 0
            );
            return session._bytes;
        }

        function removeOldest(collection, preserveBookmarks) {
            if (!collection.length) return null;
            let index = 0;
            if (preserveBookmarks) {
                const unbookmarked = collection.findIndex(item =>
                    !item.bookmarked);
                if (unbookmarked >= 0) index = unbookmarked;
            }
            return collection.splice(index, 1)[0];
        }

        function enforceBounds(session) {
            const newestTick = session.lastWorldTick;
            let removedEvent = false;
            function discardEvent(preserveBookmarks) {
                const removed = removeOldest(
                    session.events, preserveBookmarks);
                if (!removed) return false;
                session._bytes = Math.max(
                    0, session._bytes - entrySize(removed));
                session.droppedEvents += 1;
                removedEvent = true;
                return true;
            }
            function discardSnapshot() {
                const removed = session.snapshots.shift();
                if (!removed) return false;
                session._bytes = Math.max(
                    0, session._bytes - entrySize(removed));
                session.droppedSnapshots += 1;
                return true;
            }
            if (limits.maxDurationTicks > 0 && newestTick != null) {
                const minimumTick = newestTick - limits.maxDurationTicks;
                while (session.events.length &&
                    session.events[0].endTick < minimumTick) {
                    discardEvent(false);
                }
                while (session.snapshots.length &&
                    session.snapshots[0].worldTick < minimumTick) {
                    discardSnapshot();
                }
            }
            while (session.events.length > limits.maxEvents) {
                discardEvent(true);
            }
            while (session.snapshots.length > limits.maxSnapshots) {
                discardSnapshot();
            }
            while (session._bytes > limits.maxBytes &&
                (session.events.length || session.snapshots.length)) {
                const eventTick = session.events.length
                    ? session.events[0].endTick : Infinity;
                const snapshotTick = session.snapshots.length
                    ? session.snapshots[0].worldTick : Infinity;
                if (snapshotTick <= eventTick) {
                    discardSnapshot();
                } else {
                    discardEvent(true);
                }
            }
            if (removedEvent) {
                session._hasDerivedEvents = session.events.some(
                    event => !event.explicit);
            }
            const ticks = [];
            if (session.events.length) {
                ticks.push(session.events[0].startTick);
            }
            if (session.snapshots.length) {
                ticks.push(session.snapshots[0].worldTick);
            }
            session.retainedFromTick = ticks.length
                ? Math.min(...ticks) : session.lastWorldTick;
        }

        function normalizedEvent(session, value) {
            const event = value || {};
            const startTick = finite(event.startTick != null
                ? event.startTick : event.worldTick);
            const endTick = finite(event.endTick != null
                ? event.endTick : startTick);
            if (startTick == null || endTick == null) {
                throw new TypeError("Timeline events require a tick or tick range");
            }
            const category = CATEGORIES.includes(event.category)
                ? event.category : "error";
            const result = {
                schemaVersion: SCHEMA_VERSION,
                id: event.id == null
                    ? "timeline-event-" + nextEventId++
                    : String(event.id),
                sessionId: session.id,
                worldKey: session.worldKey,
                worldName: session.worldName,
                subjectKey: session.subjectKey,
                subjectLabel: session.subjectLabel,
                subjectAgentId: session.subjectAgentId,
                category,
                transitionKind: text(event.transitionKind, category),
                label: text(event.label, "Observed change"),
                detail: text(event.detail, ""),
                evidenceLevel: text(event.evidenceLevel,
                    event.explicit ? "observed" : "derived"),
                explicit: Boolean(event.explicit),
                exactTick: Boolean(event.exactTick),
                startTick: Math.trunc(Math.min(startTick, endTick)),
                endTick: Math.trunc(Math.max(startTick, endTick)),
                sampleIntervalMs: finite(event.sampleIntervalMs != null
                    ? event.sampleIntervalMs : session.sampleIntervalMs),
                uncertainty: event.uncertainty == null
                    ? null : String(event.uncertainty),
                before: clone(event.before),
                after: clone(event.after),
                sourceRecords: clone(event.sourceRecords || []),
                relatedAgents: Array.from(new Set(
                    (event.relatedAgents || [])
                        .map(finite).filter(value => value != null)
                )),
                eventCode: finite(event.eventCode),
                correlationId: event.correlationId == null
                    ? null : String(event.correlationId),
                navigation: clone(event.navigation),
                severity: text(event.severity, "info"),
                bookmarked: Boolean(event.bookmarked),
                annotation: text(event.annotation, ""),
                count: finite(event.count) || 1,
                _order: nextEventId
            };
            entryBytes.set(result, approximateBytes(publicEvent(result)));
            return result;
        }

        function precedenceMatch(derived, explicit) {
            if (derived.explicit || derived.category !== explicit.category) {
                return false;
            }
            if (explicit.eventCode != null && derived.eventCode != null &&
                explicit.eventCode !== derived.eventCode) {
                return false;
            }
            const tick = explicit.endTick;
            return derived.startTick <= tick && derived.endTick >= tick;
        }

        function addEvent(session, value) {
            if (!session || session.readOnly) return null;
            const event = normalizedEvent(session, value);
            if (event.explicit && session._hasDerivedEvents) {
                const retained = [];
                session.events.forEach(existing => {
                    if (precedenceMatch(existing, event)) {
                        session.droppedEvents += 1;
                        session._bytes = Math.max(
                            0, session._bytes - entrySize(existing));
                    } else {
                        retained.push(existing);
                    }
                });
                session.events = retained;
                session._hasDerivedEvents = session.events.some(
                    existing => !existing.explicit);
            }
            session.events.push(event);
            session._bytes += entrySize(event);
            if (!event.explicit) session._hasDerivedEvents = true;
            const previous = session.events[session.events.length - 2];
            if (previous && (
                previous.endTick > event.endTick ||
                previous.endTick === event.endTick &&
                  previous.startTick > event.startTick
            )) {
                session.events.sort((left, right) =>
                    left.endTick - right.endTick ||
                    left.startTick - right.startTick ||
                    left._order - right._order
                );
            }
            session.firstWorldTick = session.firstWorldTick == null
                ? event.startTick
                : Math.min(session.firstWorldTick, event.startTick);
            session.lastWorldTick = session.lastWorldTick == null
                ? event.endTick
                : Math.max(session.lastWorldTick, event.endTick);
            enforceBounds(session);
            return publicEvent(event);
        }

        function derived(session, previous, current, config) {
            const details = config || {};
            return addEvent(session, {
                category: details.category,
                transitionKind: details.transitionKind,
                label: details.label,
                detail: details.detail,
                evidenceLevel: "derived",
                explicit: false,
                exactTick: false,
                startTick: previous.worldTick,
                endTick: current.worldTick,
                sampleIntervalMs: session.sampleIntervalMs,
                uncertainty: intervalUncertainty(previous, current),
                before: details.before,
                after: details.after,
                sourceRecords: details.sourceRecords,
                relatedAgents: details.relatedAgents,
                eventCode: details.eventCode,
                navigation: details.navigation
            });
        }

        function sourcePair(previousObservation, currentObservation) {
            return [
                sourceReference(previousObservation),
                sourceReference(currentObservation)
            ];
        }

        function emitStateTransitions(
            session,
            previous,
            current,
            previousObservation,
            currentObservation
        ) {
            const sources = sourcePair(
                previousObservation, currentObservation
            );
            const emitted = [];
            const push = config => {
                const event = derived(
                    session, previous, current,
                    Object.assign({ sourceRecords: sources }, config)
                );
                if (event) emitted.push(event);
            };

            if (previous.creature.lifeState !==
                current.creature.lifeState) {
                push({
                    category: "lifecycle",
                    transitionKind: "life_state",
                    label: "Life state changed to " +
                        current.creature.lifeState,
                    before: previous.creature.lifeState,
                    after: current.creature.lifeState,
                    navigation: navigationFor(
                        "lifecycle", current, {}
                    )
                });
            }
            if (previous.creature.ageStage !==
                current.creature.ageStage &&
                current.creature.ageStage != null) {
                push({
                    category: "lifecycle",
                    transitionKind: "age_stage",
                    label: "Age stage changed to " +
                        current.creature.ageStage,
                    before: previous.creature.ageStage,
                    after: current.creature.ageStage
                });
            }
            if (previous.creature.roomId !== current.creature.roomId ||
                previous.creature.metaRoomId !==
                    current.creature.metaRoomId) {
                push({
                    category: "environment",
                    transitionKind: "room_change",
                    label: current.creature.roomId == null
                        ? "Room became unavailable"
                        : "Moved to room " + current.creature.roomId,
                    before: {
                        roomId: previous.creature.roomId,
                        metaRoomId: previous.creature.metaRoomId,
                        posX: previous.creature.posX,
                        posY: previous.creature.posY
                    },
                    after: {
                        roomId: current.creature.roomId,
                        metaRoomId: current.creature.metaRoomId,
                        posX: current.creature.posX,
                        posY: current.creature.posY
                    },
                    navigation: navigationFor(
                        "environment", current, {}
                    )
                });
            }
            if (previous.pressure.highestDriveId !==
                current.pressure.highestDriveId) {
                push({
                    category: "physiology",
                    transitionKind: "highest_drive",
                    label: "Highest drive changed to " +
                        text(current.pressure.highestDriveLabel,
                            "drive " +
                            current.pressure.highestDriveId),
                    before: {
                        id: previous.pressure.highestDriveId,
                        label: previous.pressure.highestDriveLabel,
                        value: previous.pressure.highestDriveValue
                    },
                    after: {
                        id: current.pressure.highestDriveId,
                        label: current.pressure.highestDriveLabel,
                        value: current.pressure.highestDriveValue
                    },
                    navigation: navigationFor(
                        "physiology", current,
                        { metricId: "drive:" +
                            current.pressure.highestDriveId }
                    )
                });
            }

            const previousDrives = new Map(
                previous.pressure.drives.map(drive =>
                    [drive.id, drive])
            );
            current.pressure.drives.forEach(drive => {
                const prior = previousDrives.get(drive.id);
                if (!prior) return;
                DRIVE_THRESHOLDS.forEach(threshold => {
                    const crossedUp = prior.value < threshold &&
                        drive.value >= threshold;
                    const crossedDown = prior.value >= threshold &&
                        drive.value < threshold;
                    if (!crossedUp && !crossedDown) return;
                    push({
                        category: "physiology",
                        transitionKind: "drive_threshold",
                        label: text(drive.label,
                            "Drive " + drive.id) + " crossed " +
                            threshold.toFixed(1) + " " +
                            (crossedUp ? "upward" : "downward"),
                        before: prior.value,
                        after: drive.value,
                        navigation: navigationFor(
                            "physiology", current,
                            { metricId: "drive:" + drive.id }
                        )
                    });
                });
            });

            if (previous.attention.winnerId !==
                current.attention.winnerId) {
                push({
                    category: "perception",
                    transitionKind: "attention_winner",
                    label: "Attention changed to " +
                        text(current.attention.winnerLabel,
                            "category " + current.attention.winnerId),
                    before: previous.attention,
                    after: current.attention,
                    relatedAgents: [
                        previous.attention.target &&
                            previous.attention.target.agentId,
                        current.attention.target &&
                            current.attention.target.agentId
                    ],
                    navigation: navigationFor(
                        "perception", current, {}
                    )
                });
            }
            const previousTarget = previous.attention.target &&
                previous.attention.target.agentId;
            const currentTarget = current.attention.target &&
                current.attention.target.agentId;
            if (previousTarget !== currentTarget) {
                push({
                    category: "perception",
                    transitionKind: "attention_target",
                    label: currentTarget == null
                        ? "Current IT became unavailable"
                        : "Current IT changed to agent #" +
                            currentTarget,
                    before: previous.attention.target,
                    after: current.attention.target,
                    relatedAgents: [previousTarget, currentTarget],
                    navigation: navigationFor(
                        "perception", current, {}
                    )
                });
            }
            if (previous.selection.winnerId !==
                current.selection.winnerId) {
                push({
                    category: "neural",
                    transitionKind: "decision_winner",
                    label: "Decision winner changed to " +
                        text(current.selection.winnerLabel,
                            "decision " +
                            current.selection.winnerId),
                    before: previous.selection,
                    after: current.selection,
                    navigation: navigationFor(
                        "neural", current, {}
                    )
                });
            }

            const previousActionKey = actionKey(previous.action);
            const currentActionKey = actionKey(current.action);
            if (previousActionKey !== currentActionKey) {
                if (previousActionKey) {
                    push({
                        category: "action",
                        transitionKind: "script_finish",
                        label: text(previous.action.eventLabel,
                            "Creature script") + " no longer observed",
                        before: previous.action,
                        after: current.action,
                        relatedAgents: [
                            previous.action.targ,
                            previous.action.itAtScriptStart
                        ],
                        eventCode: previous.action.script &&
                            previous.action.script.event,
                        navigation: navigationFor(
                            "action", previous,
                            { script: previous.action.script }
                        )
                    });
                }
                if (currentActionKey) {
                    push({
                        category: "action",
                        transitionKind: "script_start",
                        label: text(current.action.eventLabel,
                            "Creature script") + " first observed",
                        before: previous.action,
                        after: current.action,
                        relatedAgents: [
                            current.action.targ,
                            current.action.itAtScriptStart
                        ],
                        eventCode: current.action.script &&
                            current.action.script.event,
                        navigation: navigationFor(
                            "action", current,
                            { script: current.action.script }
                        )
                    });
                }
            } else if (currentActionKey &&
                (previous.action.state !== current.action.state ||
                    previous.action.blockingCommand !==
                        current.action.blockingCommand)) {
                const blocked = current.action.state === "blocking";
                push({
                    category: "action",
                    transitionKind: blocked
                        ? "script_block" : "script_resume",
                    label: text(current.action.eventLabel,
                        "Creature script") + " " +
                        (blocked
                            ? "blocked in " +
                                text(current.action.blockingCommand,
                                    "unknown command")
                            : "resumed"),
                    before: previous.action,
                    after: current.action,
                    relatedAgents: [
                        current.action.targ,
                        current.action.itAtScriptStart
                    ],
                    eventCode: current.action.script &&
                        current.action.script.event,
                    navigation: navigationFor(
                        "action", current,
                        { script: current.action.script }
                    )
                });
            }

            const metricIds = new Set([
                ...Object.keys(previous.metrics),
                ...Object.keys(current.metrics)
            ]);
            metricIds.forEach(metricId => {
                const prior = previous.metrics[metricId];
                const next = current.metrics[metricId];
                if (!prior || !next) return;
                const delta = next.value - prior.value;
                const threshold = next.largeDelta == null
                    ? 0.05 : Math.abs(next.largeDelta);
                const pulseName = PULSE_CHEMICALS.get(metricId);
                const pulse = pulseName &&
                    prior.value <= 0.01 && next.value > 0.01;
                if (!pulse && Math.abs(delta) < threshold) return;
                push({
                    category: "physiology",
                    transitionKind: pulse
                        ? "reinforcement_pulse" : "large_metric_change",
                    label: pulse
                        ? pulseName + " pulse observed"
                        : next.label + " changed " +
                            (delta > 0 ? "+" : "") +
                            delta.toFixed(3),
                    before: prior,
                    after: next,
                    sourceRecords: sources.concat(
                        previous.physiologySources,
                        current.physiologySources
                    ),
                    navigation: navigationFor(
                        "physiology", current,
                        { metricId }
                    )
                });
            });

            const organIds = new Set([
                ...Object.keys(previous.organs),
                ...Object.keys(current.organs)
            ]);
            organIds.forEach(organId => {
                const prior = previous.organs[organId];
                const next = current.organs[organId];
                if (!prior || !next || prior.status === next.status) return;
                push({
                    category: "physiology",
                    transitionKind: "organ_status",
                    label: next.label + " status changed to " +
                        next.status,
                    before: prior,
                    after: next,
                    sourceRecords: sources.concat(
                        previous.physiologySources,
                        current.physiologySources
                    ),
                    navigation: {
                        tab: "creatures",
                        view: "organs",
                        primary: "organ",
                        selections: {
                            creature: {
                                id: current.creature.agentId
                            },
                            agent: {
                                id: current.creature.agentId
                            },
                            organ: { id: next.id }
                        }
                    }
                });
            });
            return emitted;
        }

        function ingestObservation(observation, metadata) {
            if (!observation || observation.worldTick == null ||
                !observation.worldKey || !observation.subjectKey) {
                return { session: null, events: [], snapshot: null };
            }
            const context = {
                worldKey: observation.worldKey,
                worldName: observation.rawSources &&
                    observation.rawSources.endpoint &&
                    observation.rawSources.endpoint.worldName ||
                    observation.worldKey,
                subjectKey: observation.subjectKey,
                subjectLabel: observation.subjectLabel,
                subjectAgentId: observation.rawSources &&
                    observation.rawSources.endpoint &&
                    observation.rawSources.endpoint.creature &&
                    observation.rawSources.endpoint.creature.agentId,
                worldTick: observation.worldTick,
                sampleIntervalMs: metadata &&
                    metadata.sampleIntervalMs
            };
            const session = setContext(context);
            if (!session || session.readOnly) {
                return { session, events: [], snapshot: null };
            }
            if (metadata && metadata.sessionName) {
                session.name = text(metadata.sessionName, session.name);
            }
            if (metadata && metadata.sampleIntervalMs != null) {
                session.sampleIntervalMs =
                    finite(metadata.sampleIntervalMs);
            }
            const current = observationState(
                observation,
                metadata && metadata.physiology
            );
            const previous = session._lastState;
            const previousSnapshot = session.snapshots.length
                ? session.snapshots[session.snapshots.length - 1]
                : null;
            const emitted = [];
            if (previous && current.worldTick > previous.worldTick) {
                const expectedTickDelta = Math.max(1,
                    Math.round((session.sampleIntervalMs || 2000) /
                        50 * (current.gameSpeed || 1)));
                const tickDelta = current.worldTick -
                    previous.worldTick;
                if (tickDelta > expectedTickDelta * 1.5) {
                    const gap = addEvent(session, {
                        category: "gap",
                        transitionKind: "sampling_gap",
                        label: "Sampling gap",
                        detail: tickDelta + " world ticks elapsed; about " +
                            Math.max(1,
                                Math.floor(tickDelta /
                                    expectedTickDelta) - 1) +
                            " expected samples were missed.",
                        evidenceLevel: "derived",
                        startTick: previous.worldTick,
                        endTick: current.worldTick,
                        uncertainty: "No inactivity is implied inside this interval.",
                        before: {
                            expectedTickDelta,
                            previousTick: previous.worldTick
                        },
                        after: {
                            currentTick: current.worldTick,
                            tickDelta
                        },
                        sourceRecords: [
                            sourceReference(
                                previousSnapshot &&
                                    previousSnapshot.observation
                            ),
                            sourceReference(observation)
                        ],
                        severity: "warning"
                    });
                    if (gap) emitted.push(gap);
                }
                emitted.push(...emitStateTransitions(
                    session,
                    previous,
                    current,
                    previousSnapshot && previousSnapshot.observation,
                    observation
                ));
            }
            const snapshot = {
                schemaVersion: SCHEMA_VERSION,
                worldTick: Math.trunc(current.worldTick),
                systemTick: current.systemTick,
                wallTimeMs: current.wallTimeMs,
                enginePaused: current.enginePaused,
                gameSpeed: current.gameSpeed,
                sourceRecords: [sourceReference(observation)],
                observation: clone(observation)
            };
            const duplicate = session.snapshots.length &&
                session.snapshots[session.snapshots.length - 1]
                    .worldTick === snapshot.worldTick &&
                sameValue(session._lastState, current);
            if (!duplicate) {
                entryBytes.set(snapshot, approximateBytes(snapshot));
                session.snapshots.push(snapshot);
                session._bytes += entrySize(snapshot);
            }
            session._lastState = current;
            session.firstWorldTick = session.firstWorldTick == null
                ? current.worldTick
                : Math.min(session.firstWorldTick, current.worldTick);
            session.lastWorldTick = session.lastWorldTick == null
                ? current.worldTick
                : Math.max(session.lastWorldTick, current.worldTick);
            enforceBounds(session);
            return {
                session: sessionSummary(session),
                events: emitted,
                snapshot: duplicate ? null : clone(snapshot)
            };
        }

        function markGap(reason, context) {
            const source = context || {};
            const session = source.sessionId
                ? sessions.get(source.sessionId)
                : activeSessionId && sessions.get(activeSessionId);
            if (!session || session.readOnly) return null;
            const startTick = finite(source.startTick != null
                ? source.startTick : session.lastWorldTick);
            const endTick = finite(source.endTick != null
                ? source.endTick : startTick);
            if (startTick == null || endTick == null) return null;
            return addEvent(session, {
                category: "gap",
                transitionKind: text(reason, "recording_gap"),
                label: text(source.label, "Recording gap"),
                detail: text(source.detail,
                    "No observations were retained for this interval."),
                evidenceLevel: text(source.evidenceLevel, "observed"),
                explicit: Boolean(source.explicit),
                exactTick: startTick === endTick,
                startTick,
                endTick,
                uncertainty: text(source.uncertainty,
                    "A gap is not evidence that the creature was inactive."),
                sourceRecords: clone(source.sourceRecords || []),
                severity: "warning"
            });
        }

        function ingestLog(record) {
            const session = activeSessionId &&
                sessions.get(activeSessionId);
            if (!session || session.readOnly || !record) return null;
            if (record.worldName &&
                record.worldName !== session.worldName) return null;
            const agentId = record.agent && finite(record.agent.id);
            if (agentId == null ||
                session.subjectAgentId == null ||
                agentId !== session.subjectAgentId) {
                return null;
            }
            const isError = record.severity === "error" ||
                record.severity === "critical";
            if (!isError && !record.script && !record.action) return null;
            const tick = finite(record.worldTick) == null
                ? session.lastWorldTick : finite(record.worldTick);
            if (tick == null) return null;
            const exact = record.contextTiming ===
                "engine_main_thread" && record.worldTick != null;
            const category = isError ? "error" : "action";
            return addEvent(session, {
                id: "log:" + record.id,
                category,
                transitionKind: isError
                    ? "log_error" : "explicit_engine_record",
                label: text(record.message,
                    isError ? "Engine error" : "Engine event"),
                detail: "Structured log record from " +
                    text(record.subsystem, "unknown subsystem") + ".",
                evidenceLevel: "observed",
                explicit: true,
                exactTick: exact,
                startTick: tick,
                endTick: tick,
                uncertainty: exact ? null :
                    "Log context is nearest-snapshot timing, not an exact engine event tick.",
                sourceRecords: [clone(record)],
                relatedAgents: [agentId],
                eventCode: record.script &&
                    record.script.event,
                correlationId: record.correlationId,
                navigation: {
                    tab: "log",
                    view: "record",
                    primary: "logRecord",
                    selections: {
                        creature: {
                            id: session.subjectAgentId
                        },
                        agent: {
                            id: session.subjectAgentId,
                            details: clone(record.agent)
                        },
                        logRecord: { id: record.id }
                    }
                },
                severity: record.severity
            });
        }

        function interventionTargetId(record) {
            const target = record && record.target;
            if (target == null) return null;
            if (typeof target !== "object") return finite(target);
            return finite(target.creatureId != null
                ? target.creatureId
                : target.agentId != null
                    ? target.agentId : target.id);
        }

        function ingestIntervention(record) {
            const session = activeSessionId &&
                sessions.get(activeSessionId);
            if (!session || session.readOnly || !record) return null;
            if (record.worldKey &&
                String(record.worldKey) !== session.worldKey) return null;
            const targetId = interventionTargetId(record);
            if (targetId != null && session.subjectAgentId != null &&
                targetId !== session.subjectAgentId) return null;
            const tick = finite(record.tick);
            if (tick == null) return null;
            return addEvent(session, {
                id: "intervention:" + record.id,
                category: "intervention",
                transitionKind: text(record.type, "intervention"),
                label: text(record.label,
                    "Intervention · " +
                    text(record.type, "unspecified")),
                detail: "Explicit user intervention recorded by the shared Observatory ledger.",
                evidenceLevel: "observed",
                explicit: true,
                exactTick: true,
                startTick: tick,
                endTick: tick,
                sourceRecords: [clone(record)],
                relatedAgents: [targetId],
                correlationId: record.correlationId || record.id,
                navigation: clone(record.navigation),
                severity: "warning"
            });
        }

        function sessionSummary(session) {
            if (!session) return null;
            return {
                schemaVersion: SCHEMA_VERSION,
                id: session.id,
                order: session.order,
                epoch: session.epoch,
                imported: session.imported,
                readOnly: session.readOnly,
                name: session.name,
                worldKey: session.worldKey,
                worldName: session.worldName,
                subjectKey: session.subjectKey,
                subjectLabel: session.subjectLabel,
                subjectAgentId: session.subjectAgentId,
                createdAtWallTimeMs: session.createdAtWallTimeMs,
                firstWorldTick: session.firstWorldTick,
                lastWorldTick: session.lastWorldTick,
                retainedFromTick: session.retainedFromTick,
                sampleIntervalMs: session.sampleIntervalMs,
                eventCount: session.events.length,
                snapshotCount: session.snapshots.length,
                droppedEvents: session.droppedEvents,
                droppedSnapshots: session.droppedSnapshots,
                byteCount: session._bytes
            };
        }

        function allSessions() {
            return Array.from(sessions.values())
                .sort((left, right) => left.order - right.order)
                .map(sessionSummary);
        }

        function activeSession() {
            return activeSessionId
                ? sessionSummary(sessions.get(activeSessionId))
                : null;
        }

        function selectSession(sessionId) {
            if (!sessions.has(String(sessionId))) return null;
            activeSessionId = String(sessionId);
            return activeSession();
        }

        function renameSession(sessionId, name) {
            const session = sessions.get(String(sessionId));
            if (!session || session.readOnly) return false;
            session.name = text(name, session.name);
            recalculateBytes(session);
            return true;
        }

        function updateEvent(sessionId, eventId, changes) {
            const session = sessions.get(String(sessionId));
            if (!session) return false;
            const event = session.events.find(item =>
                item.id === String(eventId));
            if (!event) return false;
            if (changes && changes.bookmarked != null) {
                event.bookmarked = Boolean(changes.bookmarked);
            }
            if (changes && changes.annotation != null) {
                event.annotation = String(changes.annotation);
            }
            entryBytes.delete(event);
            recalculateBytes(session);
            enforceBounds(session);
            return true;
        }

        function query(options) {
            const selected = options || {};
            const session = sessions.get(String(
                selected.sessionId || activeSessionId || ""
            ));
            if (!session) return [];
            const startTick = finite(selected.startTick);
            const endTick = finite(selected.endTick);
            const categories = selected.categories instanceof Set
                ? selected.categories
                : Array.isArray(selected.categories)
                    ? new Set(selected.categories) : null;
            return session.events.filter(event => {
                if (startTick != null && event.endTick < startTick) {
                    return false;
                }
                if (endTick != null && event.startTick > endTick) {
                    return false;
                }
                if (event.category !== "gap" && categories &&
                    !categories.has(event.category)) return false;
                return true;
            }).map(publicEvent);
        }

        function downsample(events, maxItems) {
            const source = Array.isArray(events)
                ? events.map(publicEvent) : [];
            const limit = Math.max(2, Math.trunc(
                finite(maxItems) || 200
            ));
            if (source.length <= limit) return source;
            const preserved = source.filter(event =>
                event.explicit || event.bookmarked ||
                event.category === "gap"
            );
            const ordinary = source.filter(event =>
                !event.explicit && !event.bookmarked &&
                event.category !== "gap"
            );
            const available = Math.max(1, limit - preserved.length);
            const bucketSize = Math.max(1,
                Math.ceil(ordinary.length / available));
            const aggregates = [];
            for (let index = 0;
                index < ordinary.length; index += bucketSize) {
                const bucket = ordinary.slice(index, index + bucketSize);
                if (bucket.length === 1) {
                    aggregates.push(bucket[0]);
                    continue;
                }
                const categories = Array.from(new Set(
                    bucket.map(event => event.category)
                ));
                aggregates.push({
                    schemaVersion: SCHEMA_VERSION,
                    id: "aggregate:" + bucket[0].id + ":" +
                        bucket[bucket.length - 1].id,
                    category: categories.length === 1
                        ? categories[0] : "gap",
                    transitionKind: "display_aggregate",
                    label: bucket.length + " retained events",
                    detail: "Display aggregate only; export retains each event.",
                    evidenceLevel: "derived",
                    explicit: false,
                    exactTick: false,
                    startTick: bucket[0].startTick,
                    endTick: bucket[bucket.length - 1].endTick,
                    uncertainty: null,
                    before: null,
                    after: null,
                    sourceRecords: [],
                    relatedAgents: [],
                    correlationId: null,
                    navigation: null,
                    severity: "info",
                    bookmarked: false,
                    annotation: "",
                    count: bucket.length,
                    aggregateCategories: categories
                });
            }
            return preserved.concat(aggregates)
                .sort((left, right) =>
                    left.endTick - right.endTick ||
                    left.startTick - right.startTick);
        }

        function nearestSnapshot(sessionId, tick) {
            const session = sessions.get(String(
                sessionId || activeSessionId || ""
            ));
            const wanted = finite(tick);
            if (!session || wanted == null ||
                !session.snapshots.length) return null;
            let nearest = session.snapshots[0];
            session.snapshots.forEach(snapshot => {
                const distance = Math.abs(snapshot.worldTick - wanted);
                const previousDistance =
                    Math.abs(nearest.worldTick - wanted);
                if (distance < previousDistance ||
                    (distance === previousDistance &&
                        snapshot.worldTick <= wanted &&
                        nearest.worldTick > wanted)) {
                    nearest = snapshot;
                }
            });
            return clone(nearest);
        }

        function exportSession(sessionId) {
            const session = sessions.get(String(
                sessionId || activeSessionId || ""
            ));
            if (!session) return null;
            return {
                schemaVersion: SCHEMA_VERSION,
                kind: RECORDING_KIND,
                exportedAt: new Date().toISOString(),
                limits: clone(limits),
                session: sessionSummary(session),
                events: session.events.map(publicEvent),
                snapshots: clone(session.snapshots)
            };
        }

        function importRecording(value) {
            const payload = parseRecording(value);
            if (!payload || payload.kind !== RECORDING_KIND ||
                finite(payload.schemaVersion) !== SCHEMA_VERSION ||
                !payload.session) {
                throw new TypeError(
                    "Unsupported ethology recording schema"
                );
            }
            const summary = payload.session;
            const session = createSession({
                name: text(summary.name, "Imported recording"),
                worldKey: text(summary.worldKey, "imported-world"),
                worldName: text(summary.worldName, summary.worldKey),
                subjectKey: text(summary.subjectKey, "imported-subject"),
                subjectLabel: text(
                    summary.subjectLabel, summary.subjectKey),
                subjectAgentId: summary.subjectAgentId,
                worldTick: summary.firstWorldTick,
                sampleIntervalMs: summary.sampleIntervalMs,
                createdAtWallTimeMs: summary.createdAtWallTimeMs
            }, true);
            session.events = (payload.events || []).map(event => {
                const normalized = normalizedEvent(
                    session,
                    Object.assign({}, event, {
                        id: "imported:" + event.id
                    })
                );
                normalized._order = nextEventId++;
                return normalized;
            }).sort((left, right) =>
                left.endTick - right.endTick ||
                left.startTick - right.startTick);
            session.snapshots = clone(payload.snapshots || [])
                .filter(snapshot =>
                    finite(snapshot.worldTick) != null)
                .sort((left, right) =>
                    left.worldTick - right.worldTick);
            session.firstWorldTick = finite(summary.firstWorldTick);
            session.lastWorldTick = finite(summary.lastWorldTick);
            session.droppedEvents =
                Math.max(0, Math.trunc(
                    finite(summary.droppedEvents) || 0));
            session.droppedSnapshots =
                Math.max(0, Math.trunc(
                    finite(summary.droppedSnapshots) || 0));
            session._hasDerivedEvents = session.events.some(
                event => !event.explicit);
            recalculateBytes(session);
            enforceBounds(session);
            return sessionSummary(session);
        }

        function setLimits(next) {
            const source = next || {};
            if (finite(source.maxEvents) != null) {
                limits.maxEvents = Math.max(
                    10, Math.trunc(finite(source.maxEvents))
                );
            }
            if (finite(source.maxSnapshots) != null) {
                limits.maxSnapshots = Math.max(
                    2, Math.trunc(finite(source.maxSnapshots))
                );
            }
            if (finite(source.maxBytes) != null) {
                limits.maxBytes = Math.max(
                    4096, Math.trunc(finite(source.maxBytes))
                );
            }
            if (finite(source.maxDurationTicks) != null) {
                limits.maxDurationTicks = Math.max(
                    0, Math.trunc(finite(source.maxDurationTicks))
                );
            }
            sessions.forEach(enforceBounds);
            return clone(limits);
        }

        function getEvent(sessionId, eventId) {
            const session = sessions.get(String(
                sessionId || activeSessionId || ""
            ));
            const event = session && session.events.find(item =>
                item.id === String(eventId));
            return event ? publicEvent(event) : null;
        }

        return Object.freeze({
            setContext,
            ingestObservation,
            ingestLog,
            ingestIntervention,
            markGap,
            query,
            downsample,
            nearestSnapshot,
            getEvent,
            updateEvent,
            renameSession,
            allSessions,
            activeSession,
            selectSession,
            exportSession,
            importRecording,
            setLimits,
            limits: () => clone(limits),
            stats: sessionId => {
                const session = sessions.get(String(
                    sessionId || activeSessionId || ""
                ));
                return sessionSummary(session);
            }
        });
    }

    return Object.freeze({
        SCHEMA_VERSION,
        RECORDING_KIND,
        CATEGORIES,
        DEFAULT_MAX_EVENTS,
        DEFAULT_MAX_SNAPSHOTS,
        DEFAULT_MAX_BYTES,
        DEFAULT_MAX_DURATION_TICKS,
        observationState,
        createStore,
        serializeRecording,
        parseRecording
    });
});
