// Orbit Wallpaper — clock engine.
// Every elapsed second of the current minute is a label on a ring, tied to the
// readout by a hair-thin string that sways with wind, inertia and touch.
// A form decides where the labels live; timing, physics and paint are shared.
// No third-party code, no web fonts, no network requests.

export const PALETTES = {
  phosphor: { label: "Phosphor", bg: "#050807", ink: "#eafff0", accent: "#3dff7a" },
  graphite: { label: "Graphite", bg: "#0b0b0c", ink: "#f2f2f3", accent: "#3b5bfd" },
  ember: { label: "Ember", bg: "#070707", ink: "#fef3ee", accent: "#ff5610" },
  amber: { label: "Amber", bg: "#0a0803", ink: "#fff4dc", accent: "#ffb000" },
  violet: { label: "Violet", bg: "#09070f", ink: "#efeaff", accent: "#9d7bff" },
  paper: { label: "Paper", bg: "#f6f6f5", ink: "#17171a", accent: "#3b5bfd" },
};

export const FONTS = {
  sans: {
    label: "Sans",
    stack: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    weight: 600,
  },
  mono: {
    label: "Mono",
    stack: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    weight: 500,
  },
  serif: {
    label: "Serif",
    stack: 'ui-serif, Georgia, "Times New Roman", serif',
    weight: 400,
  },
};

export const FORMS = {
  orbit: {
    label: "Orbit",
    hint: "The arc grows with the minute",
    defaults: { showTicks: false, readoutScale: 0.2, readoutOffsetY: 0 },
  },
  dial: {
    label: "Dial",
    hint: "Ticks and a feather hand",
    defaults: { showTicks: true, readoutScale: 0.34, readoutOffsetY: 0, handLength: 0.93, handWidth: 4, handStart: 0.6 },
  },
  grid: {
    label: "Grid",
    hint: "12 × 6, readout punched out",
    defaults: { showTicks: false, readoutScale: 0.2, readoutOffsetY: 0 },
  },
  chimes: {
    label: "Chimes",
    hint: "A rail of hanging seconds",
    defaults: { showTicks: false, readoutScale: 0.2, readoutOffsetY: 0.28 },
  },
  spiral: {
    label: "Spiral",
    hint: "One turn per minute",
    defaults: { showTicks: false, readoutScale: 0.18, readoutOffsetY: 0 },
  },
};

export const DEFAULTS = {
  form: "orbit",
  palette: "phosphor",
  font: "sans",
  hour12: false,
  radius: 0.34,
  offsetY: 0,
  readoutScale: 0.2,
  readoutOffsetX: 0,
  readoutOffsetY: 0,
  wind: 18,
  stiffness: 140,
  damping: 14,
  mouseForce: 1,
  lineWidth: 0.7,
  stringAlpha: 0.16,
  numberLabels: true,
  showTicks: false,
  dialLabels: true,
  handLength: 0.93,
  handWidth: 4,
  handStart: 0.6,
  fps: 30,
  retro: false,
  collapse: true,
  alpha: 1,
  gridCols: 12,
  gridRows: 6,
  tick: "smooth",
};

const D2R = Math.PI / 180;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t) => {
  const s = 2.2;
  const c = t - 1;
  return 1 + (s + 1) * c * c * c + s * c * c;
};
const mix = (a, b, t) => a + (b - a) * t;
const hex2rgb = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const LABEL_STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/**
 * Mount a clock into `canvas` with its DOM readout in `readout`.
 * Returns a small controller: set(patch), start(), stop(), config.
 */
export function createClock({ canvas, readout, sub, root, config = {} }) {
  const cfg = { ...DEFAULTS, ...config };
  const ctx = canvas.getContext("2d", { alpha: false });
  const host = root || document.documentElement;

  let pal = PALETTES[cfg.palette] || PALETTES.phosphor;
  let RGB = { ink: hex2rgb(pal.ink), accent: hex2rgb(pal.accent) };
  let A = clamp01(cfg.alpha == null ? 1 : cfg.alpha);

  let W = 0;
  let H = 0;
  let CX = 0;
  let CY = 0;
  let R = 0;
  let DPR = 1;

  let low = document.createElement("canvas");
  let lowCtx = low.getContext("2d", { alpha: false });
  const K = 0.55;

  const springs = new Map();
  const pointer = { x: 0, y: 0, active: false };
  const hand = { t: 0, vel: 0 };
  let gridCells = [];
  let lastItems = [];
  let falling = null;
  let fallingAt = 0;
  let lastMinute = -1;
  let slots = [];
  let shownTime = "";
  let shownSub = null;

  let raf = 0;
  let timer = 0;
  let last = 0;
  let lastDraw = 0;
  let running = false;
  let reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${clamp01(a * A)})`;
  const mixRGB = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  /* ---------- paint setup ---------- */

  function applyLook() {
    pal = PALETTES[cfg.palette] || PALETTES.phosphor;
    RGB = { ink: hex2rgb(pal.ink), accent: hex2rgb(pal.accent) };
    A = clamp01(cfg.alpha == null ? 1 : cfg.alpha);
    const font = FONTS[cfg.font] || FONTS.sans;
    host.style.setProperty("--bg", pal.bg);
    host.style.setProperty("--ink", pal.ink);
    host.style.setProperty("--accent", pal.accent);
    host.style.setProperty("--readout-font", font.stack);
    host.style.setProperty("--readout-weight", String(font.weight));
    host.style.setProperty("--readout-tracking", cfg.font === "mono" ? "-0.01em" : "-0.03em");
    host.classList.toggle("is-retro", !!cfg.retro);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", pal.bg);
  }

  function resize() {
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    // Cap the backing store: a wallpaper is redrawn once a second, not every frame,
    // so 900k pixels is plenty and costs a fraction of a full-res canvas.
    DPR = Math.min(2, window.devicePixelRatio || 1);
    const pixels = W * H * DPR * DPR;
    if (pixels > 900000) DPR *= Math.sqrt(900000 / pixels);
    DPR = Math.max(1, DPR);
    canvas.width = Math.max(2, Math.round(W * DPR));
    canvas.height = Math.max(2, Math.round(H * DPR));
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    CX = W / 2;
    CY = H / 2 + (cfg.offsetY || 0) * H;
    R = Math.min(W, H) * (cfg.radius || 0.34);

    if (cfg.retro) {
      low.width = Math.max(2, Math.round(W * K));
      low.height = Math.max(2, Math.round(H * K));
    }
    gridCells = buildGrid();
    layoutReadout();
  }

  function layoutReadout() {
    if (!readout) return;
    const size = Math.max(14, Math.round(R * (cfg.readoutScale || 0.2)));
    readout.style.setProperty("--readout", size + "px");
    readout.style.left = CX + (cfg.readoutOffsetX || 0) * R + "px";
    readout.style.top = CY + (cfg.readoutOffsetY || 0) * R + "px";
    if (sub) {
      sub.style.left = readout.style.left;
      sub.style.top = CY + (cfg.readoutOffsetY || 0) * R + size * 0.72 + "px";
    }
  }

  /* ---------- readout ---------- */

  function timeText(d) {
    const h = d.getHours();
    const m = d.getMinutes();
    if (cfg.hour12) return (h % 12 === 0 ? 12 : h % 12) + ":" + String(m).padStart(2, "0");
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }

  function buildReadout(text) {
    if (!readout) return;
    readout.textContent = "";
    slots = [...text].map((ch) => {
      const slot = document.createElement("span");
      slot.className = "slot" + (ch === ":" ? " colon" : "");
      const glyph = document.createElement("span");
      glyph.className = "glyph";
      glyph.textContent = ch;
      slot.appendChild(glyph);
      readout.appendChild(slot);
      return { slot, glyph, ch };
    });
  }

  function updateReadout(text) {
    if (!readout) return;
    if (slots.length !== text.length) return buildReadout(text);
    let changed = 0;
    [...text].forEach((ch, i) => {
      const s = slots[i];
      if (s.ch === ch) return;
      const delay = changed++ * 50;
      const out = s.glyph;
      out.style.transitionDelay = delay + "ms";
      out.classList.add("out");
      const inc = document.createElement("span");
      inc.className = "glyph in";
      inc.textContent = ch;
      inc.style.transitionDelay = delay + "ms";
      s.slot.appendChild(inc);
      requestAnimationFrame(() => inc.classList.remove("in"));
      setTimeout(() => out.remove(), 720 + delay);
      s.glyph = inc;
      s.ch = ch;
    });
  }

  /* ---------- time base ---------- */

  // An eased step per second rather than a linear sweep.
  function tickSpin(t) {
    const phase = 0.62;
    const s = t + phase;
    const w = Math.floor(s);
    const f = s - w;
    return w + 0.92 * easeInOutCubic(Math.pow(f, 1.25)) + 0.08 * f;
  }

  function springFor(abs) {
    let st = springs.get(abs);
    if (!st) {
      st = { bend: 0, vel: 0, seen: false, px: 0, py: 0, phase: Math.random() * Math.PI * 2, period: 5 + Math.random() * 6 };
      springs.set(abs, st);
    }
    return st;
  }

  /* ---------- forms ---------- */

  function buildGrid() {
    const cols = cfg.gridCols || 12;
    const rows = cfg.gridRows || 6;
    const cell = (R * 2) / cols;
    const out = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = CX + (c - (cols - 1) / 2) * cell;
        const y = CY + (r - (rows - 1) / 2) * cell;
        if (Math.abs(x - CX) < R * 0.44 && Math.abs(y - CY) < R * 0.2) continue;
        out.push({ x, y });
      }
    }
    return out;
  }

  function placement(s, age) {
    const form = cfg.form || "orbit";
    if (form === "dial") {
      const deg = -90 + 6 * s;
      return { home: { x: CX + Math.cos(deg * D2R) * R, y: CY + Math.sin(deg * D2R) * R }, anchor: { x: CX, y: CY } };
    }
    if (form === "grid") {
      const cell = gridCells[s] || gridCells[gridCells.length - 1] || { x: CX, y: CY };
      return { home: cell, anchor: { x: CX, y: CY } };
    }
    if (form === "chimes") {
      const span = Math.min(R * 1.75, W - R * 0.8);
      const x = CX - span / 2 + (span * s) / 59;
      const railY = CY - R * 0.5;
      const hang = R * (0.16 + 0.11 * [0, 2, 1, 3][s % 4]);
      return { home: { x, y: railY + hang }, anchor: { x, y: railY } };
    }
    if (form === "spiral") {
      const deg = 180 - 9 * age;
      const r = R * (0.45 + 0.55 * (age / 59));
      return { home: { x: CX + Math.cos(deg * D2R) * r, y: CY + Math.sin(deg * D2R) * r }, anchor: { x: CX, y: CY } };
    }
    const deg = 180 - 6 * age;
    return { home: { x: CX + Math.cos(deg * D2R) * R, y: CY + Math.sin(deg * D2R) * R }, anchor: { x: CX, y: CY } };
  }

  /* ---------- drawing ---------- */

  function begin() {
    const g = cfg.retro ? lowCtx : ctx;
    if (cfg.retro) g.setTransform(K, 0, 0, K, 0, 0);
    else g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.fillStyle = pal.bg;
    g.fillRect(0, 0, W, H);
    return g;
  }

  function end() {
    if (!cfg.retro) return;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(low, 0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
  }

  function drawDial(g, secondFloat, secOfMinute) {
    const labelSize = Math.max(8, Math.round(R * 0.068));
    const short = Math.max(5, R * 0.05);
    const long = Math.max(9, R * 0.085);
    const labelR = R + labelSize * 1.5;

    for (let s = 0; s < 60; s++) {
      const a = (-90 + 6 * s) * D2R;
      const past = s <= secOfMinute;
      const major = s % 5 === 0;
      const r1 = R - (major ? long : short);
      const r2 = R - 1;
      g.strokeStyle = past ? rgba(RGB.ink, major ? 0.8 : 0.42) : rgba(RGB.ink, 0.14);
      g.lineWidth = major ? 1.6 : 1;
      g.beginPath();
      g.moveTo(CX + Math.cos(a) * r1, CY + Math.sin(a) * r1);
      g.lineTo(CX + Math.cos(a) * r2, CY + Math.sin(a) * r2);
      g.stroke();
      if (major && cfg.dialLabels !== false) {
        g.fillStyle = rgba(RGB.ink, past ? 0.45 : 0.16);
        g.font = labelSize + "px " + LABEL_STACK;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(String(s).padStart(2, "0"), CX + Math.cos(a) * labelR, CY + Math.sin(a) * labelR);
      }
    }

    // Feather hand: a tapered leaf that lags the second on a spring. It fades
    // out at its inner end so it never reads as a line struck through the time.
    const angle = -90 + 6 * (((secondFloat % 60) + 60) % 60);
    const L = R * (cfg.handLength || 0.9);
    const w = Math.max(1, (cfg.handWidth || 3.4) * (R / 240));
    const inner = R * (cfg.handStart == null ? 0.6 : cfg.handStart);
    const bulge = inner + (L - inner) * 0.45;
    g.save();
    g.translate(CX, CY);
    g.rotate(angle * D2R);
    const grad = g.createLinearGradient(0, -inner, 0, -L);
    grad.addColorStop(0, rgba(RGB.accent, 0));
    grad.addColorStop(0.35, rgba(RGB.accent, 0.55));
    grad.addColorStop(1, rgba(RGB.accent, 0.95));
    g.beginPath();
    g.moveTo(0, -inner);
    g.bezierCurveTo(w * 1.7, -inner * 0.9, w * 2.3, -bulge, 0, -L);
    g.bezierCurveTo(-w * 2.3, -bulge, -w * 1.7, -inner * 0.9, 0, -inner);
    g.fillStyle = grad;
    g.fill();
    g.restore();
  }

  function drawItems(g, items, now, dt) {
    const lineW = cfg.lineWidth || 0.7;
    for (const it of items) {
      const st = springFor(it.abs);
      const st2 = cfg.stiffness || 140;
      const damp = cfg.damping || 14;
      const windAmp = cfg.wind == null ? 18 : cfg.wind;

      if (st.seen) st.bend -= ((it.home.x - st.px) * it.nx + (it.home.y - st.py) * it.ny) * 0.5 * 1.2;
      else st.vel += 220 * (Math.random() < 0.5 ? -1 : 1);
      st.seen = true;
      st.px = it.home.x;
      st.py = it.home.y;

      const wind = Math.sin((now / st.period) * Math.PI * 2 + st.phase) * windAmp;

      if (pointer.active && cfg.mouseForce) {
        const dx = it.home.x - it.anchor.x;
        const dy = it.home.y - it.anchor.y;
        const len2 = dx * dx + dy * dy || 1;
        const along = clamp01(((pointer.x - it.anchor.x) * dx + (pointer.y - it.anchor.y) * dy) / len2);
        const cx0 = it.anchor.x + dx * along;
        const cy0 = it.anchor.y + dy * along;
        const dist = Math.hypot(pointer.x - cx0, pointer.y - cy0);
        if (dist < 250) {
          const falloff = Math.pow(1 - dist / 250, 1.7) * Math.sin(Math.PI * along);
          const side = Math.sign((pointer.x - cx0) * it.nx + (pointer.y - cy0) * it.ny) || 1;
          st.vel -= side * falloff * cfg.mouseForce * 0.004 * dt;
        }
      }

      st.vel += (-st2 * (st.bend - wind) - damp * st.vel) * dt;
      st.bend = Math.max(-60, Math.min(60, st.bend + st.vel * dt));

      if (cfg.strings !== false) {
        const off = st.bend * 1.6;
        const mx = (it.anchor.x + it.home.x) / 2 + it.nx * off;
        const my = (it.anchor.y + it.home.y) / 2 + it.ny * off;
        g.strokeStyle = rgba(RGB.ink, (cfg.stringAlpha == null ? 0.16 : cfg.stringAlpha) * it.alpha);
        g.lineWidth = lineW;
        g.beginPath();
        g.moveTo(it.anchor.x, it.anchor.y);
        g.quadraticCurveTo(mx, my, it.home.x, it.home.y);
        g.stroke();
      }

      const cool = smoothstep(0.05, 0.7, it.age);
      const col = mixRGB(RGB.accent, RGB.ink, cool);
      const alpha = it.alpha * mix(1, 0.5, cool);
      const pop = it.age < 0.45 ? Math.max(0.05, easeOutBack(clamp01(it.age / 0.45))) : 1;
      g.save();
      g.translate(it.home.x, it.home.y);
      g.scale(pop, pop);
      g.fillStyle = rgba(col, alpha);
      if (it.label) {
        g.font = it.size + "px " + LABEL_STACK;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(it.label, 0, 0);
      } else {
        g.beginPath();
        g.arc(0, 0, Math.max(1.8, it.size * 0.22), 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }
  }

  /* ---------- frame ---------- */

  function update(now, dt) {
    const spin = cfg.tick === "step" || reduce ? Math.floor(now) : tickSpin(now);
    const whole = Math.floor(now);
    const minuteStart = Math.floor(now / 60) * 60;
    const unitValue = spin - minuteStart;
    const text = timeText(new Date(whole * 1000));

    if (minuteStart !== lastMinute) {
      if (lastMinute !== -1 && cfg.collapse !== false && !reduce) {
        falling = lastItems.map((it, i) => ({ ...it, delay: (((i * 17) % 60) / 60) * 0.45 }));
        fallingAt = now;
      }
      springs.clear();
      lastMinute = minuteStart;
    }

    if (text !== shownTime) {
      updateReadout(text);
      shownTime = text;
    }
    if (sub && cfg.sub !== shownSub) {
      sub.textContent = cfg.sub || "";
      shownSub = cfg.sub;
    }

    const count = Math.max(0, Math.min(60, Math.floor(unitValue) + 1));
    const items = [];
    const size = Math.max(9, Math.min(12, R * 0.062));
    for (let s = 0; s < count; s++) {
      const age = unitValue - (s + 1);
      const { home, anchor } = placement(s, age);
      const dx = home.x - anchor.x;
      const dy = home.y - anchor.y;
      const d = Math.hypot(dx, dy) || 1;
      items.push({
        s,
        abs: s,
        age,
        home,
        anchor,
        nx: -dy / d,
        ny: dx / d,
        label: cfg.numberLabels === false ? "" : String(s).padStart(2, "0"),
        size,
        alpha: 1,
      });
    }
    lastItems = items;

    if (cfg.form === "dial") {
      const fps = cfg.fps || 60;
      if (fps < 30) hand.t = unitValue;
      else {
        hand.vel += (-160 * (hand.t - unitValue) - 16 * hand.vel) * dt;
        hand.t += hand.vel * dt;
      }
    }

    return {
      now,
      dt,
      secOfMinute: Math.floor(unitValue),
      secondFloat: cfg.form === "dial" ? hand.t || unitValue : unitValue,
    };
  }

  function draw(state) {
    const g = begin();
    const { now, dt, secOfMinute, secondFloat } = state;

    if (cfg.form === "dial" || cfg.showTicks) {
      drawDial(g, secondFloat, secOfMinute);
    } else {
      if (cfg.form === "chimes") {
        const span = Math.min(R * 1.75, W - R * 0.8);
        const railY = CY - R * 0.5;
        g.strokeStyle = rgba(RGB.ink, 0.2);
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(CX - span / 2, railY);
        g.lineTo(CX + span / 2, railY);
        g.stroke();
      }
      drawItems(g, lastItems, now, dt);
    }

    if (falling) {
      const p = now - fallingAt;
      if (p > 0.9) falling = null;
      else {
        for (const it of falling) {
          const q = clamp01((p - it.delay) / 0.42);
          if (q <= 0) continue;
          const k = Math.max(0, 1 - 0.088 * q - 1.262 * q * q);
          g.fillStyle = rgba(RGB.ink, 0.5 * (1 - q));
          g.font = it.size + "px " + LABEL_STACK;
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillText(it.label, CX + (it.home.x - CX) * k, CY + (it.home.y - CY) * k);
        }
      }
    }

    end();
  }

  function frame(ts, force) {
    if (document.hidden && !force) return;
    const now = Date.now() / 1000;
    const dt = Math.min(0.033, last ? now - last : 0.016);
    last = now;
    const fps = cfg.fps || 0;
    if (fps && fps < 60 && ts - lastDraw < 1000 / fps) return;
    lastDraw = ts;
    draw(update(now, dt));
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    frame(ts);
  }

  function step(force) {
    last = 0;
    frame(performance.now(), force);
  }

  /* ---------- lifecycle ---------- */

  function start() {
    stop();
    if (reduce) {
      step();
      timer = setInterval(() => step(), 1000);
      running = true;
      return;
    }
    const fps = cfg.fps || 0;
    if (fps && fps <= 5) {
      // Wallpaper use: a plain interval beats rAF, which browsers throttle or stop.
      step();
      timer = setInterval(() => step(), 1000 / fps);
    } else {
      lastDraw = 0;
      step();
      raf = requestAnimationFrame(loop);
    }
    running = true;
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    if (timer) clearInterval(timer);
    raf = 0;
    timer = 0;
    running = false;
  }

  function onVisibility() {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    } else if (running && !raf && !timer) {
      start();
    }
  }

  function set(patch) {
    const wasRunning = running;
    Object.assign(cfg, patch || {});
    applyLook();
    resize();
    if (wasRunning) start();
    else step();
  }

  window.addEventListener("resize", () => {
    resize();
    step();
  });
  window.addEventListener("pointermove", (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
  }, { passive: true });
  window.addEventListener("pointerleave", () => {
    pointer.active = false;
  });
  document.addEventListener("visibilitychange", onVisibility);

  applyLook();
  resize();
  buildReadout(timeText(new Date()));
  shownTime = "";

  return {
    config: cfg,
    set,
    start,
    stop,
    // Draw one frame even when the host page is hidden. The Android wallpaper
    // drives this from native code, where page visibility never becomes true.
    redraw: () => step(true),
    get running() {
      return running;
    },
  };
}
