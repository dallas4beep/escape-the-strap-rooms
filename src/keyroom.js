// The carabiner room: a wide dark box whose walls carry one long band that scrolls
// left wall -> back wall -> right wall, with a blurred reflection on the floor and a
// slow blue hue wash over everything. The Girl Trash video plays on the band; until
// the video loads (or if it can't), scrolling lyrics take its place.
import * as THREE from "three";
import { SPOTS } from "./config.js";
import { clubify } from "./clublook.js";

const WALL_H = 2.64;          // this hall is taller than the club
const SCROLL = 0.55;          // metres per second the band moves along the walls
const REFLECT_DEPTH = 2.4;    // how far the floor reflection reaches into the room

const LYRICS = [
  ["Girl where are you", "block away"], ["Guess who's here", "Community Strap"],
  ["She's in a", "league", "of her own"], ["Drunken stumbling home"], ["And I", "can't forget you"],
  ["Do you go to a lot of", "parties"], ["Do you wear a lot of", "Ed Hardy"],
  ["Open relationship with", "half the population"], ["Raise your hand"], ["You think I'm", "lying"],
  ["Threw your phone at the", "bouncer"], ["Girls that", "trashy"], ["Watch your mouth or it'll get", "nasty"],
  ["Bathroom's locked"], ["Like a", "whisper", "or a", "dream"], ["Do you wanna come home with me tonight"],
  ["We can", "feel the vibe"], ["Is your", "brain fried"], ["I think I", "slept with you"], ["Let's", "rewind"],
];

// One long strip of lyrics in the poem's style: white words, a few in red.
function lyricStrip() {
  const H = 256, c = document.createElement("canvas");
  const g = c.getContext("2d");
  const font = "190px 'Bebas Neue', Impact, sans-serif";
  g.font = font;
  const gap = g.measureText("   ").width;
  let W = 0;
  for (const line of LYRICS) { for (const w of line) W += g.measureText(w + " ").width; W += gap; }
  c.width = Math.ceil(W);
  c.height = H;
  g.fillStyle = "#000";
  g.fillRect(0, 0, c.width, H);
  g.font = font;
  g.textBaseline = "middle";
  let x = 0;
  for (const line of LYRICS) {
    line.forEach((w, i) => {
      g.fillStyle = i % 2 ? "#ff2a2a" : "#ffffff";
      g.fillText(w, x, H / 2 + 10);
      x += g.measureText(w + " ").width;
    });
    x += gap;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return { texture: t, aspect: c.width / H };
}

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// uv.x is the distance along the band in metres; uv.y is 0..1 up the wall
// (or 0..1 away from the wall, for the floor reflection).
const fragmentShader = `
uniform sampler2D map;
uniform float tileW, scroll, time, reflect;
varying vec2 vUv;
vec3 hueRotate(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}
vec3 overlay(vec3 b, vec3 s) {
  return mix(2.0 * b * s, 1.0 - 2.0 * (1.0 - b) * (1.0 - s), step(0.5, b));
}
void main() {
  float u = (vUv.x - scroll) / tileW;
  vec3 col;
  float alpha = 1.0;
  if (reflect > 0.5) {
    // Mirrored and blurred: further from the wall shows higher up the band.
    float v = clamp(vUv.y * 0.75, 0.0, 1.0), b = 0.012 + vUv.y * 0.03;
    col = (texture2D(map, vec2(u, v)).rgb * 2.0 +
           texture2D(map, vec2(u + b, v)).rgb + texture2D(map, vec2(u - b, v)).rgb +
           texture2D(map, vec2(u, v + b * 3.0)).rgb + texture2D(map, vec2(u, v - b * 3.0)).rgb) / 6.0;
    alpha = 0.55 * pow(1.0 - vUv.y, 1.6);
  } else {
    col = texture2D(map, vec2(u, vUv.y)).rgb;
  }
  // Blue wash, hue drifting back and forth every 8 seconds.
  float a = radians(100.0) * (0.5 - 0.5 * cos(time * 0.785398));
  vec3 blue = mix(vec3(0.118, 0.341, 0.6), vec3(0.49, 0.725, 0.91), abs(vUv.y - 0.5) * 2.0);
  col = hueRotate(mix(col, overlay(col, blue), 0.75), a);
  gl_FragColor = vec4(col * 0.9, alpha);
  #include <colorspace_fragment>
}`;

// A quad between two floor points, with uv.x running s0 -> s1 along it.
function quad(ax, az, bx, bz, y0, y1, s0, s1) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az], 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([s0, 0, s1, 0, s1, 1, s0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

function floorQuad(corners, s0, s1) {
  // corners: wall-start, wall-end, inner-end, inner-start
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(corners.flat(), 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([s0, 0, s1, 0, s1, 1, s0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

// The sign: the band's neon two-headed planet and name, then EVIL ROOM DO NOT ENTER in
// dripping Nosifer, with drops of blood that fall from the letters and fade, over and over.
function evilSign() {
  const S = 512, c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  const base = document.createElement("canvas");
  base.width = base.height = S;

  const neon = (ctx, color, width, draw) => {
    ctx.save();
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = color;
    ctx.lineWidth = width + 3;
    ctx.globalAlpha = 0.55;
    draw(); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 6;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = width * 0.45;
    draw(); ctx.stroke();
    ctx.restore();
  };

  function drawBase() {
    const b = base.getContext("2d");
    b.clearRect(0, 0, S, S);
    b.fillStyle = "rgba(10,4,16,0.94)";
    b.fillRect(6, 6, S - 12, S - 12);
    const cyan = "#4ff7f0", pink = "#ff4fd8";
    // Two smiling planets sharing one ring: back half of the ring, planets, front half.
    const ring = (from, to, color) => neon(b, color, 4, () => {
      b.beginPath(); b.ellipse(256, 120, 205, 42, -0.12, from, to);
    });
    ring(Math.PI, Math.PI * 1.5, cyan);
    ring(Math.PI * 1.5, Math.PI * 2, pink);
    for (const [x, y, r, color] of [[300, 102, 74, pink], [200, 112, 70, cyan]]) {
      b.fillStyle = "#0a0410";
      b.beginPath(); b.arc(x, y, r, 0, Math.PI * 2); b.fill();
      neon(b, color, 4, () => { b.beginPath(); b.arc(x, y, r, 0, Math.PI * 2); });
    }
    neon(b, cyan, 4, () => { b.beginPath(); b.ellipse(182, 108, 9, 18, 0, 0, Math.PI * 2); b.moveTo(222, 108); b.ellipse(213, 108, 9, 18, 0, 0, Math.PI * 2); });
    neon(b, cyan, 4, () => { b.beginPath(); b.arc(196, 108, 46, 0.25 * Math.PI, 0.85 * Math.PI); });
    neon(b, pink, 4, () => { b.beginPath(); b.arc(296, 98, 50, 1.05 * Math.PI, 1.85 * Math.PI); });
    neon(b, pink, 4, () => { b.beginPath(); b.arc(290, 132, 13, Math.PI, 0); b.moveTo(342, 132); b.arc(329, 132, 13, Math.PI, 0); });
    ring(0, Math.PI, cyan);
    ring(0, Math.PI * 0.45, pink);
    // The band name in pink neon outline.
    b.save();
    b.font = "52px 'Bungee', Impact, sans-serif";
    b.textAlign = "center";
    b.textBaseline = "middle";
    b.lineJoin = "round";
    b.shadowColor = pink;
    b.shadowBlur = 16;
    b.strokeStyle = pink;
    b.lineWidth = 5;
    b.strokeText("2 HEADED GIRL", 256, 236);
    b.shadowBlur = 4;
    b.strokeStyle = "#ffd6f6";
    b.lineWidth = 1.6;
    b.strokeText("2 HEADED GIRL", 256, 236);
    // The warning: near-black letters with a red glow.
    b.font = "50px 'Nosifer', Impact, sans-serif";
    b.shadowColor = "#CF000F";
    b.shadowBlur = 14;
    b.fillStyle = "#111";
    for (let k = 0; k < 3; k++) {
      b.fillText("EVIL ROOM", 256, 336);
      b.font = "36px 'Nosifer', Impact, sans-serif";
      b.fillText("DO NOT ENTER", 256, 420);
      b.font = "50px 'Nosifer', Impact, sans-serif";
    }
    b.restore();
  }
  drawBase();
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load("50px 'Nosifer'"), document.fonts.load("52px 'Bungee'")]).then(() => { drawBase(); update(0); }).catch(() => {});
  }

  // Nine drops, each with its own spot, fall distance, fall time and start delay (from the original pen).
  const drops = [[118, 352, 50, 1.9, 0], [176, 352, 70, 2.8, 1.7], [252, 352, 30, 0.6, 4.0], [352, 352, 40, 0.7, 2.7],
    [104, 432, 50, 1.7, 3.8], [178, 432, 80, 1.7, 0.8], [262, 432, 30, 1.1, 2.3], [330, 432, 50, 1.8, 3.5], [402, 432, 120, 1.8, 3.0]];
  const drop = (x, y, alpha) => {
    const grad = g.createLinearGradient(x - 6, 0, x + 6, 0);
    grad.addColorStop(0, `rgba(100,0,0,${0.7 * alpha})`);
    grad.addColorStop(1, `rgba(255,0,0,${0.7 * alpha})`);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(x, y - 14);
    g.bezierCurveTo(x + 2, y - 6, x + 7, y - 2, x + 7, y + 4);
    g.arc(x, y + 4, 7, 0, Math.PI);
    g.bezierCurveTo(x - 7, y - 2, x - 2, y - 6, x, y - 14);
    g.fill();
  };

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  function update(time) {
    g.clearRect(0, 0, S, S);
    // The neon buzzes now and then.
    g.globalAlpha = Math.random() < 0.025 ? 0.55 : 1;
    g.drawImage(base, 0, 0);
    g.globalAlpha = 1;
    for (const [x, y, fall, dur, delay] of drops) {
      const t = (time - delay) % 6;
      if (time < delay || t > dur + 0.5) continue;
      const p = Math.min(1, t / dur);
      const ease = 1 - Math.pow(1 - p, 2);
      drop(x, y + fall * ease, t > dur ? 1 - (t - dur) / 0.5 : Math.min(1, t / 0.5));
    }
    texture.needsUpdate = true;
  }
  update(0);
  return { texture, update };
}

// The loading-dots arrow: ten dots, a chevron and a tail, with white light running from
// the tail to the tip every two seconds. Drawn pointing left, which on this wall is
// toward the door.
function dotArrow() {
  const W = 256, H = 128, c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  // [x, y, delay] from the original, pointing right; mirrored below.
  const dots = [[0, 0, 0.9], [18, 13, 1.1], [35, 25, 1.3], [18, 38, 1.1], [0, 50, 0.9],
    [0, 25, 0.9], [-20, 25, 0.7], [-40, 25, 0.5], [-60, 25, 0.3], [-80, 25, 0.1]];
  const k = 1.75, r = 7.5 * k * 0.95;
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  function update(time) {
    g.clearRect(0, 0, W, H);
    for (const [x, y, delay] of dots) {
      const t = (((time - delay) % 2) + 2) % 2;
      const p = 0.5 - 0.5 * Math.cos(Math.PI * t);         // green -> white -> green
      const col = `rgb(${Math.round(63 + 192 * p)},${Math.round(195 + 60 * p)},${Math.round(128 + 127 * p)})`;
      g.shadowColor = col;
      g.shadowBlur = 10 + 10 * p;
      g.fillStyle = col;
      g.beginPath();
      g.arc(W / 2 - (x + 22.5) * k, H / 2 + (y - 25) * k, r, 0, Math.PI * 2);
      g.fill();
    }
    texture.needsUpdate = true;
  }
  update(0);
  return { texture, update };
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d"), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,0.9)");
  r.addColorStop(0.35, "rgba(255,150,210,0.45)");
  r.addColorStop(1, "rgba(120,60,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildKeyRoom(world) {
  const R = SPOTS.keyRoom, y = world.floorY, scene = world.scene;
  const [x0, z0] = R.min, [x1, z1] = R.max;
  const w = x1 - x0, d = z1 - z0;

  // The band: video if it loads, lyrics until then.
  const lyrics = lyricStrip();
  const uniforms = {
    map: { value: lyrics.texture },
    tileW: { value: WALL_H * lyrics.aspect },
    scroll: { value: 0 },
    time: { value: 0 },
    reflect: { value: 0 },
  };
  // Redraw the lyrics once the poster font has arrived.
  if (document.fonts && document.fonts.load) {
    document.fonts.load("190px 'Bebas Neue'").then(() => {
      if (uniforms.map.value !== lyrics.texture) return;
      const again = lyricStrip();
      uniforms.map.value = again.texture;
      uniforms.tileW.value = WALL_H * again.aspect;
    }).catch(() => {});
  }
  const wallMat = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, side: THREE.DoubleSide });
  const floorUniforms = { ...uniforms, reflect: { value: 1 } };
  const reflectMat = new THREE.ShaderMaterial({
    uniforms: floorUniforms, vertexShader, fragmentShader,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); scene.add(m); return m; };
  const inset = 0.03, top = y + WALL_H, base = y + 0.01;

  // Left wall (south) -> back wall (west) -> right wall (north), as one strip.
  const sA = w, sB = w + d, sC = w + d + w;
  add(quad(x1, z1 - inset, x0, z1 - inset, base, top, 0, sA), wallMat);
  add(quad(x0 + inset, z1, x0 + inset, z0, base, top, sA, sB), wallMat);
  add(quad(x0, z0 + inset, x1, z0 + inset, base, top, sB, sC), wallMat);

  // Black glossy floor, black ceiling, black front wall like the open side of a stage.
  const black = new THREE.MeshBasicMaterial({ color: 0x050308, side: THREE.DoubleSide });
  world.plane(w, d, black, x0 + w / 2, y + 0.03, z0 + d / 2, 0, -Math.PI / 2);
  world.plane(w, d, black, x0 + w / 2, top - 0.01, z0 + d / 2, 0, Math.PI / 2);
  const D = REFLECT_DEPTH, fy = y + 0.04;
  add(floorQuad([[x1, fy, z1], [x0, fy, z1], [x0 + D, fy, z1 - D], [x1, fy, z1 - D]], 0, sA), reflectMat);
  add(floorQuad([[x0, fy, z1], [x0, fy, z0], [x0 + D, fy, z0 + D], [x0 + D, fy, z1 - D]], sA, sB), reflectMat);
  add(floorQuad([[x0, fy, z0], [x1, fy, z0], [x1, fy, z0 + D], [x0 + D, fy, z0 + D]], sB, sC), reflectMat);

  // East wall with the doorway: black inside, the club's own walls outside so it sits
  // in the level like any other room.
  const mid = y + WALL_H / 2;
  const outsideMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  clubify(outsideMat, "Wall_1");
  const a = R.doorFrom - z0, b = z1 - R.doorTo, lintel = R.doorTo - R.doorFrom;
  world.plane(a, WALL_H, black, x1 - inset, mid, z0 + a / 2, -Math.PI / 2);
  world.plane(b, WALL_H, black, x1 - inset, mid, R.doorTo + b / 2, -Math.PI / 2);
  world.plane(lintel, 0.4, black, x1 - inset, top - 0.2, R.doorFrom + lintel / 2, -Math.PI / 2);
  world.plane(a, WALL_H, outsideMat, x1 + inset, mid, z0 + a / 2, Math.PI / 2);
  world.plane(b, WALL_H, outsideMat, x1 + inset, mid, R.doorTo + b / 2, Math.PI / 2);
  world.plane(lintel, 0.4, outsideMat, x1 + inset, top - 0.2, R.doorFrom + lintel / 2, Math.PI / 2);
  world.plane(w, WALL_H, outsideMat, x0 + w / 2, mid, z1 + inset, 0);
  world.blockRect(x1 - 0.08, z0, x1 + 0.08, R.doorFrom);
  world.blockRect(x1 - 0.08, R.doorTo, x1 + 0.08, z1);
  world.blockRect(x0, z1 - 0.08, x1, z1 + 0.08);

  // The same neon strips as every other wall in the club.
  const strip = (len, h, py, color, px, pz, alongZ) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(alongZ ? 0.02 : len, h, alongZ ? len : 0.02),
      new THREE.MeshBasicMaterial({ color, fog: false }));
    m.position.set(px, py, pz);
    scene.add(m);
  };
  for (const [py, h, color] of [[y + 0.07, 0.06, 0xff3d9a], [y + 2.355, 0.05, 0x9b5cff]]) {
    strip(a, h, py, color, x1 + 0.05, z0 + a / 2, true);
    strip(b, h, py, color, x1 + 0.05, R.doorTo + b / 2, true);
    strip(w, h, py, color, x0 + w / 2, z1 + 0.05, false);
  }

  // The sign by the door: the band's neon logo, then a warning, dripping blood.
  const sign = evilSign();
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.0), new THREE.MeshBasicMaterial({ map: sign.texture, transparent: true }));
  signMesh.rotation.y = Math.PI / 2;
  signMesh.position.set(x1 + 0.06, y + 1.38, R.doorTo + 1.6);
  scene.add(signMesh);
  // A dotted arrow on the other side of the door, pointing at it.
  const arrow = dotArrow();
  const arrowMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), new THREE.MeshBasicMaterial({ map: arrow.texture, transparent: true, fog: false }));
  arrowMesh.rotation.y = Math.PI / 2;
  arrowMesh.position.set(x1 + 0.06, y + 1.45, R.doorFrom - 1.2);
  scene.add(arrowMesh);
  world.updaters.push((time) => { if (wanted) { sign.update(time); arrow.update(time); } });

  // A pool of light on the floor where the carabiner floats.
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2),
    new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(SPOTS.key[0], y + 0.05, SPOTS.key[1]);
  scene.add(glow);

  // The video: muted, looping, only playing while you're near enough to see it.
  const video = document.createElement("video");
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.preload = "auto";
  let started = false, wanted = false;
  video.addEventListener("loadeddata", () => {
    const t = new THREE.VideoTexture(video);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    uniforms.map.value = t;
    uniforms.tileW.value = WALL_H * (video.videoWidth / video.videoHeight || 16 / 9);
  }, { once: true });

  const cx = x0 + w / 2, cz = z0 + d / 2;
  world.updaters.push((time, dt) => {
    uniforms.time.value = time;
    uniforms.scroll.value += dt * SCROLL;
  });

  return {
    center: [cx, cz],
    // Call from the Start tap so phones allow playback.
    start(src) {
      if (started) return;
      started = true;
      video.src = src;
      video.load();
      video.play().then(() => { if (!wanted) video.pause(); }).catch(() => {});
    },
    // Pause the video when the player is far away; it's the heaviest thing on screen.
    near(px, pz) {
      const want = Math.hypot(px - cx, pz - cz) < 22;
      if (want === wanted || !started) return;
      wanted = want;
      if (want) video.play().catch(() => {}); else video.pause();
    },
  };
}
