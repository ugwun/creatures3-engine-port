// creature_observation.js — pure live-observation composition and captures
"use strict";

(function(root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    if (root) root.CreatureObservation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
    const SCHEMA_VERSION = 1;
    const STAGES = Object.freeze([
        { id: "environment", label: "Environment" },
        { id: "perception", label: "Perception" },
        { id: "pressure", label: "Internal pressure" },
        { id: "attention", label: "Attention" },
        { id: "selection", label: "Selection" },
        { id: "action", label: "Action" },
        { id: "consequence", label: "Consequence" }
    ]);
    const DEFAULT_CAPTURE_LIMIT = 20;

    function finite(value) {
        if (value == null || value === "") return null;
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }

    function clone(value) {
        if (value == null) return value;
        return JSON.parse(JSON.stringify(value));
    }

    function text(value, fallback) {
        const result = String(value == null ? "" : value).trim();
        return result || fallback;
    }

    function fact(label, value, options) {
        const opts = options || {};
        return {
            label,
            value: value == null ? "Unknown" : String(value),
            rawValue: opts.rawValue == null ? value : opts.rawValue,
            evidenceLevel: opts.evidenceLevel || "observed",
            sourceField: opts.sourceField || null
        };
    }

    function stageEvidence(level, source, tick, options) {
        const opts = options || {};
        return {
            level,
            label: opts.label || null,
            source,
            worldTick: finite(tick),
            systemTick: finite(opts.systemTick),
            capturedAtWallTimeMs: finite(opts.capturedAtWallTimeMs),
            sampleIntervalMs: finite(opts.sampleIntervalMs),
            supportingEvidence: clone(opts.supportingEvidence || [])
        };
    }

    function unknownStage(definition, reason, evidence) {
        return {
            id: definition.id,
            label: definition.label,
            status: "unknown",
            summary: "Unknown",
            detail: reason || "Source data is unavailable.",
            facts: [],
            competition: null,
            evidence: evidence || stageEvidence(
                "unknown", null, null, { label: "Unavailable" }
            ),
            navigation: null,
            raw: null
        };
    }

    function stageDefinition(id) {
        return STAGES.find(stage => stage.id === id);
    }

    function candidateLabel(candidate) {
        if (!candidate) return "Unknown";
        return text(candidate.label, "ID " + candidate.id);
    }

    function competitionFor(lobe) {
        if (!lobe || !Array.isArray(lobe.candidates) ||
            lobe.winnerId == null) {
            return null;
        }
        const winnerActivity = finite(lobe.winnerActivity);
        const alternatives = lobe.candidates.filter(candidate =>
            String(candidate.id) !== String(lobe.winnerId)
        );
        const alternative = alternatives.length ? alternatives[0] : null;
        const alternativeActivity = alternative
            ? finite(alternative.activity)
            : null;
        if (winnerActivity == null || alternativeActivity == null) return null;
        const margin = winnerActivity - alternativeActivity;
        const weak = winnerActivity < 0.2;
        const overtaken = margin < 0;
        const close = Math.abs(margin) < 0.05;
        if (!weak && !close && !overtaken) return null;
        return {
            weak,
            close,
            overtaken,
            margin,
            winner: {
                id: lobe.winnerId,
                label: text(lobe.winnerLabel, "ID " + lobe.winnerId),
                activity: winnerActivity
            },
            alternative: {
                id: alternative.id,
                label: candidateLabel(alternative),
                activity: alternativeActivity
            },
            evidenceLevel: "derived",
            explanation: overtaken
                ? "A different neuron currently has stronger activity than the recorded winner."
                : weak && close
                ? "Winner activity is low and the strongest alternative is close."
                : weak
                    ? "Winner activity is low."
                    : "The strongest alternative is close to the winner."
        };
    }

    function composeObservation(input) {
        const source = input || {};
        const endpoint = source.endpoint || null;
        const recentChanges = Array.isArray(source.recentChanges)
            ? source.recentChanges.filter(change =>
                change && finite(change.previousDelta) != null
            )
            : [];
        const sampleIntervalMs = finite(source.sampleIntervalMs);
        if (!endpoint || endpoint.error) {
            const reason = endpoint && endpoint.error
                ? endpoint.error
                : "Observation endpoint is unavailable.";
            return {
                schemaVersion: SCHEMA_VERSION,
                worldKey: source.worldKey || null,
                subjectKey: source.subjectKey || null,
                subjectLabel: source.subjectLabel || null,
                worldTick: null,
                systemTick: null,
                enginePaused: null,
                gameSpeed: null,
                capturedAtWallTimeMs: finite(source.capturedAtWallTimeMs),
                stages: STAGES.map(definition =>
                    unknownStage(definition, reason)
                ),
                timing: {
                    ticks: [],
                    aligned: false,
                    tickSpan: null,
                    warning: reason
                },
                causalWarning: "The strip does not establish why an action occurred.",
                rawSources: {
                    endpoint: clone(endpoint),
                    recentChanges: clone(recentChanges)
                }
            };
        }

        const tick = finite(endpoint.worldTick);
        const evidenceOptions = {
            systemTick: endpoint.systemTick,
            capturedAtWallTimeMs: endpoint.capturedAtWallTimeMs,
            sampleIntervalMs
        };
        const observed = () => stageEvidence(
            "observed",
            endpoint.source || "GET /api/creature/:id/observation",
            tick,
            evidenceOptions
        );
        const stages = [];

        const environment = endpoint.environment || {};
        const nearby = Array.isArray(environment.nearby)
            ? environment.nearby
            : [];
        const caChannels = Array.isArray(environment.caChannels)
            ? environment.caChannels
                .filter(channel => finite(channel.value) != null)
                .sort((left, right) =>
                    finite(right.value) - finite(left.value)
                )
            : [];
        const strongestCA = caChannels.find(channel =>
            finite(channel.value) > 0
        ) || null;
        const room = environment.roomId;
        const nearbySummary = nearby.slice(0, 2).map(agent => {
            const gallery = text(agent.gallery, "Agent #" + agent.agentId);
            const distance = finite(agent.distanceSquared);
            return gallery + (distance == null
                ? ""
                : " · " + Math.round(Math.sqrt(Math.max(0, distance))) + " px");
        });
        stages.push({
            id: "environment",
            label: "Environment",
            status: room == null ? "unknown" : "available",
            summary: room == null
                ? "Unknown room"
                : "Room " + room + " · " +
                    (finite(environment.nearbySameRoomCount) || 0) +
                    " nearby",
            detail: nearbySummary.length
                ? nearbySummary.join(" · ")
                : "No same-room neighbours were returned.",
            facts: [
                fact("Room", room, {
                    sourceField: "environment.roomId"
                }),
                fact("Metaroom", environment.metaRoomId, {
                    sourceField: "environment.metaRoomId"
                }),
                fact("Same-room agents",
                    finite(environment.nearbySameRoomCount) || 0, {
                        sourceField: "environment.nearbySameRoomCount"
                    }),
                fact("Strongest CA/smell",
                    strongestCA
                        ? text(strongestCA.label,
                            "CA smell " + strongestCA.id) + " · " +
                            finite(strongestCA.value).toFixed(3)
                        : null, {
                        rawValue: strongestCA,
                        sourceField: "environment.caChannels"
                    })
            ],
            competition: null,
            evidence: room == null
                ? stageEvidence("unknown", endpoint.source, tick, evidenceOptions)
                : observed(),
            navigation: room == null ? null : {
                tab: "creatures",
                view: "drives",
                kind: "room",
                id: room
            },
            raw: clone(environment)
        });

        const perception = endpoint.perception || {};
        const channels = Array.isArray(perception.channels)
            ? perception.channels
            : [];
        // Input lobes such as smell have no winner, so their strongest
        // neuron is the honest summary of what they carry.
        const channelSignal = channel => {
            if (!channel || !channel.available) return null;
            if (channel.winnerId != null) {
                return {
                    channel,
                    id: channel.winnerId,
                    label: channel.winnerLabel,
                    activity: channel.winnerActivity
                };
            }
            const strongest = (channel.candidates || []).find(candidate =>
                finite(candidate.activity) > 0);
            return strongest ? {
                channel,
                id: strongest.id,
                label: strongest.label,
                activity: strongest.activity
            } : null;
        };
        const availableChannels = channels.filter(channel =>
            channelSignal(channel) !== null
        );
        const signals = availableChannels.map(channelSignal);
        stages.push(signals.length ? {
            id: "perception",
            label: "Perception",
            status: "available",
            summary: signals.map(signal =>
                text(signal.channel.lobe, "signal") + " " +
                text(signal.label, "ID " + signal.id)
            ).join(" · "),
            detail: "Strongest visual, smell, and category signals are concurrent brain values.",
            facts: signals.map(signal =>
                fact(text(signal.channel.lobe, "Lobe"), candidateLabel({
                    id: signal.id,
                    label: signal.label
                }) + " · " +
                    (finite(signal.activity) == null
                        ? "activity unknown"
                        : finite(signal.activity).toFixed(3)), {
                    sourceField: "perception.channels." + signal.channel.lobe
                })
            ),
            competition: availableChannels
                .map(competitionFor)
                .find(Boolean) || null,
            evidence: observed(),
            navigation: {
                tab: "creatures",
                view: "brain",
                kind: "brainElement",
                id: "perception"
            },
            raw: clone(perception)
        } : unknownStage(
            stageDefinition("perception"),
            "No mapped visual, smell, or noun signal was available.",
            stageEvidence("unknown", endpoint.source, tick, evidenceOptions)
        ));

        const pressure = endpoint.pressure || {};
        const highestDriveId = pressure.highestDriveId;
        const highestDriveValue = finite(pressure.highestDriveValue);
        const fastestDrive = recentChanges
            .filter(change => String(change.id || "").startsWith("drive:"))
            .sort((left, right) =>
                Math.abs(right.previousDelta) -
                Math.abs(left.previousDelta)
            )[0] || null;
        stages.push(highestDriveId == null ? unknownStage(
            stageDefinition("pressure"),
            "No highest-drive sample was available.",
            stageEvidence("unknown", endpoint.source, tick, evidenceOptions)
        ) : {
            id: "pressure",
            label: "Internal pressure",
            status: "available",
            summary: text(
                pressure.highestDriveLabel,
                "Drive " + highestDriveId
            ) + (highestDriveValue == null
                ? ""
                : " " + highestDriveValue.toFixed(3)),
            detail: fastestDrive
                ? "Largest retained drive change: " +
                    text(fastestDrive.label, fastestDrive.id) + " " +
                    formatSigned(fastestDrive.previousDelta, 3)
                : "Recent drive change needs at least two retained samples.",
            facts: [
                fact("Highest drive",
                    text(pressure.highestDriveLabel,
                        "Drive " + highestDriveId), {
                        rawValue: highestDriveId,
                        sourceField: "pressure.highestDriveId"
                    }),
                fact("Level", highestDriveValue == null
                    ? null : highestDriveValue.toFixed(3), {
                    rawValue: highestDriveValue,
                    sourceField: "pressure.highestDriveValue"
                })
            ],
            competition: null,
            evidence: observed(),
            navigation: {
                tab: "creatures",
                view: "drives",
                kind: "creature",
                id: endpoint.creature && endpoint.creature.agentId
            },
            raw: clone(pressure)
        });

        const attention = endpoint.attention || {};
        const attentionCompetition = competitionFor(attention);
        const target = attention.currentTarget;
        stages.push(attention.available && attention.winnerId != null ? {
            id: "attention",
            label: "Attention",
            status: "available",
            summary: text(
                attention.winnerLabel,
                "Category " + attention.winnerId
            ) + (finite(attention.winnerActivity) == null
                ? ""
                : " " + finite(attention.winnerActivity).toFixed(3)),
            detail: target
                ? "Current IT: " +
                    text(target.categoryLabel,
                        text(target.gallery, "Agent #" + target.agentId)) +
                    " · agent #" + target.agentId
                : attention.introspective
                    ? "No current IT; the creature is introspective."
                    : "No valid current IT was returned.",
            facts: [
                fact("Attention winner",
                    text(attention.winnerLabel,
                        "Category " + attention.winnerId), {
                    rawValue: attention.winnerId,
                    sourceField: "attention.winnerId"
                }),
                fact("Motor attention ID", attention.motorAttentionId, {
                    sourceField: "attention.motorAttentionId"
                }),
                fact("Current IT", target ? target.agentId : null, {
                    sourceField: "attention.currentTarget.agentId"
                })
            ],
            competition: attentionCompetition,
            evidence: observed(),
            navigation: {
                tab: "creatures",
                view: "brain",
                kind: "brainElement",
                id: "attn"
            },
            targetNavigation: target ? {
                tab: "debugger",
                view: "agent",
                kind: "agent",
                id: target.agentId,
                details: clone(target)
            } : null,
            raw: clone(attention)
        } : unknownStage(
            stageDefinition("attention"),
            "The attention lobe or its winner is unavailable.",
            stageEvidence("unknown", endpoint.source, tick, evidenceOptions)
        ));

        const selection = endpoint.selection || {};
        const selectionCompetition = competitionFor(selection);
        const involuntaryAction = finite(
            selection.currentInvoluntaryAction
        );
        stages.push(selection.available && selection.winnerId != null ? {
            id: "selection",
            label: "Selection",
            status: "available",
            summary: text(
                selection.winnerLabel,
                "Decision " + selection.winnerId
            ) + (finite(selection.winnerActivity) == null
                ? ""
                : " " + finite(selection.winnerActivity).toFixed(3)),
            detail: "Decision-lobe winner; this does not by itself prove which script will execute.",
            facts: [
                fact("Decision winner",
                    text(selection.winnerLabel,
                        "Decision " + selection.winnerId), {
                    rawValue: selection.winnerId,
                    sourceField: "selection.winnerId"
                }),
                fact("Motor action offset",
                    selection.currentActionOffset, {
                    sourceField: "selection.currentActionOffset"
                }),
                fact("Involuntary action",
                    involuntaryAction != null && involuntaryAction >= 0
                        ? involuntaryAction
                        : "None", {
                    rawValue: selection.currentInvoluntaryAction,
                    sourceField: "selection.currentInvoluntaryAction"
                })
            ],
            competition: selectionCompetition,
            evidence: observed(),
            navigation: {
                tab: "creatures",
                view: "brain",
                kind: "brainElement",
                id: "decn"
            },
            raw: clone(selection)
        } : unknownStage(
            stageDefinition("selection"),
            "The decision lobe or its winner is unavailable.",
            stageEvidence("unknown", endpoint.source, tick, evidenceOptions)
        ));

        const action = endpoint.action || {};
        const script = action.script;
        const eventNames = source.eventNames || {};
        const eventId = script && script.event;
        const eventLabel = eventId == null
            ? null
            : text(eventNames[eventId], "Event " + eventId);
        stages.push({
            id: "action",
            label: "Action",
            status: "available",
            summary: action.running
                ? text(eventLabel, "Running script") + " · " +
                    text(action.state, "running")
                : "No running creature script",
            detail: action.running
                ? text(action.sourceStatement,
                    action.blockingCommand
                        ? "Blocked in " + action.blockingCommand
                        : "Source statement unavailable.")
                : "Idle is an observed VM state, not an inferred intention.",
            facts: [
                fact("VM state", text(action.state, "idle"), {
                    sourceField: "action.state"
                }),
                fact("Script event", eventId == null ? null : eventLabel, {
                    rawValue: eventId,
                    sourceField: "action.script.event"
                }),
                fact("TARG", action.targ, {
                    sourceField: "action.targ"
                }),
                fact("IT at script start", action.itAtScriptStart, {
                    sourceField: "action.itAtScriptStart"
                })
            ],
            competition: null,
            evidence: observed(),
            navigation: {
                tab: "scripts",
                view: "activity",
                kind: "script",
                id: script
                    ? [
                        endpoint.creature && endpoint.creature.agentId,
                        script.family, script.genus,
                        script.species, script.event
                    ].join(":")
                    : endpoint.creature && endpoint.creature.agentId,
                details: script ? clone(script) : {}
            },
            targetNavigation: {
                tab: "debugger",
                view: "agent",
                kind: "agent",
                id: endpoint.creature && endpoint.creature.agentId,
                label: "Open owning agent",
                details: clone(endpoint.creature || {})
            },
            raw: clone(action)
        });

        const consequenceChanges = recentChanges
            .slice()
            .sort((left, right) =>
                Math.abs(right.previousDelta) -
                Math.abs(left.previousDelta)
            )
            .slice(0, 3);
        if (!consequenceChanges.length) {
            stages.push(unknownStage(
                stageDefinition("consequence"),
                "Two retained biological samples are required before change can be shown.",
                stageEvidence(
                    "unknown",
                    "BiologicalSeries retained samples",
                    tick,
                    evidenceOptions
                )
            ));
        } else {
            const consequenceTick = Math.max(...consequenceChanges.map(change =>
                finite(change.worldTick) == null ? tick : finite(change.worldTick)
            ));
            stages.push({
                id: "consequence",
                label: "Consequence",
                status: "available",
                summary: consequenceChanges.map(change =>
                    text(change.label, change.id) + " " +
                    formatSigned(change.previousDelta, 3)
                ).join(" · "),
                detail: "Largest adjacent retained-sample changes; timing alone does not establish consequence or cause.",
                facts: consequenceChanges.map(change =>
                    fact(text(change.label, change.id),
                        formatSigned(change.previousDelta, 6), {
                        rawValue: change.previousDelta,
                        evidenceLevel: "derived",
                        sourceField: change.sourceEndpoint || change.id
                    })
                ),
                competition: null,
                evidence: stageEvidence(
                    "derived",
                    "BiologicalSeries retained samples",
                    consequenceTick,
                    {
                        systemTick: endpoint.systemTick,
                        capturedAtWallTimeMs:
                            source.capturedAtWallTimeMs,
                        sampleIntervalMs,
                        label: "Change between observed samples",
                        supportingEvidence: consequenceChanges.map(change => ({
                            metricId: change.id,
                            worldTick: change.worldTick,
                            sourceEndpoint: change.sourceEndpoint
                        }))
                    }
                ),
                navigation: {
                    tab: "creatures",
                    view: String(consequenceChanges[0].id || "")
                        .startsWith("chemical:")
                        ? "chemistry" : "drives",
                    kind: String(consequenceChanges[0].id || "")
                        .startsWith("chemical:")
                        ? "chemical" : "creature",
                    id: String(consequenceChanges[0].id || "")
                        .startsWith("chemical:")
                        ? Number(String(consequenceChanges[0].id).split(":")[1])
                        : endpoint.creature && endpoint.creature.agentId
                },
                raw: clone(consequenceChanges)
            });
        }

        const ticks = Array.from(new Set(stages
            .map(stage => finite(stage.evidence && stage.evidence.worldTick))
            .filter(value => value != null))).sort((left, right) => left - right);
        const tickSpan = ticks.length
            ? ticks[ticks.length - 1] - ticks[0]
            : null;
        const aligned = ticks.length === 1;
        let timingWarning = null;
        if (ticks.length > 1) {
            timingWarning = "Stages combine world ticks " +
                ticks[0] + "–" + ticks[ticks.length - 1] + ".";
        }
        if (!endpoint.enginePaused && sampleIntervalMs > 0 &&
            ticks.length > 1) {
            timingWarning += " Polling cadence cannot establish exact event order.";
        }

        return {
            schemaVersion: SCHEMA_VERSION,
            worldKey: source.worldKey || endpoint.worldName || null,
            subjectKey: source.subjectKey ||
                (endpoint.creature && endpoint.creature.moniker
                    ? "creature:" + endpoint.creature.moniker
                    : endpoint.creature
                        ? "creature:agent-" + endpoint.creature.agentId
                        : null),
            subjectLabel: source.subjectLabel ||
                (endpoint.creature &&
                    text(endpoint.creature.name,
                        "Creature #" + endpoint.creature.agentId)),
            worldTick: tick,
            systemTick: finite(endpoint.systemTick),
            enginePaused: Boolean(endpoint.enginePaused),
            gameSpeed: finite(endpoint.gameSpeed),
            capturedAtWallTimeMs: finite(
                source.capturedAtWallTimeMs
            ) || finite(endpoint.capturedAtWallTimeMs),
            stages,
            timing: {
                ticks,
                aligned,
                tickSpan,
                warning: timingWarning
            },
            causalWarning: "Stages are concurrent observations, not a certain causal chain.",
            rawSources: {
                endpoint: clone(endpoint),
                recentChanges: clone(recentChanges)
            }
        };
    }

    function formatSigned(value, digits) {
        const number = finite(value);
        if (number == null) return "Unknown";
        const places = Number.isInteger(digits) ? digits : 3;
        const threshold = Math.pow(10, -places) / 2;
        if (Math.abs(number) < threshold) return "0";
        return (number > 0 ? "+" : "") + number.toFixed(places);
    }

    function stageSignature(stage) {
        if (!stage) return null;
        return JSON.stringify({
            status: stage.status,
            summary: stage.summary,
            detail: stage.detail,
            facts: (stage.facts || []).map(item => [
                item.label, item.rawValue
            ]),
            competition: stage.competition
        });
    }

    function compareObservation(observation, captured) {
        const previous = captured && captured.observation;
        const previousStages = new Map(
            previous && Array.isArray(previous.stages)
                ? previous.stages.map(stage => [stage.id, stage])
                : []
        );
        return Object.assign({}, observation, {
            comparedCapture: captured ? {
                id: captured.id,
                name: captured.name,
                worldTick: captured.worldTick
            } : null,
            stages: observation.stages.map(stage => {
                const prior = previousStages.get(stage.id);
                return Object.assign({}, stage, {
                    comparison: !captured
                        ? "none"
                        : !prior
                            ? "new"
                            : stageSignature(stage) ===
                                stageSignature(prior)
                                ? "unchanged"
                                : "changed"
                });
            })
        });
    }

    function createCaptureStore(options) {
        const opts = options || {};
        const limit = Math.max(1, Math.trunc(
            finite(opts.limit) || DEFAULT_CAPTURE_LIMIT
        ));
        let worldKey = null;
        let subjectKey = null;
        let nextId = 1;
        let captures = [];

        function setSession(nextWorldKey, nextSubjectKey) {
            const world = nextWorldKey == null
                ? null : String(nextWorldKey);
            const subject = nextSubjectKey == null
                ? null : String(nextSubjectKey);
            if (world === worldKey && subject === subjectKey) return false;
            worldKey = world;
            subjectKey = subject;
            captures = [];
            return true;
        }

        function add(name, observation, wallTimeMs) {
            if (!observation || observation.worldTick == null) return null;
            setSession(observation.worldKey, observation.subjectKey);
            const captured = {
                schemaVersion: SCHEMA_VERSION,
                id: "observation-" + nextId++,
                name: text(name, "Observation at tick " + observation.worldTick),
                worldKey,
                subjectKey,
                subjectLabel: observation.subjectLabel,
                worldTick: observation.worldTick,
                capturedAtWallTimeMs:
                    finite(wallTimeMs) || Date.now(),
                observation: clone(observation)
            };
            captures = captures.concat([captured]).slice(-limit);
            return clone(captured);
        }

        function latest() {
            return captures.length
                ? clone(captures[captures.length - 1])
                : null;
        }

        function all() {
            return clone(captures);
        }

        function clear() {
            captures = [];
        }

        return Object.freeze({
            setSession,
            add,
            latest,
            all,
            clear,
            stats: () => ({
                worldKey,
                subjectKey,
                count: captures.length,
                limit
            })
        });
    }

    return Object.freeze({
        SCHEMA_VERSION,
        STAGES,
        DEFAULT_CAPTURE_LIMIT,
        composeObservation,
        compareObservation,
        competitionFor,
        createCaptureStore,
        formatSigned
    });
});
