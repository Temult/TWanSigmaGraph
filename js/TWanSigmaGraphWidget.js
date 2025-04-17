// TWanSigmaGraphWidget.js – v2.24
// -------------------------------
// Companion widget for the TWanSigmaGraph node.  Draws a bi‑
// directional sigma schedule, preview text, density controls,
// save/load slots, undo, and an ℹ️ info popup.

import { app } from "/../scripts/app.js";
import { $el } from "/../scripts/ui.js";

/*—— Constants ——*/
const NODE_CLASS      = "TWanSigmaGraph";
const GRAPH_DATA_NAME = "graph_data";
const STEPS_NAME      = "steps";
const CANVAS_TYPE     = "SIGMA_GRAPH_CANVAS";
const MIN_POINTS      = 3;
const NUM_SLOTS       = 8;
const LS_KEY          = "sigma_graph_saveSlots";
const UNDO_LIMIT      = 1;
const MIN_NODE_WIDTH  = 180;
const GRAB_THRESHOLD  = 0.08;
const POINT_RADIUS    = 6;
const POINT_COLOR     = "#1E88E5";

/*—— Helper Functions ——*/

/** Linear‑interpolate pts→sigma array of length=steps */
function calcSigmas(pts, steps) {
  steps = Math.max(1, steps | 0);
  const p = (pts || []).slice().sort((a, b) => a.x - b.x);
  if (p.length < 2) return Array(steps).fill(1.0);

  if (!p.some((pt) => Math.abs(pt.x) < 1e-6))
    p.unshift({ x: 0, y: p[0].y });
  if (!p.some((pt) => Math.abs(pt.x - 1) < 1e-6))
    p.push({ x: 1, y: p[p.length - 1].y });

  const out = [];
  let idx = 0;
  for (let i = 0; i < steps; i++) {
    const t = steps === 1 ? 0 : i / (steps - 1);
    while (idx < p.length - 2 && p[idx + 1].x < t) idx++;
    const [p1, p2] = [p[idx], p[idx + 1]];
    const dx = p2.x - p1.x;
    let y = dx < 1e-6
      ? (Math.abs(t - p2.x) < Math.abs(t - p1.x) ? p2.y : p1.y)
      : p1.y + ((t - p1.x) / dx) * (p2.y - p1.y);
    out.push(Math.max(0.001, Math.round(y * 100) / 100));
  }
  return out;
}

/** Parse either JSON‑[{x,y}] or comma‑list "y,y,y" */
function strToPts(str) {
  try {
    const arr = JSON.parse(str);
    if (
      Array.isArray(arr) &&
      arr.every((o) => typeof o.x === "number" && typeof o.y === "number")
    ) return arr;
  } catch { /* ignore */ }

  const nums = str
    .split(/[^0-9.+-]+/)
    .map(parseFloat)
    .filter((n) => !isNaN(n));
  if (nums.length < 2) {
    const y = nums[0] || 1;
    return [{ x: 0, y }, { x: 1, y: nums[0] != null ? y : 0 }];
  }
  return nums.map((y, i) => ({ x: i / (nums.length - 1), y: Math.round(y * 100) / 100 }));
}

/** Convert [{x,y}] → "y, y, y" */
function ptsToStr(pts, prec = 2) {
  return pts.map((p) => p.y.toFixed(prec)).join(", ");
}

/*—— Main Widget Setup ——*/

function setup(node) {
  // prevent double init
  if (node._sigmaSetupDone) return;
  node._sigmaSetupDone = true;

  // 1) locate the hidden textarea
  const gw = node.widgets.find((w) => w.name === GRAPH_DATA_NAME);
  if (!gw || !gw.element) return;
  const ta = gw.element;

  // 2) style it
  ta.style.minHeight = "10px";
  ta.style.boxSizing = "border-box";
  ta.style.resize = "vertical";

  // 3) per‑node storage key
  const storageKey = `TWanSigmaGraph_last_${node.id}`;

  // 4) try load from cache
  let initialPts = null;
  const cached = localStorage.getItem(storageKey);
  if (cached) {
    try {
      initialPts = strToPts(cached);
      ta.value = ptsToStr(initialPts);
      gw.value = JSON.stringify(initialPts);
    } catch {
      initialPts = null;
    }
  }

  // 5) if no cache → four‐point default
  if (!initialPts) {
    const defaultText = "1.00, 0.67, 0.33, 0.00";
    ta.value = defaultText;
    initialPts = strToPts(defaultText);
    gw.value = JSON.stringify(initialPts);
  }

  // 6) Build UI: container, canvas, preview
  const wrap = $el("div", {
    style: {
      width: "100%", position: "relative", display: "flex",
      flexDirection: "column", flexGrow: "1", minHeight: "180px",
      paddingBottom: "20px", minWidth: `${MIN_NODE_WIDTH}px`
    }
  });
  const canvas = $el("canvas", {
    style: {
      width: "100%", flexGrow: "1", minHeight: "125px",
      background: "#282828", border: "1px solid #555",
      borderRadius: "4px", cursor: "crosshair"
    }
  });
  wrap.appendChild(canvas);

  const preview = $el("textarea", {
    placeholder: "Sigmas preview…",
    readOnly: true,
    style: {
      width: "100%", height: '55px', fontFamily: "monospace",
      background: "#181818", color: "#ccc",
      border: "1px solid #555", borderRadius: "4px",
      boxSizing: "border-box", padding: "4px", resize: "none",
      marginTop: "4px"
    }
  });
  wrap.appendChild(preview);

  node.addDOMWidget(CANVAS_TYPE, "custom", wrap, {
    getHeight: () => Math.max(180, wrap.scrollHeight)
  });

  // enforce min width on resize
  if (node.size[0] < MIN_NODE_WIDTH) {
    node.setSize([MIN_NODE_WIDTH, node.size[1]]);
  }
  const prevOnResize = node.onResize;
  node.onResize = function() {
    prevOnResize?.apply(this, arguments);
    if (this.size[0] < MIN_NODE_WIDTH) {
      this.setSize([MIN_NODE_WIDTH, this.size[1]]);
    }
  };

  /*—— Density Controls (+ / –) ——*/
  const addBtn = $el("button", {
    textContent: "+", title: "Double density",
    style: {
      position: "absolute", top: "4px", right: "40px",
      width: "24px", height: "24px",
      borderRadius: "3px", border: "1px solid #555",
      background: "#64B5F6", color: "#fff", cursor: "pointer"
    }
  });
  const delBtn = $el("button", {
    textContent: "−", title: "Halve density",
    style: {
      position: "absolute", top: "4px", right: "10px",
      width: "24px", height: "24px",
      borderRadius: "3px", border: "1px solid #555",
      background: "#EF9A9A", color: "#fff", cursor: "pointer"
    }
  });
  wrap.appendChild(addBtn);
  wrap.appendChild(delBtn);

  /*—— Slots & Presets ——*/
  const slotBar = $el("div", {
    style: { display: "flex", gap: "4px", marginTop: "4px", alignItems: "center" }
  });
  wrap.appendChild(slotBar);

  const slotsData = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  let recordMode = false;
  const recBtn = $el("button", {
    textContent: "💾", title: "Toggle save mode",
    style: { minWidth: "28px", cursor: "pointer" }
  });
  slotBar.appendChild(recBtn);

  const slotBtns = [];
  for (let i = 0; i < NUM_SLOTS; i++) {
    const b = $el("button", {
      textContent: `${i + 1}`,
      disabled: !slotsData[i] && !recordMode,
      style: {
        flex: "1", minWidth: "20px",
        opacity: slotsData[i]||recordMode ? "1" : "0.3",
        cursor: slotsData[i]||recordMode ? "pointer" : "not-allowed"
      }
    });
    slotBar.appendChild(b);
    slotBtns.push(b);

    b.onclick = () => {
      if (recordMode) {
        slotsData[i] = gw.value;
        localStorage.setItem(LS_KEY, JSON.stringify(slotsData));
        recBtn.click();
      } else if (slotsData[i]) {
        let pts;
        try { pts = JSON.parse(slotsData[i]); }
        catch { pts = strToPts(slotsData[i]); }
        applyPoints(pts);
      }
    };
  }

  recBtn.onclick = () => {
    recordMode = !recordMode;
    recBtn.style.background = recordMode ? "#4caf50" : "";
    slotBtns.forEach((b, i) => {
      const ok = slotsData[i] || recordMode;
      b.disabled = !ok;
      b.style.opacity = ok ? "1" : "0.3";
      b.style.cursor  = ok ? "pointer" : "not-allowed";
    });
  };

  /*—— Info Popup ——*/
  const infoBtn = $el("button", {
    textContent: "ℹ️", title: "Instructions",
    style: {
      flex: "0 0 auto", minWidth: "10px",
      opacity: "0.6", cursor: "pointer",
      background: "transparent", border: "none",
      color: "#ccc"
    }
  });
  const advBtn = $el("button", {
    textContent: "§", title: "Advanced (WIP)", disabled: true,
    style: {
      flex: "0 0 auto", minWidth: "10px",
      opacity: "0.4", cursor: "not-allowed",
      background: "transparent", border: "none",
      color: "#666"
    }
  });
  slotBar.appendChild(infoBtn);
  slotBar.appendChild(advBtn);

  const overlay = $el("div", {
    style: {
      position: "absolute",
      top: "15%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: "240px",
      background: "#222",
      color: "#ccc",
      border: "1px solid #555",
      borderRadius: "6px",
      padding: "8px 12px",
      fontSize: "11px",
      lineHeight: "1.4",
      textAlign: "center",
      display: "none",
      zIndex: "9999",
      pointerEvents: "auto"
    }
  });
  overlay.innerHTML = `
    <strong>Sigma Schedule Editor</strong><br>
    Bidirectional editor for sigma schedules.<br>
    Use <strong>+ / –</strong> to adjust density.<br>
    Expand node to preview sigmas.<br>
    <em>Special thanks to huchenlei!</em>
  `;
  wrap.appendChild(overlay);

  infoBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    overlay.style.display =
      overlay.style.display === "none" ? "block" : "none";
  });
  wrap.addEventListener("click", () => {
    if (overlay.style.display === "block") {
      overlay.style.display = "none";
    }
  });

  /*—— Undo & Draw Logic ——*/
  let undoStack = [];
  function pushUndo(state) {
    undoStack.unshift(state);
    if (undoStack.length > UNDO_LIMIT) undoStack.pop();
  }

  function applyPoints(pts) {
    pushUndo(gw.value);
    const clean = pts.map((p) => ({
      x: p.x,
      y: Math.round(p.y * 100) / 100
    }));
    gw.value = JSON.stringify(clean);
    ta.value = ptsToStr(clean);

    // persist to cache
    localStorage.setItem(storageKey, gw.value);

    draw(clean);
  }

  const ctx = canvas.getContext("2d");
  function draw(overridePts) {
    const pts = overridePts || strToPts(gw.value);
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // grid
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let i = 1; i < 10; i++) {
      const x = (i * w) / 10, y = (i * h) / 10;
      ctx.moveTo(x, 0); ctx.lineTo(x, h);
      ctx.moveTo(0, y); ctx.lineTo(w, y);
    }
    ctx.stroke();

    // curve & handles
    if (pts.length >= 2) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      pts.forEach((p, i) => {
        const px = p.x * w, py = (1 - p.y) * h;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      });
      ctx.stroke();

      pts.forEach((p) => {
        const px = p.x * w, py = (1 - p.y) * h;
        ctx.fillStyle = POINT_COLOR;
        ctx.beginPath();
        ctx.arc(px, py, POINT_RADIUS, 0, 2 * Math.PI);
        ctx.fill();
      });
    }

    // update text preview
    const stepsW = node.widgets.find((w) => w.name === STEPS_NAME).value | 0;
    preview.value = calcSigmas(pts, stepsW)
      .map((v) => v.toFixed(2))
      .join(", ");
  }

  /*—— Event Bindings ——*/
  let debounce;
  ta.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      if (ta.value.trim()) draw(strToPts(ta.value));
    }, 200);
  });
  ta.addEventListener("blur", () => {
    if (ta.value.trim()) applyPoints(strToPts(ta.value));
  });
  ta.addEventListener("keydown", (e) => {
    if ((e.ctrlKey||e.metaKey) && e.key==="z" && undoStack.length) {
      e.preventDefault();
      const prev = undoStack.shift();
      gw.value = prev;
      const pts   = strToPts(prev);
      ta.value    = ptsToStr(pts);
      draw(pts);
    }
  });

  addBtn.onclick = () => {
    const pts = strToPts(gw.value);
    const n   = pts.length + 1;
    applyPoints(calcSigmas(pts, n).map((y,i)=>({ x:i/(n-1), y })));
  };
  delBtn.onclick = () => {
    const pts = strToPts(gw.value);
    if (pts.length > MIN_POINTS) {
      const n = pts.length - 1;
      applyPoints(calcSigmas(pts, n).map((y,i)=>({ x:i/(n-1), y })));
    }
  };

  // pointer interactions: drag, dblclick add, RMB delete
  let dragIdx = -1;
  canvas.onpointerdown = (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX-rect.left)/rect.width;
    const y = 1 - (e.clientY-rect.top)/rect.height;
    const pts = strToPts(gw.value);

    if (e.button===2) {
      const idx = pts.findIndex(p=>Math.hypot(p.x-x,p.y-y)<GRAB_THRESHOLD);
      if (idx>0 && idx<pts.length-1 && pts.length>MIN_POINTS) {
        pushUndo(gw.value);
        pts.splice(idx,1);
        applyPoints(pts);
      }
      e.preventDefault();
      return;
    }

    if (e.detail===2) {
      pushUndo(gw.value);
      pts.push({ x, y });
      pts.sort((a,b)=>a.x-b.x);
      applyPoints(pts);
      return;
    }

    dragIdx = pts.findIndex(p=>Math.hypot(p.x-x,p.y-y)<GRAB_THRESHOLD);
    if (dragIdx>=0) e.target.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX-rect.left)/rect.width;
    const y = 1 - (e.clientY-rect.top)/rect.height;
    const pts = strToPts(gw.value);

    if (dragIdx>=0) {
      const ny = Math.min(1, Math.max(0, y));
      pts[dragIdx] = { x:pts[dragIdx].x, y:ny };
      applyPoints(pts);
    }

    const over = pts.some(p=>Math.hypot(p.x-x,p.y-y)<GRAB_THRESHOLD);
    canvas.style.cursor = dragIdx>=0||over ? "pointer":"crosshair";
  };
  canvas.onpointerup = (e) => {
    if (dragIdx>=0) {
      e.target.releasePointerCapture(e.pointerId);
      dragIdx = -1;
    }
  };
  canvas.oncontextmenu = (e) => e.preventDefault();

  // recompute on step‐count change
  const sw = node.widgets.find((w) => w.name === STEPS_NAME);
  if (sw) sw.callback = () => applyPoints(strToPts(ta.value));

  // initial draw
  applyPoints(strToPts(ta.value));
  new ResizeObserver(() => draw()).observe(canvas);
}

/*—— Registration ——*/

app.registerExtension({
  name: "TWanSigmaGraph.widget",
  beforeRegisterNodeDef(nt, nd) {
    if (nd.name === NODE_CLASS) {
      const orig = nt.prototype.onConfigure;
      nt.prototype.onConfigure = function(info) {
        orig?.apply(this, arguments);
        setup(this);
      };
    }
  },
});

if (app.on) {
  app.on("nodeAdded", (n) => { if (n.type === NODE_CLASS) setup(n); });
} else {
  setInterval(() => {
    (app.graph?._nodes||[]).forEach((n) => {
      if (n.type === NODE_CLASS) setup(n);
    });
  }, 100);
}
