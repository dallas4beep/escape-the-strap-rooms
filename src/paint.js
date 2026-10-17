// Textures painted on canvases at startup: bathroom tiles, mirrors,
// the DJ booth front, the checkerboard floor and the disco ball.
import * as THREE from "three";

function canvas(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  return c;
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function toTexture(c, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 4;
  return t;
}

function tiles(g, S, rnd) {
  const t = S / 8;
  g.fillStyle = "#94a8a2";
  g.fillRect(0, 0, S, S);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const mint = y >= 6, v = Math.floor(rnd() * 10);
      g.fillStyle = mint ? `rgb(${110 + v},${205 + v},${180 + v})` : `rgb(${228 + v},${238 + v},${234 + v})`;
      g.fillRect(x * t + 1, y * t + 1, t - 2, t - 2);
      g.fillStyle = "rgba(255,255,255,0.6)";
      g.fillRect(x * t + 2, y * t + 2, t * 0.35, 2);
    }
  }
  g.fillStyle = "#ff70a6";
  g.fillRect(0, t * 6 - 3, S, 4);
}

// One texture = one metre of wall, floor to ceiling is stretched over 2.45 m.
export function tileWall() {
  return toTexture(canvas(128, 128, (g, S) => tiles(g, S, seeded(3))));
}

export function mirrorWall() {
  return toTexture(canvas(128, 128, (g, S) => {
    tiles(g, S, seeded(3));
    g.fillStyle = "#5c5c66";
    g.fillRect(14, 10, S - 28, 56);
    const glass = g.createLinearGradient(0, 14, 0, 62);
    glass.addColorStop(0, "#cfe6f2");
    glass.addColorStop(1, "#8fb3c8");
    g.fillStyle = glass;
    g.fillRect(18, 14, S - 36, 48);
    g.strokeStyle = "rgba(255,255,255,0.7)";
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(30, 58); g.lineTo(56, 18);
    g.moveTo(44, 58); g.lineTo(62, 30);
    g.stroke();
    g.strokeStyle = "#ff3d7f";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(S - 38, 30, 6, Math.PI, 0);
    g.arc(S - 26, 30, 6, Math.PI, 0);
    g.lineTo(S - 32, 44);
    g.closePath();
    g.stroke();
  }));
}

export function checkerFloor(w, d) {
  const t = toTexture(canvas(64, 64, (g) => {
    g.fillStyle = "#96969b";
    g.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      g.fillStyle = (x + y) % 2 ? "#2e2c3a" : "#ecece6";
      g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30);
    }
  }), w, d);
  t.magFilter = THREE.NearestFilter;
  return t;
}

export function ceilingPanels(w, d) {
  return toTexture(canvas(64, 64, (g) => {
    g.fillStyle = "#969ba5";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#cdd4dc";
    g.fillRect(2, 2, 60, 60);
    g.fillStyle = "#fffff0";
    g.fillRect(10, 26, 44, 12);
  }), w, d);
}

export function djFront() {
  return toTexture(canvas(256, 96, (g, W, H) => {
    g.fillStyle = "#1a0d2a";
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 4; i++) {
      g.strokeStyle = ["#ff70a6", "#5ff0ff", "#ff9b55", "#c9a0ff"][i];
      g.lineWidth = 3;
      g.strokeRect(6 + i * 5, 6 + i * 5, W - 12 - i * 10, H - 12 - i * 10);
    }
    g.fillStyle = "#ff70a6";
    g.shadowColor = "#ff70a6";
    g.shadowBlur = 14;
    g.font = "bold 40px monospace";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("DJ", W / 2, H / 2 + 2);
  }));
}

export function wcSign() {
  return toTexture(canvas(128, 48, (g, W, H) => {
    g.fillStyle = "#120a1f";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#5ff0ff";
    g.shadowColor = "#5ff0ff";
    g.shadowBlur = 12;
    g.font = "bold 30px monospace";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("WC", W / 2, H / 2 + 1);
  }));
}

export function discoFacets() {
  const t = toTexture(canvas(128, 64, (g, W, H) => {
    const rnd = seeded(9);
    for (let y = 0; y < H; y += 8) for (let x = 0; x < W; x += 8) {
      const v = 120 + Math.floor(rnd() * 135);
      g.fillStyle = rnd() < 0.08 ? "#ffffff" : `rgb(${v},${v},${v + 10})`;
      g.fillRect(x, y, 7, 7);
    }
  }));
  t.magFilter = THREE.NearestFilter;
  return t;
}

// Light-up dance floor. Call update(time) each frame; colours change on the beat.
export function danceFloor(cols, rows) {
  const CELL = 16;
  const c = document.createElement("canvas");
  c.width = cols * CELL;
  c.height = rows * CELL;
  const g = c.getContext("2d");
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  const colours = ["#ff70a6", "#5ff0ff", "#ff9b55", "#aa64ff", "#ffe066"];
  let lastBeat = -1;
  function update(time) {
    const beat = Math.floor(time * 2);
    if (beat === lastBeat) return;
    lastBeat = beat;
    g.fillStyle = "#22102f";
    g.fillRect(0, 0, c.width, c.height);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const h = ((x * 73856093) ^ (y * 19349663) ^ (beat * 83492791)) >>> 0;
      g.globalAlpha = ((h >>> 8) & 3) ? 0.95 : 0.3;
      g.fillStyle = colours[h % colours.length];
      g.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
    }
    g.globalAlpha = 1;
    tex.needsUpdate = true;
  }
  update(0);
  return { texture: tex, update };
}
