// Keyboard, mouse look, and phone controls.
// Phones: touch the left side of the screen and a joystick appears under your thumb.
// Drag anywhere else to look around. Tap to continue a conversation.
import { CONFIG } from "./config.js";

export const input = {
  keys: {},
  move: { x: 0, y: 0 },      // joystick, -1..1
  lookX: 0,                  // accumulated look since last frame (radians)
  lookY: 0,
  enabled: false,            // movement and looking
  pointerLocked: false,
  onTap: null,               // called on any tap/click/space while a conversation is open
};

const STICK_RADIUS = 55, DEAD_ZONE = 0.12, STICK_ZONE = 0.45;

export function isTouchDevice() {
  return navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
}

export function setupInput(canvas) {
  if (isTouchDevice()) document.body.classList.add("touch");
  window.addEventListener("pointerdown", (e) => { if (e.pointerType === "touch") document.body.classList.add("touch"); }, { capture: true });

  window.addEventListener("keydown", (e) => {
    input.keys[e.code] = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    if (!e.repeat && ["Space", "Enter", "KeyE"].includes(e.code) && input.onTap) input.onTap();
  });
  window.addEventListener("keyup", (e) => { input.keys[e.code] = false; });
  window.addEventListener("blur", () => { for (const k in input.keys) input.keys[k] = false; releaseAll(); });

  document.addEventListener("pointerlockchange", () => { input.pointerLocked = document.pointerLockElement === canvas; });
  document.addEventListener("mousemove", (e) => {
    if (!input.pointerLocked || !input.enabled) return;
    input.lookX += e.movementX * CONFIG.mouseSensitivity;
    input.lookY -= e.movementY * CONFIG.mouseSensitivity;
  });
  canvas.addEventListener("click", () => {
    if (input.onTap) { input.onTap(); return; }
    if (input.enabled && !input.pointerLocked && !document.body.classList.contains("touch")) lockPointer(canvas);
  });

  setupTouch();
}

export function lockPointer(canvas) {
  if (document.body.classList.contains("touch")) return;
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch (e) { /* keyboard still works */ }
}

export function unlockPointer() {
  if (document.pointerLockElement) document.exitPointerLock();
}

let releaseAll = () => {};

function setupTouch() {
  const zone = document.getElementById("touch-controls");
  const stick = document.getElementById("stick-base");
  const knob = document.getElementById("stick-knob");
  const act = document.getElementById("act-btn");

  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("touchmove", (e) => { if (document.body.classList.contains("playing")) e.preventDefault(); }, { passive: false });

  let stickId = null, cx = 0, cy = 0, lookId = null, lastX = 0, lastY = 0;

  function moveStick(e) {
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_RADIUS) { dx = dx / d * STICK_RADIUS; dy = dy / d * STICK_RADIUS; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    if (Math.min(1, d / STICK_RADIUS) < DEAD_ZONE) { input.move.x = 0; input.move.y = 0; }
    else { input.move.x = dx / STICK_RADIUS; input.move.y = -dy / STICK_RADIUS; }
  }
  function releaseStick() {
    stickId = null;
    input.move.x = 0;
    input.move.y = 0;
    knob.style.transform = "translate(0px, 0px)";
    stick.classList.remove("active");
    stick.style.left = "";
    stick.style.top = "";
  }
  releaseAll = () => { releaseStick(); lookId = null; };

  zone.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (input.onTap) { input.onTap(); return; }
    if (!input.enabled) return;
    if (stickId === null && e.clientX < window.innerWidth * STICK_ZONE) {
      stickId = e.pointerId;
      cx = e.clientX;
      cy = e.clientY;
      stick.classList.add("active");
      stick.style.left = (cx - stick.offsetWidth / 2) + "px";
      stick.style.top = (cy - stick.offsetHeight / 2) + "px";
      moveStick(e);
    } else if (lookId === null) {
      lookId = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
    } else return;
    try { zone.setPointerCapture(e.pointerId); } catch (err) { /* fine without */ }
  });
  zone.addEventListener("pointermove", (e) => {
    if (e.pointerId === stickId) moveStick(e);
    else if (e.pointerId === lookId && input.enabled) {
      input.lookX += (e.clientX - lastX) * CONFIG.touchLookSensitivity;
      input.lookY -= (e.clientY - lastY) * CONFIG.touchLookSensitivity * 0.6;
      lastX = e.clientX;
      lastY = e.clientY;
    }
  });
  const release = (e) => {
    if (e.pointerId === stickId) releaseStick();
    if (e.pointerId === lookId) lookId = null;
  };
  zone.addEventListener("pointerup", release);
  zone.addEventListener("pointercancel", release);
  zone.addEventListener("lostpointercapture", release);

  act.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (input.onTap) input.onTap();
  });
}

export function releaseTouches() { releaseAll(); }

// Combined movement for this frame: forward and strafe, each -1..1.
export function moveAxes() {
  const k = input.keys;
  let fwd = input.move.y, strafe = input.move.x;
  if (k.KeyW || k.ArrowUp) fwd += 1;
  if (k.KeyS || k.ArrowDown) fwd -= 1;
  if (k.KeyD) strafe += 1;
  if (k.KeyA) strafe -= 1;
  const len = Math.hypot(fwd, strafe);
  if (len > 1) { fwd /= len; strafe /= len; }
  let turn = 0;
  if (k.ArrowLeft) turn -= 1;
  if (k.ArrowRight) turn += 1;
  return { fwd, strafe, turn };
}
