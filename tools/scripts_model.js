// scripts_model.js — pure activity tracking and filtering for Running Scripts
"use strict";

(function(root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    if (root) root.ScriptsActivityModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
    const DEFAULT_RETENTION_MS = 5000;

    function classifierKey(script) {
        return [
            script.family,
            script.genus,
            script.species,
            script.event
        ].join(" ");
    }

    function scriptKey(script) {
        return String(script.agentId) + ":" + classifierKey(script);
    }

    function normalizeState(script) {
        const state = String(script.state || "running").toLowerCase();
        if (state === "paused" || state === "finished") return state;
        if (state !== "blocking") return "running";
        return String(script.blockingCommand || "").toUpperCase() === "WAIT"
            ? "waiting"
            : "blocking";
    }

    function stateSummary(records) {
        const counts = {
            running: 0,
            waiting: 0,
            blocking: 0,
            paused: 0,
            finished: 0
        };
        records.forEach(record => {
            counts[record.displayState] += 1;
        });
        return counts;
    }

    function activitySignature(script) {
        return JSON.stringify([
            normalizeState(script),
            script.ip,
            script.source,
            script.blockingCommand,
            script.targ,
            script.it
        ]);
    }

    function createTracker(options) {
        const opts = options || {};
        const retentionMs = Number.isFinite(opts.retentionMs)
            ? opts.retentionMs
            : DEFAULT_RETENTION_MS;
        const records = new Map();
        let nextOrder = 0;

        function ingest(rows, capturedAt) {
            const now = Number.isFinite(capturedAt) ? capturedAt : Date.now();
            const seen = new Set();

            (Array.isArray(rows) ? rows : []).forEach(script => {
                if (!script || script.agentId == null) return;
                const key = scriptKey(script);
                seen.add(key);
                const previous = records.get(key);
                const restarting = Boolean(previous && previous.finishedAt != null);
                const signature = activitySignature(script);
                records.set(key, Object.assign({}, script, {
                    key,
                    classifierKey: classifierKey(script),
                    displayState: normalizeState(script),
                    newlyStarted: !previous || restarting,
                    changed: Boolean(previous &&
                        (restarting || previous.signature !== signature)),
                    firstSeenAt: !previous || restarting
                        ? now
                        : previous.firstSeenAt,
                    lastSeenAt: now,
                    finishedAt: null,
                    stableOrder: previous ? previous.stableOrder : nextOrder++,
                    signature
                }));
            });

            for (const [key, previous] of records) {
                if (seen.has(key)) continue;
                if (previous.finishedAt == null) {
                    records.set(key, Object.assign({}, previous, {
                        state: "finished",
                        displayState: "finished",
                        newlyStarted: false,
                        changed: true,
                        finishedAt: now
                    }));
                } else if (now - previous.finishedAt > retentionMs) {
                    records.delete(key);
                } else if (previous.changed) {
                    records.set(key, Object.assign({}, previous, {
                        changed: false
                    }));
                }
            }

            return getRecords();
        }

        function getRecords() {
            return Array.from(records.values());
        }

        function clear() {
            records.clear();
            nextOrder = 0;
        }

        return Object.freeze({ ingest, getRecords, clear });
    }

    function contains(value, query) {
        return String(value == null ? "" : value)
            .toLowerCase()
            .includes(query);
    }

    function matchesFilters(record, filters) {
        const selected = filters || {};
        if (selected.state && selected.state !== "all" &&
            record.displayState !== selected.state) {
            return false;
        }
        if (selected.creaturesOnly && Number(record.agentFamily) !== 4) {
            return false;
        }
        if (selected.changedOnly && !record.changed) return false;
        if (selected.newOnly && !record.newlyStarted) return false;

        const classifier = String(selected.classifier || "").trim().toLowerCase();
        if (classifier && !contains(record.classifierKey, classifier)) return false;

        const event = String(selected.event || "").trim().toLowerCase();
        if (event &&
            !contains(record.event, event) &&
            !contains(record.eventName, event)) {
            return false;
        }

        const gallery = String(selected.gallery || "").trim().toLowerCase();
        if (gallery &&
            !contains(record.gallery, gallery) &&
            !contains(record.agentName, gallery)) {
            return false;
        }

        const query = String(selected.query || "").trim().toLowerCase();
        if (!query) return true;
        return [
            record.agentId,
            record.agentName,
            record.gallery,
            record.classifierKey,
            record.eventName,
            record.source,
            record.blockingCommand,
            record.blockReason,
            record.targ,
            record.it
        ].some(value => contains(value, query));
    }

    function stableSort(records, selectedAgentId) {
        const selected = selectedAgentId == null
            ? null
            : String(selectedAgentId);
        return records.slice().sort((left, right) => {
            const leftSelected = selected != null &&
                String(left.agentId) === selected;
            const rightSelected = selected != null &&
                String(right.agentId) === selected;
            if (leftSelected !== rightSelected) return leftSelected ? -1 : 1;
            return left.stableOrder - right.stableOrder;
        });
    }

    function buildView(records, filters, options) {
        const opts = options || {};
        const selectedAgentId = opts.selectedAgentId;
        const filtered = stableSort(
            records.filter(record => matchesFilters(record, filters)),
            selectedAgentId
        );
        if (!opts.grouped) {
            return filtered.map(record => ({
                key: "script:" + record.key,
                classifierKey: record.classifierKey,
                records: [record],
                counts: stateSummary([record]),
                collapsed: false,
                selected: selectedAgentId != null &&
                    String(record.agentId) === String(selectedAgentId)
            }));
        }

        const groups = new Map();
        filtered.forEach(record => {
            let group = groups.get(record.classifierKey);
            if (!group) {
                group = {
                    key: "classifier:" + record.classifierKey,
                    classifierKey: record.classifierKey,
                    records: [],
                    stableOrder: record.stableOrder,
                    selected: false
                };
                groups.set(record.classifierKey, group);
            }
            group.records.push(record);
            group.stableOrder = Math.min(group.stableOrder, record.stableOrder);
            if (selectedAgentId != null &&
                String(record.agentId) === String(selectedAgentId)) {
                group.selected = true;
            }
        });

        return Array.from(groups.values())
            .sort((left, right) => {
                if (left.selected !== right.selected) {
                    return left.selected ? -1 : 1;
                }
                return left.stableOrder - right.stableOrder;
            })
            .map(group => Object.assign(group, {
                counts: stateSummary(group.records),
                collapsed: group.records.length > 1 &&
                    !group.selected &&
                    opts.collapsedGroups &&
                    opts.collapsedGroups.has(group.classifierKey)
            }));
    }

    function formatStateSummary(counts) {
        return ["running", "waiting", "blocking", "paused", "finished"]
            .filter(state => counts[state])
            .map(state => counts[state] + " " + state)
            .join(" · ");
    }

    return Object.freeze({
        DEFAULT_RETENTION_MS,
        classifierKey,
        scriptKey,
        normalizeState,
        stateSummary,
        createTracker,
        matchesFilters,
        stableSort,
        buildView,
        formatStateSummary
    });
});
