// Music. Volumes go through Web Audio because iPhones ignore audio.volume.
// unlock() must run inside a tap or key press (the Start button does it).
import { CONFIG } from "./config.js";

let ctx = null;
const tracks = {};

function track(name, src) {
  const el = new Audio(src);
  el.loop = true;
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
  }
  if (ctx && ctx.state === "suspended") ctx.resume();
  // Touch each media element once during the tap so the browser lets it play later.
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

export function stopAll() { for (const n in tracks) stop(n); }

// Chase song: louder the closer Community Strap gets.
export function chaseVolumeFor(distance) {
  const m = CONFIG.music;
  const close = Math.max(0, 1 - distance / m.hearDistance);
  return m.minVolume + (m.maxVolume - m.minVolume) * close * close;
}

// Pause everything when the tab or app goes to the background.
document.addEventListener("visibilitychange", () => {
  for (const t of Object.values(tracks)) {
    if (document.hidden) t.el.pause();
    else if (t.wanted) t.el.play().catch(() => {});
  }
});
