// caos_format.js — Creatures 3 Developer Tools — CAOS Source Formatter
// Pretty-prints raw CAOS source code with indentation and line breaks.
"use strict";

/**
 * Format raw CAOS source code into readable, indented text.
 * @param {string} raw - Raw CAOS source (may be a single long line)
 * @returns {string} Formatted source with line breaks and indentation
 */
function formatCAOS(raw) {
    if (!raw || typeof raw !== "string") return raw || "";

    const INDENT = "    "; // 4 spaces

    // ── Block openers: indent AFTER this line ────────────────────────────
    const BLOCK_OPEN = new Set([
        "doif", "elif", "else",
        "reps", "loop",
        "enum", "esee", "etch", "epas", "econ",
        "subr",
    ]);

    // ── Block closers: dedent BEFORE this line ───────────────────────────
    const BLOCK_CLOSE = new Set([
        "endi", "repe", "untl", "ever", "next",
        "elif", "else",  // also close the previous block level
    ]);

    // ── Statement starters: force a new line before these ────────────────
    // This is the core set of CAOS commands that begin new statements.
    const STMT_START = new Set([
        // flow control
        "doif", "elif", "else", "endi",
        "reps", "repe", "loop", "untl", "ever",
        "enum", "esee", "etch", "epas", "econ", "next",
        "subr", "gsub", "retn", "call",
        "inst", "slow", "lock", "unlk", "endm", "stop",
        // variable manipulation
        "setv", "addv", "subv", "mulv", "divv", "modv",
        "andv", "orrv", "negv", "notv",
        "seta", "sets",
        // agent / target
        "targ", "ownr",
        "new:", "kill",
        "rtar", "star",
        // movement
        "mvto", "mvsf", "mvby", "mvft", "mesg",
        "accg", "aero", "elas", "attr", "bhvr", "perm",
        "flto", "frel",
        // output
        "outs", "outv", "outx",
        // animation / appearance
        "anim", "over", "pose", "base", "gall",
        "tick", "wait",
        // agent properties
        "pupt", "puhl", "emit", "plne",
        "fmly", "gnus", "spcs", "unid",
        "clas", "cls2",
        // sound
        "snde", "sndc", "sndl", "sndq", "stpc", "mclr", "mmsc",
        // network / pray / file
        "net:", "pray", "file",
        // misc
        "ject", "clik", "clac", "cabn", "cabw", "cabp",
        "rpas", "rnge",
        "simp", "cbtn", "part",
        "link", "dbg:",
        "scrp", "rscr", "iscr",
        // camera
        "cmra", "cmrp", "cmrt", "wndw", "meta",
        "pat:", "stm#",
        // genetics / creatures
        "gene", "gids", "hist",
        // variables
        "delg", "deln",
    ]);

    // ── Tokenize: split on whitespace but respect "string literals" ──────
    const tokens = [];
    let i = 0;
    while (i < raw.length) {
        // Skip whitespace
        if (raw[i] === " " || raw[i] === "\t" || raw[i] === "\n" || raw[i] === "\r") {
            i++;
            continue;
        }

        // String literal
        if (raw[i] === '"') {
            let j = i + 1;
            while (j < raw.length && raw[j] !== '"') j++;
            tokens.push(raw.substring(i, j + 1));
            i = j + 1;
            continue;
        }

        // Byte string [...]
        if (raw[i] === "[") {
            let j = i + 1;
            while (j < raw.length && raw[j] !== "]") j++;
            tokens.push(raw.substring(i, j + 1));
            i = j + 1;
            continue;
        }

        // Regular token
        let j = i;
        while (j < raw.length && raw[j] !== " " && raw[j] !== "\t" &&
               raw[j] !== "\n" && raw[j] !== "\r") j++;
        tokens.push(raw.substring(i, j));
        i = j;
    }

    if (tokens.length === 0) return "";

    // ── Format: build output lines with indentation ──────────────────────
    const lines = [];
    let currentLine = [];
    let depth = 0;

    function flushLine() {
        if (currentLine.length > 0) {
            const indent = INDENT.repeat(Math.max(0, depth));
            lines.push(indent + currentLine.join(" "));
            currentLine = [];
        }
    }

    for (let t = 0; t < tokens.length; t++) {
        const tok = tokens[t];
        const lower = tok.toLowerCase();

        // Check if this token starts a new statement
        // Also check for compound commands like "new: simp", "dbg: prof", "pat: fixd"
        const isCompound = (lower === "new:" || lower === "dbg:" ||
                            lower === "pat:" || lower === "stm#" ||
                            lower === "net:" || lower === "cls2");
        const isStmtStart = STMT_START.has(lower);

        if (isStmtStart && t > 0) {
            // Flush the previous line
            flushLine();

            // Handle dedent for block closers
            if (BLOCK_CLOSE.has(lower)) {
                depth = Math.max(0, depth - 1);
            }
        } else if (t === 0 && BLOCK_CLOSE.has(lower)) {
            depth = Math.max(0, depth - 1);
        }

        currentLine.push(tok);

        // For compound commands, grab the next token onto the same line
        if (isCompound && t + 1 < tokens.length) {
            t++;
            currentLine.push(tokens[t]);
        }

        // Handle indent after block openers (but not elif/else which already dedented)
        if (BLOCK_OPEN.has(lower) && !BLOCK_CLOSE.has(lower)) {
            // flush this line first so the block opener is on its own line
            // (it was already pushed to currentLine above)
            // Depth increases AFTER this line
        }
    }

    // Flush remaining
    flushLine();

    // Now apply indentation increases after block openers
    // We need a second pass because the indent happens AFTER the line
    const result = [];
    depth = 0;

    for (const line of lines) {
        const trimmed = line.trimStart();
        const firstWord = trimmed.split(/\s+/)[0].toLowerCase();

        // Dedent before closers
        if (BLOCK_CLOSE.has(firstWord)) {
            depth = Math.max(0, depth - 1);
        }

        result.push(INDENT.repeat(depth) + trimmed);

        // Indent after openers (but not elif/else which are both close+open)
        if (BLOCK_OPEN.has(firstWord)) {
            depth++;
        }
    }

    return result.join("\n");
}

// Export for use by other modules
if (typeof window !== "undefined") {
    window.formatCAOS = formatCAOS;
}

/**
 * Syntax-highlight a single line of CAOS source, returning HTML with spans.
 * Uses the same keyword sets as the formatter for consistency.
 * @param {string} line - A single line of CAOS code
 * @returns {string} HTML with <span class="hl-*"> wrappers
 */
function highlightCAOS(line) {
    const FLOW = new Set([
        "doif", "elif", "else", "endi", "loop", "untl", "ever", "next",
        "repe", "reps", "enum", "esee", "etch", "epas", "econ",
        "subr", "gsub", "retn", "inst", "slow", "lock", "unlk", "stop",
        "call", "endm", "scrp", "iscr", "rscr"
    ]);

    const COMMANDS = new Set([
        "setv", "addv", "subv", "mulv", "divv", "modv", "negv", "andv", "orrv",
        "sets", "adds", "notv",
        "seta", "targ", "ownr", "from", "null", "norn", "pntr",
        "new:", "simp", "comp", "vhcl", "crea",
        "mvto", "mvsf", "mvby", "mesg", "writ", "stim",
        "pose", "anim", "over", "base", "part", "gall",
        "wait", "tick", "sndc", "snde", "sndl", "plne",
        "attr", "bhvr", "perm", "accg", "aero", "elas", "fric", "rest",
        "velo", "velx", "vely",
        "obst", "posx", "posy", "posl", "posr", "post", "posb",
        "cmra", "cmrp", "cmrt", "meta", "trck",
        "kill", "dead", "rtar", "star", "totl",
        "gnam", "unid", "fmly", "gnus", "spcs", "type",
        "rand", "rean",
        "outv", "outs", "outx",
        "gmap", "rtyp", "room", "grid", "emit",
        "carr", "fall", "rnge",
        "dde:", "putb", "putv", "puts", "dbg:",
        "gene", "load", "chem", "driv",
        "hand", "touc",
        "agnt", "pray",
        "clik", "clac", "cabn", "cabw", "cabp",
        "rpas", "cbtn", "link",
        "pat:", "stm#", "net:", "cls2",
        "flto", "frel", "pupt", "puhl",
        "file", "ject",
        "hist", "gids",
        "delg", "deln",
    ]);

    const re = /(\"[^\"]*\")|(\*[^\n]*)|((?:\b|(?<=\s))-?\d+(?:\.\d+)?\b)|([a-zA-Z_:#][a-zA-Z0-9_:#]*)|(\S)/g;
    let result = "";
    let lastIndex = 0;
    let match;

    while ((match = re.exec(line)) !== null) {
        if (match.index > lastIndex) {
            result += escHtml(line.substring(lastIndex, match.index));
        }
        lastIndex = re.lastIndex;

        const token = match[0];

        if (match[1]) {
            result += `<span class="hl-string">${escHtml(token)}</span>`;
        } else if (match[2]) {
            result += `<span class="hl-comment">${escHtml(token)}</span>`;
        } else if (match[3]) {
            result += `<span class="hl-number">${escHtml(token)}</span>`;
        } else if (match[4]) {
            const lower = token.toLowerCase();
            if (FLOW.has(lower)) {
                result += `<span class="hl-flow">${escHtml(token)}</span>`;
            } else if (COMMANDS.has(lower)) {
                result += `<span class="hl-command">${escHtml(token)}</span>`;
            } else if (/^[ov][av]\d{2}$/i.test(lower)) {
                result += `<span class="hl-var">${escHtml(token)}</span>`;
            } else {
                result += escHtml(token);
            }
        } else {
            result += escHtml(token);
        }
    }

    if (lastIndex < line.length) {
        result += escHtml(line.substring(lastIndex));
    }

    return result || " ";
}

if (typeof window !== "undefined") {
    window.highlightCAOS = highlightCAOS;
}
