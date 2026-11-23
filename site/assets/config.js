// Config plumbing: one object shape, four ways in (defaults, presets, URL, hash),
// one way out (a compact base64url string you can paste anywhere).

import { DEFAULTS } from "./clock.js";

export const PRESETS = [
  {
    id: "signature",
    label: "Signature",
    note: "The full minute on a ring",
    config: { form: "orbit", palette: "phosphor", wind: 18, fps: 5, radius: 0.34, offsetY: -0.06, alpha: 0.9 },
  },
  {
    id: "quiet",
    label: "Quiet",
    note: "Small dial, upper third, once a second",
    config: {
      form: "dial",
      palette: "phosphor",
      radius: 0.26,
      offsetY: -0.14,
      readoutScale: 0.34,
      handLength: 0.86,
      handWidth: 3,
      handStart: 0.46,
      fps: 1,
      alpha: 0.78,
    },
  },
  {
    id: "paper",
    label: "Paper",
    note: "Light wallpaper, printed marks",
    config: {
      form: "dial",
      palette: "paper",
      radius: 0.26,
      offsetY: -0.14,
      readoutScale: 0.34,
      handLength: 0.86,
      handWidth: 3,
      handStart: 0.46,
      fps: 1,
      alpha: 0.92,
    },
  },
  {
    id: "vfd",
    label: "VFD",
    note: "1980s vacuum fluorescent",
    config: { form: "orbit", palette: "amber", retro: true, fps: 5, radius: 0.32, alpha: 0.9 },
  },
];

export function normalize(raw) {
  const out = {};
  for (const [key, value] of Object.entries(raw || {})) {
    if (!(key in DEFAULTS) || value == null) continue;
    const def = DEFAULTS[key];
    if (typeof def === "boolean") {
      out[key] = value === true || value === "1" || value === "true" || value === "on";
    } else if (typeof def === "number") {
      const n = Number(value);
      if (Number.isFinite(n)) out[key] = n;
    } else {
      out[key] = String(value);
    }
  }
  return out;
}

export function compact(config) {
  const out = {};
  for (const [key, value] of Object.entries(normalize(config))) {
    if (value !== DEFAULTS[key]) out[key] = value;
  }
  return out;
}

const b64url = (s) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s) => {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  return atob(padded);
};

export function encodeConfig(config) {
  return b64url(unescape(encodeURIComponent(JSON.stringify(compact(config)))));
}

export function decodeConfig(text) {
  try {
    return normalize(JSON.parse(unescape(decodeURIComponent(escape(unb64url(text))))));
  } catch {
    return {};
  }
}

/** Query string wins over the hash; both are optional. */
export function configFromLocation(loc = window.location) {
  const out = {};
  const hash = (loc.hash || "").replace(/^#/, "");
  if (hash) {
    const h = new URLSearchParams(hash);
    const packed = h.get("c");
    if (packed) Object.assign(out, decodeConfig(packed));
    for (const [key, value] of h) if (key !== "c") out[key] = value;
  }
  for (const [key, value] of new URLSearchParams(loc.search || "")) out[key] = value;
  return normalize(out);
}

export function wallpaperUrl(base, config) {
  const url = new URL(base, window.location.href);
  url.hash = "c=" + encodeConfig(config);
  return url.toString();
}
