// The carabiner room: a wide dark box whose walls carry one long band that scrolls
// left wall -> back wall -> right wall, with a blurred reflection on the floor and a
// slow blue hue wash over everything. The Girl Trash video plays on the band; until
// the video loads (or if it can't), scrolling lyrics take its place.
import * as THREE from "three";
import { SPOTS } from "./config.js";

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

// Plain mono-yellow wallpaper to match the Backrooms halls outside the room.
function wallpaper() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#cbb46c";
  g.fillRect(0, 0, 64, 256);
  g.fillStyle = "rgba(120,95,30,0.12)";
  for (let x = 4; x < 64; x += 16) g.fillRect(x, 0, 3, 256);
  g.fillStyle = "rgba(90,70,20,0.35)";
  g.fillRect(0, 244, 64, 12);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function neonSign() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 148;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(10,4,20,0.92)";
  g.fillRect(0, 0, 512, 148);
  g.strokeStyle = "#5ff0ff";
  g.lineWidth = 4;
  g.shadowColor = "#5ff0ff";
  g.shadowBlur = 12;
  g.strokeRect(8, 8, 496, 132);
  g.font = "bold 64px 'Bebas Neue', Impact, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.shadowColor = "#ff4fa3";
  g.shadowBlur = 22;
  g.fillStyle = "#ffd1e8";
  g.fillText("GIRL TRASH", 256, 78);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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

  // East wall with the doorway, black inside, Backrooms wallpaper outside.
  const mid = y + WALL_H / 2;
  const outside = (len) => {
    const t = wallpaper();
    t.repeat.set(len / 1.2, 1);
    return new THREE.MeshBasicMaterial({ map: t });
  };
  const a = R.doorFrom - z0, b = z1 - R.doorTo, lintel = R.doorTo - R.doorFrom;
  world.plane(a, WALL_H, black, x1 - inset, mid, z0 + a / 2, -Math.PI / 2);
  world.plane(b, WALL_H, black, x1 - inset, mid, R.doorTo + b / 2, -Math.PI / 2);
  world.plane(lintel, 0.4, black, x1 - inset, top - 0.2, R.doorFrom + lintel / 2, -Math.PI / 2);
  world.plane(a, WALL_H, outside(a), x1 + inset, mid, z0 + a / 2, Math.PI / 2);
  world.plane(b, WALL_H, outside(b), x1 + inset, mid, R.doorTo + b / 2, Math.PI / 2);
  world.plane(lintel, 0.4, outside(lintel), x1 + inset, top - 0.2, R.doorFrom + lintel / 2, Math.PI / 2);
  world.plane(w, WALL_H, outside(w), x0 + w / 2, mid, z1 + inset, 0);
  world.blockRect(x1 - 0.08, z0, x1 + 0.08, R.doorFrom);
  world.blockRect(x1 - 0.08, R.doorTo, x1 + 0.08, z1);
  world.blockRect(x0, z1 - 0.08, x1, z1 + 0.08);

  // Neon outside so nobody walks past it: pink trim, a cyan door frame, a lit sign,
  // and light spilling out of the doorway.
  const pink = new THREE.MeshBasicMaterial({ color: 0xff4fa3 });
  const cyan = new THREE.MeshBasicMaterial({ color: 0x5ff0ff });
  const bar = (sx, sy, sz, mat, px, py, pz) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(px, py, pz);
    scene.add(m);
  };
  const doorTop = top - 0.4, dm = (R.doorFrom + R.doorTo) / 2;
  bar(0.06, 0.06, d, pink, x1 + 0.07, top - 0.06, z0 + d / 2);
  bar(0.06, 0.06, d, pink, x1 + 0.07, y + 0.06, z0 + d / 2);
  bar(w, 0.06, 0.06, pink, x0 + w / 2, top - 0.06, z1 + 0.07);
  bar(w, 0.06, 0.06, pink, x0 + w / 2, y + 0.06, z1 + 0.07);
  bar(0.06, doorTop - y, 0.06, cyan, x1 + 0.07, (y + doorTop) / 2, R.doorFrom);
  bar(0.06, doorTop - y, 0.06, cyan, x1 + 0.07, (y + doorTop) / 2, R.doorTo);
  bar(0.06, 0.06, R.doorTo - R.doorFrom, cyan, x1 + 0.07, doorTop, dm);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.75), new THREE.MeshBasicMaterial({ map: neonSign(), transparent: true }));
  sign.rotation.y = Math.PI / 2;
  sign.position.set(x1 + 0.08, y + 1.55, R.doorTo + 1.7);
  scene.add(sign);
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6),
    new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
  spill.rotation.x = -Math.PI / 2;
  spill.position.set(x1 + 1.4, y + 0.05, dm);
  scene.add(spill);
  // The sign buzzes and flickers now and then.
  world.updaters.push(() => { sign.material.opacity = Math.random() < 0.03 ? 0.35 : 1; });

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
