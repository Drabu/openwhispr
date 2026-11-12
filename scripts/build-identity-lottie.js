#!/usr/bin/env node
/**
 * Builds the pill's voice-identity .lottie from a source animation.
 *
 * The source is one short dance cycle, so the seven states are authored here
 * rather than drawn: each gets its own slot on a concatenated timeline, a
 * marker naming it, and a pose built from the cycle — tempo, framing, and
 * transforms on the source's named body parts (ear, mouth, arms, legs).
 *
 * Usage: node scripts/build-identity-lottie.js <source.lottie>
 */
const fs = require("fs");
const path = require("path");
const { deflateRawSync, inflateRawSync, crc32 } = require("zlib");
const { pathToFileURL } = require("url");

const FPS = 30;
// The source's cycle length. Every transform in it holds the same value at 0
// and at 29, so a slot covering exactly one cycle loops seamlessly.
const CYCLE_FRAMES = 29;

// How each state wears the cycle.
//
// Tempo alone does not separate seven states at 36px — it reads as one bear
// moving at seven speeds. What does separate them, in order of how well it
// survives the size: colour, then framing, then silhouette. So each state gets
// a crop and a palette, and only then a tempo.
//
//   speed   time stretch (sr); above 1 is slower
//   scale   framing, in percent of the source frame
//   lift    moves the content down, bringing the head toward centre: a crop
//   parts   per-layer overrides on the source's named body parts
const CRIMSON = [0.717, 0.082, 0.25];
const DEEP = [0.466, 0.0018, 0.124];
const AMBER = [0.96, 0.62, 0.11];
const GREY = [0.42, 0.42, 0.46];
const GREY_DEEP = [0.3, 0.3, 0.34];

const STATE_POSES = {
  // Whole bear, small and unhurried: the resting state should be the quietest
  // thing on screen, and the full silhouette is what the others crop away from.
  idle: { speed: 1.7, scale: 112, lift: 0 },

  // Ears up and turned out, framed closer. Ear angle is the one cue the cat
  // proved survives this size, so the bear borrows it.
  hearing: {
    speed: 1.0,
    scale: 138,
    lift: 70,
    parts: { ear: { scale: 128, rotate: -14 } },
  },

  // Head close-up, mouth open, brighter. The state that matters most is the
  // one that should be unmistakable across the room.
  recording: {
    speed: 0.7,
    scale: 158,
    lift: 120,
    parts: {
      mouth: { scale: 140 },
      body: { color: CRIMSON },
      ear: { scale: 112 },
    },
  },

  // Tilting, darker, running quick: busy rather than attentive.
  //
  // The arms are deliberately left alone. Rotating `l arm*` swung the limbs out
  // but not the `l hand*` layers, which are separate in the source — so the
  // paws stayed crossed on the chest while the arms left, and the bear read as
  // having four of them. Colour carries the state instead, as it does in every
  // other pose here.
  processing: {
    speed: 0.45,
    scale: 124,
    lift: 20,
    spin: 9,
    parts: { body: { color: DEEP } },
  },

  // Slumped: squashed down, ears flat, head tipped, breathing slowly. The gag
  // is deflation — the bear has clocked off — which survives at 68px where a
  // finer gesture would not.
  //
  // The paw-over-the-mouth version is the obvious joke and does not work: the
  // source's hand layer is the whole arm, so over the muzzle it reads as a blob
  // covering the face rather than a paw. Posing that needs art, not transforms.
  //
  // Slow rather than frozen, because a still bear reads as a crashed animation,
  // and grey because colour is what carries "off" at a glance.
  // Paw over the eyes, muzzle left showing: the one hands-to-face pose this
  // source will give up. `l hand*` is the whole limb — ~335px of tapering arm
  // anchored at the paw end — so sliding it up lays the forearm across the
  // face, which is a fault for every other target and exactly right for this
  // one. (Over the ears it cannot be done: rotating about the paw stands a grey
  // column beside the head, and a paw-sized stub on the ear is a smudge, dark
  // or light. Over the mouth it takes the face with it. Both need drawn art.)
  //
  // The bear keeps his own colour here. Grey said "off" at a glance but it
  // said it about the artwork rather than the state, and the paw is the cue.
  //
  // Played once (ONE_SHOT_STATES in LottieIdentity): both paws travel up over
  // the first nine frames and the pose then holds, so entering mute is a move
  // you watch rather than a swap you catch afterwards.
  muted: {
    speed: 1.6,
    scale: 132,
    lift: 72,
    tilt: -6,
    parts: {
      // Darker than the head so the paws read as being in front of it. The
      // near arm reaches across from the right, the far one — on a mirrored
      // null, hence the shorter shift — from the left, and they cross over the
      // eyes. Stopping the far one here is what leaves the muzzle showing; any
      // further and the two close the face into one mass with nothing in it.
      "l hand": { color: DEEP, offsetTo: [-360, -265], offsetOverFrames: 9 },
      "l hand 2": { color: DEEP, offsetTo: [-160, -265], offsetOverFrames: 9 },
      "l hand 3": { color: DEEP, offsetTo: [-160, -265], offsetOverFrames: 9 },
      // Shoulder wedges, which stay behind when the arms leave.
      "l arm": { hide: true },
      "l arm 2": { hide: true },
      "l arm 3": { hide: true },
    },
  },

  // Shaking its head, ears laid back.
  missed: {
    speed: 1.0,
    scale: 122,
    lift: 30,
    shake: 30,
    parts: { ear: { rotate: 24, scale: 88 } },
  },

  // Amber, to match the countdown ring drawn on the pill's boundary: one state,
  // one colour, said twice. It dances through the wait rather than holding
  // still — a motionless bear under a draining ring reads as a hang.
  submitting: {
    speed: 1.1,
    scale: 136,
    lift: 80,
    spin: 5,
    parts: { body: { color: AMBER }, ear: { color: DEEP } },
  },

  // Sent: a paw thrown up as the Return lands. The arm swings up about the paw
  // — the same move that was useless for covering the ears, because what it
  // makes is a limb standing straight up beside the head, which is exactly a
  // raised paw. Played once; it reports an event, not a state.
  sent: {
    speed: 1.0,
    scale: 112,
    lift: 0,
    parts: {
      "l hand": { color: DEEP, rotateTo: -82, offsetTo: [-150, -300], offsetOverFrames: 6 },
      "l hand 2": { hide: true },
      "l hand 3": { hide: true },
      "l arm": { hide: true },
      "l arm 2": { hide: true },
      "l arm 3": { hide: true },
    },
  },

  // Where `muted` lands. The same pose with the paws already there, looping, so
  // the bear keeps dancing under them — looping `muted` itself would drop the
  // paws and lift them again every cycle. The seam is clean because a slot
  // covers exactly one cycle: `muted` ends on the frame this one starts from,
  // and the paws are at the same place in both.
  "muted-hold": {
    speed: 1.6,
    scale: 132,
    lift: 72,
    tilt: -6,
    parts: {
      "l hand": { color: DEEP, offset: [-360, -265] },
      "l hand 2": { color: DEEP, offset: [-160, -265] },
      "l hand 3": { color: DEEP, offset: [-160, -265] },
      "l arm": { hide: true },
      "l arm 2": { hide: true },
      "l arm 3": { hide: true },
    },
  },
};

function readLottie(file) {
  const buf = fs.readFileSync(file);
  const entries = unzip(buf);
  const manifest = JSON.parse(entries.get("manifest.json").toString("utf8"));
  const animName = [...entries.keys()].find((n) => n.startsWith("animations/"));
  return { manifest, animation: JSON.parse(entries.get(animName).toString("utf8")) };
}

// Minimal reader for the two-entry archives dotLottie produces: central
// directory only, no spanning, no encryption.
function unzip(buf) {
  const out = new Map();
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error("Not a zip archive");
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Bad central directory");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");

    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    out.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));

    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

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
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, deflated);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(sum, 16);
    entry.writeUInt32LE(deflated.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBuf);

    offset += local.length + nameBuf.length + deflated.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...chunks, centralBuf, end]);
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const staticValue = (k) => ({ a: 0, k });

// Repaints every fill in a layer. The source keeps one hue per body part, so a
// single colour per layer is enough to restate the whole state in the one cue
// that still reads when the shapes themselves no longer do.
function recolour(node, [r, g, b]) {
  if (Array.isArray(node)) return node.forEach((child) => recolour(child, [r, g, b]));
  if (!node || typeof node !== "object") return;
  if (node.ty === "fl" && node.c) node.c = staticValue([r, g, b, 1]);
  for (const key of Object.keys(node)) recolour(node[key], [r, g, b]);
}

// Applies a pose's part overrides to a copy of the source precomp. Returns the
// original id when nothing changes, so unmodified states share one precomp
// instead of paying for a duplicate of the whole bear.
function derivePrecomp(sourceComp, pose, stateName) {
  if (!pose.parts) return null;
  const copy = clone(sourceComp);
  copy.id = `comp_${stateName}`;
  for (const layer of copy.layers) {
    const override = pose.parts[layer.nm];
    if (!override) continue;
    if (override.hide) {
      layer.ks.o = staticValue(0);
      continue;
    }
    if (override.scale) {
      // Replaced outright rather than multiplied into the existing curve: the
      // source animates scale, and scaling a keyframed property per-frame would
      // mean rewriting every key for a pose that only needs a held offset.
      layer.ks.s = staticValue([override.scale, override.scale, 100]);
    }
    if (override.rotate !== undefined) {
      layer.ks.r = staticValue(override.rotate);
    }
    if (override.rotateTo !== undefined) {
      // Swings into the angle over the same frames the offset travels, so a
      // part that both moves and turns arrives as one gesture.
      const from = layer.ks.r?.a === 1 ? layer.ks.r.k[0].s[0] : (layer.ks.r?.k ?? 0);
      layer.ks.r = {
        a: 1,
        k: [
          { t: 0, s: [from], i: { x: [0.2], y: [1] }, o: { x: [0.4], y: [0] } },
          { t: override.offsetOverFrames ?? 9, s: [override.rotateTo] },
        ],
      };
    }
    if (override.offset || override.offsetTo) {
      // Relative to wherever the source parked the part, because the layers
      // carry their own anchors and an absolute position would have to repeat
      // that arithmetic for every pose.
      const base = layer.ks.p?.a === 1 ? layer.ks.p.k[0].s : (layer.ks.p?.k ?? [0, 0, 0]);
      const shift = override.offset ?? override.offsetTo;
      const target = [base[0] + shift[0], base[1] + shift[1], 0];
      if (override.offsetTo) {
        // The part travels to the pose instead of starting in it: the state is
        // entered while the pill is on screen, so the move is the thing that
        // says it changed. Frames are the precomp's own, not the slot's — the
        // slot is `sr` times longer.
        layer.ks.p = {
          a: 1,
          k: [
            {
              t: 0,
              s: [base[0], base[1], 0],
              // The house curve, in the form Lottie wants per keyframe.
              i: { x: [0.2], y: [1] },
              o: { x: [0.4], y: [0] },
            },
            { t: override.offsetOverFrames ?? 9, s: target },
          ],
        };
      } else {
        layer.ks.p = staticValue(target);
      }
    }
    if (override.color) {
      recolour(layer.shapes, override.color);
    }
  }
  return copy;
}

// A slot has to hold one whole cycle *at this state's tempo*, or the loop cuts
// the dance mid-beat and snaps back. Time stretch divides the precomp's clock,
// so a 1.7x-slower state needs 1.7x the frames to get through the same cycle;
// at a fixed length the slow states showed barely half of it.
const slotFramesFor = (pose) => Math.round(CYCLE_FRAMES * (pose.speed ?? 1));

function buildStateLayer(pose, start, slotFrames, refId, size, index) {
  // One frame past the cycle, which renders the same pose as the cycle's first
  // frame. The marker ends there, so the loop wraps onto an identical frame
  // instead of one frame short of it.
  const end = start + slotFrames + 1;
  const centre = size / 2;

  // `lift` slides the content down inside the frame, which crops to the head.
  const lift = pose.lift ?? 0;
  const transform = {
    o: staticValue(pose.opacity ?? 100),
    r: staticValue(0),
    p: staticValue([centre, centre + lift, 0]),
    a: staticValue([centre, centre, 0]),
    s: staticValue([pose.scale ?? 100, pose.scaleY ?? pose.scale ?? 100, 100]),
  };

  if (pose.tilt) {
    transform.r = staticValue(pose.tilt);
  }

  if (pose.spin) {
    transform.r = {
      a: 1,
      k: [
        { t: start, s: [-pose.spin] },
        { t: start + slotFrames / 2, s: [pose.spin] },
        { t: start + slotFrames, s: [-pose.spin] },
      ],
    };
  }

  if (pose.shake) {
    const step = slotFrames / 4;
    transform.p = {
      a: 1,
      k: [
        { t: start, s: [centre, centre + lift, 0] },
        { t: start + step, s: [centre - pose.shake, centre + lift, 0] },
        { t: start + step * 2, s: [centre + pose.shake, centre + lift, 0] },
        { t: start + step * 3, s: [centre - pose.shake, centre + lift, 0] },
        { t: start + slotFrames, s: [centre, centre + lift, 0] },
      ],
    };
  }

  const layer = {
    ddd: 0,
    ind: index + 1,
    ty: 0,
    nm: pose.name,
    refId,
    sr: pose.speed ?? 1,
    ks: transform,
    ao: 0,
    w: size,
    h: size,
    ip: start,
    op: end,
    // Shifted so every slot shows the cycle from its first frame; without this
    // a later state would start mid-dance.
    st: start,
    bm: 0,
  };

  if (pose.freezeAt !== undefined) {
    // Time remap pinned to one value holds the precomp on a single frame, which
    // is how a state stops moving without a separate still asset.
    layer.tm = staticValue(pose.freezeAt / FPS);
  }

  return layer;
}

async function main() {
  const source = process.argv[2];
  if (!source) {
    console.error("usage: node scripts/build-identity-lottie.js <source.lottie>");
    process.exitCode = 1;
    return;
  }

  const { ALL_VOICE_IDENTITY_MARKERS } = await import(
    pathToFileURL(path.join(__dirname, "..", "src", "helpers", "voiceIdentityMarkers.js")).href
  );

  const { animation } = readLottie(source);
  const sourceComp = (animation.assets || []).find((asset) => asset.layers);
  if (!sourceComp) throw new Error("Source has no precomp to build states from");

  const assets = [sourceComp];
  const layers = [];

  const markers = [];
  let cursor = 0;

  ALL_VOICE_IDENTITY_MARKERS.forEach((name, index) => {
    if (!STATE_POSES[name]) throw new Error(`No pose defined for state "${name}"`);
    const pose = { ...STATE_POSES[name], name };
    const slotFrames = slotFramesFor(pose);
    const derived = derivePrecomp(sourceComp, pose, name);
    if (derived) assets.push(derived);
    layers.push(
      buildStateLayer(
        pose,
        cursor,
        slotFrames,
        derived ? derived.id : sourceComp.id,
        animation.w,
        index
      )
    );
    markers.push({ tm: cursor, cm: name, dr: slotFrames });
    cursor += slotFrames + 1;
  });

  const out = {
    v: animation.v,
    fr: FPS,
    ip: 0,
    op: cursor,
    w: animation.w,
    h: animation.h,
    nm: "voice-identity",
    ddd: 0,
    assets,
    // Later layers paint on top, and only one slot is ever in range, so the
    // order is irrelevant to what is seen — kept ascending for readability.
    layers: layers.reverse(),
    markers,
  };

  const manifest = {
    version: "1",
    generator: "openwhispr/build-identity-lottie",
    animations: [{ id: "voice-identity", playMode: "normal" }],
  };

  const target = path.join(__dirname, "..", "src", "assets", "voice-identity.lottie");
  fs.writeFileSync(
    target,
    zip([
      { name: "manifest.json", data: Buffer.from(JSON.stringify(manifest)) },
      { name: "animations/voice-identity.json", data: Buffer.from(JSON.stringify(out)) },
    ])
  );

  console.log(
    `[identity] wrote ${path.relative(process.cwd(), target)} ` +
      `(${(fs.statSync(target).size / 1024).toFixed(1)} KB, ${out.op} frames, ` +
      `${assets.length} precomps, markers: ${ALL_VOICE_IDENTITY_MARKERS.join(", ")})`
  );
}

main().catch((error) => {
  console.error(`[identity] ${error.message}`);
  process.exitCode = 1;
});
