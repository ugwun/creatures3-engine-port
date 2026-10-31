// log_model.js — pure normalization, retention, filtering, and export for logs
"use strict";

(function(root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    if (root) root.ObservatoryLogModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
    const DEFAULT_MAX_RECORDS = 5000;
    const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;

    const SUBSYSTEMS = [
        [1, "error"],
        [16, "shutdown"],
        [2, "network"],
        [4, "world"],
        [8, "caos"],
        [32, "sound"],
        [64, "crash"]
    ];

    function finite(value) {
        if (value == null || value === "") return null;
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }

    function categorySubsystem(mask) {
        const value = finite(mask) || 0;
        for (const entry of SUBSYSTEMS) {
            if (value & entry[0]) return entry[1];
        }
        return "other";
    }

    function categorySeverity(mask, message) {
        const value = finite(mask) || 0;
        const text = String(message || "");
        if (value & 64) return "critical";
        if (value & 1) return "error";
        if (/^\s*(?:\[?warn(?:ing)?\]?[:\s])/i.test(text)) return "warning";
        return "info";
    }

    function normalizeContext(value, fields) {
        if (!value || typeof value !== "object") return null;
        const result = {};
        fields.forEach(field => {
            if (value[field] != null) result[field] = value[field];
        });
        return Object.keys(result).length ? result : null;
    }

    function normalize(raw, fallback) {
        const source = raw && typeof raw === "object"
            ? raw
            : { message: String(raw == null ? "" : raw) };
        const defaults = fallback || {};
        const categoryMask = finite(source.categoryMask != null
            ? source.categoryMask
            : source.cat) || 0;
        const message = String(source.message != null
            ? source.message
            : source.msg != null
                ? source.msg
                : "");
        const schemaVersion = finite(source.schemaVersion) || 1;
        const streamId = source.streamId == null ? null : String(source.streamId);
        const recordId = finite(source.recordId);
        const id = source.id != null
            ? String(source.id)
            : streamId && recordId != null
                ? streamId + ":" + recordId
                : "client:" + String(defaults.sequence || 0);
        const kind = source.kind === "gap" || source.kind === "world_boundary"
            ? source.kind
            : "record";
        const record = {
            schemaVersion,
            kind,
            id,
            streamId,
            recordId,
            source: source.source || (schemaVersion >= 2 ? "unknown" : "legacy"),
            legacy: source.legacy != null ? Boolean(source.legacy) : schemaVersion < 2,
            monotonicMs: finite(source.monotonicMs != null
                ? source.monotonicMs
                : source.t),
            wallTimeMs: finite(source.wallTimeMs),
            receivedAtWallTimeMs: finite(source.receivedAtWallTimeMs) ||
                finite(defaults.receivedAtWallTimeMs) || Date.now(),
            categoryMask,
            severity: String(source.severity || categorySeverity(categoryMask, message)),
            subsystem: String(source.subsystem || categorySubsystem(categoryMask)),
            message,
            worldName: source.worldName == null ? null : String(source.worldName),
            worldTick: finite(source.worldTick),
            systemTick: finite(source.systemTick),
            enginePaused: source.enginePaused == null
                ? null
                : Boolean(source.enginePaused),
            gameSpeed: finite(source.gameSpeed),
            contextTiming: source.contextTiming == null
                ? "unavailable"
                : String(source.contextTiming),
            agent: normalizeContext(source.agent, [
                "id", "family", "genus", "species"
            ]),
            script: normalizeContext(source.script, [
                "family", "genus", "species", "event", "ip", "sourceLine"
            ]),
            correlationId: source.correlationId == null
                ? null
                : String(source.correlationId),
            action: source.action == null ? null : String(source.action),
            reason: source.reason == null ? null : String(source.reason),
            droppedCount: finite(source.droppedCount) || 0,
            duplicateCount: 1,
            bookmarked: Boolean(source.bookmarked),
            annotation: source.annotation == null ? "" : String(source.annotation)
        };
        record.firstWallTimeMs = record.wallTimeMs || record.receivedAtWallTimeMs;
        record.lastWallTimeMs = record.firstWallTimeMs;
        record.firstWorldTick = record.worldTick;
        record.lastWorldTick = record.worldTick;
        return record;
    }

    function approximateBytes(value) {
        try {
            return JSON.stringify(value).length * 2;
        } catch (_) {
            return String(value).length * 2;
        }
    }

    function duplicateSignature(record) {
        if (!record || record.kind !== "record") return null;
        return JSON.stringify([
            record.message,
            record.severity,
            record.subsystem,
            record.worldName,
            record.contextTiming,
            record.agent,
            record.script,
            record.correlationId
        ]);
    }

    function createBuffer(options) {
        const opts = options || {};
        const maxRecords = Number.isFinite(opts.maxRecords)
            ? Math.max(1, opts.maxRecords)
            : DEFAULT_MAX_RECORDS;
        const maxBytes = Number.isFinite(opts.maxBytes)
            ? Math.max(256, opts.maxBytes)
            : DEFAULT_MAX_BYTES;
        let entries = [];
        let rawCount = 0;
        let byteCount = 0;
        let sequence = 0;
        let evictedCount = 0;

        function addOverflowGap(count) {
            const existing = entries[0];
            if (existing && existing.kind === "gap" &&
                existing.reason === "client_buffer_overflow") {
                const previousBytes = existing._bytes;
                existing.droppedCount += count;
                existing.message = existing.droppedCount +
                    " earlier records were discarded by the browser buffer";
                existing._bytes = approximateBytes({
                    kind: existing.kind,
                    reason: existing.reason,
                    droppedCount: existing.droppedCount,
                    message: existing.message
                });
                byteCount += existing._bytes - previousBytes;
                return;
            }
            const gap = normalize({
                schemaVersion: 2,
                kind: "gap",
                id: "client-gap:" + String(sequence++),
                source: "browser",
                severity: "warning",
                subsystem: "developer_tools",
                reason: "client_buffer_overflow",
                droppedCount: count,
                message: count + " earlier records were discarded by the browser buffer"
            }, { sequence });
            gap._bytes = approximateBytes({
                kind: gap.kind,
                reason: gap.reason,
                droppedCount: gap.droppedCount,
                message: gap.message
            });
            gap._rawCount = 0;
            entries.unshift(gap);
            byteCount += gap._bytes;
        }

        function enforceBounds() {
            let removed = 0;
            while (rawCount > maxRecords || byteCount > maxBytes) {
                const index = entries.findIndex(entry =>
                    !(entry.kind === "gap" &&
                        entry.reason === "client_buffer_overflow")
                );
                if (index < 0) break;
                const entry = entries[index];
                entries.splice(index, 1);
                rawCount -= entry._rawCount || 0;
                byteCount -= entry._bytes || 0;
                removed += entry._rawCount || 1;
            }
            if (removed) {
                evictedCount += removed;
                addOverflowGap(removed);
                while (byteCount > maxBytes) {
                    const index = entries.findIndex(entry =>
                        !(entry.kind === "gap" &&
                            entry.reason === "client_buffer_overflow")
                    );
                    if (index < 0) break;
                    const entry = entries[index];
                    const count = entry._rawCount || 1;
                    entries.splice(index, 1);
                    rawCount -= entry._rawCount || 0;
                    byteCount -= entry._bytes || 0;
                    evictedCount += count;
                    addOverflowGap(count);
                }
            }
        }

        function ingest(raw, receivedAtWallTimeMs) {
            const record = normalize(raw, {
                sequence: sequence++,
                receivedAtWallTimeMs
            });
            const bytes = approximateBytes(raw);
            const previous = entries[entries.length - 1];
            const signature = duplicateSignature(record);
            if (signature && previous && previous._signature === signature &&
                !previous.bookmarked && !previous.annotation) {
                previous.duplicateCount += 1;
                previous.lastWallTimeMs = record.wallTimeMs ||
                    record.receivedAtWallTimeMs;
                previous.lastWorldTick = record.worldTick;
                previous._rawCount += 1;
                previous._bytes += bytes;
                rawCount += 1;
                byteCount += bytes;
                enforceBounds();
                return previous;
            }
            record._signature = signature;
            record._rawCount = 1;
            record._bytes = bytes;
            entries.push(record);
            rawCount += 1;
            byteCount += bytes;
            enforceBounds();
            return record;
        }

        function update(id, changes) {
            const record = entries.find(entry => entry.id === String(id));
            if (!record) return false;
            const previousMetadataBytes = approximateBytes({
                bookmarked: record.bookmarked,
                annotation: record.annotation
            });
            Object.assign(record, changes || {});
            const nextMetadataBytes = approximateBytes({
                bookmarked: record.bookmarked,
                annotation: record.annotation
            });
            record._bytes += nextMetadataBytes - previousMetadataBytes;
            byteCount += nextMetadataBytes - previousMetadataBytes;
            enforceBounds();
            return true;
        }

        function clear() {
            entries = [];
            rawCount = 0;
            byteCount = 0;
            evictedCount = 0;
        }

        function records() {
            return entries.slice();
        }

        function stats() {
            const first = entries.find(entry => entry.kind !== "gap") || null;
            const last = [...entries].reverse()
                .find(entry => entry.kind !== "gap") || null;
            return {
                rawCount,
                displayCount: entries.length,
                byteCount,
                evictedCount,
                firstWallTimeMs: first && first.firstWallTimeMs,
                lastWallTimeMs: last && last.lastWallTimeMs
            };
        }

        return { ingest, update, clear, records, stats };
    }

    function classifierText(context) {
        if (!context) return "";
        return [context.family, context.genus, context.species]
            .filter(value => value != null).join(" ");
    }

    function matches(record, filters) {
        const f = filters || {};
        if (record.kind === "gap") return true;
        const query = String(f.query || "").trim().toLowerCase();
        if (query && ![
            record.message,
            record.annotation,
            record.worldName,
            record.correlationId,
            classifierText(record.agent),
            classifierText(record.script)
        ].join(" ").toLowerCase().includes(query)) return false;
        if (f.severities instanceof Set &&
            !f.severities.has(record.severity)) return false;
        if (f.subsystems instanceof Set &&
            !f.subsystems.has(record.subsystem)) return false;
        if (f.world && record.worldName !== f.world) return false;
        if (f.agent && (!record.agent ||
            String(record.agent.id) !== String(f.agent))) return false;
        if (f.classifier) {
            const wanted = String(f.classifier).trim();
            if (classifierText(record.agent) !== wanted &&
                classifierText(record.script) !== wanted) return false;
        }
        if (f.event !== "" && f.event != null &&
            (!record.script || String(record.script.event) !== String(f.event))) {
            return false;
        }
        if (f.range === "since_world_load" && f.worldSessionStartWallTimeMs != null &&
            record.lastWallTimeMs < f.worldSessionStartWallTimeMs) return false;
        if (f.range === "around_tick" && f.contextTick != null) {
            const tick = record.worldTick;
            const windowSize = Number.isFinite(Number(f.tickWindow))
                ? Number(f.tickWindow)
                : 100;
            if (tick == null || Math.abs(tick - Number(f.contextTick)) > windowSize) {
                return false;
            }
        }
        return true;
    }

    function filterRecords(records, filters) {
        return (records || []).filter(record => matches(record, filters));
    }

    function publicRecord(record) {
        const copy = {};
        Object.keys(record).forEach(key => {
            if (key[0] !== "_") copy[key] = record[key];
        });
        return copy;
    }

    function exportRecords(records, format) {
        const values = (records || []).map(publicRecord);
        if (format === "json") return JSON.stringify(values, null, 2);
        if (format === "jsonl") {
            return values.map(value => JSON.stringify(value)).join("\n");
        }
        return values.map(record => {
            const wall = record.wallTimeMs
                ? new Date(record.wallTimeMs).toISOString()
                : "wall-time-unknown";
            const tick = record.worldTick == null ? "tick-unknown" : "tick-" + record.worldTick;
            const duplicate = record.duplicateCount > 1
                ? " ×" + record.duplicateCount
                : "";
            return "[" + wall + "] [" + tick + "] [" + record.severity +
                "/" + record.subsystem + "] " + record.message + duplicate;
        }).join("\n");
    }

    return {
        DEFAULT_MAX_RECORDS,
        DEFAULT_MAX_BYTES,
        normalize,
        categorySeverity,
        categorySubsystem,
        duplicateSignature,
        createBuffer,
        filterRecords,
        exportRecords,
        publicRecord
    };
});
