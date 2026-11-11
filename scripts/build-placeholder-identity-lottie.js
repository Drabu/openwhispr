#!/usr/bin/env node
/**
 * Authors the placeholder voice-identity .lottie.
 *
 * Exists so the Lottie identity pipeline can be built, run and reviewed before
 * the real artwork lands: it carries the full marker contract the player maps
 * onto, with deliberately plain shapes so nobody mistakes it for the design.
 * Replace src/assets/voice-identity.lottie with the real export and delete this.
 *
 * Usage: node scripts/build-placeholder-identity-lottie.js
 */
const fs = require("fs");
const path = require("path");
const { deflateRawSync, crc32 } = require("zlib");
const { pathToFileURL } = require("url");

// Look per state. The names themselves come from the shared marker contract, so
// this file cannot disagree with the player about what states exist; each gets
// its own 30-frame second, making an unresolved marker obvious on screen rather
// than a silent fall back to frame 0.
const STATE_LOOKS = {
  idle: { hue: 210, scale: 1.0 },
  hearing: { hue: 150, scale: 1.12 },
  recording: { hue: 0, scale: 1.25 },
  processing: { hue: 265, scale: 1.05 },
  muted: { hue: 0, sat: 0, scale: 0.9 },
  missed: { hue: 25, scale: 1.0 },
  submitting: { hue: 40, scale: 1.15 },
};
const FRAMES_PER_STATE = 30;
const FPS = 30;
const SIZE = 600;

const hslToRgb = (h, s, l) => {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
};

// A pulsing disc per state: distinct colour, distinct scale, distinct tempo.
function buildLayer(state, index) {
  const start = index * FRAMES_PER_STATE;
  const end = start + FRAMES_PER_STATE;
  const [r, g, b] = hslToRgb(state.hue, state.sat ?? 0.7, 0.55);
  const base = 180 * state.scale;
  return {
    ddd: 0,
    ind: index + 1,
    ty: 4,
    nm: state.name,
    sr: 1,
    ip: start,
    op: end,
    st: start,
    bm: 0,
    ks: {
      o: { a: 0, k: 100 },
      r: { a: 0, k: 0 },
      p: { a: 0, k: [SIZE / 2, SIZE / 2, 0] },
      a: { a: 0, k: [0, 0, 0] },
      s: {
        a: 1,
        k: [
          { t: start, s: [100, 100, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
          { t: start + FRAMES_PER_STATE / 2, s: [118, 118, 100] },
          { t: end - 1, s: [100, 100, 100] },
        ],
      },
    },
    shapes: [
      {
        ty: "gr",
        nm: state.name,
        it: [
          { ty: "el", d: 1, s: { a: 0, k: [base, base] }, p: { a: 0, k: [0, 0] }, nm: "disc" },
          { ty: "fl", c: { a: 0, k: [r, g, b, 1] }, o: { a: 0, k: 100 }, r: 1, nm: "fill" },
          {
            ty: "tr",
            p: { a: 0, k: [0, 0] },
            a: { a: 0, k: [0, 0] },
            s: { a: 0, k: [100, 100] },
            r: { a: 0, k: 0 },
            o: { a: 0, k: 100 },
          },
        ],
      },
    ],
  };
}

const buildAnimation = (states) => ({
  v: "5.12.1",
  fr: FPS,
  ip: 0,
  op: states.length * FRAMES_PER_STATE,
  w: SIZE,
  h: SIZE,
  nm: "placeholder-voice-identity",
  ddd: 0,
  assets: [],
  layers: states.map(buildLayer).reverse(),
  markers: states.map((state, index) => ({
    tm: index * FRAMES_PER_STATE,
    cm: state.name,
    dr: FRAMES_PER_STATE,
  })),
});

const manifest = {
  version: "1",
  generator: "openwhispr/build-placeholder-identity-lottie",
  animations: [{ id: "voice-identity", playMode: "normal" }],
};

// A .lottie is a zip. Written by hand rather than adding a dependency for a
// two-entry archive, stored with raw deflate (method 8), no data descriptors.
function zip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const deflated = deflateRawSync(data, { level: 9 });
    const sum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, deflated);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(0, 14);
    entry.writeUInt32LE(sum, 16);
    entry.writeUInt32LE(deflated.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt16LE(0, 30);
    entry.writeUInt16LE(0, 32);
    entry.writeUInt16LE(0, 34);
    entry.writeUInt16LE(0, 36);
    entry.writeUInt32LE(0, 38);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBuf);

    offset += local.length + nameBuf.length + deflated.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, centralBuf, end]);
}

// Under the Vite root: the renderer imports it with ?url, and Vite only
// resolves assets inside its own root.
const out = path.join(__dirname, "..", "src", "assets", "voice-identity.lottie");

async function main() {
  // The contract is an ES module shared with the renderer; this script is CJS.
  const { VOICE_IDENTITY_MARKERS } = await import(
    pathToFileURL(path.join(__dirname, "..", "src", "helpers", "voiceIdentityMarkers.js")).href
  );
  const states = VOICE_IDENTITY_MARKERS.map((name) => {
    const look = STATE_LOOKS[name];
    if (!look) throw new Error(`No placeholder look defined for state "${name}"`);
    return { name, ...look };
  });

  fs.writeFileSync(
    out,
    zip([
      { name: "manifest.json", data: Buffer.from(JSON.stringify(manifest)) },
      {
        name: "animations/voice-identity.json",
        data: Buffer.from(JSON.stringify(buildAnimation(states))),
      },
    ])
  );

  console.log(
    `[placeholder-identity] wrote ${path.relative(process.cwd(), out)} ` +
      `(${fs.statSync(out).size} bytes, markers: ${states.map((s) => s.name).join(", ")})`
  );
}

main().catch((error) => {
  console.error(`[placeholder-identity] ${error.message}`);
  process.exitCode = 1;
});
