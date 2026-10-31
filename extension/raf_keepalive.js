// Runs in the meta.ai page (MAIN world) before any of its scripts.
// meta.ai reveals and hydrates its UI inside requestAnimationFrame callbacks, and Chrome never runs those in a tab that
// is not visible on screen. meta.ai also reloads itself now and then (on the first in-app navigation after a new
// deployment), so a tab that reloads while hidden would stay a dead shell until someone looks at it — and the clip
// queue would stop. While the tab is hidden, run the callbacks from a timer instead.
(() => {
  const raf = window.requestAnimationFrame.bind(window);
  const caf = window.cancelAnimationFrame.bind(window);
  const timers = new Map(); // our (negative) id -> timeout id
  let nextId = -1;
  window.requestAnimationFrame = (callback) => {
    if (!document.hidden) return raf(callback);
    const id = nextId--;
    timers.set(id, setTimeout(() => { timers.delete(id); callback(performance.now()); }, 16));
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    if (id >= 0) return caf(id);
    clearTimeout(timers.get(id));
    timers.delete(id);
  };
})();
