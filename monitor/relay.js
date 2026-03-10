// relay.js
// Bridges the Creatures 3 engine's UDP log stream to browser WebSocket clients.
//
// UDP  :9999  <-- JSON log lines from FlightRecorder (C++ engine)
// WS   :9998  --> pushed to all connected browser tabs
//
// Usage:
//   cd monitor && node relay.js
//
"use strict";

const dgram = require("dgram");
const { WebSocketServer } = require("ws");

const UDP_PORT = 9999;
const WS_PORT = 9998;

// ── WebSocket server ─────────────────────────────────────────────────────────
const wss = new WebSocketServer({ port: WS_PORT });
const clients = new Set();

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[relay] browser connected  (total: ${clients.size})`);
  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[relay] browser disconnected (total: ${clients.size})`);
  });
  // Send a synthetic "connected" banner so the browser knows the relay is up.
  ws.send(JSON.stringify({ t: Date.now(), cat: 0, msg: "── Monitor relay connected ──" }));
});

function broadcast(data) {
  for (const client of clients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(data, { binary: false });
    }
  }
}

// ── UDP listener ─────────────────────────────────────────────────────────────
const udp = dgram.createSocket("udp4");

udp.on("message", (msg) => {
  // Each UDP packet is a single JSON line from the C++ engine.
  // Validate it's JSON before forwarding; drop malformed packets silently.
  const raw = msg.toString("utf8").trim();
  console.log(`[relay] UDP packet received (${raw.length} bytes): ${raw.slice(0, 80)}`);
  try {
    JSON.parse(raw); // will throw if malformed
    broadcast(raw);
  } catch (_) {
    // Not valid JSON — could be a partial packet; ignore.
    console.log(`[relay] WARNING: non-JSON packet dropped`);
  }
});

udp.on("listening", () => {
  const { address, port } = udp.address();
  console.log(`[relay] UDP  listening on ${address}:${port}`);
  console.log(`[relay] WS   listening on ws://localhost:${WS_PORT}`);
  console.log(`[relay] Open: file://${__dirname}/index.html`);
});

udp.on("error", (err) => {
  console.error("[relay] UDP error:", err.message);
});

udp.bind(UDP_PORT, "127.0.0.1");
