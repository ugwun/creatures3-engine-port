// biological_series.js — bounded, reusable biological time-series storage
"use strict";

(function(root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    if (root) root.BiologicalSeries = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
    const SCHEMA_VERSION = 1;
    const DEFAULT_MAX_SAMPLES_PER_SERIES = 300;
    const DEFAULT_MAX_TOTAL_SAMPLES = 60000;
    const DEFAULT_EXPECTED_TICK_DELTA = 40;
    const MAX_SEEN_INTERVENTIONS_PER_SERIES = 400;

    function finite(value) {
        if (value == null || value === "") return null;
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }

    function identityKey(worldKey, subjectKey) {
        return JSON.stringify([String(worldKey), String(subjectKey)]);
    }

    function normalizeContext(context) {
        const source = context || {};
        if (!source.worldKey) throw new TypeError("Series samples require worldKey");
        if (!source.subjectKey) throw new TypeError("Series samples require subjectKey");
        const worldTick = finite(source.worldTick);
        if (worldTick == null) throw new TypeError("Series samples require worldTick");
        return {
            worldKey: String(source.worldKey),
            worldName: source.worldName == null ? null : String(source.worldName),
            subjectKey: String(source.subjectKey),
            subjectLabel: source.subjectLabel == null
                ? null
                : String(source.subjectLabel),
            worldTick: Math.trunc(worldTick),
            systemTick: finite(source.systemTick),
            wallTimeMs: finite(source.wallTimeMs) == null
                ? Date.now()
                : finite(source.wallTimeMs),
            enginePaused: source.enginePaused == null
                ? null
                : Boolean(source.enginePaused),
            gameSpeed: finite(source.gameSpeed),
            sampleIntervalMs: finite(source.sampleIntervalMs),
            expectedTickDelta: finite(source.expectedTickDelta) ||
                DEFAULT_EXPECTED_TICK_DELTA,
            sourceEndpoint: source.sourceEndpoint == null
                ? null
                : String(source.sourceEndpoint),
            interventions: Array.isArray(source.interventions)
                ? source.interventions.map(record => ({
                    id: String(record.id),
                    type: String(record.type),
                    tick: finite(record.tick) == null
                        ? worldTick
                        : Math.trunc(finite(record.tick)),
                    source: record.source == null ? null : String(record.source),
                    target: record.target == null
                        ? null
                        : (typeof record.target === "object"
                            ? Object.assign({}, record.target)
                            : record.target),
                    parameters: record.parameters == null
                        ? {}
                        : (typeof record.parameters === "object"
                            ? Object.assign({}, record.parameters)
                            : record.parameters)
                }))
                : [],
            evidenceLevel: source.evidenceLevel || "observed"
        };
    }

    function normalizeMetric(metric) {
        if (!metric || metric.id == null) {
            throw new TypeError("Series metric requires an id");
        }
        const value = finite(metric.value);
        if (value == null) return null;
        return {
            id: String(metric.id),
            label: metric.label == null ? String(metric.id) : String(metric.label),
            value,
            unit: metric.unit == null ? "raw" : String(metric.unit),
            group: metric.group == null ? "other" : String(metric.group),
            sourceField: metric.sourceField == null
                ? null
                : String(metric.sourceField),
            evidenceLevel: metric.evidenceLevel || "observed"
        };
    }

    function sampleValueEqual(left, right) {
        return left != null && right != null &&
            left.value === right.value &&
            left.worldTick === right.worldTick;
    }

    function downsample(samples, maxPoints) {
        const source = Array.isArray(samples) ? samples : [];
        const limit = Math.max(2, Math.trunc(finite(maxPoints) || 80));
        if (source.length <= limit) return source.slice();
        const interior = source.slice(1, -1);
        const bucketCount = Math.max(1, Math.floor((limit - 2) / 2));
        const bucketSize = Math.ceil(interior.length / bucketCount);
        const result = [source[0]];
        for (let start = 0; start < interior.length; start += bucketSize) {
            const bucket = interior.slice(start, start + bucketSize);
            if (!bucket.length) continue;
            let minimum = bucket[0];
            let maximum = bucket[0];
            bucket.forEach(sample => {
                if (sample.value < minimum.value) minimum = sample;
                if (sample.value > maximum.value) maximum = sample;
            });
            if (minimum.worldTick <= maximum.worldTick) {
                result.push(minimum);
                if (maximum !== minimum) result.push(maximum);
            } else {
                result.push(maximum);
                if (maximum !== minimum) result.push(minimum);
            }
        }
        result.push(source[source.length - 1]);
        if (result.length <= limit) return result;
        const reduced = [result[0]];
        const interiorResult = result.slice(1, -1);
        const slots = limit - 2;
        for (let index = 0; index < slots; index += 1) {
            const sourceIndex = Math.min(
                interiorResult.length - 1,
                Math.floor(index * interiorResult.length / slots)
            );
            reduced.push(interiorResult[sourceIndex]);
        }
        reduced.push(result[result.length - 1]);
        return reduced;
    }

    function summarize(samples, baselineTick) {
        const source = Array.isArray(samples) ? samples : [];
        if (!source.length) {
            return {
                current: null,
                previousDelta: null,
                baselineDelta: null,
                baselineTick: baselineTick == null ? null : baselineTick,
                minimum: null,
                maximum: null,
                ratePer100Ticks: null,
                gapCount: 0,
                missedIntervals: 0,
                stale: true
            };
        }
        const current = source[source.length - 1];
        const previous = source.length > 1 ? source[source.length - 2] : null;
        let baseline = null;
        if (baselineTick != null) {
            for (const sample of source) {
                if (sample.worldTick <= baselineTick) baseline = sample;
                else break;
            }
        }
        if (!baseline) baseline = source[0];
        let minimum = source[0].value;
        let maximum = source[0].value;
        let gapCount = 0;
        let missedIntervals = 0;
        source.forEach(sample => {
            minimum = Math.min(minimum, sample.value);
            maximum = Math.max(maximum, sample.value);
            if (sample.gapBefore) gapCount += 1;
            missedIntervals += sample.missedIntervals || 0;
        });
        const tickSpan = current.worldTick - source[0].worldTick;
        return {
            current: current.value,
            previousDelta: previous ? current.value - previous.value : null,
            baselineDelta: baseline ? current.value - baseline.value : null,
            baselineTick: baseline ? baseline.worldTick : null,
            minimum,
            maximum,
            ratePer100Ticks: tickSpan > 0
                ? (current.value - source[0].value) / tickSpan * 100
                : null,
            gapCount,
            missedIntervals,
            stale: Boolean(current.stale),
            firstTick: source[0].worldTick,
            lastTick: current.worldTick,
            sampleCount: source.length
        };
    }

    function createStore(options) {
        const opts = options || {};
        const maxSamplesPerSeries = Math.max(2,
            Math.trunc(finite(opts.maxSamplesPerSeries) ||
                DEFAULT_MAX_SAMPLES_PER_SERIES));
        const maxTotalSamples = Math.max(maxSamplesPerSeries,
            Math.trunc(finite(opts.maxTotalSamples) ||
                DEFAULT_MAX_TOTAL_SAMPLES));
        const series = new Map();
        const sessions = new Map();
        const activeSessions = new Map();
        const sessionEpochs = new Map();
        const baselines = new Map();
        const pins = [];
        let nextSessionOrder = 1;
        let nextSampleOrder = 1;
        let totalSamples = 0;

        function subjectIdentity(context) {
            return identityKey(context.worldKey, context.subjectKey);
        }

        function ensureSession(context) {
            const subject = subjectIdentity(context);
            let sessionId = activeSessions.get(subject);
            let session = sessionId && sessions.get(sessionId);
            if (!session || context.worldTick < session.lastWorldTick) {
                const epoch = (sessionEpochs.get(subject) || 0) + 1;
                sessionId = subject + "|session-" + epoch;
                session = {
                    id: sessionId,
                    epoch,
                    order: nextSessionOrder++,
                    worldKey: context.worldKey,
                    worldName: context.worldName,
                    subjectKey: context.subjectKey,
                    subjectLabel: context.subjectLabel,
                    firstWorldTick: context.worldTick,
                    lastWorldTick: context.worldTick,
                    firstWallTimeMs: context.wallTimeMs,
                    lastWallTimeMs: context.wallTimeMs
                };
                sessions.set(sessionId, session);
                sessionEpochs.set(subject, epoch);
                activeSessions.set(subject, sessionId);
            } else {
                session.lastWorldTick = context.worldTick;
                session.lastWallTimeMs = context.wallTimeMs;
                if (context.subjectLabel) session.subjectLabel = context.subjectLabel;
                if (context.worldName) session.worldName = context.worldName;
            }
            return session;
        }

        function seriesKey(sessionId, metricId) {
            return sessionId + "|" + metricId;
        }

        function evictOldest() {
            let target = null;
            series.forEach(candidate => {
                if (!candidate.samples.length) return;
                if (!target ||
                    candidate.samples[0].order < target.samples[0].order) {
                    target = candidate;
                }
            });
            if (!target) return false;
            target.samples.shift();
            totalSamples -= 1;
            target.droppedSamples += 1;
            return true;
        }

        function enforceBounds(target) {
            while (target.samples.length > maxSamplesPerSeries) {
                target.samples.shift();
                totalSamples -= 1;
                target.droppedSamples += 1;
            }
            while (totalSamples > maxTotalSamples) {
                if (!evictOldest()) break;
            }
        }

        function ingest(contextInput, metricsInput) {
            const context = normalizeContext(contextInput);
            const session = ensureSession(context);
            const metrics = (Array.isArray(metricsInput)
                ? metricsInput
                : []).map(normalizeMetric).filter(Boolean);
            const result = {
                sessionId: session.id,
                added: 0,
                skippedPausedDuplicates: 0,
                metrics: []
            };

            metrics.forEach(metric => {
                const key = seriesKey(session.id, metric.id);
                let target = series.get(key);
                if (!target) {
                    target = {
                        key,
                        sessionId: session.id,
                        metric: Object.assign({}, metric),
                        samples: [],
                        droppedSamples: 0,
                        seenInterventionIds: new Set()
                    };
                    series.set(key, target);
                } else {
                    target.metric = Object.assign({}, target.metric, metric);
                }

                const previous = target.samples[target.samples.length - 1] || null;
                const tickDelta = previous
                    ? context.worldTick - previous.worldTick
                    : null;
                const missedIntervals = tickDelta != null &&
                    tickDelta > context.expectedTickDelta * 1.5
                    ? Math.max(1,
                        Math.floor(tickDelta / context.expectedTickDelta) - 1)
                    : 0;
                const interventionWindowStart = previous
                    ? previous.worldTick
                    : context.worldTick - context.expectedTickDelta * 1.5;
                const interventions = context.interventions.filter(record => {
                    if (record.tick > context.worldTick ||
                        record.tick < interventionWindowStart ||
                        target.seenInterventionIds.has(record.id)) {
                        return false;
                    }
                    const interventionTarget = record.target;
                    const chemicalId = interventionTarget &&
                        interventionTarget.chemicalId != null
                        ? interventionTarget.chemicalId
                        : record.parameters.chemicalId;
                    if (chemicalId != null) {
                        return metric.id === "chemical:" + chemicalId;
                    }
                    return true;
                });
                const sample = {
                    schemaVersion: SCHEMA_VERSION,
                    order: nextSampleOrder++,
                    sessionId: session.id,
                    metricId: metric.id,
                    value: metric.value,
                    unit: metric.unit,
                    worldKey: context.worldKey,
                    worldName: context.worldName,
                    subjectKey: context.subjectKey,
                    worldTick: context.worldTick,
                    systemTick: context.systemTick,
                    wallTimeMs: context.wallTimeMs,
                    enginePaused: context.enginePaused,
                    gameSpeed: context.gameSpeed,
                    sampleIntervalMs: context.sampleIntervalMs,
                    sourceEndpoint: context.sourceEndpoint,
                    interventions,
                    evidenceLevel: metric.evidenceLevel || context.evidenceLevel,
                    gapBefore: missedIntervals > 0,
                    missedIntervals,
                    stale: false
                };

                if (context.enginePaused && !interventions.length &&
                    sampleValueEqual(previous, sample)) {
                    result.skippedPausedDuplicates += 1;
                    return;
                }
                if (previous && previous.worldTick === sample.worldTick &&
                    previous.value === sample.value && !interventions.length) {
                    return;
                }

                target.samples.push(sample);
                interventions.forEach(record => {
                    target.seenInterventionIds.add(record.id);
                    while (target.seenInterventionIds.size >
                        MAX_SEEN_INTERVENTIONS_PER_SERIES) {
                        target.seenInterventionIds.delete(
                            target.seenInterventionIds.values().next().value
                        );
                    }
                });
                totalSamples += 1;
                enforceBounds(target);
                result.added += 1;
                result.metrics.push(metric.id);
            });
            return result;
        }

        function getSeries(sessionId, metricId) {
            const target = series.get(seriesKey(sessionId, metricId));
            if (!target) return null;
            return {
                key: target.key,
                sessionId: target.sessionId,
                metric: Object.assign({}, target.metric),
                samples: target.samples.slice(),
                droppedSamples: target.droppedSamples
            };
        }

        function activeSession(worldKey, subjectKey) {
            const id = activeSessions.get(identityKey(worldKey, subjectKey));
            return id ? sessions.get(id) || null : null;
        }

        function endWorldSession(worldKey) {
            const expected = String(worldKey);
            Array.from(activeSessions.entries()).forEach(([subject, id]) => {
                const session = sessions.get(id);
                if (session && session.worldKey === expected) {
                    activeSessions.delete(subject);
                }
            });
        }

        function metricView(worldKey, subjectKey, metricId, maxPoints) {
            const session = activeSession(worldKey, subjectKey);
            if (!session) return null;
            const target = getSeries(session.id, metricId);
            if (!target) return null;
            const baselineTick = baselines.get(session.id);
            return Object.assign(target, {
                session: Object.assign({}, session),
                summary: summarize(target.samples, baselineTick),
                visibleSamples: downsample(target.samples, maxPoints || 80),
                pinned: pins.includes(metricId),
                pinOrder: pins.indexOf(metricId)
            });
        }

        function setBaseline(sessionId, worldTick) {
            if (!sessions.has(sessionId)) return false;
            const tick = finite(worldTick);
            if (tick == null) {
                baselines.delete(sessionId);
            } else {
                baselines.set(sessionId, Math.trunc(tick));
            }
            return true;
        }

        function pin(metricId) {
            const id = String(metricId);
            if (!pins.includes(id)) pins.push(id);
            return pins.slice();
        }

        function unpin(metricId) {
            const index = pins.indexOf(String(metricId));
            if (index >= 0) pins.splice(index, 1);
            return pins.slice();
        }

        function movePin(metricId, index) {
            const id = String(metricId);
            unpin(id);
            pins.splice(Math.max(0, Math.min(pins.length, index)), 0, id);
            return pins.slice();
        }

        function pinnedMetrics() {
            return pins.slice();
        }

        function markStale(worldKey, subjectKey) {
            const session = activeSession(worldKey, subjectKey);
            if (!session) return;
            series.forEach(target => {
                if (target.sessionId !== session.id || !target.samples.length) return;
                target.samples[target.samples.length - 1].stale = true;
            });
        }

        function orderMetrics(records, mode, groupOrder) {
            const values = (records || []).slice();
            const groups = groupOrder || [];
            const canonicalId = record => {
                const match = String(record.id).match(/(\d+)(?!.*\d)/);
                return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
            };
            const compareCanonical = (left, right) =>
                canonicalId(left) - canonicalId(right) ||
                String(left.label).localeCompare(String(right.label));
            if (mode === "functional_group") {
                values.sort((left, right) => {
                    const leftIndex = groups.indexOf(left.group);
                    const rightIndex = groups.indexOf(right.group);
                    return (leftIndex < 0 ? groups.length : leftIndex) -
                        (rightIndex < 0 ? groups.length : rightIndex) ||
                        compareCanonical(left, right);
                });
            } else if (mode === "current_value") {
                values.sort((left, right) =>
                    (right.value || 0) - (left.value || 0) ||
                    compareCanonical(left, right)
                );
            } else if (mode === "absolute_change") {
                values.sort((left, right) =>
                    Math.abs(right.previousDelta || 0) -
                    Math.abs(left.previousDelta || 0) ||
                    compareCanonical(left, right)
                );
            } else if (mode === "pinned_order") {
                values.sort((left, right) => {
                    const leftPin = pins.indexOf(String(left.id));
                    const rightPin = pins.indexOf(String(right.id));
                    return (leftPin < 0 ? pins.length : leftPin) -
                        (rightPin < 0 ? pins.length : rightPin) ||
                        compareCanonical(left, right);
                });
            } else {
                values.sort(compareCanonical);
            }
            return values;
        }

        function exportSession(sessionId) {
            const session = sessions.get(sessionId);
            if (!session) return null;
            const exportedSeries = [];
            series.forEach(target => {
                if (target.sessionId !== sessionId) return;
                exportedSeries.push({
                    metric: Object.assign({}, target.metric),
                    droppedSamples: target.droppedSamples,
                    samples: target.samples.map(sample => Object.assign({}, sample))
                });
            });
            return {
                schemaVersion: SCHEMA_VERSION,
                kind: "biological_series_session",
                session: Object.assign({}, session),
                baselineTick: baselines.has(sessionId)
                    ? baselines.get(sessionId)
                    : null,
                pinnedMetricIds: pins.slice(),
                series: exportedSeries
            };
        }

        function stats() {
            return {
                sessionCount: sessions.size,
                seriesCount: series.size,
                totalSamples,
                maxSamplesPerSeries,
                maxTotalSamples
            };
        }

        return {
            ingest,
            getSeries,
            activeSession,
            endWorldSession,
            metricView,
            setBaseline,
            pin,
            unpin,
            movePin,
            pinnedMetrics,
            markStale,
            orderMetrics,
            exportSession,
            stats
        };
    }

    return {
        SCHEMA_VERSION,
        DEFAULT_MAX_SAMPLES_PER_SERIES,
        DEFAULT_MAX_TOTAL_SAMPLES,
        normalizeContext,
        normalizeMetric,
        downsample,
        summarize,
        createStore
    };
});
