// session_status.js — shared world/session polling and persistent ribbon view
"use strict";

(function(root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    if (root) root.SessionStatus = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
    const SAMPLE_KEY = "session:status";
    const TRANSPORT_KEY = "session:status:transport";
    const FOREGROUND_INTERVAL_MS = 1000;
    const BACKGROUND_INTERVAL_MS = 5000;
    const DISCONNECT_AFTER_FAILURES = 3;
    let sharedController = null;

    function optionalString(value) {
        if (value == null || String(value).length === 0) return null;
        return String(value);
    }

    function finiteNumber(value) {
        if (value == null || value === "") return null;
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }

    function integer(value) {
        const number = finiteNumber(value);
        return number == null ? null : Math.trunc(number);
    }

    function isoTime(value) {
        const date = value == null ? new Date() : new Date(value);
        if (!Number.isFinite(date.getTime())) {
            throw new TypeError("Session capture time must be valid");
        }
        return date.toISOString();
    }

    function normalizeSessionStatus(payload, capturedAt) {
        if (!payload || typeof payload !== "object") {
            throw new TypeError("Session status must be an object");
        }
        const worldName = optionalString(payload.worldName);
        const requestedWorldName = optionalString(payload.requestedWorldName);
        const worldType = optionalString(payload.worldType) ||
            (worldName === "Startup" ? "startup" : null);
        const requestedWorldType = optionalString(payload.requestedWorldType) ||
            (requestedWorldName === "Startup" ? "startup" : null);
        const gameSpeed = finiteNumber(payload.gameSpeed);
        const creatureCount = integer(payload.creatureCount);

        return Object.freeze({
            worldName,
            worldSessionId: optionalString(payload.worldSessionId),
            worldType,
            worldTick: integer(payload.worldTick),
            systemTick: integer(payload.systemTick),
            paused: typeof payload.paused === "boolean" ? payload.paused : null,
            gameSpeed: gameSpeed != null && gameSpeed > 0 ? gameSpeed : null,
            creatureCount: creatureCount == null ? null : Math.max(0, creatureCount),
            loadPending: Boolean(payload.loadPending && requestedWorldName),
            requestedWorldName,
            requestedWorldType,
            capturedAt: isoTime(capturedAt)
        });
    }

    function applySessionStatus(store, status, sampleIntervalMs) {
        if (!store || typeof store.dispatch !== "function") {
            throw new TypeError("A compatible ObservatoryState store is required");
        }
        const current = store.getState();
        if (current.connection.status !== "connected" ||
            current.connection.error != null) {
            store.dispatch({
                type: "connection/status",
                payload: {
                    status: "connected",
                    changedAt: status.capturedAt
                }
            });
        }
        store.dispatch({
            type: "world/session",
            payload: status
        });
        if (status.paused != null) {
            store.dispatch({
                type: "engine/pause",
                payload: { paused: status.paused }
            });
        }

        const world = store.getState().world;
        if (world.identity && status.worldTick != null) {
            store.recordSample(SAMPLE_KEY, status, {
                worldKey: world.identity.key,
                tick: status.worldTick,
                capturedAt: status.capturedAt,
                sampleIntervalMs,
                evidenceLevel: "observed",
                evidence: { source: "GET /api/session" }
            });
        }
        return status;
    }

    function formatTick(value) {
        return value == null ? "—" : Number(value).toLocaleString("en-US");
    }

    function formatSpeed(value) {
        if (value == null) return "×—";
        const rounded = Math.round(Number(value) * 100) / 100;
        return "×" + String(rounded);
    }

    function formatAge(ageMs) {
        if (ageMs == null) return "updated —";
        const seconds = ageMs / 1000;
        if (seconds < 10) return "updated " + seconds.toFixed(1) + "s ago";
        if (seconds < 60) return "updated " + Math.floor(seconds) + "s ago";
        const minutes = Math.floor(seconds / 60);
        const remainder = Math.floor(seconds % 60);
        return "updated " + minutes + "m " + String(remainder).padStart(2, "0") + "s ago";
    }

    function titleCase(value) {
        if (!value) return "Unknown";
        return value.charAt(0).toUpperCase() + value.slice(1);
    }

    function pollInterval(state, pageHidden) {
        return pageHidden && !state.recording.active
            ? BACKGROUND_INTERVAL_MS
            : FOREGROUND_INTERVAL_MS;
    }

    function deriveSessionView(state, now) {
        const timestamp = now == null ? Date.now() : new Date(now).getTime();
        const sample = state.samples.current[SAMPLE_KEY] || null;
        const sampleValue = sample && sample.value ? sample.value : {};
        const ageMs = sample
            ? Math.max(0, timestamp - new Date(sample.capturedAt).getTime())
            : null;
        const staleAfterMs = sample
            ? Math.max(3000, (sample.sampleIntervalMs || 0) * 2)
            : 3000;
        const stale = !sample ||
            sample.stale ||
            ageMs > staleAfterMs ||
            state.connection.status === "disconnected";
        const transition = state.world.transition;
        const activeIdentity = state.world.identity;
        const noWorld = !activeIdentity ||
            activeIdentity.type === "startup" ||
            state.world.status === "startup" ||
            state.world.status === "none";

        let stateKey;
        let stateLabel;
        let stateIcon;
        if (state.connection.status === "disconnected") {
            stateKey = "disconnected";
            stateLabel = "Disconnected";
            stateIcon = "!";
        } else if (state.world.status === "loading") {
            stateKey = "loading";
            stateLabel = "Loading";
            stateIcon = "↻";
        } else if (state.connection.status === "connecting") {
            stateKey = "connecting";
            stateLabel = "Connecting";
            stateIcon = "…";
        } else if (noWorld) {
            stateKey = "no-world";
            stateLabel = "No World";
            stateIcon = "○";
        } else if (state.engine.paused === true) {
            stateKey = "paused";
            stateLabel = "Paused";
            stateIcon = "❚❚";
        } else {
            stateKey = "running";
            stateLabel = "Running";
            stateIcon = "▶";
        }

        const pendingName = transition && transition.targetName;
        const pendingType = transition && transition.targetType;
        const activeName = activeIdentity && activeIdentity.name !== "Startup"
            ? activeIdentity.name
            : null;
        const activeType = activeIdentity && activeIdentity.type !== "startup"
            ? activeIdentity.type
            : null;
        const worldLabel = pendingName || activeName || "No world";
        const worldType = pendingName ? pendingType : activeIdentity && activeIdentity.type;
        const creatureCount = sampleValue.creatureCount == null
            ? null
            : Math.max(0, Number(sampleValue.creatureCount));
        const ageText = formatAge(ageMs);
        const freshnessText = stale
            ? (sample ? "Stale · " + ageText : "Waiting for first status sample")
            : ageText;
        const connectionLabel = titleCase(state.connection.status);
        const previousWorldText = pendingName && activeName
            ? "Previous world: " + activeName
            : null;
        const creaturesText = creatureCount == null
            ? "— creatures"
            : creatureCount + (creatureCount === 1 ? " creature" : " creatures");
        const tickText = "Tick " + formatTick(state.world.tick);
        const activity = [];
        if (state.recording.active) activity.push("Recording");
        if (state.experiment.status !== "idle" && state.experiment.id) {
            activity.push(state.experiment.name || "Experiment active");
        }
        const activityText = activity.join(" · ");
        const source = sample && sample.evidence
            ? sample.evidence.source
            : "GET /api/session";

        return Object.freeze({
            stateKey,
            stateLabel,
            stateIcon,
            worldLabel,
            worldTypeLabel: worldType ? titleCase(worldType) : "Type unknown",
            activeWorldLabel: activeName || "No world",
            activeWorldTypeLabel: activeType ? titleCase(activeType) : "No world",
            previousWorldText,
            requestedWorldLabel: pendingName
                ? pendingName + (pendingType ? " · " + titleCase(pendingType) : "")
                : "None",
            speedText: formatSpeed(state.world.speed),
            speedValue: state.world.speed,
            tickText,
            worldTickText: formatTick(state.world.tick),
            systemTickText: formatTick(state.world.systemTick),
            creaturesText,
            creatureCountText: creatureCount == null ? "—" : String(creatureCount),
            activityText,
            ageText,
            freshnessText,
            stale,
            capturedAtText: sample
                ? new Date(sample.capturedAt).toLocaleString()
                : "No successful sample",
            connectionLabel,
            connectionError: state.connection.error || "None",
            source,
            ariaLabel: [
                worldLabel,
                worldType ? titleCase(worldType) : null,
                stateLabel,
                formatSpeed(state.world.speed),
                tickText,
                creaturesText,
                activityText || null,
                freshnessText,
                "Open session details"
            ].filter(Boolean).join(". ")
        });
    }

    function setText(element, value) {
        if (element) element.textContent = value;
    }

    function createBrowserController(options) {
        const opts = options || {};
        const store = opts.store;
        const fetchFn = opts.fetch || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
        const documentObj = opts.document ||
            (typeof document !== "undefined" ? document : null);
        const windowObj = opts.window ||
            (typeof window !== "undefined" ? window : null);
        const now = opts.now || (() => new Date());
        const setTimer = opts.setTimeout ||
            (typeof setTimeout === "function" ? setTimeout : null);
        const clearTimer = opts.clearTimeout ||
            (typeof clearTimeout === "function" ? clearTimeout : null);

        if (!store || !fetchFn) {
            throw new TypeError("SessionStatus requires ObservatoryState and fetch");
        }

        let running = false;
        let timer = null;
        let polling = false;
        let consecutiveFailures = 0;
        let unsubscribe = null;
        // The pending choice, until it is applied. A refresh must not undo it.
        let speedDraft = null;

        const byId = id => documentObj ? documentObj.getElementById(id) : null;
        const elements = {
            ribbon: byId("session-ribbon"),
            summary: byId("session-summary"),
            world: byId("session-world"),
            type: byId("session-type"),
            state: byId("session-state"),
            stateIcon: byId("session-state-icon"),
            speed: byId("session-speed"),
            tick: byId("session-tick"),
            creatures: byId("session-creatures"),
            activity: byId("session-activity"),
            age: byId("session-age"),
            previous: byId("session-previous-world"),
            popover: byId("session-popover"),
            popoverClose: byId("session-popover-close"),
            detailWorld: byId("session-detail-world"),
            detailType: byId("session-detail-type"),
            detailState: byId("session-detail-state"),
            detailConnection: byId("session-detail-connection"),
            detailSpeed: byId("session-detail-speed"),
            detailWorldTick: byId("session-detail-world-tick"),
            detailSystemTick: byId("session-detail-system-tick"),
            detailCreatures: byId("session-detail-creatures"),
            activityRow: byId("session-detail-activity-row"),
            detailActivity: byId("session-detail-activity"),
            detailFreshness: byId("session-detail-freshness"),
            detailCaptured: byId("session-detail-captured"),
            detailSource: byId("session-detail-source"),
            pendingRow: byId("session-detail-pending-row"),
            detailPending: byId("session-detail-pending"),
            speedSelect: byId("session-speed-select"),
            speedApply: byId("session-speed-apply"),
            speedResult: byId("session-speed-result")
        };

        function render() {
            const view = deriveSessionView(store.getState(), now());
            if (elements.ribbon) {
                elements.ribbon.dataset.state = view.stateKey;
                elements.ribbon.classList.toggle("session-ribbon--stale", view.stale);
            }
            if (elements.summary) {
                elements.summary.setAttribute("aria-label", view.ariaLabel);
                elements.summary.setAttribute(
                    "aria-expanded",
                    elements.popover && elements.popover.open ? "true" : "false"
                );
            }
            setText(elements.world, view.worldLabel);
            if (elements.world) elements.world.title = view.worldLabel;
            setText(elements.type, view.worldTypeLabel);
            setText(elements.state, view.stateLabel);
            setText(elements.stateIcon, view.stateIcon);
            setText(elements.speed, view.speedText);
            setText(elements.tick, view.tickText);
            setText(elements.creatures, view.creaturesText);
            setText(elements.activity, view.activityText);
            if (elements.activity) elements.activity.hidden = !view.activityText;
            setText(elements.age, view.freshnessText);
            setText(elements.previous, view.previousWorldText || "");
            if (elements.previous) {
                elements.previous.hidden = !view.previousWorldText;
                elements.previous.title = view.previousWorldText || "";
            }

            setText(elements.detailWorld, view.activeWorldLabel);
            setText(elements.detailType, view.activeWorldTypeLabel);
            setText(elements.detailState, view.stateLabel);
            setText(
                elements.detailConnection,
                view.connectionError === "None"
                    ? view.connectionLabel
                    : view.connectionLabel + " — " + view.connectionError
            );
            setText(elements.detailSpeed, view.speedText);
            setText(elements.detailWorldTick, view.worldTickText);
            setText(elements.detailSystemTick, view.systemTickText);
            setText(elements.detailCreatures, view.creatureCountText);
            setText(elements.detailActivity, view.activityText || "None");
            if (elements.activityRow) elements.activityRow.hidden = !view.activityText;
            setText(elements.detailFreshness, view.freshnessText);
            setText(elements.detailCaptured, view.capturedAtText);
            setText(elements.detailSource, view.source);
            setText(elements.detailPending, view.requestedWorldLabel);
            if (elements.pendingRow) {
                elements.pendingRow.hidden = view.requestedWorldLabel === "None";
            }
            if (elements.speedSelect && speedDraft == null &&
                view.speedValue != null &&
                Array.from(elements.speedSelect.options).some(option =>
                    Number(option.value) === Number(view.speedValue))) {
                elements.speedSelect.value = String(view.speedValue);
            }
            return view;
        }

        function positionPopover() {
            if (!elements.popover || !elements.summary ||
                !elements.popover.open || !windowObj) return;
            const padding = 12;
            const gap = 8;
            const anchor = elements.summary.getBoundingClientRect();
            const width = elements.popover.offsetWidth;
            const height = elements.popover.offsetHeight;
            const left = Math.max(
                padding,
                Math.min(
                    anchor.left + (anchor.width - width) / 2,
                    windowObj.innerWidth - width - padding
                )
            );
            const below = anchor.bottom + gap;
            const top = below + height <= windowObj.innerHeight - padding
                ? below
                : Math.max(padding, anchor.top - height - gap);
            elements.popover.style.left = Math.round(left) + "px";
            elements.popover.style.top = Math.round(top) + "px";
        }

        function closePopover() {
            if (!elements.popover || !elements.popover.open) return;
            if (typeof elements.popover.close === "function") {
                elements.popover.close();
            } else {
                elements.popover.removeAttribute("open");
            }
            if (elements.summary) elements.summary.setAttribute("aria-expanded", "false");
        }

        function openPopover() {
            if (!elements.popover) return;
            if (elements.popover.open) {
                closePopover();
                return;
            }
            if (typeof elements.popover.show === "function") {
                elements.popover.show();
            } else {
                elements.popover.setAttribute("open", "");
            }
            if (elements.summary) elements.summary.setAttribute("aria-expanded", "true");
            render();
            positionPopover();
        }

        async function refresh(force) {
            const interval = pollInterval(
                store.getState(),
                Boolean(documentObj && documentObj.hidden)
            );
            try {
                const envelope = await store.requestShared(
                    TRANSPORT_KEY,
                    async () => {
                        const response = await fetchFn("/api/session", {
                            headers: { Accept: "application/json" }
                        });
                        if (!response.ok) {
                            throw new Error("Session status request failed: HTTP " + response.status);
                        }
                        return {
                            payload: await response.json(),
                            capturedAt: isoTime(now())
                        };
                    },
                    {
                        store: false,
                        cacheForMs: force ? 0 : 250
                    }
                );
                const status = normalizeSessionStatus(
                    envelope.payload,
                    envelope.capturedAt
                );
                consecutiveFailures = 0;
                applySessionStatus(store, status, interval);
                render();
                return status;
            } catch (error) {
                consecutiveFailures += 1;
                store.dispatch({
                    type: "sample/stale",
                    payload: { key: SAMPLE_KEY, reason: "poll-failed" }
                });
                if (consecutiveFailures >= DISCONNECT_AFTER_FAILURES) {
                    store.dispatch({
                        type: "connection/status",
                        payload: {
                            status: "disconnected",
                            changedAt: isoTime(now()),
                            error: error && error.message
                                ? error.message
                                : "Session status unavailable"
                        }
                    });
                }
                render();
                throw error;
            }
        }

        function scheduleNext() {
            if (!running || !setTimer) return;
            const interval = pollInterval(
                store.getState(),
                Boolean(documentObj && documentObj.hidden)
            );
            timer = setTimer(runPoll, interval);
        }

        async function runPoll() {
            if (!running || polling) return;
            polling = true;
            try {
                await refresh(false);
            } catch (_) {
                // State and UI already carry the failure.
            } finally {
                polling = false;
                scheduleNext();
            }
        }

        async function setSpeed(multiplier) {
            const value = Number(multiplier);
            if (!Number.isFinite(value) || value <= 0) {
                throw new TypeError("Simulation speed must be greater than zero");
            }
            if (elements.speedApply) elements.speedApply.disabled = true;
            setText(elements.speedResult, "Applying…");
            try {
                const response = await fetchFn("/api/engine/tickrate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ multiplier: value })
                });
                if (!response.ok) {
                    throw new Error("Speed request failed: HTTP " + response.status);
                }
                const result = await response.json();
                if (!result.ok) throw new Error(result.error || "Speed request failed");
                speedDraft = null;
                await refresh(true);
                setText(elements.speedResult, "Applied " + formatSpeed(result.multiplier));
                return result;
            } catch (error) {
                setText(elements.speedResult, error.message || "Speed request failed");
                throw error;
            } finally {
                if (elements.speedApply) elements.speedApply.disabled = false;
            }
        }

        function onVisibilityChange() {
            if (!running) return;
            if (timer && clearTimer) clearTimer(timer);
            timer = null;
            if (!polling) runPoll();
        }

        function start() {
            if (running) return;
            running = true;
            const state = store.getState();
            if (state.connection.status === "disconnected") {
                store.dispatch({
                    type: "connection/status",
                    payload: {
                        status: "connecting",
                        changedAt: isoTime(now())
                    }
                });
            }
            if (!unsubscribe) {
                unsubscribe = store.subscribe(
                    stateValue => {
                        const sample = stateValue.samples.current[SAMPLE_KEY];
                        return [
                            stateValue.connection.status,
                            stateValue.connection.error,
                            stateValue.engine.paused,
                            stateValue.world.status,
                            stateValue.world.identity && stateValue.world.identity.key,
                            stateValue.world.tick,
                            stateValue.world.systemTick,
                            stateValue.world.speed,
                            stateValue.world.transition && stateValue.world.transition.targetName,
                            stateValue.recording.active,
                            stateValue.experiment.id,
                            stateValue.experiment.name,
                            stateValue.experiment.status,
                            sample && sample.capturedAt,
                            sample && sample.stale
                        ].join("|");
                    },
                    render
                );
            }
            render();
            runPoll();
        }

        function stop() {
            running = false;
            if (timer && clearTimer) clearTimer(timer);
            timer = null;
            if (unsubscribe) unsubscribe();
            unsubscribe = null;
        }

        if (elements.summary) {
            elements.summary.addEventListener("click", openPopover);
        }
        if (elements.popoverClose) {
            elements.popoverClose.addEventListener("click", closePopover);
        }
        if (elements.speedSelect) {
            elements.speedSelect.addEventListener("change", () => {
                speedDraft = elements.speedSelect.value;
                setText(elements.speedResult, "");
            });
        }
        if (elements.speedApply && elements.speedSelect) {
            elements.speedApply.addEventListener("click", () => {
                setSpeed(elements.speedSelect.value).catch(() => {});
            });
        }
        if (documentObj) {
            documentObj.addEventListener("pointerdown", event => {
                if (!elements.popover || !elements.popover.open) return;
                if (elements.popover.contains(event.target) ||
                    (elements.summary && elements.summary.contains(event.target))) return;
                closePopover();
            });
            documentObj.addEventListener("keydown", event => {
                if (event.key === "Escape") closePopover();
            });
            documentObj.addEventListener("visibilitychange", onVisibilityChange);
        }
        if (windowObj) windowObj.addEventListener("resize", positionPopover);

        render();
        return Object.freeze({
            start,
            stop,
            refresh,
            render,
            setSpeed,
            openPopover,
            closePopover
        });
    }

    function mount(options) {
        if (!sharedController) {
            sharedController = createBrowserController(options);
        }
        return sharedController;
    }

    function refresh(force) {
        if (!sharedController) {
            return Promise.reject(new Error("SessionStatus has not been mounted"));
        }
        return sharedController.refresh(force);
    }

    return Object.freeze({
        SAMPLE_KEY,
        FOREGROUND_INTERVAL_MS,
        BACKGROUND_INTERVAL_MS,
        DISCONNECT_AFTER_FAILURES,
        normalizeSessionStatus,
        applySessionStatus,
        deriveSessionView,
        formatTick,
        formatSpeed,
        formatAge,
        pollInterval,
        createBrowserController,
        mount,
        refresh
    });
});
