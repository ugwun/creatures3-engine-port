// comparison_model.js — pure cohort history, statistics, and definition model
"use strict";

(function(root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    if (root) root.CreatureComparison = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
    const SCHEMA_VERSION = 1;
    const DEFINITION_KIND = "creatures3-comparison-definition";
    const REPORT_KIND = "creatures3-comparison-report";
    const DEFAULT_MAX_SNAPSHOTS = 180;
    const DEFAULT_NEAREST_TICK_OFFSET = 200;

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

    function memberKey(creature) {
        if (!creature) return null;
        return "creature:" + text(creature.moniker,
            "agent-" + creature.agentId);
    }

    function quantile(sorted, fraction) {
        if (!sorted.length) return null;
        if (sorted.length === 1) return sorted[0];
        const position = (sorted.length - 1) * fraction;
        const lower = Math.floor(position);
        const upper = Math.ceil(position);
        if (lower === upper) return sorted[lower];
        const weight = position - lower;
        return sorted[lower] * (1 - weight) +
            sorted[upper] * weight;
    }

    function summarize(records) {
        const source = Array.isArray(records) ? records : [];
        const present = source.map(record => ({
            id: record && record.id == null
                ? null : String(record.id),
            label: record && record.label || null,
            value: finite(record && record.value)
        })).filter(record => record.value != null);
        const values = present.map(record => record.value)
            .sort((left, right) => left - right);
        const q1 = quantile(values, 0.25);
        const q3 = quantile(values, 0.75);
        const median = quantile(values, 0.5);
        const iqr = q1 == null || q3 == null ? null : q3 - q1;
        const lowerFence = iqr == null ? null : q1 - iqr * 1.5;
        const upperFence = iqr == null ? null : q3 + iqr * 1.5;
        const outliers = present.filter(record =>
            lowerFence != null &&
            (record.value < lowerFence || record.value > upperFence));
        return {
            n: values.length,
            total: source.length,
            missing: source.length - values.length,
            min: values.length ? values[0] : null,
            q1,
            median,
            q3,
            max: values.length ? values[values.length - 1] : null,
            mean: values.length
                ? values.reduce((sum, value) => sum + value, 0) /
                    values.length
                : null,
            iqr,
            outliers,
            individuals: source.map(record => clone(record))
        };
    }

    function normalizeCreature(creature) {
        const source = creature || {};
        const key = memberKey(source);
        const selectedChemicals = {};
        (Array.isArray(source.selectedChemicals)
            ? source.selectedChemicals : []).forEach(chemical => {
            const id = finite(chemical && chemical.id);
            const value = finite(chemical &&
                chemical.concentration);
            if (id != null && value != null) {
                selectedChemicals[String(id)] = value;
            }
        });
        return {
            key,
            agentId: finite(source.agentId),
            moniker: source.moniker || null,
            name: source.name || null,
            label: text(source.name,
                "Creature #" + text(source.agentId, "unknown")),
            family: finite(source.family),
            genus: finite(source.genus),
            species: finite(source.species),
            sex: finite(source.sex),
            ageStage: finite(source.age),
            ageInTicks: finite(source.ageInTicks),
            lifeState: text(source.lifeState,
                source.dead ? "dead" : "unknown"),
            dead: Boolean(source.dead),
            glycogenReserve: finite(source.glycogenReserve),
            drives: Array.isArray(source.drives)
                ? source.drives.map(finite) : [],
            highestDrive: finite(source.highestDrive),
            currentAttentionId: finite(source.currentAttentionId),
            currentDecisionId: finite(source.currentDecisionId),
            currentTargetAgentId:
                finite(source.currentTargetAgentId),
            currentTargetCategory:
                source.currentTargetCategory || null,
            actionState: source.actionState || null,
            blockingCommand: source.blockingCommand || null,
            lastObservedWorldTick:
                finite(source.lastObservedWorldTick),
            selectedChemicals,
            organCount: finite(source.organCount),
            functioningOrgans: finite(source.functioningOrgans),
            failedOrgans: finite(source.failedOrgans),
            roomId: finite(source.roomId),
            metaRoomId: finite(source.metaRoomId),
            posX: finite(source.posX),
            posY: finite(source.posY),
            status: source.dead ? "dead" : "present",
            missingReason: null
        };
    }

    function normalizeSnapshot(payload) {
        if (!payload || finite(payload.worldTick) == null) {
            throw new TypeError("Cohort snapshot requires a world tick");
        }
        const worldTick = Math.trunc(finite(payload.worldTick));
        const creatures = (Array.isArray(payload.creatures)
            ? payload.creatures : []).map(normalizeCreature)
            .filter(creature => creature.key);
        creatures.forEach(creature => {
            creature.lastObservedWorldTick = worldTick;
        });
        return {
            schemaVersion: SCHEMA_VERSION,
            source: payload.source ||
                "GET /api/creatures/snapshot",
            contextTiming: payload.contextTiming ||
                "engine_main_thread",
            worldKey: text(payload.worldKey,
                text(payload.worldName, "unknown-world")),
            worldName: text(payload.worldName,
                text(payload.worldKey, "Unknown world")),
            worldTick,
            systemTick: finite(payload.systemTick),
            capturedAtWallTimeMs:
                finite(payload.capturedAtWallTimeMs),
            enginePaused: payload.enginePaused == null
                ? null : Boolean(payload.enginePaused),
            gameSpeed: finite(payload.gameSpeed),
            requestedChemicalIds:
                (payload.requestedChemicalIds || [])
                    .map(finite).filter(value => value != null),
            creatures
        };
    }

    function metricValue(creature, metricId) {
        if (!creature) return null;
        if (creature.status === "missing" ||
            creature.missingReason) return null;
        const id = String(metricId || "");
        let match = id.match(/^drive:(\d+)$/);
        if (match) return finite(creature.drives[Number(match[1])]);
        match = id.match(/^chemical:(\d+)$/);
        if (match) {
            return finite(creature.selectedChemicals[match[1]]);
        }
        if (id === "glycogen") return creature.glycogenReserve;
        if (id === "age_ticks") return creature.ageInTicks;
        if (id === "failed_organs") return creature.failedOrgans;
        if (id === "functioning_organs") {
            return creature.functioningOrgans;
        }
        if (id === "pos_x") return creature.posX;
        if (id === "pos_y") return creature.posY;
        return null;
    }

    function distribution(snapshot, metricId, memberKeys) {
        const selected = memberKeys
            ? new Set(memberKeys.map(String)) : null;
        const members = snapshot && Array.isArray(snapshot.creatures)
            ? snapshot.creatures.filter(creature =>
                !selected || selected.has(creature.key))
            : [];
        return summarize(members.map(creature => ({
            id: creature.key,
            label: creature.label,
            value: metricValue(creature, metricId),
            status: creature.status,
            worldTick: snapshot && snapshot.worldTick
        })));
    }

    function nearestSnapshot(snapshots, tick, maxOffset) {
        const source = Array.isArray(snapshots) ? snapshots : [];
        const wanted = finite(tick);
        if (wanted == null || !source.length) return null;
        let nearest = source[0];
        source.forEach(snapshot => {
            const distance = Math.abs(snapshot.worldTick - wanted);
            const nearestDistance =
                Math.abs(nearest.worldTick - wanted);
            if (distance < nearestDistance ||
                (distance === nearestDistance &&
                    snapshot.worldTick <= wanted &&
                    nearest.worldTick > wanted)) {
                nearest = snapshot;
            }
        });
        const offset = nearest.worldTick - wanted;
        const limit = finite(maxOffset);
        if (limit != null && Math.abs(offset) > limit) {
            return {
                snapshot: null,
                requestedTick: wanted,
                actualTick: nearest.worldTick,
                tickOffset: offset,
                missing: true,
                missingReason: "nearest sample exceeds tick tolerance"
            };
        }
        return {
            snapshot: clone(nearest),
            requestedTick: wanted,
            actualTick: nearest.worldTick,
            tickOffset: offset,
            missing: false,
            missingReason: null
        };
    }

    function alignSeries(seriesByMember, ticks, maxOffset) {
        const source = seriesByMember || {};
        return (ticks || []).map(tick => {
            const members = {};
            Object.keys(source).forEach(key => {
                const samples = source[key] || [];
                let nearest = null;
                samples.forEach(sample => {
                    if (finite(sample.worldTick) == null ||
                        finite(sample.value) == null) return;
                    if (!nearest ||
                        Math.abs(sample.worldTick - tick) <
                            Math.abs(nearest.worldTick - tick)) {
                        nearest = sample;
                    }
                });
                const offset = nearest
                    ? nearest.worldTick - tick : null;
                members[key] = !nearest ||
                    (finite(maxOffset) != null &&
                        Math.abs(offset) > finite(maxOffset))
                    ? {
                        value: null,
                        actualTick: nearest &&
                            nearest.worldTick,
                        tickOffset: offset,
                        missing: true
                    } : {
                        value: nearest.value,
                        actualTick: nearest.worldTick,
                        tickOffset: offset,
                        missing: false
                    };
            });
            return { worldTick: tick, members };
        });
    }

    function demographics(snapshot, memberKeys) {
        const selected = memberKeys
            ? new Set(memberKeys.map(String)) : null;
        const members = (snapshot && snapshot.creatures || [])
            .filter(member => !selected || selected.has(member.key));
        const countBy = field => {
            const counts = {};
            members.forEach(member => {
                const value = member.status === "missing"
                    ? "missing" : member[field] == null
                        ? "unknown" : String(member[field]);
                counts[value] = (counts[value] || 0) + 1;
            });
            return counts;
        };
        return {
            n: members.length,
            present: members.filter(member =>
                member.status === "present").length,
            survivors: members.filter(member =>
                member.status === "present" && !member.dead).length,
            dead: members.filter(member =>
                member.dead || member.status === "dead").length,
            missing: members.filter(member =>
                member.status === "missing").length,
            sex: countBy("sex"),
            genus: countBy("genus"),
            species: countBy("species"),
            ageStage: countBy("ageStage"),
            lifeState: countBy("lifeState")
        };
    }

    function movement(snapshots, key, startTick, endTick) {
        const points = [];
        const rooms = new Set();
        (snapshots || []).forEach(snapshot => {
            if (finite(startTick) != null &&
                snapshot.worldTick < startTick) return;
            if (finite(endTick) != null &&
                snapshot.worldTick > endTick) return;
            const member = (snapshot.creatures || []).find(creature =>
                creature.key === key);
            if (!member || member.status === "missing") return;
            if (member.roomId != null) rooms.add(member.roomId);
            if (member.posX != null && member.posY != null) {
                points.push({
                    worldTick: snapshot.worldTick,
                    x: member.posX,
                    y: member.posY
                });
            }
        });
        let distance = 0;
        for (let index = 1; index < points.length; ++index) {
            const dx = points[index].x - points[index - 1].x;
            const dy = points[index].y - points[index - 1].y;
            distance += Math.sqrt(dx * dx + dy * dy);
        }
        return {
            n: points.length,
            roomsVisited: Array.from(rooms).sort((a, b) => a - b),
            movementDistance: distance,
            rangeX: points.length
                ? Math.max(...points.map(point => point.x)) -
                    Math.min(...points.map(point => point.x))
                : null,
            rangeY: points.length
                ? Math.max(...points.map(point => point.y)) -
                    Math.min(...points.map(point => point.y))
                : null
        };
    }

    function eventRates(events, startTick, endTick, memberKeys) {
        const start = finite(startTick);
        const end = finite(endTick);
        const duration = start == null || end == null
            ? null : Math.max(1, end - start);
        const selected = memberKeys
            ? new Set(memberKeys.map(String)) : null;
        const counts = {};
        (events || []).forEach(event => {
            if (start != null && event.endTick < start) return;
            if (end != null && event.startTick > end) return;
            if (selected && !selected.has(event.subjectKey)) return;
            const key = event.category + ":" + event.transitionKind;
            counts[key] = (counts[key] || 0) +
                (finite(event.count) || 1);
        });
        return Object.keys(counts).sort().map(key => ({
            key,
            count: counts[key],
            durationTicks: duration,
            ratePer1000Ticks: duration == null
                ? null : counts[key] / duration * 1000
        }));
    }

    function fingerprintGenome(genome) {
        const genes = genome && Array.isArray(genome.genes)
            ? genome.genes : [];
        const byType = {};
        genes.forEach(gene => {
            const key = text(gene.type, "?") + "/" +
                text(gene.subtype, "?");
            byType[key] = (byType[key] || 0) + 1;
        });
        return {
            moniker: genome && genome.moniker || null,
            geneCount: finite(genome && genome.geneCount) ||
                genes.length,
            byType
        };
    }

    function diffGenomes(left, right) {
        const a = fingerprintGenome(left);
        const b = fingerprintGenome(right);
        const keys = new Set([
            ...Object.keys(a.byType),
            ...Object.keys(b.byType)
        ]);
        return {
            left: a,
            right: b,
            geneCountDelta: b.geneCount - a.geneCount,
            structural: Array.from(keys).sort().map(key => ({
                key,
                left: a.byType[key] || 0,
                right: b.byType[key] || 0,
                delta: (b.byType[key] || 0) -
                    (a.byType[key] || 0)
            })).filter(row => row.delta !== 0)
        };
    }

    function normalizeDefinition(value) {
        const source = value || {};
        const mode = ["individual", "self", "cohort"]
            .includes(source.mode) ? source.mode : "individual";
        return {
            schemaVersion: SCHEMA_VERSION,
            kind: DEFINITION_KIND,
            id: text(source.id,
                "comparison-" + Date.now()),
            name: text(source.name, "Untitled comparison"),
            mode,
            worldKey: source.worldKey == null
                ? null : String(source.worldKey),
            memberKeys: Array.from(new Set(
                (source.memberKeys || []).map(String)
            )),
            metricIds: Array.from(new Set(
                (source.metricIds || []).map(String)
            )),
            timebase: source.timebase === "relative"
                ? "relative" : "world_tick",
            rangeA: clone(source.rangeA || null),
            rangeB: clone(source.rangeB || null),
            anchorEventId: source.anchorEventId == null
                ? null : String(source.anchorEventId),
            createdAt: text(source.createdAt,
                new Date().toISOString())
        };
    }

    function serializeDefinition(definition) {
        return JSON.stringify(normalizeDefinition(definition), null, 2) +
            "\n";
    }

    function parseDefinition(value) {
        const parsed = typeof value === "string"
            ? JSON.parse(value) : clone(value);
        if (!parsed || parsed.kind !== DEFINITION_KIND ||
            finite(parsed.schemaVersion) !== SCHEMA_VERSION) {
            throw new TypeError("Unsupported comparison definition");
        }
        return normalizeDefinition(parsed);
    }

    function createHistory(options) {
        const maxSnapshots = Math.max(2, Math.trunc(
            finite(options && options.maxSnapshots) ||
                DEFAULT_MAX_SNAPSHOTS
        ));
        let nextSession = 1;
        let activeId = null;
        const sessions = new Map();

        function start(snapshot) {
            const session = {
                id: "cohort-session-" + nextSession++,
                worldKey: snapshot.worldKey,
                worldName: snapshot.worldName,
                firstWorldTick: snapshot.worldTick,
                lastWorldTick: snapshot.worldTick,
                snapshots: [],
                members: new Map(),
                droppedSnapshots: 0
            };
            sessions.set(session.id, session);
            activeId = session.id;
            return session;
        }

        function ingest(payload) {
            const snapshot = normalizeSnapshot(payload);
            let session = activeId && sessions.get(activeId);
            if (!session || session.worldKey !== snapshot.worldKey ||
                snapshot.worldTick < session.lastWorldTick) {
                session = start(snapshot);
            }
            const present = new Set();
            snapshot.creatures.forEach(creature => {
                present.add(creature.key);
                session.members.set(creature.key, clone(creature));
            });
            session.members.forEach((last, key) => {
                if (present.has(key)) return;
                snapshot.creatures.push(Object.assign({}, clone(last), {
                    status: last.dead ? "dead" : "missing",
                    missingReason: last.dead
                        ? "dead creature absent from current engine list"
                        : "not returned by current bulk snapshot"
                }));
            });
            snapshot.creatures.sort((left, right) =>
                left.key.localeCompare(right.key));
            session.snapshots.push(snapshot);
            while (session.snapshots.length > maxSnapshots) {
                session.snapshots.shift();
                session.droppedSnapshots += 1;
            }
            session.firstWorldTick =
                session.snapshots[0].worldTick;
            session.lastWorldTick = snapshot.worldTick;
            return {
                session: summary(session),
                snapshot: clone(snapshot)
            };
        }

        function summary(session) {
            if (!session) return null;
            return {
                id: session.id,
                worldKey: session.worldKey,
                worldName: session.worldName,
                firstWorldTick: session.firstWorldTick,
                lastWorldTick: session.lastWorldTick,
                snapshotCount: session.snapshots.length,
                memberCount: session.members.size,
                droppedSnapshots: session.droppedSnapshots
            };
        }

        function snapshots(sessionId) {
            const session = sessions.get(String(
                sessionId || activeId || ""
            ));
            return session ? clone(session.snapshots) : [];
        }

        return Object.freeze({
            ingest,
            activeSession: () =>
                summary(activeId && sessions.get(activeId)),
            sessions: () => Array.from(sessions.values())
                .map(summary),
            snapshots,
            latest: sessionId => {
                const values = snapshots(sessionId);
                return values.length
                    ? values[values.length - 1] : null;
            }
        });
    }

    return Object.freeze({
        SCHEMA_VERSION,
        DEFINITION_KIND,
        REPORT_KIND,
        DEFAULT_MAX_SNAPSHOTS,
        DEFAULT_NEAREST_TICK_OFFSET,
        memberKey,
        quantile,
        summarize,
        normalizeCreature,
        normalizeSnapshot,
        metricValue,
        distribution,
        nearestSnapshot,
        alignSeries,
        demographics,
        movement,
        eventRates,
        fingerprintGenome,
        diffGenomes,
        normalizeDefinition,
        serializeDefinition,
        parseDefinition,
        createHistory
    });
});
