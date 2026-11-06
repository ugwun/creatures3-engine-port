// marionette.cjs — minimal Firefox driver with no dependencies
//
// Speaks the Marionette protocol directly so browser tests need only an
// installed Firefox. Clicks go through WebDriver actions at real coordinates,
// because a scripted element.click() would pass even when the element is
// covered, scrolled away, or never receives the event.
"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

// Notebook viewport from the manual review (OBS-002).
const VIEWPORT = Object.freeze({ width: 1530, height: 840 });
const ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecf";

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function connect(port, deadline) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect(port, "127.0.0.1");
      socket.once("connect", () => resolve(socket));
      socket.once("error", error => {
        if (Date.now() > deadline) reject(error);
        else setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}

class Browser {
  constructor(process, socket, profile) {
    this.process = process;
    this.socket = socket;
    this.profile = profile;
    this.buffer = Buffer.alloc(0);
    this.waiters = [];
    this.nextId = 0;
    this.pending = new Map();
    socket.on("data", chunk => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.drain();
    });
  }

  drain() {
    for (;;) {
      const colon = this.buffer.indexOf(0x3a);
      if (colon < 0) return;
      const length = Number(this.buffer.subarray(0, colon).toString());
      if (this.buffer.length < colon + 1 + length) return;
      const body = this.buffer.subarray(colon + 1, colon + 1 + length);
      this.buffer = this.buffer.subarray(colon + 1 + length);
      const message = JSON.parse(body.toString());
      if (Array.isArray(message) && this.pending.has(message[1])) {
        const { resolve, reject } = this.pending.get(message[1]);
        this.pending.delete(message[1]);
        if (message[2]) {
          reject(new Error(
            message[2].error + ": " + message[2].message));
        } else {
          resolve(message[3]);
        }
      }
    }
  }

  send(name, params) {
    const id = ++this.nextId;
    const payload = Buffer.from(JSON.stringify([0, id, name, params || {}]));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.write(Buffer.concat([
        Buffer.from(payload.length + ":"),
        payload
      ]));
    });
  }

  async navigate(url) {
    await this.send("WebDriver:Navigate", { url });
  }

  async evaluate(script, ...args) {
    const result = await this.send("WebDriver:ExecuteScript", {
      script,
      args,
      sandbox: null
    });
    return result.value;
  }

  async find(selector) {
    const result = await this.send("WebDriver:FindElement", {
      using: "css selector",
      value: selector
    });
    return result.value[ELEMENT_KEY] || result.value;
  }

  async centerOf(selector) {
    const point = await this.evaluate(`
      const element = document.querySelector(arguments[0]);
      if (!element) return null;
      element.scrollIntoView({ block: "nearest", inline: "nearest" });
      const box = element.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const hit = document.elementFromPoint(x, y);
      return {
        x, y,
        visible: x >= 0 && y >= 0 && x < innerWidth && y < innerHeight,
        reachable: Boolean(hit && (hit === element || element.contains(hit)))
      };
    `, selector);
    if (!point) throw new Error("No element matches " + selector);
    return point;
  }

  // A real pointer click. Fails if anything else would receive it.
  async click(selector) {
    // Polled content can arrive between the measurement and the pointer
    // action and move the target (an evidence strip grows when its sample
    // lands), so measure until the point stops moving.
    let point = await this.centerOf(selector);
    for (let attempt = 0; attempt < 10; attempt++) {
      await delay(50);
      const again = await this.centerOf(selector);
      const stable = Math.abs(again.x - point.x) < 1 &&
        Math.abs(again.y - point.y) < 1;
      point = again;
      if (stable) break;
    }
    if (!point.visible || !point.reachable) {
      throw new Error(
        selector + " is not clickable: " + JSON.stringify(point));
    }
    await this.send("WebDriver:PerformActions", {
      actions: [{
        type: "pointer",
        id: "mouse",
        parameters: { pointerType: "mouse" },
        actions: [
          {
            type: "pointerMove",
            x: Math.round(point.x),
            y: Math.round(point.y),
            duration: 0
          },
          { type: "pointerDown", button: 0 },
          { type: "pointerUp", button: 0 }
        ]
      }]
    });
    await this.send("WebDriver:ReleaseActions");
  }

  async type(selector, text) {
    const element = await this.find(selector);
    await this.send("WebDriver:ElementSendKeys", { id: element, text });
  }

  async select(selector, value) {
    const element = await this.find(selector);
    await this.send("WebDriver:ElementClick", { id: element }).catch(() => {});
    await this.evaluate(`
      const element = document.querySelector(arguments[0]);
      element.value = arguments[1];
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    `, selector, value);
  }

  async waitFor(script, options) {
    const opts = options || {};
    const timeout = opts.timeout || 8000;
    const args = opts.args || [];
    const deadline = Date.now() + timeout;
    let last = null;
    while (Date.now() < deadline) {
      last = await this.evaluate(script, ...args);
      if (last) return last;
      await delay(opts.interval || 60);
    }
    throw new Error("Timed out waiting for: " + script);
  }

  async setViewport(width, height) {
    await this.send("WebDriver:SetWindowRect", { width, height });
    const chrome = await this.evaluate(
      "return [outerWidth - innerWidth, outerHeight - innerHeight];");
    await this.send("WebDriver:SetWindowRect", {
      width: width + chrome[0],
      height: height + chrome[1]
    });
  }

  async screenshot(file) {
    const result = await this.send("WebDriver:TakeScreenshot", {
      full: false,
      hash: false
    });
    fs.writeFileSync(file, Buffer.from(result.value, "base64"));
  }

  async close() {
    await this.send("Marionette:Quit").catch(() => {});
    this.socket.destroy();
    this.process.kill("SIGTERM");
    await delay(200);
    fs.rmSync(this.profile, { recursive: true, force: true });
  }
}

function firefoxPath() {
  const candidates = (process.env.PATH || "").split(path.delimiter)
    .map(directory => path.join(directory, "firefox"));
  candidates.push(
    "/Applications/Firefox.app/Contents/MacOS/firefox");
  return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

async function launch(options) {
  const opts = options || {};
  const executable = firefoxPath();
  if (!executable) throw new Error("Firefox is not installed");
  const port = opts.port || 2828 + Math.floor(Math.random() * 2000);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "obs-firefox-"));
  fs.writeFileSync(path.join(profile, "user.js"), [
    `user_pref("marionette.port", ${port});`,
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
    'user_pref("toolkit.telemetry.enabled", false);',
    'user_pref("browser.aboutwelcome.enabled", false);'
  ].join("\n") + "\n");
  const firefox = spawn(executable, [
    "--headless", "--marionette", "--no-remote",
    "--profile", profile, "about:blank"
  ], {
    stdio: "ignore",
    env: Object.assign({}, process.env, {
      MOZ_HEADLESS: "1",
      MOZ_HEADLESS_WIDTH: String(VIEWPORT.width + 20),
      MOZ_HEADLESS_HEIGHT: String(VIEWPORT.height + 100)
    })
  });
  const socket = await connect(port, Date.now() + 30000);
  const browser = new Browser(firefox, socket, profile);
  await delay(100);
  await browser.send("WebDriver:NewSession", {
    capabilities: {
      alwaysMatch: { timeouts: { script: 30000, pageLoad: 30000 } }
    }
  });
  await browser.setViewport(VIEWPORT.width, VIEWPORT.height);
  return browser;
}

module.exports = { launch, firefoxPath, delay, VIEWPORT };
