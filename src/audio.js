
import { CONFIG } from "./config.js";

let ctx = null;
const tracks = {};

function track(name, src, loop = true) {
  const el = new Audio(src);
  el.loop = loop;
  el.preload = "auto";
  el.setAttribute("playsinline", "");
  const t = { el, gain: null };
  if (ctx) {
    try {
      t.gain = ctx.createGain();
      t.gain.gain.value = 0;
      ctx.createMediaElementSource(el).connect(t.gain).connect(ctx.destination);
    } catch (e) { t.gain = null; }
  }
  tracks[name] = t;
  return t;
}

export function unlock(video) {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; }
    track("chase", "assets/audio/chase.mp3");
    track("ring", "assets/audio/ring.mp3", false);
  }
  if (ctx && ctx.state === "suspended") ctx.resume();

  for (const t of Object.values(tracks)) {
    const p = t.el.play();
    if (p && p.then) p.then(() => { if (!t.wanted) t.el.pause(); }).catch(() => {});
  }
  if (video) {
    const p = video.play();
    if (p && p.then) p.then(() => { video.pause(); video.currentTime = 0; }).catch(() => {});
  }
}

export function setVolume(name, v, smooth = 0.1) {
  const t = tracks[name];
  if (!t) return;
  if (t.gain) t.gain.gain.setTargetAtTime(v, ctx.currentTime, smooth);
  else t.el.volume = Math.max(0, Math.min(1, v));
}

export function play(name, { restart = true, volume = 1 } = {}) {
  const t = tracks[name];
  if (!t) return;
  t.wanted = true;
  if (restart) t.el.currentTime = 0;
  setVolume(name, volume, 0.05);
  const p = t.el.play();
  if (p && p.catch) p.catch(() => {});
}

export function stop(name) {
  const t = tracks[name];
  if (!t) return;
  t.wanted = false;
  t.el.pause();
}

// Play a sound once and resolve when it finishes (or after maxSeconds, whichever is first).
export function playOnce(name, maxSeconds = 6) {
  return new Promise((resolve) => {
    const t = tracks[name];
    if (!t) { resolve(); return; }
    let done = false;
    const finish = () => { if (done) return; done = true; t.wanted = false; resolve(); };
    t.el.addEventListener("ended", finish, { once: true });
    setTimeout(finish, maxSeconds * 1000);
    play(name, { volume: 1 });
  });
}

export function stopAll() { for (const n in tracks) stop(n); }

export function chaseVolumeFor(distance) {
  const m = CONFIG.music;
  const close = Math.max(0, 1 - distance / m.hearDistance);
  return m.minVolume + (m.maxVolume - m.minVolume) * close * close;
}

document.addEventListener("visibilitychange", () => {
  for (const t of Object.values(tracks)) {
    if (document.hidden) t.el.pause();
    else if (t.wanted) t.el.play().catch(() => {});
  }
});
