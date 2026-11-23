// Boots the wallpaper page: built-in defaults < hash/query config.

import { createClock, DEFAULTS } from "./clock.js";
import { configFromLocation, isAppContext } from "./config.js";

const builtin = (() => {
  try {
    return JSON.parse(document.getElementById("orbit-config").textContent || "{}");
  } catch {
    return {};
  }
})();

const config = { ...DEFAULTS, ...builtin, ...configFromLocation() };
const stage = document.getElementById("stage");

const clock = createClock({
  canvas: document.getElementById("canvas"),
  readout: document.getElementById("readout"),
  sub: document.getElementById("sub"),
  root: stage,
  config,
});

// The Android wallpaper app drives frames from native code: a page inside an
// offscreen window never reports itself visible, so rAF and timers can stall.
const inApp = isAppContext();

if (inApp) {
  clock.redraw();
} else {
  document.fonts.ready.then(() => clock.start());
}

window.orbitWallpaper = {
  tick: () => clock.redraw(),
  start: () => clock.start(),
  stop: () => clock.stop(),
};

// A wallpaper should never scroll, zoom or select.
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("dblclick", (e) => e.preventDefault(), { passive: false });
document.addEventListener("contextmenu", (e) => e.preventDefault());
