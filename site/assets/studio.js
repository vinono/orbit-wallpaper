// Studio: one config object, a live phone preview, and four ways to take it away.

import { createClock, DEFAULTS, FONTS, FORMS, PALETTES } from "./clock.js";
import { PRESETS, compact, configFromLocation, encodeConfig } from "./config.js";

const BASE = { ...DEFAULTS, ...PRESETS[0].config };
let state = { ...BASE, ...configFromLocation() };

const screen = document.getElementById("preview");
const canvas = document.getElementById("canvas");
const readout = document.getElementById("readout");
const sub = document.getElementById("sub");

const clock = createClock({ canvas, readout, sub, root: screen, config: state });
document.fonts.ready.then(() => clock.start());

/* ---------- chips ---------- */

const formChips = document.getElementById("form-chips");
const paletteChips = document.getElementById("palette-chips");
const fontChips = document.getElementById("font-chips");

formChips.innerHTML = Object.entries(FORMS)
  .map(([key, form]) => `<button type="button" class="chip" data-form="${key}">${form.label}</button>`)
  .join("");

paletteChips.innerHTML = Object.entries(PALETTES)
  .map(([key, pal]) => `<button type="button" class="chip" data-palette="${key}"><i style="--c:${pal.accent}"></i>${pal.label}</button>`)
  .join("");

fontChips.innerHTML = Object.entries(FONTS)
  .map(([key, font]) => `<button type="button" class="chip" data-font="${key}">${font.label}</button>`)
  .join("");

/* ---------- formatting ---------- */

const pct = (v) => Math.round(v * 100) + "%";
const FORMAT = {
  radius: pct,
  readoutScale: pct,
  alpha: pct,
  wind: (v) => String(Math.round(v)),
  offsetY: (v) => (Math.abs(v) < 0.005 ? "centred" : `${Math.abs(Math.round(v * 100))}% ${v < 0 ? "up" : "down"}`),
};

/* ---------- paint ---------- */

const setPressed = (selector, attr, value) => {
  for (const el of document.querySelectorAll(selector)) {
    const on = el.dataset[attr] === String(value);
    el.setAttribute("aria-pressed", on ? "true" : "false");
  }
};

function paint() {
  setPressed("[data-form]", "form", state.form);
  setPressed("[data-palette]", "palette", state.palette);
  setPressed("[data-font]", "font", state.font);
  setPressed("[data-fps]", "fps", state.fps);
  setPressed("[data-preset]", "preset", state.preset);

  for (const input of document.querySelectorAll("input[data-key]")) {
    input.value = state[input.dataset.key];
  }
  for (const out of document.querySelectorAll("output[data-out]")) {
    const key = out.dataset.out;
    out.textContent = (FORMAT[key] || String)(state[key]);
  }
  for (const toggle of document.querySelectorAll("[data-toggle]")) {
    const key = toggle.dataset.toggle;
    if (key === "icons") continue;
    toggle.setAttribute("aria-checked", state[key] ? "true" : "false");
  }

  document.getElementById("form-hint").textContent = FORMS[state.form]?.hint || "";
  document.getElementById("battery-note").textContent =
    state.fps <= 1
      ? "1/s redraws once a second: the kindest setting on battery."
      : state.fps <= 5
        ? "5/s keeps the strings swaying and still sips battery."
        : "30/s is smooth, and the first thing to cost you battery.";

  const url = "./wallpaper.html#c=" + encodeConfig(state);
  document.getElementById("open-preview").href = url;
  history.replaceState(null, "", "#c=" + encodeConfig(state));
}

/* ---------- mutate ---------- */

let frame = 0;
function apply(next) {
  Object.assign(state, next);
  clock.set(state);
  paint();
}

function setKey(key, value) {
  apply({ [key]: value });
}

/* ---------- wiring ---------- */

formChips.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-form]");
  if (!btn) return;
  const form = btn.dataset.form;
  apply({ form, ...(FORMS[form]?.defaults || {}) });
});

paletteChips.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-palette]");
  if (btn) setKey("palette", btn.dataset.palette);
});

fontChips.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-font]");
  if (btn) setKey("font", btn.dataset.font);
});

document.querySelector("[data-fps]")?.closest(".seg")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-fps]");
  if (btn) setKey("fps", Number(btn.dataset.fps));
});

for (const input of document.querySelectorAll("input[data-key]")) {
  input.addEventListener("input", () => {
    const key = input.dataset.key;
    const value = Number(input.value);
    state[key] = value;
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = 0;
      clock.set(state);
      paint();
    });
  });
}

for (const toggle of document.querySelectorAll("[data-toggle]")) {
  toggle.addEventListener("click", () => {
    const key = toggle.dataset.toggle;
    if (key === "icons") {
      const on = toggle.getAttribute("aria-checked") !== "true";
      toggle.setAttribute("aria-checked", on ? "true" : "false");
      document.getElementById("phone-ui").hidden = !on;
      return;
    }
    setKey(key, toggle.getAttribute("aria-checked") !== "true");
  });
}

for (const btn of document.querySelectorAll("[data-preset]")) {
  btn.addEventListener("click", () => {
    const preset = PRESETS.find((p) => p.id === btn.dataset.preset);
    if (!preset) return;
    state = { ...DEFAULTS, ...preset.config, preset: preset.id };
    clock.set(state);
    paint();
  });
}

/* ---------- actions ---------- */

const toastEl = document.getElementById("toast");
let toastTimer = 0;
function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2400);
}

function wallpaperLink() {
  const url = new URL("./wallpaper.html", location.href);
  url.hash = "c=" + encodeConfig(state);
  return url.toString();
}

async function copy(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    toast(message);
  }
}

document.querySelector("[data-action='link']").addEventListener("click", () => {
  copy(wallpaperLink(), "Wallpaper link copied");
});

document.querySelector("[data-action='json']").addEventListener("click", () => {
  copy(JSON.stringify(compact(state), null, 2), "JSON copied");
});

document.querySelector("[data-action='reset']").addEventListener("click", () => {
  state = { ...DEFAULTS, ...PRESETS[0].config, preset: PRESETS[0].id };
  clock.set(state);
  paint();
  toast("Back to Signature");
});

document.querySelector("[data-action='app']").addEventListener("click", () => {
  const deep = "orbitwall://set?u=" + encodeURIComponent(wallpaperLink());
  location.href = deep;
  toast("Opening the Android app…");
});

document.querySelector("[data-action='download']").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const res = await fetch("./wallpaper.html");
    if (!res.ok) throw new Error(res.status);
    const html = (await res.text()).replace(
      /(<script id="orbit-config" type="application\/json">)[\s\S]*?(<\/script>)/,
      `$1${JSON.stringify(compact(state))}$2`,
    );
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "orbit-wallpaper.html";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast("orbit-wallpaper.html — one file, no network");
  } catch {
    toast("Could not build the file, try again");
  } finally {
    btn.disabled = false;
  }
});

/* ---------- boot ---------- */

if (!location.hash) state.preset = PRESETS[0].id;
paint();
