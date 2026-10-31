// log_workspace.js — contextual, bounded SSE log workspace
"use strict";

(() => {
const Model = window.ObservatoryLogModel;
if (!Model) return;

const buffer = Model.createBuffer();
const dom = {
    panel: document.getElementById("tab-log"),
    inner: document.getElementById("log-inner"),
    container: document.getElementById("log-container"),
    anchor: document.getElementById("scroll-anchor"),
    stream: document.getElementById("log-stream-state"),
    search: document.getElementById("search"),
    pause: document.getElementById("btn-pause"),
    clear: document.getElementById("btn-clear"),
    copy: document.getElementById("btn-copy"),
    export: document.getElementById("btn-export"),
    exportFormat: document.getElementById("log-export-format"),
    overlay: document.getElementById("pause-overlay"),
    pauseBuffered: document.getElementById("pause-buffered"),
    summary: document.getElementById("log-buffer-summary"),
    world: document.getElementById("log-filter-world"),
    agent: document.getElementById("log-filter-agent"),
    classifier: document.getElementById("log-filter-classifier"),
    event: document.getElementById("log-filter-event"),
    range: document.getElementById("log-filter-range"),
    tickWindow: document.getElementById("log-filter-tick-window"),
    timestamps: document.getElementById("opt-timestamps"),
    ticks: document.getElementById("opt-world-ticks"),
    autoscroll: document.getElementById("opt-autoscroll"),
    compact: document.getElementById("opt-compact"),
    preview: document.getElementById("log-context-preview"),
    previewBody: document.getElementById("log-context-preview-body"),
    previewActions: document.getElementById("log-context-actions"),
    annotation: document.getElementById("log-annotation"),
    saveAnnotation: document.getElementById("log-save-annotation"),
    closePreview: document.getElementById("log-close-preview")
};

let paused = false;
let bufferedWhilePaused = 0;
let renderPending = false;
let disconnectGapOpen = false;
let selectedId = null;
let previewedRecordId = null;
let worldSessionStartWallTimeMs = null;

const CLASS_BY_SUBSYSTEM = {
    error: "cat-error",
    shutdown: "cat-shutdown",
    network: "cat-network",
    world: "cat-world",
    caos: "cat-caos",
    sound: "cat-sound",
    crash: "cat-crash"
};

function checkedSet(attribute) {
    return new Set(Array.from(document.querySelectorAll(
        `input[${attribute}]:checked`
    )).map(input => input.getAttribute(attribute)));
}

function selectedContextTick() {
    const state = ObservatoryState.getState();
    const event = state.selection && state.selection.event;
    if (event && event.worldTick != null) return Number(event.worldTick);
    return state.world && state.world.tick != null ? Number(state.world.tick) : null;
}

function filters() {
    return {
        query: dom.search.value,
        severities: checkedSet("data-severity"),
        subsystems: checkedSet("data-subsystem"),
        world: dom.world.value.trim() || null,
        agent: dom.agent.value.trim() || null,
        classifier: dom.classifier.value.trim() || null,
        event: dom.event.value.trim(),
        range: dom.range.value,
        tickWindow: Number(dom.tickWindow.value),
        contextTick: selectedContextTick(),
        worldSessionStartWallTimeMs
    };
}

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    return (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + " KiB";
}

function formatWall(value) {
    if (value == null) return "wall —";
    return new Date(value).toLocaleTimeString([], {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        fractionalSecondDigits: 3
    });
}

function updateSummary() {
    const stats = buffer.stats();
    const range = stats.firstWallTimeMs == null
        ? "time unavailable"
        : formatWall(stats.firstWallTimeMs) + "–" + formatWall(stats.lastWallTimeMs);
    dom.summary.textContent = stats.rawCount + " records · " +
        stats.displayCount + " rows · " + formatBytes(stats.byteCount) +
        " · " + range;
}

function contextLabel(record) {
    if (record.contextTiming === "engine_main_thread") return "exact main-thread context";
    if (record.contextTiming === "nearest_engine_poll") return "nearest engine snapshot";
    return "context unavailable";
}

function rowFor(record) {
    const row = document.createElement("article");
    const subsystemClass = CLASS_BY_SUBSYSTEM[record.subsystem] || "cat-other";
    row.className = "log-row " + subsystemClass +
        " log-severity-" + record.severity +
        (selectedId === record.id ? " log-row--selected" : "");
    row.dataset.recordId = record.id;
    row.dataset.patchKey = record.id;
    row.tabIndex = 0;

    if (record.kind === "gap" || record.kind === "world_boundary") {
        row.classList.add("log-row--" + record.kind.replace("_", "-"));
    }

    const bookmark = document.createElement("button");
    bookmark.type = "button";
    bookmark.className = "log-bookmark";
    bookmark.textContent = record.bookmarked ? "★" : "☆";
    bookmark.setAttribute("aria-label", record.bookmarked
        ? "Remove bookmark"
        : "Bookmark record");

    const wall = document.createElement("time");
    wall.className = "log-ts log-wall-time";
    wall.hidden = !dom.timestamps.checked;
    wall.textContent = formatWall(record.wallTimeMs || record.receivedAtWallTimeMs);

    const tick = document.createElement("span");
    tick.className = "log-tick";
    tick.hidden = !dom.ticks.checked;
    tick.textContent = record.worldTick == null ? "tick —" : "tick " + record.worldTick;

    const badge = document.createElement("span");
    badge.className = "log-cat";
    badge.textContent = record.kind === "gap"
        ? "GAP"
        : record.kind === "world_boundary"
            ? "WORLD"
            : record.subsystem;
    badge.title = record.severity + " severity · " + record.subsystem + " subsystem";

    const message = document.createElement("span");
    message.className = "log-msg";
    message.textContent = record.message || "(empty record)";

    row.append(bookmark, wall, tick, badge, message);

    if (record.duplicateCount > 1) {
        const count = document.createElement("span");
        count.className = "log-duplicate-count";
        count.textContent = "×" + record.duplicateCount;
        count.title = "Consecutive duplicates collapsed; export preserves this count";
        row.appendChild(count);
    }
    if (record.annotation) {
        const note = document.createElement("span");
        note.className = "log-annotation-mark";
        note.textContent = "NOTE";
        note.title = record.annotation;
        row.appendChild(note);
    }
    if (record.agent || record.script || record.correlationId ||
        record.contextTiming !== "unavailable") {
        const inspect = document.createElement("button");
        inspect.type = "button";
        inspect.className = "log-context-link";
        inspect.textContent = "Preview context";
        inspect.title = contextLabel(record) + "; preview before following links";
        row.appendChild(inspect);
    }
    return row;
}

function rowRecordId(event) {
    const row = event.target.closest(".log-row");
    return row ? row.dataset.recordId : null;
}

dom.inner.addEventListener("click", event => {
    const id = rowRecordId(event);
    if (!id) return;
    if (event.target.closest(".log-bookmark")) {
        const record = recordById(id);
        if (record) {
            buffer.update(id, { bookmarked: !record.bookmarked });
            scheduleRender();
        }
        return;
    }
    selectRecord(id);
});
dom.inner.addEventListener("keydown", event => {
    if ((event.key === "Enter" || event.key === " ") &&
            event.target.classList.contains("log-row")) {
        event.preventDefault();
        selectRecord(rowRecordId(event));
    }
});

function render() {
    renderPending = false;
    if (paused || !logsVisible()) return;
    const records = Model.filterRecords(buffer.records(), filters());
    const visible = records.slice(-2000);
    DomPatch.updateChildren(dom.inner, visible.map(rowFor));
    updateSummary();
    if (selectedId) renderPreview();
    if (dom.autoscroll.checked) {
        requestAnimationFrame(() => dom.anchor.scrollIntoView({ block: "end" }));
    }
}

// Records keep arriving on every route; only drawing them waits for the tab.
function logsVisible() {
    return !dom.panel.hidden;
}

function scheduleRender() {
    if (renderPending || paused || !logsVisible()) return;
    renderPending = true;
    requestAnimationFrame(render);
}

function append(raw) {
    const record = buffer.ingest(raw, Date.now());
    if (!record) return;
    DevToolsEvents.emit("log:record", Model.publicRecord(record));
    if (record.kind === "world_boundary") {
        worldSessionStartWallTimeMs = record.wallTimeMs ||
            record.receivedAtWallTimeMs;
    }
    if (paused) {
        bufferedWhilePaused += 1;
        dom.pauseBuffered.textContent = bufferedWhilePaused;
        updateSummary();
    } else {
        scheduleRender();
    }
}

function setStreamState(state) {
    dom.stream.dataset.state = state;
    dom.stream.textContent = {
        connecting: "Stream connecting",
        live: "Stream live",
        reconnecting: "Stream reconnecting"
    }[state] || "Stream unknown";
}

function connect() {
    setStreamState("connecting");
    const source = new EventSource("/api/events");
    source.onopen = () => {
        setStreamState("live");
        disconnectGapOpen = false;
    };
    source.onerror = () => {
        setStreamState("reconnecting");
        if (!disconnectGapOpen) {
            append({
                schemaVersion: 2,
                kind: "gap",
                source: "browser",
                severity: "warning",
                subsystem: "network",
                reason: "disconnect",
                message: "Log stream disconnected; EventSource is reconnecting"
            });
            disconnectGapOpen = true;
        }
    };
    source.onmessage = event => {
        try {
            append(JSON.parse(event.data));
        } catch (_) {
            append({
                schemaVersion: 1,
                legacy: true,
                message: event.data
            });
        }
    };
}

function recordById(id) {
    return buffer.records().find(record => record.id === id) || null;
}

function addAction(label, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-light";
    button.textContent = label;
    button.addEventListener("click", handler);
    dom.previewActions.appendChild(button);
}

function navigateTo(record, tab, view) {
    const context = ObservatoryNavigation.extractLogContext(record);
    if (!context || !window.DevToolsNavigation) return;
    const world = ObservatoryState.getState().world.identity;
    window.DevToolsNavigation.navigate({
        tab,
        view,
        worldKey: world && world.key,
        primary: "logRecord",
        selections: context.selections
    });
}

function renderPreview() {
    const record = recordById(selectedId);
    if (!record) {
        dom.preview.hidden = true;
        previewedRecordId = null;
        return;
    }
    const lines = [
        ["Evidence", record.legacy ? "Legacy / compatibility" : "Observed log record"],
        ["Context timing", contextLabel(record)],
        ["World", record.worldName || "Unknown"],
        ["World tick", record.worldTick == null ? "Unknown" : record.worldTick],
        ["System tick", record.systemTick == null ? "Unknown" : record.systemTick],
        ["Wall time", record.wallTimeMs == null
            ? "Unavailable (receipt: " + formatWall(record.receivedAtWallTimeMs) + ")"
            : new Date(record.wallTimeMs).toISOString()],
        ["Agent", record.agent ? "#" + record.agent.id + " · " +
            [record.agent.family, record.agent.genus, record.agent.species].join(" ") : "None"],
        ["Script", record.script ? [
            record.script.family,
            record.script.genus,
            record.script.species,
            record.script.event
        ].join(" ") + (record.script.ip == null ? "" : " · IP " + record.script.ip) : "None"],
        ["Correlation", record.correlationId || "None"],
        ["Duplicates", record.duplicateCount]
    ];
    const list = document.createElement("dl");
    lines.forEach(pair => {
        const term = document.createElement("dt");
        term.textContent = pair[0];
        const value = document.createElement("dd");
        value.textContent = String(pair[1]);
        list.append(term, value);
    });
    DomPatch.updateChildren(dom.previewBody, [list]);
    dom.preview.hidden = false;
    // Incoming records refresh the preview; the actions and the note being
    // typed only change when a different record is opened.
    if (previewedRecordId === record.id) return;
    previewedRecordId = record.id;
    dom.previewActions.replaceChildren();
    const context = ObservatoryNavigation.extractLogContext(record);
    if (context) {
        addAction("Open agent", () => navigateTo(record, "debugger", "agent"));
        if (record.script) {
            addAction("Open in Scripts", () => navigateTo(record, "scripts", "script"));
            addAction("Open in Debugger", () => navigateTo(record, "debugger", "script"));
        }
    }
    dom.annotation.value = record.annotation || "";
}

function selectRecord(id) {
    selectedId = id;
    renderPreview();
    scheduleRender();
}

function download(format, content) {
    const extension = format === "text" ? "txt" : format;
    const type = format === "json"
        ? "application/json"
        : format === "jsonl"
            ? "application/x-ndjson"
            : "text/plain";
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "creatures3-observatory-log." + extension;
    link.click();
    URL.revokeObjectURL(url);
}

dom.pause.addEventListener("click", () => {
    paused = !paused;
    dom.pause.textContent = paused ? "Resume stream" : "Pause stream";
    dom.pause.classList.toggle("active", paused);
    dom.overlay.hidden = !paused;
    if (!paused) {
        bufferedWhilePaused = 0;
        dom.pauseBuffered.textContent = "0";
        scheduleRender();
    }
});
DevToolsEvents.on("tab:activated", tab => {
    if (tab === "log") scheduleRender();
});
dom.clear.addEventListener("click", () => {
    buffer.clear();
    selectedId = null;
    previewedRecordId = null;
    worldSessionStartWallTimeMs = null;
    dom.preview.hidden = true;
    render();
});
dom.copy.addEventListener("click", () => {
    const records = Model.filterRecords(buffer.records(), filters());
    // Plain HTTP from another machine is not a secure context: no clipboard.
    if (!navigator.clipboard) {
        dom.copy.textContent = "Use Export";
        setTimeout(() => { dom.copy.textContent = "Copy"; }, 1500);
        return;
    }
    navigator.clipboard.writeText(Model.exportRecords(records, "text"))
        .then(() => {
            const label = dom.copy.textContent;
            dom.copy.textContent = "Copied " + records.length;
            setTimeout(() => { dom.copy.textContent = label; }, 1500);
        })
        .catch(() => {
            dom.copy.textContent = "Copy failed";
            setTimeout(() => { dom.copy.textContent = "Copy"; }, 1500);
        });
});
dom.export.addEventListener("click", () => {
    const format = dom.exportFormat.value;
    const records = Model.filterRecords(buffer.records(), filters());
    download(format, Model.exportRecords(records, format));
});
dom.saveAnnotation.addEventListener("click", () => {
    if (!selectedId) return;
    buffer.update(selectedId, { annotation: dom.annotation.value.trim() });
    scheduleRender();
    renderPreview();
});
dom.closePreview.addEventListener("click", () => {
    selectedId = null;
    dom.preview.hidden = true;
    scheduleRender();
});

[
    dom.search,
    dom.world,
    dom.agent,
    dom.classifier,
    dom.event,
    dom.range,
    dom.tickWindow,
    dom.timestamps,
    dom.ticks,
    dom.autoscroll
].forEach(control => {
    control.addEventListener(control.tagName === "INPUT" &&
        !["checkbox", "number"].includes(control.type) ? "input" : "change", scheduleRender);
});
document.querySelectorAll(
    "input[data-severity], input[data-subsystem]"
).forEach(input => input.addEventListener("change", scheduleRender));
dom.compact.addEventListener("change", () => {
    document.body.classList.toggle("compact", dom.compact.checked);
});

window.DevToolsNavigation.registerWorkspace("log", {
    capture() {
        return {
            query: dom.search.value,
            world: dom.world.value,
            agent: dom.agent.value,
            classifier: dom.classifier.value,
            event: dom.event.value,
            range: dom.range.value,
            tickWindow: dom.tickWindow.value,
            severities: Array.from(document.querySelectorAll(
                "input[data-severity]"
            )).map(input => ({
                value: input.dataset.severity,
                checked: input.checked
            })),
            subsystems: Array.from(document.querySelectorAll(
                "input[data-subsystem]"
            )).map(input => ({
                value: input.dataset.subsystem,
                checked: input.checked
            })),
            timestamps: dom.timestamps.checked,
            ticks: dom.ticks.checked,
            autoscroll: dom.autoscroll.checked,
            compact: dom.compact.checked,
            selectedId,
            scrollTop: dom.container.scrollTop
        };
    },
    restore(saved) {
        if (!saved) return;
        ["query", "world", "agent", "classifier", "event"].forEach(key => {
            const element = key === "query" ? dom.search : dom[key];
            element.value = saved[key] || "";
        });
        if (saved.range) dom.range.value = saved.range;
        if (saved.tickWindow) dom.tickWindow.value = saved.tickWindow;
        (saved.severities || []).forEach(savedFilter => {
            const input = document.querySelector(
                `input[data-severity="${savedFilter.value}"]`
            );
            if (input) input.checked = Boolean(savedFilter.checked);
        });
        (saved.subsystems || []).forEach(savedFilter => {
            const input = document.querySelector(
                `input[data-subsystem="${savedFilter.value}"]`
            );
            if (input) input.checked = Boolean(savedFilter.checked);
        });
        ["timestamps", "ticks", "autoscroll", "compact"].forEach(key => {
            if (saved[key] != null) dom[key].checked = Boolean(saved[key]);
        });
        selectedId = saved.selectedId && recordById(saved.selectedId)
            ? saved.selectedId
            : null;
        if (!selectedId) dom.preview.hidden = true;
        document.body.classList.toggle("compact", dom.compact.checked);
        scheduleRender();
        requestAnimationFrame(() => {
            dom.container.scrollTop = Number(saved.scrollTop) || 0;
        });
    }
});

connect();
updateSummary();
})();
