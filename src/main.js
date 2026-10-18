// Escape the Strap Rooms
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { CONFIG, SPOTS } from "./config.js";
import { World } from "./world.js";
import * as A from "./actors.js";
import { input, setupInput, lockPointer, unlockPointer, releaseTouches, moveAxes, isTouchDevice } from "./input.js";
import * as audio from "./audio.js";
import { createVortex } from "./vortex.js";
import { dotArrow } from "./keyroom.js";
import { protect } from "./protect.js";

protect();

// 3D characters. "h" is how tall they stand, "censor" is where the disco ball goes (fractions of height).
const MODELS = [
  { id: "fish", h: 1.75 },
  { id: "project13", h: 1.95, censor: [0, 0.56, 0.13] },
  { id: "sploot", h: 1.75 },
  { id: "subject7", h: 1.7 },
  { id: "tank", h: 1.9 },
  { id: "mrsun", h: 2.0 },
  { id: "boris", h: 1.85 },
];

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
const angleDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

// ---------- Renderer ----------
const touch = isTouchDevice();
const renderer = new THREE.WebGLRenderer({ antialias: !touch, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
$("view").appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c0612);
scene.fog = new THREE.Fog(0x1c0a26, 16, 75);
scene.add(new THREE.HemisphereLight(0xfff4d6, 0x5a4a28, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.3);
sun.position.set(2, 5, 3);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(CONFIG.fov, 1, 0.05, 200);
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

const manager = new THREE.LoadingManager();
const gltfLoader = new GLTFLoader(manager);
gltfLoader.setMeshoptDecoder(MeshoptDecoder);
const texLoader = new THREE.TextureLoader(manager);
const world = new World(scene);

// ---------- Game state ----------
const state = {
  phase: "loading",          // loading | title | walk | lock | introVideo | pan | dangerVideo | play | caught | won
  introDone: false,          // the intro plays once per page load
  player: { x: 0, z: 0, yaw: 0, pitch: 0 },
  walked: 0,
  hasKey: false,
  rush: 0,
  talkCooldown: 0,
  dialogue: null,
  camTween: null,
  fovTarget: CONFIG.fov,
  flowTimer: 0,
  lastStatus: "",
  time: 0,
  stall: "closed",            // closed | open
  accostTimer: 0,
  accost: null,               // the NPC storming up to Community Strap right now
};
let npcs = [], strap = null, key = null, soda = null, phoneGirl = null;
let rushers = [], extraLooks = [], hole = null, vortex = null, makeActor = null, archArrow = null;
let dialogue = null, credits = null;

// ---------- Loading ----------
async function load() {
  let done = 0, total = 1;
  const tick = () => { done++; $("loading-text").textContent = `Loading ${Math.min(99, Math.round(done / total * 100))}%`; };

  const [chars, dlg, cred, rects] = await Promise.all(
    ["assets/sprites/chars.json", "data/dialogue.json", "data/credits.json", "assets/img/strap-looks.json"].map((u) => fetch(u).then((r) => r.json())));
  dialogue = dlg;
  credits = cred;

  // Cast the night: Sock, 2 DJs, 7 regulars' spots, the dance floor, the bathroom, the start
  // hallway, and everyone else spread through the club. Her Own Primary makes it a full house.
  const fixedSlots = 1 + 2 + 7 + CONFIG.danceCrowd + CONFIG.bathroomCrowd + CONFIG.hallwayCrowd;
  const scatter = CONFIG.maxCharacters - 2 - fixedSlots;   // minus Community Strap and Her Own Primary
  const slots = fixedSlots + scatter;
  const models = shuffle(MODELS.slice()).slice(0, 3 + Math.floor(Math.random() * 3));
  const looks = shuffle(chars.slice()).slice(0, slots - models.length).map((c) => ({ sprite: c }));
  for (const m of models) looks.splice(Math.floor(Math.random() * (looks.length + 1)), 0, { model: m });

  const spriteFiles = [...new Set(looks.filter((l) => l.sprite).map((l) => l.sprite.file))];
  total = 4 + spriteFiles.length + models.length + 5;

  const texCache = {};
  const jobs = [
    world.load(gltfLoader, texLoader, tick).then(tick),
    ...spriteFiles.map((f) => texLoader.loadAsync("assets/sprites/" + f).then((t) => { texCache[f] = A.pixelTexture(t); tick(); })),
    ...models.map((m) => gltfLoader.loadAsync(`assets/models/${m.id}.glb`).then((g) => { m.gltf = g; tick(); })),
  ];
  const fixed = {};
  jobs.push(texLoader.loadAsync("assets/img/strap-looks.webp").then((t) => { fixed.strap = t; tick(); }));
  jobs.push(texLoader.loadAsync("assets/img/solo-poly.jpg").then((t) => { t.colorSpace = THREE.SRGBColorSpace; fixed.primary = t; tick(); }));
  jobs.push(texLoader.loadAsync("assets/img/carabiner.webp").then((t) => { fixed.key = t; tick(); }));
  jobs.push(gltfLoader.loadAsync("assets/models/soda.glb").then((g) => { fixed.soda = g; tick(); }));
  await Promise.all(jobs);

  const make = (look) => {
    const actor = look.model
      ? A.modelActor(look.model.gltf, look.model.h * rand(0.95, 1.05), { censor: look.model.censor })
      : A.spriteActor(look.sprite, texCache[look.sprite.file], rand(1.55, 1.85));
    actor.look = look.model ? look.model.id : look.sprite.id;
    return actor;
  };

  makeActor = make;
  extraLooks = looks.filter((l) => l.sprite);

  // Community Strap
  const img = fixed.strap.image;
  strap = { actor: A.strapActor(fixed.strap, rects, img.width, img.height, 1.45), x: 0, z: 0, active: false, elapsed: 0 };
  scene.add(strap.actor.object);

  // Everyone else
  let li = 0;
  const next = () => make(looks[li++]);
  // Sock: walking down the start hallway toward you. Passing them sets off the intro.
  phoneGirl = addNpc(next(), { kind: "sock", name: "Sock", at: SPOTS.phoneGirl, wander: 0, lines: [] });
  SPOTS.djs.forEach((at, i) => addNpc(next(), { kind: "dj", name: (i ? dialogue.djRightName : dialogue.djLeftName) || "DJ", at, wander: 0, lines: i ? dialogue.djRight : dialogue.djLeft, talkRange: 1.9 }));
  // The old named regulars' spots are just patrons now, using the crowd lines.
  for (const at of Object.values(SPOTS.named)) addNpc(next(), { kind: "crowd", name: "Patron", at, wander: 1.2 });
  // The solo poly meme always says her first two lines; her third only if you ask for a hint.
  const primary = addNpc(A.cardActor(fixed.primary, 1.5), { kind: "primary", name: dialogue.primaryName || "Her Own Primary", at: SPOTS.primary, wander: 0, lines: dialogue.primary.slice(0, 2) });
  primary.hint = dialogue.primary[2] || "";
  const df = SPOTS.danceFloor;
  for (let i = 0; i < CONFIG.danceCrowd; i++) addNpc(next(), { kind: "crowd", name: "Someone on the dance floor", area: { min: [df.min[0] + 0.6, df.min[1] + 1.2], max: [df.max[0] - 0.6, df.max[1] - 0.4] } });
  const b = SPOTS.bathroom;
  for (let i = 0; i < CONFIG.bathroomCrowd; i++) addNpc(next(), { kind: "crowd", name: "Someone in the bathroom", area: { min: [b.min[0] + 0.9, b.min[1] + 0.5], max: [b.max[0] - 3.2, b.max[1] - 1.7] } });
  // A few further down the start hallway, past Sock. The intro turns the camera back the
  // way you came, so they stay out of that shot.
  const [sx, sz] = SPOTS.start.pos, [gx, gz] = SPOTS.phoneGirl;
  [1.3, 1.5, 1.7, 1.9].slice(0, CONFIG.hallwayCrowd).forEach((t, i) => {
    let x = sx + (gx - sx) * t, z = sz + (gz - sz) * t + (i % 2 ? 0.6 : -0.6);
    if (!world.canNav(x, z)) z = sz + (gz - sz) * t;
    addNpc(next(), { kind: "crowd", name: "Patron", at: [x, z], wander: 0.4 });
  });
  // Everyone else, spread out through the rest of the club.
  for (const at of scatterSpots(scatter)) addNpc(next(), { kind: "crowd", name: "Patron", at, wander: 1.5 });

  // The dotted arrow by the archway that leads through to the west hall and the Evil Room.
  archArrow = dotArrow();
  const arrowMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), new THREE.MeshBasicMaterial({ map: archArrow.texture, transparent: true, fog: false }));
  arrowMesh.rotation.y = Math.PI / 2;      // on the wall facing into the middle hall; points north at the arch
  arrowMesh.position.set(SPOTS.archArrow[0], world.floorY + 1.45, SPOTS.archArrow[1]);
  scene.add(arrowMesh);

  vortex = createVortex();
  hole = vortex.sprite;
  scene.add(hole);

  key = A.keyProp(fixed.key);
  scene.add(key.object);
  soda = A.sodaProp(fixed.soda);
  scene.add(soda.object);

  renderCredits();
  $("loading").classList.add("hidden");
  $("title").classList.remove("hidden");
  state.phase = "title";
  placeForStart();
}

function addNpc(actor, opts) {
  const npc = {
    actor,
    kind: opts.kind,
    name: opts.name,
    lines: opts.lines || pickCrowdLines(),
    lineIndex: 0,
    talkRange: opts.talkRange || CONFIG.talkRange,
    cooldown: 0,
    followTimer: 0,
    wander: opts.wander ?? 0.8,
    area: opts.area || null,
    home: opts.at ? opts.at.slice() : null,
    goal: null,
    wanderTimer: Math.random() * 3,
    x: 0, z: 0,
  };
  if (!npc.home) npc.home = randomPointIn(npc.area, CONFIG.npcSpacing + 0.8);
  npc.x = npc.home[0];
  npc.z = npc.home[1];
  scene.add(actor.object);
  npcs.push(npc);
  return npc;
}

function pickCrowdLines() {
  const c = dialogue.crowd, a = Math.floor(Math.random() * c.length);
  let b = Math.floor(Math.random() * c.length);
  if (b === a) b = (a + 1) % c.length;
  return [c[a], c[b]];
}

// Open floor all over the club, reachable from the start, away from the special rooms,
// the dance floor and the start hallway, and well apart from everyone already placed.
function scatterSpots(count) {
  const field = new Int32Array(world.nW * world.nH);
  world.updateFlow(SPOTS.start.pos[0], SPOTS.start.pos[1], field);
  const pad = (r, m) => ({ min: [r.min[0] - m, r.min[1] - m], max: [r.max[0] + m, r.max[1] + m] });
  const keepOut = [pad(SPOTS.bathroom, 1), pad(SPOTS.keyRoom, 1.5), pad(SPOTS.danceFloor, 1)];
  const inside = (x, z) => keepOut.some((r) => x > r.min[0] && x < r.max[0] && z > r.min[1] && z < r.max[1]);
  const cells = [];
  for (let i = 0; i < field.length; i++) {
    if (field[i] < 0) continue;
    const x = world.grid.originX + (i % world.nW + 0.5) * world.nCell, z = world.grid.originZ + (((i / world.nW) | 0) + 0.5) * world.nCell;
    if (Math.hypot(x - SPOTS.start.pos[0], z - SPOTS.start.pos[1]) < 22 || inside(x, z)) continue;
    cells.push([x, z]);
  }
  const out = [];
  for (let tries = 0; out.length < count && tries < count * 200; tries++) {
    const c = cells[Math.floor(Math.random() * cells.length)];
    const near = (q) => Math.hypot(q[0] - c[0], q[1] - c[1]) < CONFIG.scatterSpacing;
    if (!npcs.some((n) => near([n.x, n.z])) && !out.some(near)) out.push(c);
  }
  return out;
}

// A free spot in an area, kept "spacing" metres away from everyone else when possible.
function randomPointIn(area, spacing = CONFIG.npcSpacing, self = null) {
  let fallback = null;
  for (let i = 0; i < 60; i++) {
    const x = rand(area.min[0], area.max[0]), z = rand(area.min[1], area.max[1]);
    if (!world.canNav(x, z)) continue;
    fallback = fallback || [x, z];
    if (npcs.every((n) => n === self || Math.hypot(n.x - x, n.z - z) >= spacing)) return [x, z];
  }
  return fallback || [(area.min[0] + area.max[0]) / 2, (area.min[1] + area.max[1]) / 2];
}

// ---------- Starting a run ----------
function placeForStart() {
  const p = state.player;
  const spot = state.introDone ? SPOTS.chaseStart : SPOTS.start;
  [p.x, p.z] = spot.pos;
  p.yaw = spot.yaw;
  p.pitch = 0;
  state.walked = 0;
  state.hasKey = false;
  state.rush = 0;
  state.talkCooldown = 0;
  state.dialogue = null;
  state.camTween = null;
  state.fovTarget = CONFIG.fov;
  camera.fov = CONFIG.fov;
  camera.updateProjectionMatrix();
  // First run: she's hidden until she appears behind you. Later runs: she's already behind you.
  [strap.x, strap.z] = SPOTS.chaseStart.strap;
  strap.actor.object.visible = state.introDone;
  strap.active = false;
  strap.elapsed = 0;
  key.object.visible = true;
  key.object.position.set(SPOTS.key[0], world.floorY, SPOTS.key[1]);
  // The soda only appears when the stall bursts open.
  soda.object.visible = false;
  state.sodaAt = null;
  state.stall = "closed";
  world.stall.close();
  for (const r of rushers) scene.remove(r.actor.object);
  rushers = [];
  for (const n of npcs) if (n.fromStall) scene.remove(n.actor.object);
  npcs = npcs.filter((n) => !n.fromStall);
  endAccost(true);
  if (state.feed) { state.feed.npc.actor.object.scale.copy(state.feed.npc.baseScale); state.feed = null; }
  state.feedTimer = rand(...CONFIG.feedEvery);
  state.accostTimer = rand(...CONFIG.accostEvery);
  for (const n of npcs) {
    [n.x, n.z] = n.home;
    n.followTimer = 0;
    n.cooldown = 0;
    n.goal = null;
  }
  $("dialogue").classList.add("hidden");
  document.body.classList.remove("talking", "danger", "rush");
}

function startRun() {
  placeForStart();
  showScreen(null);
  document.body.classList.add("playing");
  if (!state.introDone) {
    state.phase = "walk";
    setStatus(touch ? "Left thumb to walk. Right thumb to look." : "W A S D or arrow keys to move. Click, then move the mouse to look.", "neutral");
  } else {
    state.phase = "play";
    startChase();
  }
  input.enabled = true;
  lockPointer(renderer.domElement);
}

function startChase() {
  if (!state.chaseMusic) audio.play("chase", { volume: audio.chaseVolumeFor(dist(strap)) });
  state.chaseMusic = false;
  strap.actor.object.visible = true;
  strap.active = true;
  strap.elapsed = 0;
  state.lastStatus = "";
  updateStatus();
  showPopulation();
}

// ---------- Intro ----------
// True once Sock is behind you: you've walked past them in the hallway.
function passedSock() {
  const p = state.player, s = phoneGirl;
  const dx = s.x - p.x, dz = s.z - p.z;
  return Math.hypot(dx, dz) < 6 && dx * Math.cos(p.yaw) + dz * Math.sin(p.yaw) < -0.5;
}

async function beginIntroLock() {
  state.phase = "lock";
  // The way you were walking (snapped to the hallway), for when you get control back.
  state.walkYaw = Math.round(state.player.yaw / (Math.PI / 2)) * (Math.PI / 2);
  input.enabled = false;
  releaseTouches();
  // A phone rings once, then the texts come up.
  await audio.playOnce("ring");
  state.phase = "introVideo";
  await playVideo(videoSrc("intro"), { muted: false, closable: false });
  hideVideo();
  beginPan();
}

// The camera turns around: Community Strap is behind you. Then it snaps back to face
// the opposite way, the instructions come up, and the chase song starts with them.
function beginPan() {
  state.phase = "pan";
  const p = state.player, g = phoneGirl;
  const dx = g.x - p.x, dz = g.z - p.z, len = Math.hypot(dx, dz) || 1;
  const bx = dx / len, bz = dz / len;             // behind the player, past Sock
  let best = null, bestScore = Infinity;
  for (let x = p.x - 18; x <= p.x + 18; x += 0.5) for (let z = p.z - 18; z <= p.z + 18; z += 0.5) {
    const ox = x - p.x, oz = z - p.z, d = Math.hypot(ox, oz);
    if (d < 9 || d > 16 || !world.canNav(x, z)) continue;
    const ang = Math.abs(angleDiff(Math.atan2(bz, bx), Math.atan2(oz, ox)));
    if (ang > 0.6) continue;
    const px = -oz / d * 0.5, pz = ox / d * 0.5;
    if (!world.clearLine(p.x, p.z, x, z) || !world.clearLine(p.x, p.z, x + px, z + pz) || !world.clearLine(p.x, p.z, x - px, z - pz)) continue;
    const score = ang * 10 + Math.abs(d - 12) * 0.3;
    if (score < bestScore) { bestScore = score; best = [x, z]; }
  }
  [strap.x, strap.z] = best || SPOTS.chaseStart.strap;
  strap.actor.object.visible = true;
  strap.actor.setExtra(0.6);
  state.fovTarget = 42;
  tweenCameraTo(strap.x, world.floorY + 1.3, strap.z, 1.8, () => sockScene(() => {
    setTimeout(() => {
      // Turn away from her and face straight down the hallway, the way you were walking,
      // so you're not left staring into a wall.
      const ax = p.x + Math.cos(state.walkYaw) * 10, az = p.z + Math.sin(state.walkYaw) * 10;
      state.fovTarget = CONFIG.fov;
      tweenCameraTo(ax, world.floorY + CONFIG.eyeHeight, az, 1.1, async () => {
        state.phase = "dangerVideo";
        unlockPointer();
        audio.play("chase", { volume: audio.chaseVolumeFor(dist(strap)) });
        state.chaseMusic = true;
        await playVideo(videoSrc("danger"), { muted: true, closable: true });
        hideVideo();
        strap.actor.setExtra(0);
        state.introDone = true;
        state.phase = "play";
        input.enabled = true;
        lockPointer(renderer.domElement);
        startChase();
      });
    }, 600);
  }));
}

// ---------- Video overlay ----------
const video = $("video");
// H.264 MP4 plays almost everywhere; WebM covers browsers that can't decode it.
const VIDEO_EXT = video.canPlayType('video/mp4; codecs="avc1.4D401E"') ? ".mp4" : ".webm";
const videoSrc = (name) => "assets/video/" + name + VIDEO_EXT;
function playVideo(src, { muted, closable }) {
  return new Promise((resolve) => {
    $("video-layer").classList.remove("hidden");
    $("hud").classList.add("hidden");
    $("video-close").classList.add("hidden");
    video.loop = false;
    video.muted = muted;
    audio.setVideoVolume(muted ? 0 : 1);
    if (!video.src.endsWith(src)) video.src = src;
    video.currentTime = 0;
    const ended = () => {
      video.removeEventListener("ended", ended);
      if (!closable) { resolve(); return; }
      // Hold on the last frame until the player closes it: the X, Enter (or Space),
      // or a tap/click anywhere on the screen.
      const close = $("video-close"), layer = $("video-layer");
      close.classList.remove("hidden");
      const done = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        close.onclick = null;
        layer.removeEventListener("pointerup", done);
        document.removeEventListener("keydown", onKey, true);
        resolve();
      };
      const onKey = (e) => { if (["Enter", "NumpadEnter", "Space", "Escape"].includes(e.code)) done(e); };
      close.onclick = done;
      layer.addEventListener("pointerup", done);
      document.addEventListener("keydown", onKey, true);
    };
    video.addEventListener("ended", ended);
    const p = video.play();
    if (p && p.catch) p.catch(() => {
      video.muted = true;
      video.play().catch(() => ended());
    });
  });
}
function hideVideo() {
  $("video-layer").classList.add("hidden");
  $("hud").classList.remove("hidden");
  video.pause();
}

// ---------- Camera ----------
// Turn (and optionally glide to "moveTo") to look at a point.
function tweenCameraTo(x, y, z, seconds, then, moveTo = null) {
  const p = state.player, eyeY = world.floorY + CONFIG.eyeHeight;
  const [ex, ez] = moveTo || [p.x, p.z];
  const yaw = Math.atan2(z - ez, x - ex);
  const pitch = Math.atan2(y - eyeY, Math.hypot(x - ex, z - ez));
  state.camTween = { fromYaw: p.yaw, fromPitch: p.pitch, yaw: p.yaw + angleDiff(p.yaw, yaw), pitch, t: 0, seconds, then,
    fromX: p.x, fromZ: p.z, toX: ex, toZ: ez };
}

function updateCamera(dt) {
  const p = state.player, tw = state.camTween;
  if (tw) {
    tw.t = Math.min(1, tw.t + dt / tw.seconds);
    const e = tw.t < 0.5 ? 2 * tw.t * tw.t : 1 - Math.pow(-2 * tw.t + 2, 2) / 2;
    p.yaw = tw.fromYaw + (tw.yaw - tw.fromYaw) * e;
    p.pitch = tw.fromPitch + (tw.pitch - tw.fromPitch) * e;
    p.x = tw.fromX + (tw.toX - tw.fromX) * e;
    p.z = tw.fromZ + (tw.toZ - tw.fromZ) * e;
    if (tw.t >= 1) { state.camTween = null; if (tw.then) tw.then(); }
  }
  if (Math.abs(camera.fov - state.fovTarget) > 0.05) {
    camera.fov += (state.fovTarget - camera.fov) * Math.min(1, dt * 1.6);
    camera.updateProjectionMatrix();
  }
  const eyeY = world.floorY + CONFIG.eyeHeight;
  camera.position.set(p.x, eyeY, p.z);
  const cp = Math.cos(p.pitch);
  camera.lookAt(p.x + Math.cos(p.yaw) * cp, eyeY + Math.sin(p.pitch), p.z + Math.sin(p.yaw) * cp);
}

// ---------- Player ----------
function updatePlayer(dt) {
  const p = state.player;
  if (!input.enabled) { input.lookX = input.lookY = 0; return; }
  const { fwd, strafe, turn } = moveAxes();
  p.yaw += input.lookX + turn * CONFIG.turnSpeed * dt;
  p.pitch = Math.max(-CONFIG.maxPitch, Math.min(CONFIG.maxPitch, p.pitch + input.lookY));
  input.lookX = input.lookY = 0;
  if (!fwd && !strafe) return;
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw), sp = CONFIG.playerSpeed * dt;
  const mx = (c * fwd - s * strafe) * sp, mz = (s * fwd + c * strafe) * sp;
  const ox = p.x, oz = p.z;
  if (world.canWalk(p.x + mx, p.z) && !npcBlocks(p.x + mx, p.z)) p.x += mx;
  if (world.canWalk(p.x, p.z + mz) && !npcBlocks(p.x, p.z + mz)) p.z += mz;
  state.walked += Math.hypot(p.x - ox, p.z - oz);
}

// People are soft: they only push back when you move closer to them.
function npcBlocks(nx, nz) {
  const p = state.player;
  for (const n of npcs) {
    const d = Math.hypot(nx - n.x, nz - n.z);
    if (d < 0.38 && d < Math.hypot(p.x - n.x, p.z - n.z)) return true;
  }
  return false;
}

const dist = (o) => Math.hypot(o.x - state.player.x, o.z - state.player.z);

// ---------- NPCs ----------
function moveToward(n, tx, tz, speed, dt) {
  const dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz);
  if (d < 0.05) return true;
  const step = Math.min(d, speed * dt), nx = n.x + dx / d * step, nz = n.z + dz / d * step;
  if (world.canNav(nx, nz)) { n.x = nx; n.z = nz; }
  else if (world.canNav(nx, n.z)) n.x = nx;
  else if (world.canNav(n.x, nz)) n.z = nz;
  else return true;
  return false;
}

function updateNpcs(dt, frozen) {
  const p = state.player;
  state.talkCooldown = Math.max(0, state.talkCooldown - dt);
  for (const n of npcs) {
    n.cooldown = Math.max(0, n.cooldown - dt);
    if (!frozen) {
      if (busy(n)) {
        // being dealt with by Community Strap; updateAccost / updateFeed move them
      } else if (n.kind === "sock") {
        // Strolls down the hallway toward where you started.
        if (state.phase === "walk") moveToward(n, SPOTS.start.pos[0] + 6, SPOTS.start.pos[1], 0.9, dt);
      } else if (state.phase === "play" && !state.dialogue && n.cooldown === 0 && state.talkCooldown === 0 && n.lines.length &&
          dist(n) < n.talkRange && !(strap.active && dist(strap) < CONFIG.quietNearStrap)) {
        startTalk(n);
      } else if (n.followTimer > 0) {
        n.followTimer -= dt;
        if (dist(n) > 1.5) {
          const step = world.flowStep(n.x, n.z);
          if (step) moveToward(n, step[0], step[1], CONFIG.followSpeed, dt);
        }
      } else if (n.wander || n.area) {
        n.wanderTimer -= dt;
        if (n.wanderTimer <= 0) {
          n.wanderTimer = rand(2, 4.5);
          const g = n.area ? randomPointIn(n.area, CONFIG.npcSpacing, n) : [n.home[0] + rand(-n.wander, n.wander), n.home[1] + rand(-n.wander, n.wander)];
          n.goal = world.canNav(g[0], g[1]) && world.clearLine(n.x, n.z, g[0], g[1], world.nav) ? g : null;
        }
        if (n.goal && moveToward(n, n.goal[0], n.goal[1], CONFIG.wanderSpeed, dt)) n.goal = null;
      }
    }
    if (busy(n)) n.actor.face(strap.x, strap.z);
    else if (dist(n) < 5) n.actor.face(p.x, p.z);
    else if (n.goal) n.actor.face(n.goal[0], n.goal[1]);
    n.actor.object.position.set(n.x, world.floorY, n.z);
    n.actor.update(dt);
  }
}

// ---------- Dialogue ----------
function startTalk(n) {
  state.dialogue = { npc: n, pages: 1 };   // one line per chat; next time, the next line
  if (n.hint) { n.lineIndex = 0; state.dialogue.pages = 2; state.dialogue.offerHint = true; }
  document.body.classList.add("talking");
  input.onTap = advanceTalk;
  releaseTouches();
  const head = world.floorY + n.actor.height * 0.85;
  tweenCameraTo(n.x, head, n.z, 0.45);
  showLine(n);
}

function showLine(n) {
  $("dialogue-name").textContent = n.name || "Patron";
  $("dialogue-text").textContent = n.lines[n.lineIndex % n.lines.length];
  n.lineIndex++;
  $("dialogue").classList.remove("hidden");
}

function advanceTalk() {
  const d = state.dialogue;
  if (!d) return;
  if (--d.pages > 0 && d.npc.lines.length > 1) { showLine(d.npc); return; }
  // After her two lines: ask whether you want the hint.
  if (d.offerHint && !d.choosing) { d.choosing = true; $("dialogue-choices").classList.remove("hidden"); return; }
  $("dialogue-choices").classList.add("hidden");
  const n = d.npc;
  n.cooldown = CONFIG.talkCooldown;
  if (n.kind === "named") n.followTimer = CONFIG.followTime;
  state.talkCooldown = CONFIG.globalTalkCooldown;
  state.dialogue = null;
  input.onTap = null;
  document.body.classList.remove("talking");
  $("dialogue").classList.add("hidden");
}
$("dialogue").addEventListener("click", (e) => { e.stopPropagation(); advanceTalk(); });

// Her Own Primary's hint, only when asked for.
function giveHint() {
  const d = state.dialogue;
  if (!d || !d.choosing) return;
  d.choosing = false;
  d.offerHint = false;
  $("dialogue-choices").classList.add("hidden");
  $("dialogue-text").textContent = d.npc.hint;
}
$("ask-hint").addEventListener("click", (e) => { e.stopPropagation(); giveHint(); });
$("no-hint").addEventListener("click", (e) => { e.stopPropagation(); advanceTalk(); });
document.addEventListener("keydown", (e) => { if (e.code === "KeyH" && !e.repeat) giveHint(); });

// ---------- Community Strap ----------
function updateStrap(dt, frozen) {
  if (strap.active && !frozen && !state.dialogue && !strap.held) {
    strap.elapsed += dt;
    if (strap.elapsed > CONFIG.enemyStartDelay) {
      // She's quick when she can see you, slow when she has to find her way round.
      const sees = world.clearLine(strap.x, strap.z, state.player.x, state.player.z);
      const speed = sees ? CONFIG.enemySpeed : CONFIG.enemyBlindSpeed;
      const step = world.flowStep(strap.x, strap.z);
      if (step) moveToward(strap, step[0], step[1], speed, dt);
      else moveToward(strap, state.player.x, state.player.z, speed, dt);
    }
  }
  const d = dist(strap);
  if (state.phase === "play") {
    strap.actor.setExtra(Math.max(0, 1 - d / CONFIG.dangerDistance) * 0.8);
    audio.setVolume("chase", audio.chaseVolumeFor(d), 0.15);
    document.body.classList.toggle("danger", d < CONFIG.dangerDistance && state.rush <= 0);
  }
  strap.actor.object.position.set(strap.x, world.floorY, strap.z);
  strap.actor.update(dt, camera);
}

// ---------- The bathroom stall ----------
function inBathroom(p) {
  const b = SPOTS.bathroom;
  return p.x > b.min[0] && p.x < b.max[0] && p.z > b.min[1] && p.z < b.max[1];
}

// The door flies open and thirty people pour out and scatter across the club, and the
// regulars in the bathroom bolt with them. Once the last of them is out of the stall,
// the soda is left spinning inside it.
function burstStall() {
  state.stall = "open";
  state.stallOpenedAt = state.time;
  world.stall.open();
  const [ix, iz] = world.stall.inside;
  // Everywhere they could run to: open floor well away from the bathroom.
  const fromStall = new Int32Array(world.nW * world.nH);
  world.updateFlow(ix, iz, fromStall);
  const spots = [];
  for (let i = 0; i < fromStall.length; i += 7) if (fromStall[i] > 60) spots.push(i);
  for (let i = 0; i < CONFIG.stallCrowd; i++) {
    const actor = makeActor(extraLooks[Math.floor(Math.random() * extraLooks.length)]);
    const cell = spots[Math.floor(Math.random() * spots.length)];
    const goal = [world.grid.originX + (cell % world.nW + 0.5) * world.nCell, world.grid.originZ + (((cell / world.nW) | 0) + 0.5) * world.nCell];
    actor.object.visible = false;
    scene.add(actor.object);
    rushers.push({
      actor, goal, field: null, stage: "exit",
      x: ix + rand(-0.4, 0.4), z: iz + rand(-0.4, 0.4),
      delay: i * 0.12,                         // they come out one after another
      life: 45,                                // in case someone gets stuck
      speed: rand(3.2, 4.4),
    });
  }
  // Everyone else in the bathroom runs out too.
  const B = SPOTS.bathroom;
  const inside = npcs.filter((n) => n.kind === "crowd" && n.x > B.min[0] && n.x < B.max[0] && n.z > B.min[1] && n.z < B.max[1]);
  inside.forEach((n, i) => {
    const cell = spots[Math.floor(Math.random() * spots.length)];
    const goal = [world.grid.originX + (cell % world.nW + 0.5) * world.nCell, world.grid.originZ + (((cell / world.nW) | 0) + 0.5) * world.nCell];
    rushers.push({ actor: n.actor, goal, field: null, stage: "run", x: n.x, z: n.z, delay: 0.3 + i * 0.25, life: 45, speed: rand(3.2, 4.2) });
  });
  npcs = npcs.filter((n) => !inside.includes(n));
}

function updateRushers(dt) {
  const [ix, iz] = world.stall.inside;
  for (const r of rushers) {
    if (r.delay > 0) { r.delay -= dt; continue; }
    if (!r.field) {
      // Each one finds their own way to their own corner of the club.
      r.field = new Int32Array(world.nW * world.nH);
      world.updateFlow(r.goal[0], r.goal[1], r.field);
    }
    r.actor.object.visible = true;
    r.life -= dt;
    if (r.stage === "exit") {
      // Straight out through the stall door first, so nobody gets stuck on its edges.
      const [fx, fz] = world.stall.front, tx = fx, tz = fz - 0.5;
      const dx = tx - r.x, dz = tz - r.z, d = Math.hypot(dx, dz), step = Math.min(d, r.speed * dt);
      if (d < 0.15) r.stage = "run";
      else { r.x += dx / d * step; r.z += dz / d * step; r.actor.face(tx, tz); }
      r.actor.object.position.set(r.x, world.floorY, r.z);
      r.actor.update(dt);
      continue;
    }
    const step = world.flowStep(r.x, r.z, r.field);
    if (step && Math.hypot(r.goal[0] - r.x, r.goal[1] - r.z) > 0.6) {
      moveToward(r, step[0], step[1], r.speed, dt);
      r.actor.face(step[0], step[1]);
    } else r.life = Math.min(r.life, 0);
    r.actor.object.position.set(r.x, world.floorY, r.z);
    r.actor.update(dt);
  }
  rushers = rushers.filter((r) => {
    if (r.life > 0) return true;
    // Made it: stay as a regular patron while there's room, otherwise slip away unseen.
    if (npcs.length < CONFIG.maxCharacters - 1) {
      const n = addNpc(r.actor, { kind: "crowd", name: "Someone from the stall", at: [r.x, r.z], wander: 2.5 });
      n.fromStall = true;
    } else if (dist(r) < 14) { r.life = 0.5; return true; }
    else scene.remove(r.actor.object);
    return false;
  });
  // The soda turns up once the stall is empty (or after 8 seconds, whatever happens).
  if (state.stall === "open" && !state.sodaAt && !soda.object.visible &&
      (rushers.every((r) => r.delay <= 0 && r.stage !== "exit") || state.time - state.stallOpenedAt > 8)) {
    state.sodaAt = [ix, iz];
    soda.object.position.set(ix, world.floorY, iz);
    soda.object.visible = true;
  }
}

// ---------- Community Strap's black hole ----------
// One frame of the hole opening at her crotch and pulling victim n in, t seconds in.
// Returns true when it's over (the hole has closed and they're gone).
const holeAim = new THREE.Vector3(), victimAim = new THREE.Vector3(), ringPos = new THREE.Vector3();
function suckFrame(n, from, t, dt) {
  // It comes out of the O-ring on her harness.
  const ring = strap.actor.ringPosition(ringPos), hx = ring.x, hy = ring.y, hz = ring.z;
  const open = Math.min(1, t / 0.4), close = t > 1.85 ? Math.max(0, 1 - (t - 1.85) / 0.4) : 1;
  hole.visible = true;
  hole.renderOrder = 5;
  hole.position.set(hx, hy, hz);
  hole.scale.setScalar(0.15 + 2.4 * open * close);
  // Point the funnel's wide end at where the victim started, as seen from the camera.
  const a = holeAim.set(hx, hy, hz).project(camera), b = victimAim.set(from[0], world.floorY + 0.9, from[1]).project(camera);
  const sx = (b.x - a.x) * camera.aspect, sy = b.y - a.y;
  hole.material.rotation = Math.hypot(sx, sy) > 0.02 ? Math.atan2(sy, sx) - Math.PI / 2 : Math.PI;
  vortex.update(dt);

  // The victim is lifted off the floor and dragged down the funnel, faster and faster,
  // spinning, stretched thin, until their middle disappears into the narrow end.
  const o = n.actor.object, h = n.actor.height || 1.6;
  const p = Math.min(1, Math.max(0, (t - 0.35) / 1.4)), e = p * p;
  if (!n.sucking) {
    n.sucking = true;
    o.traverse((c) => { c.renderOrder = 10; });
    if (o.isSprite) o.center.set(0.5, 0.5);   // spin around their middle, not their feet
  }
  n.x = from[0] + (hx - from[0]) * e;
  n.z = from[1] + (hz - from[1]) * e;
  const mid = world.floorY + h / 2 + (hy - world.floorY - h / 2) * e + Math.sin(t * 9) * 0.05 * (1 - e);
  const size = Math.max(0.001, Math.pow(1 - e, 1.3)), thin = size * (1 - 0.55 * e), tall = size * (1 + 0.6 * e);
  const spin = dt * (3 + 22 * e);
  if (o.isSprite) {
    o.position.set(n.x, mid, n.z);
    o.scale.set(n.baseScale.x * thin, n.baseScale.y * tall, 1);
    o.material.rotation += spin;
  } else {
    o.position.set(n.x, mid - (h * tall) / 2, n.z);
    o.scale.set(n.baseScale.x * thin, n.baseScale.y * tall, n.baseScale.z * thin);
    n.spinAngle = (n.spinAngle || o.rotation.y) + spin;   // facing code resets rotation each frame
    o.rotation.y = n.spinAngle;
  }
  if (t <= 2.3) return false;
  hole.visible = false;
  return true;
}

// ---------- The intro: Sock confronts Community Strap ----------
// Plays while the camera is on her, so a first-time player sees what the black hole is.
function sockScene(done) {
  // Sock, who you passed in the hallway, has carried on walking and runs into her.
  const sock = phoneGirl;
  sock.baseScale = sock.actor.object.scale.clone();
  state.fovTarget = 24;          // close in on the two of them
  state.sock = { n: sock, stage: "walk", t: 0, done };
}

function updateSock(dt) {
  const s = state.sock, n = s.n;
  s.t += dt;
  if (s.stage === "walk") {
    const arrived = Math.hypot(n.x - strap.x, n.z - strap.z) < 1.3 || moveToward(n, strap.x, strap.z, 1.6, dt) || s.t > 6;
    n.actor.face(strap.x, strap.z);
    n.actor.object.position.set(n.x, world.floorY, n.z);
    n.actor.update(dt);
    if (arrived) {
      s.stage = "talk"; s.t = 0;
      showToast("Sock", dialogue.sock || "How you gonna ghost me and then pull up to my DJ set?");
    }
  } else if (s.stage === "talk") {
    n.actor.face(strap.x, strap.z);
    n.actor.update(dt);
    if (s.t > 3.2) { s.stage = "hole"; s.t = 0; s.from = [n.x, n.z]; hideToast(); }
  } else if (suckFrame(n, s.from, s.t, dt)) {
    devour(n);
    state.sock = null;
    setTimeout(s.done, 500);
  }
}

// ---------- Community Strap eating the club ----------
const busy = (n) => n === (state.accost && state.accost.npc) || n === (state.feed && state.feed.npc);

// Anyone who strays close to her gets pulled in, while she keeps coming for you.
function updateFeed(dt) {
  const f = state.feed;
  if (!f) {
    if (!strap.active || strap.elapsed < CONFIG.enemyStartDelay || state.accost) return;
    state.feedTimer -= dt;
    if (state.feedTimer > 0) return;
    state.feedTimer = 0.5;           // look again shortly if nobody's close enough
    let best = null, bestD = CONFIG.feedRange;
    for (const n of npcs) {
      if (n.kind !== "crowd" || busy(n) || n === (state.dialogue && state.dialogue.npc)) continue;
      const d = Math.hypot(n.x - strap.x, n.z - strap.z);
      if (d < bestD) { best = n; bestD = d; }
    }
    if (!best) return;
    best.baseScale = best.actor.object.scale.clone();
    best.goal = null;
    best.followTimer = 0;
    state.feed = { npc: best, from: [best.x, best.z], t: 0 };
    return;
  }
  f.t += dt;
  if (suckFrame(f.npc, f.from, f.t, dt)) {
    devour(f.npc);
    state.feed = null;
    state.feedTimer = rand(...CONFIG.feedEvery);
  }
}

// Someone's gone for good: off the map, and the population box counts them down.
function devour(n) {
  scene.remove(n.actor.object);
  npcs = npcs.filter((m) => m !== n);
  const lines = dialogue.vortex && dialogue.vortex.length ? dialogue.vortex : ["Community Strap sucked up another ex into her Vortex."];
  showPopulation(lines[Math.floor(Math.random() * lines.length)]);
}

let popTimer = null;
function showPopulation(message) {
  $("pop-count").textContent = `Messy Dyke Population: ${npcs.length}`;
  $("pop").classList.remove("hidden");
  if (!message) return;
  const el = $("pop-msg");
  el.textContent = message;
  el.classList.remove("hidden");
  $("pop").classList.remove("bump");
  void $("pop").offsetWidth;          // restart the little shake
  $("pop").classList.add("bump");
  clearTimeout(popTimer);
  popTimer = setTimeout(() => el.classList.add("hidden"), 4200);
}

// ---------- Patrons confronting Community Strap ----------
// Every so often someone storms up to her, says their piece, and gets sucked into
// a black hole. She stands still the whole time, which buys the player a few seconds.
function updateAccost(dt) {
  const a = state.accost;
  if (!strap.active || strap.elapsed < CONFIG.enemyStartDelay) return;
  if (!a) {
    // Faster when she's close to you, since that's when you need the help.
    state.accostTimer -= dt * (dist(strap) < 15 ? 2 : 1);
    // Only when you can see her, so you actually watch it happen.
    if (state.accostTimer <= 0 && dist(strap) < 24 && world.clearLine(state.player.x, state.player.z, strap.x, strap.z)) startAccost();
    return;
  }
  a.t += dt;
  const n = a.npc;
  if (a.stage === "walk") {
    if (a.t % 0.5 < dt) world.updateFlow(strap.x, strap.z, world.flowToStrap);
    const step = world.flowStep(n.x, n.z, world.flowToStrap);
    if (step) moveToward(n, step[0], step[1], CONFIG.accostSpeed, dt);
    n.actor.face(strap.x, strap.z);
    if (Math.hypot(n.x - strap.x, n.z - strap.z) < 1.5) {
      a.stage = "talk"; a.t = 0;
      strap.held = true;
      showToast(n.name || "Someone", a.line);
    } else if (a.t > 16) endAccost();
  } else if (a.stage === "talk" && a.t > 2.8) {
    a.stage = "hole"; a.t = 0;
    a.from = [n.x, n.z];
    hole.visible = true;
  } else if (a.stage === "hole") {
    if (suckFrame(n, a.from, a.t, dt)) {
      devour(n);
      state.accost = null;
      hideToast();
      setTimeout(() => { strap.held = false; }, 900);
      state.accostTimer = rand(...CONFIG.accostEvery);
    }
  }
}

function startAccost() {
  state.accostTimer = rand(4, 8);   // try again soon if nobody's around
  if (state.feed) return;           // one vortex at a time
  const pool = npcs.filter((n) => !["dj", "primary", "sock"].includes(n.kind) && n !== (state.dialogue && state.dialogue.npc) &&
    Math.hypot(n.x - strap.x, n.z - strap.z) < CONFIG.accostRange);
  if (!pool.length) return;
  // Crowd first; the named regulars only when nobody else is around.
  const crowd = pool.filter((n) => n.kind === "crowd" || n.kind === "phone");
  const pick = (crowd.length ? crowd : pool)[Math.floor(Math.random() * (crowd.length || pool.length))];
  const lines = dialogue.accost || [];
  world.updateFlow(strap.x, strap.z, world.flowToStrap);
  pick.baseScale = pick.actor.object.scale.clone();
  pick.goal = null;
  pick.followTimer = 0;
  state.accost = { npc: pick, stage: "walk", t: 0, line: lines[Math.floor(Math.random() * lines.length)] || "" };
}

function endAccost(silent) {
  const a = state.accost;
  if (a && a.npc.baseScale && npcs.includes(a.npc)) a.npc.actor.object.scale.copy(a.npc.baseScale);
  state.accost = null;
  if (strap) strap.held = false;
  if (hole) hole.visible = false;
  if (!silent) state.accostTimer = rand(...CONFIG.accostEvery);
  hideToast();
}

let toastTimer = null;
function showToast(name, text) {
  $("toast-name").textContent = name;
  $("toast-text").textContent = "\u201C" + text + "\u201D";
  $("toast").classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 4500);
}
function hideToast() { $("toast").classList.add("hidden"); }

// ---------- Pick-ups, winning, losing ----------
function checkEvents() {
  const p = state.player;
  if (key.object.visible && Math.hypot(p.x - SPOTS.key[0], p.z - SPOTS.key[1]) < CONFIG.keyPickupDistance) {
    key.object.visible = false;
    state.hasKey = true;
  }
  if (soda.object.visible && state.sodaAt && Math.hypot(p.x - state.sodaAt[0], p.z - state.sodaAt[1]) < CONFIG.sodaPickupDistance) {
    soda.object.visible = false;
    state.rush = CONFIG.sugarRushSeconds;
  }
  if (state.stall === "closed" && Math.hypot(p.x - world.stall.front[0], p.z - world.stall.front[1]) < 1.3) burstStall();
  if (state.hasKey && Math.hypot(p.x - SPOTS.exitDoor[0], p.z - SPOTS.exitDoor[1]) < CONFIG.doorDistance) return endRun("won");
  if (state.rush <= 0 && strap.active && dist(strap) < CONFIG.catchDistance) return endRun("caught");
  updateStatus();
}

function endRun(how) {
  state.phase = how;
  input.enabled = false;
  input.onTap = null;
  releaseTouches();
  unlockPointer();
  strap.active = false;
  document.body.classList.remove("playing", "danger", "rush", "talking");
  $("dialogue").classList.add("hidden");
  if (how === "won") audio.stop("chase");
  showScreen(how);
}

function updateStatus() {
  const p = state.player;
  if (state.rush > 0) return setStatus(`SUGAR RUSH: ${Math.ceil(state.rush)}s. Nothing can catch you.`, "rush");
  let msg = state.hasKey ? "Carabiner found. Get to the exit door." : "Find the carabiner.";
  let tone = state.hasKey ? "good" : "neutral";
  if (!state.hasKey && Math.hypot(p.x - SPOTS.exitDoor[0], p.z - SPOTS.exitDoor[1]) < 2.2) { msg = "The door is locked. Find the carabiner."; tone = "bad"; }
  if (state.stall === "closed" && inBathroom(p)) { msg = "Do you hear that noise coming from the bathroom stall?"; tone = "neutral"; }
  if (soda.object.visible && state.sodaAt && Math.hypot(p.x - state.sodaAt[0], p.z - state.sodaAt[1]) < 9) { msg = "That's the smallest bottle of coke I've ever seen."; tone = "good"; }
  if (strap.active && dist(strap) < CONFIG.dangerDistance) { msg = "She's right behind you. RUN."; tone = "bad"; }
  setStatus(msg, tone);
}

function setStatus(text, tone) {
  if (text === state.lastStatus) return;
  state.lastStatus = text;
  $("status").textContent = text;
  $("status").dataset.tone = tone;
}

// ---------- Screens ----------
function showScreen(name) {
  for (const id of ["title", "caught", "won", "credits"]) $(id).classList.toggle("hidden", id !== name);
  const inGame = !name;
  $("hud").classList.toggle("hidden", !inGame);
  $("crosshair").classList.toggle("hidden", !inGame);
  if (!inGame) $("pop").classList.add("hidden");
}

function renderCredits() {
  const list = $("credits-list");
  list.textContent = "";
  for (const s of credits.sections) {
    const h = document.createElement("h2");
    h.textContent = s.title;
    list.appendChild(h);
    if (s.note) { const n = document.createElement("div"); n.className = "note"; n.textContent = s.note; list.appendChild(n); }
    const ul = document.createElement("ul");
    for (const it of s.items) { const li = document.createElement("li"); li.textContent = it; ul.appendChild(li); }
    list.appendChild(ul);
  }
}

function begin() {
  if (state.phase !== "title" && state.phase !== "caught" && state.phase !== "won") return;
  if (!state.introDone && !video.src) video.src = videoSrc("intro");
  audio.unlock(video);
  world.keyRoom.start(videoSrc("gt-room"));
  startRun();
}
$("start-btn").addEventListener("click", begin);
$("retry-btn").addEventListener("click", begin);
$("again-btn").addEventListener("click", begin);
$("credits-btn").addEventListener("click", () => showScreen("credits"));
$("credits-close").addEventListener("click", () => showScreen("title"));
window.addEventListener("keydown", (e) => {
  if (e.code === "Enter" || e.code === "KeyR") {
    if (state.phase === "title" && !$("title").classList.contains("hidden")) begin();
    else if (state.phase === "caught" || state.phase === "won") begin();
  }
});

// ---------- Main loop ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  state.time += dt;
  if (state.phase !== "loading") {
    const frozen = ["lock", "introVideo", "pan", "dangerVideo"].includes(state.phase);
    if (state.phase === "walk" || state.phase === "play") {
      if (!state.dialogue) updatePlayer(dt);
      if (state.rush > 0) state.rush = Math.max(0, state.rush - dt);
      state.flowTimer -= dt;
      if (state.flowTimer <= 0) { state.flowTimer = 0.25; world.updateFlow(state.player.x, state.player.z); }
    }
    if (state.phase === "walk" && (passedSock() || state.walked > 60)) beginIntroLock();
    updateNpcs(dt, frozen || state.phase === "title");
    updateStrap(dt, frozen);
    updateRushers(dt);
    if (state.sock) updateSock(dt);
    world.keyRoom.near(state.player.x, state.player.z);
    if (Math.hypot(state.player.x - SPOTS.archArrow[0], state.player.z - SPOTS.archArrow[1]) < 30) archArrow.update(state.time);
    if (state.phase === "play" && !frozen) { updateAccost(dt); updateFeed(dt); }
    key.update(dt);
    soda.update(dt);
    world.update(state.time, dt);
    if (state.phase === "play" && !state.dialogue) checkEvents();
    document.body.classList.toggle("rush", state.phase === "play" && state.rush > 0);
    updateCamera(dt);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(loop);
}

setupInput(renderer.domElement);
load().catch((e) => { $("loading-text").textContent = "Couldn't load the game. Refresh to try again."; console.error(e); });
requestAnimationFrame(loop);

// Test builds only (removed from the real build).
if (typeof TEST_HOOKS !== "undefined" && TEST_HOOKS) window.__t = { state, world, get npcs() { return npcs; }, get rushers() { return rushers; }, get soda() { return soda; }, burstStall, startAccost, get strap() { return strap; }, get phoneGirl() { return phoneGirl; }, SPOTS, CONFIG, camera, beginIntroLock, beginPan, endRun };
