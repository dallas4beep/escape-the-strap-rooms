// Keeps casual players out of the page source: no right-click or long-press menu,
// no text selection or dragging, and the usual developer-tool shortcuts do nothing.
export function protect() {
  const stop = (e) => { e.preventDefault(); return false; };
  document.addEventListener("contextmenu", stop);
  document.addEventListener("selectstart", stop);
  document.addEventListener("dragstart", stop);
  document.addEventListener("copy", stop);
  document.addEventListener("keydown", (e) => {
    const k = (e.key || "").toUpperCase();
    const mod = e.ctrlKey || e.metaKey;
    if (
      k === "F12" ||
      (mod && e.shiftKey && ["I", "J", "C", "K"].includes(k)) ||
      (mod && e.altKey && ["I", "J", "C", "U"].includes(k)) ||
      (mod && ["U", "S", "P"].includes(k))
    ) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
}
