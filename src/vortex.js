/*! Community Strap's black hole is adapted from "Creative Black Hole"
 * Copyright (c) 2026 Antoine Wodniack (https://codepen.io/wodniack/pen/VYwGEGg)
 * MIT License: Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify, merge,
 * publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to
 * whom the Software is furnished to do so, subject to the following conditions: The above
 * copyright notice and this permission notice shall be included in all copies or substantial
 * portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
 */
// Drawn on a canvas every frame it's visible and shown as a sprite at her crotch: a funnel
// of rings and spokes sinking toward a point, particles rising out of it, a purple glow,
// a shifting cyan/peach/gold aura and scanlines. The edges fade out so it floats in the room.
import * as THREE from "three";

const SIZE = 256;
const DISCS = 60, LINES = 60, PARTICLES = 70;
const inExpo = (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10));

export function createVortex() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  const W = SIZE, H = SIZE;

  const start = { x: W * 0.5, y: H * 0.45, w: W * 0.75, h: H * 0.7 };
  const end = { x: W * 0.5, y: H * 0.95, w: 0, h: 0 };
  const tween = (d) => {
    d.x = start.x + (end.x - start.x) * d.p;
    d.y = start.y + (end.y - start.y) * inExpo(d.p);
    d.w = start.w + (end.w - start.w) * d.p;
    d.h = start.h + (end.h - start.h) * d.p;
    return d;
  };

  // The rings, and the ring where the funnel's throat clips everything below it.
  const discs = [];
  let clip = null, prevBottom = H;
  for (let i = 0; i < DISCS; i++) {
    const d = tween({ p: i / DISCS });
    if (d.y + d.h <= prevBottom) clip = { ...d };
    prevBottom = d.y + d.h;
    discs.push(d);
  }
  const clipPath = new Path2D();
  clipPath.ellipse(clip.x, clip.y, clip.w, clip.h, 0, 0, Math.PI * 2);
  clipPath.rect(clip.x - clip.w, 0, clip.w * 2, clip.y);

  // The spokes, drawn once.
  const lines = document.createElement("canvas");
  lines.width = W;
  lines.height = H;
  const lctx = lines.getContext("2d");
  lctx.strokeStyle = "#7a5aa8";
  lctx.lineWidth = 1;
  for (let i = 0; i < LINES; i++) {
    const a = (i / LINES) * Math.PI * 2;
    lctx.save();
    let inside = false;
    for (let j = 1; j < discs.length; j++) {
      const d0 = discs[j - 1], d1 = discs[j];
      const p0 = [d0.x + Math.cos(a) * d0.w, d0.y + Math.sin(a) * d0.h];
      const p1 = [d1.x + Math.cos(a) * d1.w, d1.y + Math.sin(a) * d1.h];
      if (!inside && lctx.isPointInPath(clipPath, p1[0], p1[1])) inside = true;
      else if (inside) lctx.clip(clipPath);
      lctx.beginPath();
      lctx.moveTo(p0[0], p0[1]);
      lctx.lineTo(p1[0], p1[1]);
      lctx.stroke();
    }
    lctx.restore();
  }

  // Particles rising out of the throat.
  const area = { sw: clip.w * 0.5, ew: clip.w * 2, h: H * 0.85 };
  area.sx = (W - area.sw) / 2;
  area.ex = (W - area.ew) / 2;
  const particle = (first) => {
    const sx = area.sx + area.sw * Math.random(), ex = area.ex + area.ew * Math.random();
    return { sx, dx: ex - sx, x: sx, y: first ? area.h * Math.random() : area.h, vy: 0.5 + Math.random(), r: 0.5 + Math.random() * 2.5, a: Math.random() };
  };
  const particles = Array.from({ length: PARTICLES }, () => particle(true));

  // Edge fade, so the square canvas never shows.
  const fade = ctx.createRadialGradient(W * 0.5, H * 0.52, W * 0.12, W * 0.5, H * 0.52, W * 0.5);
  fade.addColorStop(0, "rgba(0,0,0,1)");
  fade.addColorStop(0.65, "rgba(0,0,0,0.85)");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.75, 0, W * 0.5, H * 0.75, W * 0.6);
  glow.addColorStop(0, "rgba(169,0,255,0.9)");
  glow.addColorStop(0.3, "rgba(169,0,255,0.5)");
  glow.addColorStop(1, "rgba(169,0,255,0)");

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  let clock = 0;

  function update(dt) {
    clock += dt;
    const step = dt * 60;           // the pen moves things a fixed amount per 60fps frame
    for (const d of discs) tween(Object.assign(d, { p: (d.p + 0.001 * step) % 1 }));
    for (const pt of particles) {
      const p = 1 - pt.y / area.h;
      pt.x = pt.sx + pt.dx * p;
      pt.y -= pt.vy * step * 0.6;
      if (pt.y < 0) Object.assign(pt, particle(false));
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0b0612";
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "#7a5aa8";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(start.x, start.y, start.w, start.h, 0, 0, Math.PI * 2);
    ctx.stroke();
    discs.forEach((d, i) => {
      if (i % 4) return;
      const clipped = d.w < clip.w - 4;
      if (clipped) { ctx.save(); ctx.clip(clipPath); }
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.w, d.h, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (clipped) ctx.restore();
    });
    ctx.drawImage(lines, 0, 0);

    ctx.save();
    ctx.clip(clipPath);
    for (const pt of particles) {
      ctx.fillStyle = `rgba(255,255,255,${pt.a})`;
      ctx.fillRect(pt.x, pt.y, pt.r, pt.r);
    }
    ctx.restore();

    // The aura: a soft column of shifting colour rising out of the throat.
    const shift = (clock / 5) % 1;
    const aura = ctx.createLinearGradient(0, H * (-1 + shift * 2), W * 0.3, H * (1 + shift * 2));
    [["#00f8f1", 0], ["rgba(255,189,30,0.12)", 0.165], ["#fe848f", 0.33], ["rgba(254,132,143,0.12)", 0.495], ["#00f8f1", 0.66], ["rgba(0,248,241,0.4)", 0.855], ["#ffbd1e", 1]]
      .forEach(([c, o]) => aura.addColorStop(o, c));
    const column = ctx.createRadialGradient(W * 0.5, 0, 0, W * 0.5, 0, H * 0.75);
    column.addColorStop(0, "rgba(0,0,0,0.75)");
    column.addColorStop(1, "rgba(0,0,0,0)");
    const tmp = auraLayer.ctx;
    tmp.globalCompositeOperation = "source-over";
    tmp.clearRect(0, 0, W, H);
    tmp.fillStyle = aura;
    tmp.fillRect(W * 0.3, 0, W * 0.4, H);
    tmp.globalCompositeOperation = "destination-in";
    tmp.fillStyle = column;
    tmp.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(auraLayer.canvas, 0, 0);

    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    for (let y = 1; y < H; y += 3) ctx.fillRect(0, y, W, 1);

    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    texture.needsUpdate = true;
  }

  const auraLayer = { canvas: document.createElement("canvas") };
  auraLayer.canvas.width = W;
  auraLayer.canvas.height = H;
  auraLayer.ctx = auraLayer.canvas.getContext("2d");

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.center.set(0.5, 0.55);     // the funnel's mouth sits on the anchor point
  sprite.visible = false;
  update(0);
  return { sprite, update };
}
