// Bakes Quaternius Universal Animation Library (CC0) clips onto the
// ranger skeleton. Local swing is preserved:
//   qOut = qRangerRest * inverse(qSourceRest) * qClip
// Root translation is dropped. Only the pelvis keeps a clamped bob.
// Run from the repo root: node tools/anim/bake-motion.mjs

import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';

const ROOT = path.resolve(import.meta.dirname, '../..');
const RANGER = path.join(ROOT, 'public/assets/characters/Male_Ranger.gltf');
const UAL1 = '/tmp/ual/u1/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb';
const UAL2 = '/tmp/ual/u2/Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb';
const OUT = path.join(ROOT, 'public/assets/animations/ranger-motion.json');

const MAP = [
  ['UAL1', 'Idle_Loop', 'idle', true],
  ['UAL1', 'Idle_Torch_Loop', 'idle-hold-tool', true],
  ['UAL1', 'Idle_Talking_Loop', 'idle-talk', true],
  ['UAL2', 'Idle_FoldArms_Loop', 'idle-fold', true],
  ['UAL1', 'Walk_Loop', 'walk', true],
  ['UAL1', 'Sprint_Loop', 'run', true],
  ['UAL1', 'Jump_Start', 'jump', false],
  ['UAL1', 'Jump_Loop', 'fall', true],
  ['UAL1', 'Jump_Land', 'land', false],
  ['UAL1', 'Push_Loop', 'rock', true],
  ['UAL1', 'Pistol_Aim_Neutral', 'aim', true],
  ['UAL1', 'Fixing_Kneeling', 'sort', true],
  ['UAL1', 'Crouch_Idle_Loop', 'kneel', true],
  ['UAL2', 'TreeChopping_Loop', 'shovel', true],
  ['UAL2', 'Farm_Watering', 'pan', true],
  ['UAL2', 'Walk_Carry_Loop', 'carry', true],
];

function readGltf(file) {
  const buf = fs.readFileSync(file);
  if (file.endsWith('.glb')) {
    const magic = buf.readUInt32LE(0);
    if (magic !== 0x46546c67) throw new Error(`not a glb: ${file}`);
    let offset = 12;
    let json = null;
    let bin = null;
    while (offset < buf.length) {
      const len = buf.readUInt32LE(offset);
      const type = buf.readUInt32LE(offset + 4);
      const data = buf.subarray(offset + 8, offset + 8 + len);
      if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
      else if (type === 0x004e4942) bin = data;
      offset += 8 + len;
    }
    if (!json || !bin) throw new Error(`incomplete glb: ${file}`);
    return { json, bin };
  }
  const json = JSON.parse(buf.toString('utf8'));
  const binName = json.buffers?.[0]?.uri;
  const bin = binName ? fs.readFileSync(path.join(path.dirname(file), binName)) : Buffer.alloc(0);
  return { json, bin };
}

function accessorBytes(gltf, accessorIndex) {
  const acc = gltf.json.accessors[accessorIndex];
  const view = gltf.json.bufferViews[acc.bufferView];
  const start = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
  const count = acc.count * comps;
  if (acc.componentType !== 5126) throw new Error(`unsupported component ${acc.componentType}`);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) out[i] = gltf.bin.readFloatLE(start + i * 4);
  return { values: out, count: acc.count, comps };
}

function nodeQuat(node) {
  const r = node.rotation ?? [0, 0, 0, 1];
  return new THREE.Quaternion(r[0], r[1], r[2], r[3]);
}

function nodePos(node) {
  const t = node.translation ?? [0, 0, 0];
  return new THREE.Vector3(t[0], t[1], t[2]);
}

function skeleton(gltf) {
  const nodes = gltf.json.nodes;
  const byName = new Map();
  nodes.forEach((node, index) => {
    if (!node.name) return;
    byName.set(node.name, {
      index,
      name: node.name,
      q: nodeQuat(node),
      p: nodePos(node),
      parent: null,
    });
  });
  nodes.forEach((node) => {
    for (const child of node.children ?? []) {
      const info = [...byName.values()].find((b) => b.index === child);
      if (info && node.name) info.parent = node.name;
    }
  });
  return byName;
}

function clipByName(gltf, name) {
  const anim = gltf.json.animations?.find((a) => a.name === name);
  if (!anim) return null;
  const nodes = gltf.json.nodes;
  const tracks = [];
  let duration = 0;
  for (const channel of anim.channels) {
    const sampler = anim.samplers[channel.sampler];
    const times = accessorBytes(gltf, sampler.input);
    const values = accessorBytes(gltf, sampler.output);
    const node = nodes[channel.target.node];
    const end = times.values[times.values.length - 1] ?? 0;
    if (end > duration) duration = end;
    tracks.push({
      bone: node?.name ?? '',
      path: channel.target.path,
      times: times.values,
      values: values.values,
    });
  }
  return { name, duration, tracks };
}

function armDelta(ranger, quats, shoulder, elbow) {
  const world = new Map();
  function walk(name, parentM) {
    const node = ranger.get(name);
    if (!node) return;
    const q = quats.get(name) ?? node.q;
    const m = new THREE.Matrix4().compose(node.p, q, new THREE.Vector3(1, 1, 1));
    if (parentM) m.premultiply(parentM);
    world.set(name, m);
    for (const [child, info] of ranger) {
      if (info.parent === name) walk(child, m);
    }
  }
  for (const [name, info] of ranger) {
    if (!info.parent || !ranger.has(info.parent)) walk(name, null);
  }
  const a = new THREE.Vector3().setFromMatrixPosition(world.get(shoulder));
  const b = new THREE.Vector3().setFromMatrixPosition(world.get(elbow)).sub(a);
  return b;
}

// A bind T sticks the elbow out to the model's side. An aim that reaches
// forward, or a chop that drops the elbow, is not that pose.
function bindCheck(ranger, quats) {
  const side = (shoulder, elbow) => {
    const b = armDelta(ranger, quats, shoulder, elbow);
    const lateral = Math.abs(b.x);
    const ahead = Math.abs(b.z);
    return lateral > 0.12 && ahead < lateral * 0.55 && Math.abs(b.y) < lateral * 0.65;
  };
  return side('upperarm_l', 'lowerarm_l') || side('upperarm_r', 'lowerarm_r');
}

function retarget(sourceClip, sourceSkel, rangerSkel) {
  const bones = {};
  for (const track of sourceClip.tracks) {
    const src = sourceSkel.get(track.bone);
    const dst = rangerSkel.get(track.bone);
    if (!src || !dst) continue;
    if (track.path === 'rotation') {
      const align = dst.q.clone().multiply(src.q.clone().invert());
      const values = [];
      let prev = null;
      const frames = track.times.length;
      for (let i = 0; i < frames; i++) {
        const o = i * 4;
        const qClip = new THREE.Quaternion(track.values[o], track.values[o + 1], track.values[o + 2], track.values[o + 3]);
        const q = align.clone().multiply(qClip).normalize();
        if (prev && prev.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
        prev = q;
        values.push(+q.x.toFixed(4), +q.y.toFixed(4), +q.z.toFixed(4), +q.w.toFixed(4));
      }
      bones[track.bone] = {
        ...(bones[track.bone] ?? {}),
        times: Array.from(track.times, (t) => +t.toFixed(4)),
        q: values,
      };
    } else if (track.path === 'translation' && track.bone === 'pelvis') {
      const values = [];
      const frames = track.times.length;
      for (let i = 0; i < frames; i++) {
        const o = i * 3;
        let dx = track.values[o] - src.p.x;
        let dy = track.values[o + 1] - src.p.y;
        let dz = track.values[o + 2] - src.p.z;
        dx = Math.max(-0.06, Math.min(0.06, dx));
        dy = Math.max(-0.08, Math.min(0.08, dy));
        dz = Math.max(-0.06, Math.min(0.06, dz));
        values.push(+(dst.p.x + dx).toFixed(4), +(dst.p.y + dy).toFixed(4), +(dst.p.z + dz).toFixed(4));
      }
      bones.pelvis = {
        ...(bones.pelvis ?? {}),
        pt: Array.from(track.times, (t) => +t.toFixed(4)),
        p: values,
      };
    }
  }
  return bones;
}

function sample(bones, name, time) {
  const entry = bones[name];
  if (!entry?.times) return null;
  let idx = 0;
  for (let i = 0; i < entry.times.length; i++) {
    if (entry.times[i] <= time) idx = i;
  }
  const o = idx * 4;
  return new THREE.Quaternion(entry.q[o], entry.q[o + 1], entry.q[o + 2], entry.q[o + 3]);
}

const rangerGltf = readGltf(RANGER);
const packs = { UAL1: readGltf(UAL1), UAL2: readGltf(UAL2) };
const ranger = skeleton(rangerGltf);
const skels = { UAL1: skeleton(packs.UAL1), UAL2: skeleton(packs.UAL2) };

const rest = ranger.get('upperarm_l').q;
console.log('ranger upperarm_l rest', rest.toArray().map((n) => +n.toFixed(4)));
const tpose = clipByName(packs.UAL1, 'A_TPose');
const alignedT = retarget(tpose, skels.UAL1, ranger);
const tq = sample(alignedT, 'upperarm_l', 0);
console.log('aligned T upperarm_l', tq.toArray().map((n) => +n.toFixed(4)));
console.log('T matches rest', tq.angleTo(rest).toFixed(5), 'rad');

const clips = {};
let failed = false;
for (const [pack, sourceName, name, loop] of MAP) {
  const src = clipByName(packs[pack], sourceName);
  if (!src) {
    console.error('missing', pack, sourceName);
    failed = true;
    continue;
  }
  const bones = retarget(src, skels[pack], ranger);
  const mid = src.duration * 0.5;
  const quats = new Map();
  for (const bone of Object.keys(bones)) {
    const q = sample(bones, bone, mid);
    if (q) quats.set(bone, q);
  }
  const bind = bindCheck(ranger, quats);
  const dl = armDelta(ranger, quats, 'upperarm_l', 'lowerarm_l');
  const dr = armDelta(ranger, quats, 'upperarm_r', 'lowerarm_r');
  const fmt = (v) => `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`;
  console.log(
    `${name.padEnd(16)} ${sourceName.padEnd(22)} ${src.duration.toFixed(2)}s bones ${Object.keys(bones).length} bind ${bind} L ${fmt(dl)} R ${fmt(dr)}`,
  );
  if (bind && name !== 'jump' && name !== 'fall') {
    console.error(`  ${name} is still a T at mid-frame`);
    failed = true;
  }
  clips[name] = { duration: src.duration, loop, bones };
}

if (failed) process.exit(1);
const json = JSON.stringify({ source: 'Quaternius Universal Animation Library, CC0', clips });
fs.writeFileSync(OUT, json);
console.log('wrote', OUT, (json.length / 1e6).toFixed(2), 'MB');
