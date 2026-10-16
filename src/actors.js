// Everything with a body: pixel sprites, 3D models, the solo poly card,
// Community Strap (glitching through her looks), the phone, the key and the soda.
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { discoFacets } from "./paint.js";

const up = new THREE.Vector3(0, 1, 0);

function pixelTexture(t) {
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

// ---------- Animated pixel-art sprite ----------
export function spriteActor(def, texture, height) {
  const map = texture.clone();
  map.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map, alphaTest: 0.5 });
  const sprite = new THREE.Sprite(mat);
  sprite.center.set(0.5, 0);
  sprite.scale.set(height * def.w / def.h, height, 1);
  const flip = Math.random() < 0.5;
  map.repeat.set((flip ? -1 : 1) / def.frames, 1);
  let frame = Math.floor(Math.random() * def.frames), clock = Math.random();
  const setFrame = () => { map.offset.x = (frame + (flip ? 1 : 0)) / def.frames; };
  setFrame();
  return {
    object: sprite,
    height,
    update(dt) {
      clock += dt * def.fps;
      if (clock >= 1) { frame = (frame + Math.floor(clock)) % def.frames; clock %= 1; setFrame(); }
    },
    face() {},
  };
}

// ---------- A still picture standing up, like a cardboard cutout ----------
export function cardActor(texture, size) {
  const mat = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(mat);
  sprite.center.set(0.5, -0.12);
  sprite.scale.set(size, size, 1);
  return { object: sprite, height: size * 1.12, update() {}, face() {} };
}

// ---------- 3D model, scaled to a person's height and stood on the floor ----------
export function modelActor(gltf, height, extras = {}) {
  const inner = cloneSkinned(gltf.scene);
  // Start the animation first: some rigs change size a lot once they move.
  let mixer = null;
  if (gltf.animations && gltf.animations.length) {
    mixer = new THREE.AnimationMixer(inner);
    mixer.clipAction(gltf.animations[0]).play();
    mixer.update(0.01 + Math.random() * 2);
  }
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner, true);
  const size = box.getSize(new THREE.Vector3());
  const s = height / size.y;
  inner.scale.setScalar(s);
  inner.position.set(-(box.min.x + size.x / 2) * s, -box.min.y * s, -(box.min.z + size.z / 2) * s);
  inner.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; if (o.material) o.material.side = THREE.DoubleSide; } });
  const group = new THREE.Group();
  group.add(inner);
  if (extras.censor) {
    // A tiny spinning disco ball where it's needed most.
    const ball = new THREE.Mesh(new THREE.SphereGeometry(height * 0.05, 16, 12),
      new THREE.MeshBasicMaterial({ map: discoFacets() }));
    ball.position.set(extras.censor[0] * height, extras.censor[1] * height, extras.censor[2] * height);
    group.add(ball);
    extras.spin = ball;
  }
  let yaw = Math.random() * Math.PI * 2, targetYaw = yaw;
  return {
    object: group,
    height,
    update(dt) {
      if (mixer) mixer.update(dt);
      if (extras.spin) extras.spin.rotation.y += dt * 4;
      let d = targetYaw - yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      yaw += d * Math.min(1, dt * 5);
      group.rotation.y = yaw;
    },
    // Models turn to face a point on the floor (x, z).
    face(x, z) { targetYaw = Math.atan2(x - group.position.x, z - group.position.z); },
  };
}

// ---------- Community Strap: a floating torso that glitches through 11 looks ----------
const strapVertex = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const strapFragment = `
uniform sampler2D map;
uniform vec4 rectA;
uniform vec4 rectB;
uniform float mixB;
uniform float time;
uniform float amount;
varying vec2 vUv;
float rnd(float x) { return fract(sin(x * 91.3458) * 47453.5453); }
vec4 look(vec4 r, vec2 uv) { return texture2D(map, r.xy + clamp(uv, 0.0, 1.0) * r.zw); }
void main() {
  vec2 uv = vUv;
  float t = floor(time * 14.0);
  float band = floor(uv.y * 36.0);
  float tearOn = step(1.0 - amount * 0.55, rnd(band + t * 1.7));
  uv.x += tearOn * (rnd(band * 3.1 + t) - 0.5) * 0.35 * amount;
  uv.x += (rnd(t) - 0.5) * 0.02 * amount;
  bool useB = rnd(band * 0.37 + t * 2.3) < mixB;
  vec4 r = useB ? rectB : rectA;
  float split = 0.006 + 0.03 * amount;
  vec4 c = look(r, uv);
  c.r = look(r, uv + vec2(split, 0.0)).r;
  c.b = look(r, uv - vec2(split, 0.0)).b;
  if (c.a < 0.45) discard;
  if (mod(gl_FragCoord.y, 3.0) < 1.0) c.rgb *= 0.62;
  gl_FragColor = vec4(c.rgb, 1.0);
}`;

export function strapActor(texture, rects, atlasW, atlasH, height) {
  texture.colorSpace = THREE.SRGBColorSpace;
  const uvRects = rects.map(([x, y, w, h]) => new THREE.Vector4(x / atlasW, 1 - (y + h) / atlasH, w / atlasW, h / atlasH));
  const aspects = rects.map(([, , w, h]) => w / h);
  const uniforms = {
    map: { value: texture },
    rectA: { value: uvRects[0].clone() },
    rectB: { value: uvRects[1].clone() },
    mixB: { value: 0 },
    time: { value: 0 },
    amount: { value: 0.1 },
  };
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms, vertexShader: strapVertex, fragmentShader: strapFragment, side: THREE.DoubleSide,
  }));
  const group = new THREE.Group();
  group.add(mesh);
  let clock = 0, extra = 0;
  return {
    object: group,
    height: height + 0.5,
    rush: 0,
    // Extra glitch on top of the usual (0..1), e.g. when she's close or on camera.
    setExtra(v) { extra = v; },
    update(dt, camera) {
      clock += dt;
      const i = Math.floor(clock) % rects.length, next = (i + 1) % rects.length, phase = clock % 1;
      uniforms.rectA.value.copy(uvRects[i]);
      uniforms.rectB.value.copy(uvRects[next]);
      // Last fifth of every second: a hard glitch burst that flickers in the next look.
      const burst = phase > 0.8;
      uniforms.mixB.value = burst ? 0.5 : 0;
      const twitch = Math.random() < 0.04 ? 0.35 : 0.08;
      uniforms.amount.value = Math.min(1, (burst ? 1 : twitch) + extra);
      uniforms.time.value = clock;
      mesh.scale.set(height * aspects[i], height, 1);
      mesh.position.y = 0.55 + height / 2 + Math.sin(clock * 2.1) * 0.06;
      mesh.position.x = (Math.random() - 0.5) * 0.05 * uniforms.amount.value;
      if (camera) group.rotation.y = Math.atan2(camera.position.x - group.position.x, camera.position.z - group.position.z);
    },
    face() {},
  };
}

// ---------- Flat hot dog held up like a phone ----------
export function hotdogProp(gltf) {
  const obj = gltf.scene.clone();
  obj.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshBasicMaterial({ color: 0xffe100, side: THREE.DoubleSide }); });
  const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3());
  const s = 0.3 / Math.max(size.x, size.y);
  const center = box.getCenter(new THREE.Vector3());
  obj.position.set(-center.x * s, -center.y * s, -center.z * s);
  obj.scale.setScalar(s);
  const holder = new THREE.Group();
  holder.add(obj);
  return holder;
}

// ---------- The key: animated carabiner (5 x 5 frame sheet) ----------
export function keyProp(texture) {
  pixelTexture(texture);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.repeat.set(1 / 5, 1 / 5);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(0.45, 0.45 * 197 / 160, 1);
  const holder = new THREE.Group();
  holder.add(sprite);
  let clock = 0;
  return {
    object: holder,
    update(dt) {
      clock += dt;
      const f = Math.floor(clock * 5) % 25;
      texture.offset.set((f % 5) / 5, 1 - (Math.floor(f / 5) + 1) / 5);
      sprite.position.y = 1.0 + Math.sin(clock * 2) * 0.08;
    },
  };
}

// ---------- The soda: a spinning bottle ----------
export function sodaProp(gltf) {
  const obj = gltf.scene.clone();
  const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3());
  const s = 0.38 / size.y;
  obj.scale.setScalar(s);
  obj.position.set(-(box.min.x + size.x / 2) * s, -box.min.y * s, -(box.min.z + size.z / 2) * s);
  const group = new THREE.Group();
  group.add(obj);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x5ff0ff, transparent: true, opacity: 0.35, depthWrite: false }));
  glow.scale.set(0.7, 0.7, 1);
  glow.position.y = 0.2;
  group.add(glow);
  const holder = new THREE.Group();
  holder.add(group);
  let clock = 0;
  return {
    object: holder,
    update(dt) {
      clock += dt;
      obj.rotation.y += dt * 1.5;
      group.position.y = 0.15 + Math.sin(clock * 2) * 0.05;
      glow.material.opacity = 0.25 + 0.15 * Math.sin(clock * 4);
    },
  };
}

export { pixelTexture, up };
