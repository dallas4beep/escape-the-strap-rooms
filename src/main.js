// Escape the Strap Rooms
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { CONFIG, SPOTS } from "./config.js";
import { World } from "./world.js";
import * as A from "./actors.js";
import { input, setupInput, lockPointer, unlockPointer, releaseTouches, moveAxes, isTouchDevice } from "./input.js";
import * as audio from "./audio.js";
import { blackHole } from "./paint.js";
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
scene.background = new THREE.Color(0x2b2412);
scene.fog = new THREE.Fog(0xb9a560, 30, 100);
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
let rushers = [], extraLooks = [], hole = null, makeActor = null;
let dialogue = null, credits = null;

// ---------- Loading ----------
async function load() {
  let done = 0, total = 1;
  const tick = () => { done++; $("loading-text").textContent = `Loading ${Math.min(99, Math.round(done / total * 100))}%`; };

  const [chars, dlg, cred, rects] = await Promise.all(
    ["assets/sprites/chars.json", "data/dialogue.json", "data/credits.json", "assets/img/strap-looks.json"].map((u) => fetch(u).then((r) => r.json())));
  dialogue = dlg;
  credits = cred;

  // Cast the night. 38 random faces: phone girl, 2 DJs, 7 named, dance floor, bathroom.
  const slots = 1 + 2 + 7 + CONFIG.danceCrowd + CONFIG.bathroomCrowd;
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
  phoneGirl = addNpc(next(), { kind: "phone", name: "Girl on the phone", at: SPOTS.phoneGirl, wander: 0 });
  SPOTS.djs.forEach((at, i) => addNpc(next(), { kind: "dj", name: "DJ", at, wander: 0, lines: i ? dialogue.djRight : dialogue.djLeft, talkRange: 1.9 }));
  for (const [name, at] of Object.entries(SPOTS.named)) addNpc(next(), { kind: "named", name, at, wander: 1.2, lines: dialogue.named[name] || [] });
  addNpc(A.cardActor(fixed.primary, 1.5), { kind: "primary", name: "Her Own Primary", at: SPOTS.primary, wander: 0, lines: dialogue.primary });
  const df = SPOTS.danceFloor;
  for (let i = 0; i < CONFIG.danceCrowd; i++) addNpc(next(), { kind: "crowd", name: "Someone on the dance floor", area: { min: [df.min[0] + 0.6, df.min[1] + 1.2], max: [df.max[0] - 0.6, df.max[1] - 0.4] } });
  const b = SPOTS.bathroom;
  for (let i = 0; i < CONFIG.bathroomCrowd; i++) addNpc(next(), { kind: "crowd", name: "Someone in the bathroom", area: { min: [b.min[0] + 0.9, b.min[1] + 0.5], max: [b.max[0] - 0.4, b.max[1] - 1.7] } });

  hole = new THREE.Sprite(new THREE.SpriteMaterial({ map: blackHole(), transparent: true, depthWrite: false }));
  hole.visible = false;
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
  endAccost(true);
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
}

// ---------- Intro ----------
function beginIntroLock() {
  state.phase = "lock";
  input.enabled = false;
  releaseTouches();
  const g = phoneGirl;
  tweenCameraTo(g.x, world.floorY + g.actor.height * 0.8, g.z, 1.2, async () => {
    // Her phone rings first, then the texts come up.
    await audio.playOnce("ring");
    state.phase = "introVideo";
    await playVideo(videoSrc("intro"), { muted: false, closable: false });
    hideVideo();
    beginPan();
  });
}

// The camera turns around: Community Strap is behind you. Then it snaps back to face
// the opposite way, the instructions come up, and the chase song starts with them.
function beginPan() {
  state.phase = "pan";
  const p = state.player, g = phoneGirl;
  const dx = g.x - p.x, dz = g.z - p.z, len = Math.hypot(dx, dz) || 1;
  const bx = -dx / len, bz = -dz / len;           // straight behind the player
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
  tweenCameraTo(strap.x, world.floorY + 1.3, strap.z, 1.8, () => {
    setTimeout(() => {
      // Face the exact opposite way: away from her.
      const ax = p.x - (strap.x - p.x), az = p.z - (strap.z - p.z);
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
    }, 1200);
  });
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
      // Hold on the last frame until the player closes it.
      const close = $("video-close");
      close.classList.remove("hidden");
      close.onclick = (e) => { e.stopPropagation(); close.onclick = null; resolve(); };
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
      if (n === (state.accost && state.accost.npc)) {
        // busy shouting at Community Strap; updateAccost moves them
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
    if (n === (state.accost && state.accost.npc)) n.actor.face(strap.x, strap.z);
    else if (dist(n) < 5) n.actor.face(p.x, p.z);
    else if (n.goal) n.actor.face(n.goal[0], n.goal[1]);
    n.actor.object.position.set(n.x, world.floorY, n.z);
    n.actor.update(dt);
  }
}

// ---------- Dialogue ----------
function startTalk(n) {
  state.dialogue = { npc: n, pages: 2 };
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

// The door flies open, thirty people pour out, and one of them drops the soda.
function burstStall() {
  state.stall = "open";
  world.stall.open();
  const [ix, iz] = world.stall.inside, [fx, fz] = world.stall.front;
  const b = SPOTS.bathroom, doorX = (b.doorFrom + b.doorTo) / 2;
  for (let i = 0; i < CONFIG.stallCrowd; i++) {
    const look = extraLooks[Math.floor(Math.random() * extraLooks.length)];
    const actor = makeActor(look);
    const r = {
      actor,
      x: ix + rand(-0.5, 0.5), z: iz + rand(-0.5, 0.5),
      delay: i * 0.09,                         // they come out one after another
      life: rand(7, 10),
      speed: rand(3.2, 4.4),
      // Out of the stall, out of the bathroom door, then off into the club.
      path: [[fx + rand(-0.3, 0.3), fz - 0.4], [doorX + rand(-0.5, 0.5), b.min[1] + 0.6], [doorX + rand(-0.6, 0.6), b.min[1] - 1.2],
             [doorX + rand(-12, 12), b.min[1] - rand(4, 12)]],
    };
    actor.object.visible = false;
    scene.add(actor.object);
    rushers.push(r);
  }
  // Someone in the stampede drops the bottle.
  setTimeout(() => {
    if (state.stall !== "open") return;
    for (let d = 1.6; d >= 0.6; d -= 0.2) {
      const x = fx + rand(-0.4, 0.4), z = fz - d;
      if (world.canWalk(x, z)) { state.sodaAt = [x, z]; break; }
    }
    state.sodaAt = state.sodaAt || [fx, fz - 1];
    soda.object.position.set(state.sodaAt[0], world.floorY, state.sodaAt[1]);
    soda.object.visible = true;
  }, 900);
}

function updateRushers(dt) {
  for (const r of rushers) {
    if (r.delay > 0) { r.delay -= dt; continue; }
    r.actor.object.visible = true;
    r.life -= dt;
    if (r.path.length && moveToward(r, r.path[0][0], r.path[0][1], r.speed, dt)) r.path.shift();
    else if (r.path.length && Math.hypot(r.path[0][0] - r.x, r.path[0][1] - r.z) < 0.3) r.path.shift();
    if (r.path.length) r.actor.face(r.path[0][0], r.path[0][1]);
    // They flicker out as they leave.
    r.actor.object.position.set(r.x, world.floorY, r.z);
    if (r.life < 0.6) r.actor.object.visible = Math.random() < r.life / 0.6;
    r.actor.update(dt);
  }
  rushers = rushers.filter((r) => {
    if (r.life > 0) return true;
    scene.remove(r.actor.object);
    return false;
  });
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
    if (state.accostTimer <= 0) startAccost();
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
    // The hole opens at her crotch, pulls them in spinning, then closes.
    // Sits at her crotch, nudged toward the victim so it's in front of her.
    const dx = a.from[0] - strap.x, dz = a.from[1] - strap.z, dl = Math.hypot(dx, dz) || 1;
    const hx = strap.x + dx / dl * 0.15, hz = strap.z + dz / dl * 0.15, hy = world.floorY + 0.62;
    const open = Math.min(1, a.t / 0.4), close = a.t > 1.8 ? Math.max(0, 1 - (a.t - 1.8) / 0.4) : 1;
    hole.position.set(hx, hy, hz);
    hole.scale.setScalar(0.08 + 0.72 * open * close);
    hole.material.rotation -= dt * 7;
    const pull = Math.min(1, Math.max(0, (a.t - 0.3) / 1.2));
    n.x = a.from[0] + (hx - a.from[0]) * pull;
    n.z = a.from[1] + (hz - a.from[1]) * pull;
    const sc = Math.max(0.01, 1 - pull);
    n.actor.object.scale.copy(n.baseScale).multiplyScalar(sc);
    if (n.actor.object.material) n.actor.object.material.rotation += dt * 12 * pull;
    if (a.t > 2.2) {
      hole.visible = false;
      scene.remove(n.actor.object);
      npcs = npcs.filter((m) => m !== n);
      state.accost = null;
      hideToast();
      setTimeout(() => { strap.held = false; }, 900);
      state.accostTimer = rand(...CONFIG.accostEvery);
    }
  }
}

function startAccost() {
  state.accostTimer = rand(4, 8);   // try again soon if nobody's around
  const pool = npcs.filter((n) => !["dj", "primary"].includes(n.kind) && n !== (state.dialogue && state.dialogue.npc) &&
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
    if (state.phase === "walk" && state.walked >= CONFIG.introWalkDistance && dist(phoneGirl) < 30 &&
        world.clearLine(state.player.x, state.player.z, phoneGirl.x, phoneGirl.z)) beginIntroLock();
    updateNpcs(dt, frozen || state.phase === "title");
    updateStrap(dt, frozen);
    updateRushers(dt);
    world.keyRoom.near(state.player.x, state.player.z);
    if (state.phase === "play" && !frozen) updateAccost(dt);
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
