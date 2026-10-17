// The Backrooms level, the walkable map, and the club built inside it:
// dance floor, DJ booth, bathroom, and the carabiner room.
import * as THREE from "three";
import { CONFIG, SPOTS } from "./config.js";
import * as paint from "./paint.js";
import { buildKeyRoom } from "./keyroom.js";
import { clubify, clubTime, clubTex, clubHole, neonStrips } from "./clublook.js";
import { buildMushroom, mushroomTextures } from "./mushroom.js";

const WALL_H = 2.45;

export class World {
  constructor(scene) {
    this.scene = scene;
    this.updaters = [];
  }

  async load(gltfLoader, texLoader, onProgress) {
    const info = await (await fetch("assets/level/level.json")).json();
    this.info = info;
    this.floorY = info.floorY;
    const g = info.grid, k = CONFIG.mapScale;
    // The level is stretched in width and length; the wall map stretches with it.
    this.grid = { ...g, originX: g.originX * k, originZ: g.originZ * k, cell: g.cell * k };

    const [gltf, walls] = await Promise.all([
      gltfLoader.loadAsync("assets/level/level.glb"),
      loadImageData("assets/level/walls.png"),
    ]);
    onProgress && onProgress();

    // Every surface uses its baked texture with no lighting, which keeps phones fast.
    const textures = {};
    await Promise.all(Object.entries(info.textures).map(async ([name, file]) => {
      const t = await texLoader.loadAsync("assets/level/" + file);
      t.colorSpace = THREE.SRGBColorSpace;
      t.flipY = false;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
      textures[name] = t;
    }));
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      // Each mesh sits under a node named after its material.
      const name = info.textures[o.material.name] ? o.material.name : (o.parent && o.parent.name) || o.name;
      const see = /ranslucent|raslucent/.test(name);
      o.material = new THREE.MeshBasicMaterial({
        map: textures[name] || null,
        color: textures[name] ? 0xffffff : 0xd8c98a,
        side: THREE.DoubleSide,
        transparent: see,
        opacity: see ? 0.6 : 1,
        depthWrite: !see,
      });
      clubify(o.material, name);
    });
    gltf.scene.scale.set(k, 1, k);
    this.scene.add(gltf.scene);

    // Wall map: 1 = blocked. Props get added below, then it's thickened for collision.
    this.base = new Uint8Array(g.width * g.height);
    for (let i = 0; i < this.base.length; i++) this.base[i] = walls.data[i * 4] > 127 ? 1 : 0;

    this.buildDanceFloor();
    this.buildDJBooth();
    this.buildBathroom();
    this.keyRoom = buildKeyRoom(this);
    await buildMushroom(this, gltfLoader, texLoader);
    const mt = mushroomTextures(texLoader);
    clubTex.wall.value = mt.wall;
    clubTex.floor.value = mt.floor;
    const m = SPOTS.mushroom.pos, r = SPOTS.mushroom.hole;
    clubHole.value.set(m[0], m[1], r);
    neonStrips(this, [SPOTS.bathroom, SPOTS.keyRoom, { min: [m[0] - r, m[1] - r], max: [m[0] + r, m[1] + r] }]);
    this.updaters.push((t) => { clubTime.value = t; });

    this.walk = this.dilate(0.25);     // player clearance
    this.nav = this.dilate(0.32);      // NPC and Community Strap clearance
    this.buildNav();
  }

  // ---------- Map helpers ----------

  cellOf(x, z) {
    const g = this.grid;
    return [Math.floor((x - g.originX) / g.cell), Math.floor((z - g.originZ) / g.cell)];
  }

  blockedIn(map, x, z) {
    const [cx, cz] = this.cellOf(x, z);
    if (cx < 0 || cz < 0 || cx >= this.grid.width || cz >= this.grid.height) return true;
    return map[cz * this.grid.width + cx] === 1;
  }

  canWalk(x, z) { return !this.blockedIn(this.walk, x, z); }
  canNav(x, z) { return !this.blockedIn(this.nav, x, z); }

  // True when nothing solid sits between two points (used for sight lines).
  clearLine(ax, az, bx, bz, map = this.base) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.08);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (this.blockedIn(map, ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  blockRect(x0, z0, x1, z1) {
    const [a, b] = this.cellOf(Math.min(x0, x1), Math.min(z0, z1));
    const [c, d] = this.cellOf(Math.max(x0, x1), Math.max(z0, z1));
    for (let z = Math.max(0, b); z <= Math.min(this.grid.height - 1, d); z++)
      for (let x = Math.max(0, a); x <= Math.min(this.grid.width - 1, c); x++)
        this.base[z * this.grid.width + x] = 1;
  }

  dilate(radius) {
    const { width: W, height: H, cell } = this.grid;
    const r = Math.ceil(radius / cell), out = new Uint8Array(W * H);
    const offs = [];
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dz * dz <= r * r) offs.push([dx, dz]);
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      if (!this.base[z * W + x]) continue;
      for (const [dx, dz] of offs) {
        const X = x + dx, Z = z + dz;
        if (X >= 0 && Z >= 0 && X < W && Z < H) out[Z * W + X] = 1;
      }
    }
    return out;
  }

  // ---------- Flow field toward the player (shared by the chaser and followers) ----------

  buildNav() {
    const g = this.grid;
    this.nCell = g.cell * 2;   // two wall-map cells per step, so it covers the whole (scaled) map
    this.nW = Math.floor(g.width / 2);
    this.nH = Math.floor(g.height / 2);
    this.nBlocked = new Uint8Array(this.nW * this.nH);
    for (let z = 0; z < this.nH; z++) for (let x = 0; x < this.nW; x++) {
      const wx = g.originX + (x + 0.5) * this.nCell, wz = g.originZ + (z + 0.5) * this.nCell;
      this.nBlocked[z * this.nW + x] = this.canNav(wx, wz) ? 0 : 1;
    }
    this.flow = new Int32Array(this.nW * this.nH);       // toward the player
    this.flowToStrap = new Int32Array(this.nW * this.nH); // toward Community Strap
    this.queue = new Int32Array(this.nW * this.nH);
  }

  navCell(x, z) {
    const g = this.grid;
    return [Math.floor((x - g.originX) / this.nCell), Math.floor((z - g.originZ) / this.nCell)];
  }

  // Breadth-first distances from (x, z) to every reachable cell.
  updateFlow(x, z, dist = this.flow) {
    const W = this.nW, H = this.nH, q = this.queue;
    dist.fill(-1);
    let [sx, sz] = this.navCell(x, z);
    sx = Math.max(0, Math.min(W - 1, sx)); sz = Math.max(0, Math.min(H - 1, sz));
    let head = 0, tail = 0;
    dist[sz * W + sx] = 0;
    q[tail++] = sz * W + sx;
    while (head < tail) {
      const i = q[head++], cx = i % W, cz = (i / W) | 0, d = dist[i] + 1;
      if (cx > 0 && dist[i - 1] < 0 && !this.nBlocked[i - 1]) { dist[i - 1] = d; q[tail++] = i - 1; }
      if (cx < W - 1 && dist[i + 1] < 0 && !this.nBlocked[i + 1]) { dist[i + 1] = d; q[tail++] = i + 1; }
      if (cz > 0 && dist[i - W] < 0 && !this.nBlocked[i - W]) { dist[i - W] = d; q[tail++] = i - W; }
      if (cz < H - 1 && dist[i + W] < 0 && !this.nBlocked[i + W]) { dist[i + W] = d; q[tail++] = i + W; }
    }
  }

  // Next point to walk toward when heading for the player. Null if unreachable.
  flowStep(x, z, field = this.flow) {
    const W = this.nW, [cx, cz] = this.navCell(x, z);
    let best = -1, bx = cx, bz = cz;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const X = cx + dx, Z = cz + dz;
      if (X < 0 || Z < 0 || X >= W || Z >= this.nH) continue;
      const d = field[Z * W + X];
      if (d < 0) continue;
      // Diagonal steps only when both sides are open, so nobody cuts corners through walls.
      if (dx && dz && (this.nBlocked[cz * W + X] || this.nBlocked[Z * W + cx])) continue;
      if (best < 0 || d < best) { best = d; bx = X; bz = Z; }
    }
    if (best < 0) return null;
    const g = this.grid;
    return [g.originX + (bx + 0.5) * this.nCell, g.originZ + (bz + 0.5) * this.nCell];
  }

  // ---------- Club props ----------

  plane(w, h, material, x, y, z, rotY = 0, rotX = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    m.position.set(x, y, z);
    m.rotation.set(rotX, rotY, 0, "YXZ");
    this.scene.add(m);
    return m;
  }

  box(w, h, d, material, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    this.scene.add(m);
    return m;
  }

  buildDanceFloor() {
    const { min, max } = SPOTS.danceFloor;
    const w = max[0] - min[0], d = max[1] - min[1];
    const floor = paint.danceFloor(Math.round(w), Math.round(d));
    this.plane(w, d, new THREE.MeshBasicMaterial({ map: floor.texture }),
      (min[0] + max[0]) / 2, this.floorY + 0.012, (min[1] + max[1]) / 2, 0, -Math.PI / 2);
    this.updaters.push((t) => floor.update(t));

    // Disco ball over the middle of the floor.
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 16),
      new THREE.MeshBasicMaterial({ map: paint.discoFacets() }));
    ball.position.set((min[0] + max[0]) / 2, this.floorY + 2.05, (min[1] + max[1]) / 2);
    this.scene.add(ball);
    this.updaters.push((t, dt) => { ball.rotation.y += dt * 0.8; });
  }

  buildDJBooth() {
    const { center: [cx, cz], width, depth } = SPOTS.djBooth;
    const y = this.floorY;
    const front = new THREE.MeshBasicMaterial({ map: paint.djFront() });
    const dark = new THREE.MeshBasicMaterial({ color: 0x1a0d2a });
    const booth = this.box(width, 1.05, depth, [dark, dark, dark, dark, front, dark], cx, y + 0.525, cz);
    booth.material[4].map.repeat.set(1, 1);
    const deck = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const vinyl = new THREE.MeshBasicMaterial({ color: 0xff70a6 });
    for (const dx of [-0.8, 0.8]) {
      this.box(0.6, 0.06, 0.5, deck, cx + dx, y + 1.08, cz);
      const rec = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 24), vinyl);
      rec.position.set(cx + dx, y + 1.12, cz);
      this.scene.add(rec);
      this.updaters.push((t, dt) => { rec.rotation.y += dt * 3.5; });
    }
    for (const dx of [-width / 2 - 0.45, width / 2 + 0.45]) this.box(0.6, 1.6, 0.6, dark, cx + dx, y + 0.8, cz - 0.1);
    this.blockRect(cx - width / 2 - 0.8, cz - depth / 2, cx + width / 2 + 0.8, cz + depth / 2);
  }

  buildBathroom() {
    const B = SPOTS.bathroom, y = this.floorY;
    const [x0, z0] = B.min, [x1, z1] = B.max;
    const w = x1 - x0, d = z1 - z0, mid = y + WALL_H / 2;
    const tile = (len) => { const t = paint.tileWall(); t.repeat.set(len, 1); return new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }); };

    // Floor and ceiling.
    this.plane(w, d, new THREE.MeshBasicMaterial({ map: paint.checkerFloor(w, d) }), x0 + w / 2, y + 0.014, z0 + d / 2, 0, -Math.PI / 2);
    this.plane(w, d, new THREE.MeshBasicMaterial({ map: paint.ceilingPanels(w / 1.2, d / 1.2) }), x0 + w / 2, y + WALL_H, z0 + d / 2, 0, Math.PI / 2);

    // North wall with a doorway, tiled on both sides, and a WC sign over the door.
    const a = B.doorFrom - x0, b = x1 - B.doorTo;
    this.plane(a, WALL_H, tile(a), x0 + a / 2, mid, z0);
    this.plane(b, WALL_H, tile(b), B.doorTo + b / 2, mid, z0);
    const lintel = B.doorTo - B.doorFrom;
    this.plane(lintel, 0.35, tile(lintel), B.doorFrom + lintel / 2, y + WALL_H - 0.175, z0);
    this.plane(0.8, 0.3, new THREE.MeshBasicMaterial({ map: paint.wcSign(), side: THREE.DoubleSide }), (B.doorFrom + B.doorTo) / 2, y + 2.25, z0 - 0.02);
    this.blockRect(x0, z0 - 0.08, B.doorFrom, z0 + 0.08);
    this.blockRect(B.doorTo, z0 - 0.08, x1, z0 + 0.08);

    // West wall (new) and tile covers over the level's own east and south walls.
    // It has a second doorway: this side is the only way through to the west half
    // of the club, so the route to the carabiner and the exit runs through here.
    const wFrom = z1 - 4.0, wTo = z1 - 2.2, sA = wFrom - z0, sB = z1 - wTo, wl = wTo - wFrom;
    this.plane(sA, WALL_H, tile(sA), x0, mid, z0 + sA / 2, Math.PI / 2);
    this.plane(sB, WALL_H, tile(sB), x0, mid, wTo + sB / 2, Math.PI / 2);
    this.plane(wl, 0.35, tile(wl), x0, y + WALL_H - 0.175, wFrom + wl / 2, Math.PI / 2);
    this.blockRect(x0 - 0.08, z0, x0 + 0.08, wFrom);
    this.blockRect(x0 - 0.08, wTo, x0 + 0.08, z1);
    this.plane(d, WALL_H, tile(d), x1 - 0.03, mid, z0 + d / 2, -Math.PI / 2);
    this.plane(w, WALL_H, tile(w), x0 + w / 2, mid, z1 - 0.03, Math.PI);

    // Sinks with mirrors along the west wall.
    const mirror = new THREE.MeshBasicMaterial({ map: paint.mirrorWall() });
    const counter = new THREE.MeshBasicMaterial({ color: 0xf2f2ee });
    const sinkFrom = z0 + 1.0, sinkTo = z0 + 4.2;
    this.box(0.55, 0.85, sinkTo - sinkFrom, counter, x0 + 0.3, y + 0.425, (sinkFrom + sinkTo) / 2);
    for (let z = sinkFrom + 0.4; z < sinkTo; z += 0.8) this.plane(0.75, 0.75, mirror, x0 + 0.04, y + 1.5, z, Math.PI / 2);
    this.blockRect(x0, sinkFrom, x0 + 0.6, sinkTo);

    // One stall in the far corner, built like a giant low-poly bathroom cabinet:
    // trim cap on top, base strip, a panelled door with a brass knob.
    const S = 2.6, sx0 = x1 - S, sz0 = z1 - S, doorW = 1.3, doorX = sx0 + 0.6;
    const stallH = 2.2, T = 0.08;
    const body = 0xf1ede4, trim = 0xfaf8f2, base = 0x8d8476, panel = 0xe3dccf, brass = 0xc9a14a;
    const at = (mesh, px, py, pz) => { mesh.position.set(px, py, pz); this.scene.add(mesh); return mesh; };
    // Side wall and the two front panels either side of the door.
    at(kBox(T, stallH - 0.1, S, body), sx0, y + 0.1 + (stallH - 0.1) / 2, sz0 + S / 2);
    at(kBox(doorX - sx0, stallH - 0.1, T, body), (sx0 + doorX) / 2, y + 0.1 + (stallH - 0.1) / 2, sz0);
    at(kBox(x1 - doorX - doorW, stallH - 0.1, T, body), (doorX + doorW + x1) / 2, y + 0.1 + (stallH - 0.1) / 2, sz0);
    // Base strip, set back a little, and a chunky trim cap along the top.
    at(kBox(S, 0.1, T * 0.8, base), sx0 + S / 2, y + 0.05, sz0 + 0.01);
    at(kBox(T * 0.8, 0.1, S, base), sx0 + 0.01, y + 0.05, sz0 + S / 2);
    at(kBox(S + 0.1, 0.12, T + 0.1, trim), sx0 + S / 2 - 0.05, y + stallH + 0.06, sz0);
    at(kBox(T + 0.1, 0.12, S, trim), sx0, y + stallH + 0.06, sz0 + S / 2);
    this.blockRect(sx0 - 0.06, sz0, sx0 + 0.06, z1);
    this.blockRect(sx0, sz0 - 0.06, doorX, sz0 + 0.06);
    this.blockRect(doorX + doorW, sz0 - 0.06, x1, sz0 + 0.06);
    // The door hangs from a hinge on its left edge.
    const hinge = new THREE.Group();
    hinge.position.set(doorX, y + 0.12, sz0);
    const doorH = stallH - 0.16, dw = doorW - 0.02;
    const door = new THREE.Group();
    door.add(at(kBox(dw, doorH, 0.06, body), dw / 2, doorH / 2, 0));
    for (const side of [-1, 1]) {
      // Two raised panels on each face, like a cabinet door.
      door.add(at(kBox(dw - 0.24, doorH * 0.36, 0.02, panel), dw / 2, doorH * 0.73, side * 0.035));
      door.add(at(kBox(dw - 0.24, doorH * 0.36, 0.02, panel), dw / 2, doorH * 0.29, side * 0.035));
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 8), shaded(brass));
      knob.rotation.x = Math.PI / 2;
      door.add(at(knob, dw - 0.1, doorH * 0.5, side * 0.07));
    }
    hinge.add(door);
    this.scene.add(hinge);
    let swing = null;
    this.stall = {
      front: [doorX + doorW / 2, sz0 - 0.3],     // just outside the door
      inside: [doorX + doorW / 2, sz0 + S / 2],  // middle of the stall
      open() { swing = 0; },
      close() { swing = null; hinge.rotation.y = 0; },
    };
    // The door slams open with a little bounce.
    this.updaters.push((t, dt) => {
      if (swing === null) return;
      swing = Math.min(1, swing + dt * 3.2);
      const e = swing < 0.7 ? swing / 0.7 * 1.15 : 1.15 - 0.15 * (swing - 0.7) / 0.3;
      hinge.rotation.y = e * 1.9;
    });
  }

  update(time, dt) {
    for (const f of this.updaters) f(time, dt);
  }
}

// Kenney-style flat shading without lights: each face of a box gets a fixed shade.
const shadeCache = {};
function shaded(color) {
  if (shadeCache[color]) return shadeCache[color];
  const c = new THREE.Color(color);
  const face = (k) => new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(k) });
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z.
  return (shadeCache[color] = [face(0.84), face(0.78), face(1), face(0.6), face(0.93), face(0.88)]);
}
function kBox(w, h, d, color) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), shaded(color));
}

function loadImageData(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      resolve(g.getImageData(0, 0, img.width, img.height));
    };
    img.onerror = reject;
    img.src = src;
  });
}
