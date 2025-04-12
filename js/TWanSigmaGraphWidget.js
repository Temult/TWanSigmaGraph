// SigmaGraphWidget.js
// Refactored to use the addDOMWidget API
console.log(window.LiteGraph);
console.log(window.app);
console.log(window.ui);
console.log("[SigmaGraphWidget] top-level: file loaded successfully");

import { app } from "/../scripts/app.js";
import { $el } from "/../scripts/ui.js";
//import { LiteGraph } from "/scripts/litegraph.js";

/** Node and widget constants */
const nodeClassName = "SigmaGraphNode";
const graphDataWidgetName = "graph_data"; // Name of the hidden STRING widget
const stepsWidgetName = "steps";
const customWidgetName = "sigma_graph_ui"; // Name for our new custom DOM widget

/** How many preset slots we allow for saving/loading graph shapes. */
const numPresetSlots = 9;
/** Minimum number of points allowed on the graph */
const minGraphPoints = 3;

// --- Helper Functions (now mostly standalone) ---

/**
 * Calculates sigma values for the text preview based on points and steps.
 */
function calculateSigmasJS(points, steps) {
  const sigmaValues = [];
  steps = Math.max(1, Math.floor(steps));

  if (!points || points.length < 1) {
      for (let i = 0; i < steps; i++) { sigmaValues.push(1.0); }
      return sigmaValues;
  }

  if (steps === 1) {
    const startPoint = points.find((p) => Math.abs(p.x - 0.0) < 1e-6);
    return [startPoint ? Math.max(0.001, startPoint.y) : (points[0]?.y ?? 1.0)];
  }

  let localPoints = JSON.parse(JSON.stringify(points)); // Deep copy
  if (!Array.isArray(localPoints) || localPoints.length < 2) {
    const yVal = localPoints[0]?.y ?? 1.0;
    for (let i = 0; i < steps; i++) {
      sigmaValues.push(Math.max(0.001, yVal - (yVal * i) / (steps - 1)));
    }
    return sigmaValues;
  }

  localPoints.sort((a, b) => a.x - b.x);
  if (localPoints[0].x > 1e-6) { // Tolerance for boundary check
    localPoints.unshift({ x: 0.0, y: localPoints[0].y });
  }
  if (localPoints[localPoints.length - 1].x < 1.0 - 1e-6) { // Tolerance
    localPoints.push({ x: 1.0, y: localPoints[localPoints.length - 1].y });
  }

  let currentPointIndex = 0;
  for (let i = 0; i < steps; i++) {
    const stepProgress = steps === 1 ? 0 : i / (steps - 1);
    while (
      currentPointIndex < localPoints.length - 2 &&
      localPoints[currentPointIndex + 1].x < stepProgress - 1e-6 // Tolerance
    ) {
      currentPointIndex++;
    }
    const p1 = localPoints[currentPointIndex];
    const p2 = localPoints[currentPointIndex + 1] || p1;
    let sigma;
    const x_diff = p2.x - p1.x;
    if (x_diff <= 1e-6) {
      sigma = p1.y;
    } else {
      const clampedProgress = Math.max(p1.x, Math.min(p2.x, stepProgress));
      const interpFactor = (clampedProgress - p1.x) / x_diff;
      sigma = p1.y + interpFactor * (p2.y - p1.y);
    }
    sigmaValues.push(Math.max(0.001, sigma));
  }
  return sigmaValues;
}

/**
 * Generates `numTargetPoints` points by interpolating along `existingPoints`.
 */
function interpolatePoints(existingPoints, numTargetPoints) {
    if (numTargetPoints < 2 || !existingPoints || existingPoints.length < 2) {
        return [ { x: 0, y: 1 }, { x: 1, y: 0 } ];
    }
    const newPoints = [];
    const sortedExisting = [...existingPoints].sort((a, b) => a.x - b.x);
    if (sortedExisting[0].x > 1e-6) {
        sortedExisting.unshift({ x: 0.0, y: sortedExisting[0].y });
    }
    if (sortedExisting[sortedExisting.length - 1].x < 1.0 - 1e-6) {
        sortedExisting.push({ x: 1.0, y: sortedExisting[sortedExisting.length - 1].y });
    }

    let currentSegmentIndex = 0;
    for (let i = 0; i < numTargetPoints; i++) {
        const targetX = numTargetPoints === 1 ? 0 : i / (numTargetPoints - 1);
        while (
            currentSegmentIndex < sortedExisting.length - 2 &&
            sortedExisting[currentSegmentIndex + 1].x < targetX - 1e-6 // Tolerance
        ) {
            currentSegmentIndex++;
        }
        const p1 = sortedExisting[currentSegmentIndex];
        const p2 = sortedExisting[currentSegmentIndex + 1] || p1;
        let interpolatedY;
        const segmentXDiff = p2.x - p1.x;
        if (segmentXDiff <= 1e-6) {
            interpolatedY = p1.y;
        } else {
            const clampedTargetX = Math.max(p1.x, Math.min(p2.x, targetX));
            const interpFactor = (clampedTargetX - p1.x) / segmentXDiff;
            interpolatedY = p1.y + interpFactor * (p2.y - p1.y);
        }
        newPoints.push({ x: targetX, y: Math.max(0.001, interpolatedY) });
    }

    const uniqueNewPoints = [];
    const seenX = new Set();
    for (const p of newPoints) {
        let isDuplicate = false;
        for(const sx of seenX) { if (Math.abs(p.x - sx) < 1e-6) { isDuplicate = true; break; } }
        if (!isDuplicate) { uniqueNewPoints.push(p); seenX.add(p.x); }
    }
    if (uniqueNewPoints.length > 0) {
        if (!uniqueNewPoints.some(p => Math.abs(p.x - 0.0) < 1e-6))
            uniqueNewPoints.unshift({x: 0, y: newPoints[0].y});
        if (!uniqueNewPoints.some(p => Math.abs(p.x - 1.0) < 1e-6))
            uniqueNewPoints.push({x: 1, y: newPoints[newPoints.length-1].y});
    } else {
        return [ { x: 0, y: 1 }, { x: 1, y: 0 } ];
    }
    return uniqueNewPoints.sort((a,b) => a.x - b.x);
}

/**
 * Redraws the curve on the canvas.
 */
function drawCurve(widgetState) {
  const canvasEl = widgetState.canvasEl;
  if (!canvasEl || !widgetState._points) return;
  const rect = canvasEl.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  const dpr = window.devicePixelRatio || 1;
  const displayWidth = Math.round(rect.width);
  const displayHeight = Math.round(rect.height);
  if (canvasEl.width !== displayWidth * dpr || canvasEl.height !== displayHeight * dpr) {
    canvasEl.width = displayWidth * dpr;
    canvasEl.height = displayHeight * dpr;
    canvasEl.style.width = `${displayWidth}px`;
    canvasEl.style.height = `${displayHeight}px`;
  }

  const ctx = canvasEl.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, displayWidth, displayHeight);

  ctx.strokeStyle = "#444";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let i = 1; i < 10; i++) {
    const vx = (i * displayWidth) / 10;
    const vy = (i * displayHeight) / 10;
    ctx.moveTo(vx, 0);
    ctx.lineTo(vx, displayHeight);
    ctx.moveTo(0, vy);
    ctx.lineTo(displayWidth, vy);
  }
  ctx.stroke();

  const sortedPoints = [...widgetState._points].sort((a, b) => a.x - b.x);
  if (sortedPoints.length < 2) return;
  ctx.strokeStyle = "white";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  sortedPoints.forEach((pt, idx) => {
    const px = pt.x * displayWidth;
    const py = (1 - pt.y) * displayHeight;
    if (idx === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.stroke();

  widgetState._points.forEach((pt, idx) => {
    const ratio = widgetState._points.length > 1 ? idx / (widgetState._points.length - 1) : 0;
    const startColor = { r: 61, g: 3, b: 0 };
    const endColor = { r: 255, g: 0, b: 0 };
    const r = Math.round(startColor.r + ratio * (endColor.r - startColor.r));
    const g = Math.round(startColor.g + ratio * (endColor.g - startColor.g));
    const b = Math.round(startColor.b + ratio * (endColor.b - startColor.b));
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    const px = pt.x * displayWidth;
    const py = (1 - pt.y) * displayHeight;
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * Updates the sigma text area display.
 */
function updateSigmaDisplay(widgetState) {
  if (!widgetState.sigmaDisplayEl || !widgetState.stepsWidget || !widgetState._points) return;
  const steps = widgetState.stepsWidget.value;
  const sigmas = calculateSigmasJS(widgetState._points, steps);
  widgetState.sigmaDisplayEl.value = sigmas.map((s) => s.toFixed(3)).join(", ");
}

/**
 * Updates the enabled state of the remove (-) button.
 */
function updateRemoveButtonState(widgetState) {
    if (!widgetState.removeButtonEl || !widgetState._points) return;
    const canRemove = widgetState._points.length > minGraphPoints;
    widgetState.removeButtonEl.disabled = !canRemove;
    widgetState.removeButtonEl.style.opacity = canRemove ? "1" : "0.5";
    widgetState.removeButtonEl.style.cursor = canRemove ? "pointer" : "not-allowed";
}

// --- Main Extension Registration ---

app.registerExtension({
  name: "sigma_graph.widget",
  async beforeRegisterNodeDef(nodeType, nodeData, appInstance) {
    if (nodeData.name !== nodeClassName) return;

    // Patch onConfigure to set up the custom widget
    const originalOnConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function (info) {
      originalOnConfigure?.apply(this, arguments);
      if (this.widgets?.find(w => w.name === customWidgetName)) { return; }
      console.log(`[SigmaGraphWidget] ${this.id}: Patched onConfigure running - setting up widget.`);

      const dataWidget = this.widgets.find((w) => w.name === graphDataWidgetName);
      const stepsWidget = this.widgets.find((w) => w.name === stepsWidgetName);
      if (!dataWidget) { console.error(`[SigmaGraphWidget] ${this.id}: Could not find data widget '${graphDataWidgetName}'!`); return; }
      if (!stepsWidget) { console.error(`[SigmaGraphWidget] ${this.id}: Could not find steps widget '${stepsWidgetName}'!`); }

      if (dataWidget.inputEl) { dataWidget.inputEl.style.display = "none"; }
      try {
          const widgetIndex = this.widgets.findIndex(w => w === dataWidget);
          if (widgetIndex !== -1 && this.inputs && this.inputs[widgetIndex]) {
              const slotElement = this.graphcanvas?.canvas?.querySelector(`.node_${this.id}_slot_${widgetIndex}`);
              if (slotElement?.previousElementSibling?.tagName === 'LABEL') {
                  slotElement.previousElementSibling.style.display = 'none';
              }
          }
      } catch(e) { console.warn("[SigmaGraphWidget] Error trying to hide label:", e); }

      // Build the root element for the widget UI
      const rootElement = $el("div", {
        className: "sigma-graph-widget-container",
        style: { width: "100%", height: "100%", padding: "5px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "10px" },
      });

      // Initialize widget state and store key elements in widgetState object
      const widgetState = {
        _points: [],
        _saveSlots: new Array(numPresetSlots).fill(null),
        _saveSlotButtons: [],
        _recordMode: false,
        _draggingIndex: -1,
        _rightClickIndex: -1,
        rootElement: rootElement,
        node: this,
        dataWidget: dataWidget,
        stepsWidget: stepsWidget,
        sigmaDisplayEl: null,
        canvasContainerEl: null,
        canvasEl: null,
        presetContainerEl: null,
        addButtonEl: null,
        removeButtonEl: null,
        refreshButton: null, // We'll assign the refresh button here
        originalStepsCallback: stepsWidget ? stepsWidget.callback : null,
        saveTimeout: null,
        boundMouseUpHandler: null,
      };

      const saveStateToDataWidget = () => {
          clearTimeout(widgetState.saveTimeout);
          widgetState.saveTimeout = setTimeout(() => {
              widgetState._points.sort((a, b) => a.x - b.x);
              const serialized = JSON.stringify(widgetState._points);
              if (widgetState.dataWidget.value !== serialized) {
                  widgetState.dataWidget.value = serialized;
              }
          }, 100);
      };

      // --- Build the UI ---

      // Sigma display and button grid container
      const sigmaDisplayContainer = $el("div", { style: { display: "flex", flexDirection: "row", gap: "5px", alignItems: "stretch" } });
      const sigmaDisplay = $el("textarea", {
        placeholder: "Sigma values...",
        style: {
          flexGrow: "1",
          minHeight: "5px",
          fontSize: "0.9em",
          background: "#181818",
          color: "#ccc",
          border: "1px solid #555",
          borderRadius: "3px",
          boxSizing: "border-box",
          resize: "auto",
          fontFamily: "monospace",
          padding: "2px 4px",
        }
      });
      widgetState.sigmaDisplayEl = sigmaDisplay;
      sigmaDisplayContainer.appendChild(sigmaDisplay);

      const buttonGridContainer = $el("div", { style: { display: "flex", flexDirection: "row", gap: "1px", height: "45px" } });
      sigmaDisplayContainer.appendChild(buttonGridContainer);
      rootElement.appendChild(sigmaDisplayContainer);

      // Left column for refresh & advanced buttons
      const leftButtonColumn = $el("div", { style: { display: "flex", flexDirection: "column", alignItems: "stretch", width: "20px", borderRadius: "3px", overflow: "hidden", border: "1px solid #555", background: "#444" } });
      buttonGridContainer.appendChild(leftButtonColumn);

      // Create refreshButton and attach it to widgetState.refreshButton
      widgetState.refreshButton = $el("button", {
          textContent: "🔄",
          style: {
            flex: "1 1 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "13px",
            border: "none",
            borderBottom: "1px solid #555",
            background: "transparent",
            color: "#ccc",
            cursor: "pointer",
            lineHeight: "normal",
            padding: "0"
          },
          title: "Refresh text display from current graph/steps"
      });
      leftButtonColumn.appendChild(widgetState.refreshButton);

      // Create advancedButton (for demonstration purposes)
      const advancedButton = $el("button", {
          textContent: "⚙️",
          style: {
            flex: "1 1 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "13px",
            border: "none",
            background: "transparent",
            color: "#666",
            cursor: "not-allowed",
            lineHeight: "normal",
            padding: "0"
          },
          title: "Advanced Mode (Not Implemented)"
      });
      leftButtonColumn.appendChild(advancedButton);

      // Right column for info & apply buttons
      const rightButtonColumn = $el("div", { style: { display: "flex", flexDirection: "column", alignItems: "stretch", width: "20px", borderRadius: "3px", overflow: "hidden", border: "1px solid #555", background: "#444" } });
      buttonGridContainer.appendChild(rightButtonColumn);

      const infoButton = $el("button", {
          textContent: "ℹ",
          style: {
            flex: "1 1 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "13px",
            border: "none",
            borderBottom: "1px solid #555",
            background: "transparent",
            color: "#ccc",
            cursor: "pointer",
            lineHeight: "normal",
            padding: "0"
          },
          title: "Show instructions about this node"
      });
      rightButtonColumn.appendChild(infoButton);

      const applyButton = $el("button", {
          textContent: "▼",
          style: {
            flex: "1 1 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "13px",
            border: "none",
            background: "transparent",
            color: "#ccc",
            cursor: "pointer",
            lineHeight: "normal",
            padding: "0"
          },
          title: "Apply sigma values from the text area to the graph points"
      });
      rightButtonColumn.appendChild(applyButton);

      // Info overlay element
      const infoOverlay = $el("div", {
          style: {
              position: "absolute",
              top: "55%",
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
              pointerEvents: "none"
          }
      });
      infoOverlay.innerHTML = `<div style="font-size: 10px; line-height: 1.4;">
          <strong>Sigma Schedule Editor</strong><br>
          Bidirectional editor for sigma schedules.<br>
          <strong>🔄</strong>: Refresh text from graph/steps.<br>
          <strong>▼</strong>: Apply text to graph points.<br>
          Drag, double-click, right-click to edit points.<br>
          Use <strong>+/-</strong> on graph to adjust density.<br>
          <i>Special thanks to huchenlei for js help!!<i>
      </div>`;
      rootElement.appendChild(infoOverlay);

      // Canvas container and canvas element
      const canvasContainer = $el("div", {
          style: {
              position: "relative",
              width: "100%",
              flexGrow: "1",
              minHeight: "50px",
              boxSizing: "border-box",
              cursor: "crosshair",
              overflow: "hidden"
          }
      });
      const canvas = $el("canvas", {
          style: {
              display: "block",
              width: "100%",
              height: "100%",
              background: "#282828",
              border: "2px solid #555",
              borderRadius: "3px",
              boxSizing: "border-box"
          }
      });
      widgetState.canvasContainerEl = canvasContainer;
      widgetState.canvasEl = canvas;
      canvasContainer.appendChild(canvas);
      rootElement.appendChild(canvasContainer);

      // Add and remove buttons for graph points
      const addButton = $el("button", {
          textContent: "+",
          style: {
              position: "absolute",
              top: "4px",
              right: "30px",
              width: "22px",
              height: "22px",
              fontSize: "16px",
              lineHeight: "20px",
              textAlign: "center",
              padding: "0",
              background: "#4CAF50",
              color: "white",
              border: "1px solid #388E3C",
              borderRadius: "3px",
              cursor: "pointer",
              zIndex: "10"
          },
          title: "Add points (increase density)"
      });
      canvasContainer.appendChild(addButton);
      widgetState.addButtonEl = addButton;

      const removeBtn = $el("button", {
          textContent: "-",
          style: {
              position: "absolute",
              top: "4px",
              right: "4px",
              width: "22px",
              height: "22px",
              fontSize: "18px",
              lineHeight: "18px",
              textAlign: "center",
              padding: "0",
              background: "#f44336",
              color: "white",
              border: "1px solid #d32f2f",
              borderRadius: "3px",
              cursor: "pointer",
              zIndex: "10"
          },
          title: "Remove points (decrease density)"
      });
      canvasContainer.appendChild(removeBtn);
      widgetState.removeButtonEl = removeBtn;

      // Preset container and save mode button
      const presetContainer = $el("div", {
          style: { display: "inline-flex", flexDirection: "row", alignItems: "center", gap: "5px", marginTop: "0px" }
      });
      widgetState.presetContainerEl = presetContainer;
      rootElement.appendChild(presetContainer);

      const saveModeButton = $el("button", {
          textContent: "💾",
          style: {
              width: "30px",
              height: "30px",
              borderRadius: "3px",
              border: "1px solid #555",
              background: "#96322f",
              color: "#fff",
              fontSize: "15px",
              cursor: "pointer",
              padding: "0",
              lineHeight: "30px",
              textAlign: "center"
          },
          title: "Toggle Save Mode (then click a slot to save). Otherwise, click to load."
      });
      presetContainer.appendChild(saveModeButton);

      // Load existing preset slots from localStorage
      const savedSlotsJSON = localStorage.getItem("sigma_graph_saveSlots");
      if (savedSlotsJSON) {
          try {
              const savedSlots = JSON.parse(savedSlotsJSON);
              if (Array.isArray(savedSlots) && savedSlots.length === numPresetSlots) {
                  widgetState._saveSlots = savedSlots;
              }
          } catch (err) {
              console.error("Error parsing saved slots:", err);
          }
      }

      const updateSaveSlotVisibility = () => {
          widgetState._saveSlotButtons.forEach((btn, idx) => {
              if (widgetState._recordMode) {
                  btn.style.visibility = "visible";
                  btn.style.backgroundColor = "#4caf50";
              } else {
                  if (widgetState._saveSlots[idx]) {
                      btn.style.visibility = "visible";
                      btn.style.backgroundColor = "#273648";
                  } else {
                      btn.style.visibility = "hidden";
                  }
              }
          });
          saveModeButton.style.background = widgetState._recordMode ? "#4caf50" : "#333";
      };

      for (let i = 0; i < numPresetSlots; i++) {
          const slotContainer = $el("div", { style: { width: "30px", height: "30px", display: "inline-block" } });
          const slotButton = $el("button", {
              textContent: `${i + 1}`,
              style: { width: "100%", height: "100%", boxSizing: "border-box", padding: "0", borderRadius: "3px", border: "1px solid #555", background: "#333", color: "#fff", fontSize: "15px", cursor: "pointer" },
              title: `Slot #${i + 1}`
          });
          slotButton.addEventListener("click", () => {
              if (widgetState._recordMode) {
                  widgetState._saveSlots[i] = JSON.stringify(widgetState._points);
                  localStorage.setItem("sigma_graph_saveSlots", JSON.stringify(widgetState._saveSlots));
                  widgetState._recordMode = false;
                  updateSaveSlotVisibility();
              } else {
                  if (widgetState._saveSlots[i]) {
                      try {
                          const loadedPoints = JSON.parse(widgetState._saveSlots[i]);
                          customWidget.value = loadedPoints;
                      } catch (e) {
                          console.error(`Error parsing slot ${i + 1}:`, e);
                      }
                  }
              }
          });
          widgetState._saveSlotButtons.push(slotButton);
          slotContainer.appendChild(slotButton);
          presetContainer.appendChild(slotContainer);
      }
      updateSaveSlotVisibility();
      saveModeButton.addEventListener("click", () => {
          widgetState._recordMode = !widgetState._recordMode;
          updateSaveSlotVisibility();
      });

      // --- Define Options for addDOMWidget ---
      const widgetOptions = {
          setValue: (value) => {
              let parsedPoints = [];
              try {
                  if (typeof value === 'string') {
                      parsedPoints = JSON.parse(value || '[]');
                  } else if (Array.isArray(value)) {
                      parsedPoints = value;
                  } else {
                      throw new Error("Invalid value type");
                  }
                  if (!Array.isArray(parsedPoints))
                      throw new Error("Parsed value is not an array");
              } catch (e) {
                  console.error("[SigmaGraphWidget] setValue error:", e);
                  parsedPoints = [ { x: 0, y: 1 }, { x: 1, y: 0 } ];
              }
              if (parsedPoints.length < 1)
                  parsedPoints = [ { x: 0, y: 1 }, { x: 1, y: 0 } ];
              if (!parsedPoints.some((p) => Math.abs(p.x - 0.0) < 1e-6))
                  parsedPoints.push({ x: 0, y: 1 });
              if (!parsedPoints.some((p) => Math.abs(p.x - 1.0) < 1e-6))
                  parsedPoints.push({ x: 1, y: 0 });
              parsedPoints.sort((a, b) => a.x - b.x);
              const uniquePoints = [];
              const seenX = new Set();
              for(const p of parsedPoints) {
                  let isDuplicate = false;
                  for(const sx of seenX) {
                      if (Math.abs(p.x - sx) < 1e-6) { isDuplicate = true; break; }
                  }
                  if (!isDuplicate) { uniquePoints.push(p); seenX.add(p.x); }
              }
              parsedPoints = uniquePoints;
              while (parsedPoints.length < minGraphPoints) {
                  const mid = Math.floor(parsedPoints.length / 2);
                  const p1 = parsedPoints[mid-1];
                  const p2 = parsedPoints[mid];
                  parsedPoints.splice(mid, 0, { x: (p1.x+p2.x)/2, y: (p1.y+p2.y)/2 });
              }
              widgetState._points = parsedPoints;
              drawCurve(widgetState);
              updateSigmaDisplay(widgetState);
              updateRemoveButtonState(widgetState);
              saveStateToDataWidget();
          },
          getValue: () => {
              widgetState._points.sort((a, b) => a.x - b.x);
              return JSON.stringify(widgetState._points);
          },
          afterResize: () => {
              requestAnimationFrame(() => drawCurve(widgetState));
          },
      };

      // --- Add the Custom DOM Widget ---
      const customWidget = this.addDOMWidget(customWidgetName, "custom", rootElement, widgetOptions);
      if (!customWidget) {
          console.error(`[SigmaGraphWidget] ${this.id}: Failed to add DOM widget!`);
          return;
      }

      // --- Attach Event Listeners ---
      widgetState.refreshButton.addEventListener("click", () => { updateSigmaDisplay(widgetState); });
      advancedButton.addEventListener("click", () => { /* No action */ });
      infoButton.addEventListener("click", () => { infoOverlay.style.display = (infoOverlay.style.display === "none") ? "block" : "none"; });
      applyButton.addEventListener("click", () => {
          const textValue = widgetState.sigmaDisplayEl.value.trim();
          if (!textValue) return;
          const parts = textValue.split(",").map(s => s.trim()).filter(s => s !== "");
          const parsedSigmas = parts.map(Number);
          if (parsedSigmas.some(isNaN) || parsedSigmas.length === 0) return;
          let pointsChanged = false;
          widgetState._points.sort((a, b) => a.x - b.x);
          widgetState._points.forEach((pt) => {
              let targetIndex;
              if (parsedSigmas.length === 1) targetIndex = 0;
              else {
                  targetIndex = Math.round(pt.x * (parsedSigmas.length - 1));
                  targetIndex = Math.max(0, Math.min(parsedSigmas.length - 1, targetIndex));
              }
              const newY = Math.max(0.001, parsedSigmas[targetIndex]);
              if (pt.y !== newY) { pt.y = newY; pointsChanged = true; }
          });
          if (pointsChanged) {
              drawCurve(widgetState);
              saveStateToDataWidget();
              widgetState.node.setDirtyCanvas(true, true);
          }
      });
      addButton.addEventListener("click", () => {
          const numCurrent = widgetState._points.length;
          const numToAdd = Math.max(1, Math.floor(numCurrent * 0.5));
          widgetState._points = interpolatePoints(widgetState._points, numCurrent + numToAdd);
          drawCurve(widgetState);
          updateSigmaDisplay(widgetState);
          updateRemoveButtonState(widgetState);
          saveStateToDataWidget();
      });
      removeBtn.addEventListener("click", () => {
          const numCurrent = widgetState._points.length;
          if (numCurrent <= minGraphPoints) return;
          const numToRemove = Math.max(1, Math.floor(numCurrent * 0.5));
          let targetNumPoints = Math.max(minGraphPoints, numCurrent - numToRemove);
          const actualNumToRemove = numCurrent - targetNumPoints;
          if (actualNumToRemove <= 0) return;
          const candidates = [];
          const sortedPoints = [...widgetState._points].sort((a, b) => a.x - b.x);
          for (let i = 1; i < sortedPoints.length - 1; i++) {
              const p_prev = sortedPoints[i - 1];
              const p_curr = sortedPoints[i];
              const p_next = sortedPoints[i + 1];
              const x_diff = p_next.x - p_prev.x;
              let interpolatedY;
              if (x_diff <= 1e-6) interpolatedY = p_prev.y;
              else {
                  const ratio = (p_curr.x - p_prev.x) / x_diff;
                  interpolatedY = p_prev.y + ratio * (p_next.y - p_prev.y);
              }
              candidates.push({ point: p_curr, distance: Math.abs(p_curr.y - interpolatedY) });
          }
          candidates.sort((a, b) => a.distance - b.distance);
          const pointsToRemove = new Set(candidates.slice(0, actualNumToRemove).map(c => c.point));
          widgetState._points = widgetState._points.filter(pt => !pointsToRemove.has(pt));
          drawCurve(widgetState);
          updateSigmaDisplay(widgetState);
          updateRemoveButtonState(widgetState);
          saveStateToDataWidget();
      });

      widgetState.boundMouseUpHandler = () => {
          if (widgetState._draggingIndex >= 0) {
              widgetState._draggingIndex = -1;
              if (widgetState.canvasEl) widgetState.canvasEl.style.cursor = "crosshair";
              saveStateToDataWidget();
          }
      };
      document.addEventListener("mouseup", widgetState.boundMouseUpHandler, true);

      canvas.addEventListener("mousedown", (evt) => {
          if (evt.target === addButton || evt.target === removeBtn) return;
          evt.stopPropagation();
          const rect = widgetState.canvasEl.getBoundingClientRect();
          const x = evt.clientX - rect.left;
          const y = evt.clientY - rect.top;
          const clickRadiusSq = 64;
          widgetState._draggingIndex = -1;
          widgetState._rightClickIndex = -1;
          let closestDistSq = Infinity;
          let clickedIndex = -1;
          widgetState._points.forEach((pt, i) => {
              const px = pt.x * rect.width;
              const py = (1 - pt.y) * rect.height;
              const distSq = (px - x) ** 2 + (py - y) ** 2;
              if (distSq < clickRadiusSq && distSq < closestDistSq) {
                  closestDistSq = distSq;
                  clickedIndex = i;
              }
          });
          if (clickedIndex !== -1) {
              if (evt.button === 0) {
                  widgetState._draggingIndex = clickedIndex;
                  widgetState.canvasEl.style.cursor = "grabbing";
              } else if (evt.button === 2) {
                  widgetState._rightClickIndex = clickedIndex;
              }
          }
      });
      canvas.addEventListener("mousemove", (evt) => {
          if (evt.target === addButton || evt.target === removeBtn) return;
          const rect = widgetState.canvasEl.getBoundingClientRect();
          const x = evt.clientX - rect.left;
          const y = evt.clientY - rect.top;
          if (widgetState._draggingIndex >= 0) {
              evt.stopPropagation();
              let nx = x / rect.width;
              let ny = 1 - y / rect.height;
              nx = Math.max(0, Math.min(1, nx));
              ny = Math.max(0, Math.min(1, ny));
              const point = widgetState._points[widgetState._draggingIndex];
              if (point.x === 0 || point.x === 1) nx = point.x;
              widgetState._points[widgetState._draggingIndex] = { x: nx, y: ny };
              drawCurve(widgetState);
              updateSigmaDisplay(widgetState);
              saveStateToDataWidget();
          } else {
              let hovering = false;
              const hoverRadiusSq = 64;
              widgetState._points.forEach((pt) => {
                  const px = pt.x * rect.width;
                  const py = (1 - pt.y) * rect.height;
                  if ((px - x) ** 2 + (py - y) ** 2 < hoverRadiusSq)
                      hovering = true;
              });
              widgetState.canvasEl.style.cursor = hovering ? "grab" : "crosshair";
          }
      });
      canvas.addEventListener("dblclick", (evt) => {
          if (evt.target === addButton || evt.target === removeBtn) return;
          evt.stopPropagation();
          const rect = widgetState.canvasEl.getBoundingClientRect();
          let nx = (evt.clientX - rect.left) / rect.width;
          let ny = 1 - (evt.clientY - rect.top) / rect.height;
          nx = Math.max(0, Math.min(1, nx));
          ny = Math.max(0, Math.min(1, ny));
          widgetState._points.push({ x: nx, y: ny });
          drawCurve(widgetState);
          updateSigmaDisplay(widgetState);
          updateRemoveButtonState(widgetState);
          saveStateToDataWidget();
      });
      canvas.addEventListener("contextmenu", (evt) => {
          if (evt.target === addButton || evt.target === removeBtn) { evt.preventDefault(); return; }
          evt.preventDefault();
          evt.stopPropagation();
          if (widgetState._rightClickIndex >= 0) {
              const pt = widgetState._points[widgetState._rightClickIndex];
              if (widgetState._points.length <= minGraphPoints) { /* Show a message if needed */ }
              else if (pt.x > 1e-6 && pt.x < 1.0 - 1e-6) {
                  widgetState._points.splice(widgetState._rightClickIndex, 1);
                  drawCurve(widgetState);
                  updateSigmaDisplay(widgetState);
                  updateRemoveButtonState(widgetState);
                  saveStateToDataWidget();
              } else { /* Do not remove boundary points */ }
          }
          widgetState._rightClickIndex = -1;
      });

      // Steps Widget Hook
      if (stepsWidget) {
          stepsWidget.callback = (value) => {
              if (widgetState.originalStepsCallback) { widgetState.originalStepsCallback.call(stepsWidget, value); }
              updateSigmaDisplay(widgetState);
          };
      }

      // Resize Observer for canvas
      widgetState.resizeObserver = new ResizeObserver(() => {
          requestAnimationFrame(() => drawCurve(widgetState));
      });
      widgetState.resizeObserver.observe(canvasContainer);

      // --- Initial Setup ---
      requestAnimationFrame(() => {
          console.log(`[SigmaGraphWidget] ${this.id}: Running initial setup in rAF.`);
          if (customWidget?.value !== undefined) {
              customWidget.value = dataWidget.value;
          } else {
              console.error(`[SigmaGraphWidget] ${this.id}: customWidget or customWidget.value missing for initial load.`);
              let initialPoints = [];
              try {
                  initialPoints = JSON.parse(dataWidget.value || '[]');
              } catch(e) {
                  initialPoints = [{x:0,y:1},{x:1,y:0}];
              }
              widgetState._points = initialPoints;
              drawCurve(widgetState);
              updateSigmaDisplay(widgetState);
              updateRemoveButtonState(widgetState);
          }
          this.setSize(this.computeSize());
          this.setDirtyCanvas(true, true);
          if (this.graph) { this.graph.setDirtyCanvas(true, true); }
      });

      // --- Cleanup on Removal ---
      const originalOnRemoved = this.onRemoved;
      this.onRemoved = () => {
          console.log(`[SigmaGraphWidget] ${this.id}: Cleaning up.`);
          if (widgetState.boundMouseUpHandler) { document.removeEventListener("mouseup", widgetState.boundMouseUpHandler, true); }
          if (widgetState.resizeObserver) { widgetState.resizeObserver.disconnect(); widgetState.resizeObserver = null; }
          if (stepsWidget && widgetState.originalStepsCallback) { stepsWidget.callback = widgetState.originalStepsCallback; }
          if (originalOnRemoved) { originalOnRemoved.apply(this, arguments); }
      };

      // Mark node dirty after adding the widget
      this.setDirtyCanvas(true, true);
    }; // End of onConfigure patch

    // --- Node Appearance ---
    nodeType.prototype.resizable = true;
    const originalComputeSize = nodeType.prototype.computeSize;
    nodeType.prototype.computeSize = function(out) {
        const size = originalComputeSize ? originalComputeSize.apply(this, [null]) : [this.constructor.NODE_WIDTH || 140, 0];
        const customWidgetContentHeight = 225;
        size[0] = Math.max(290, size[0]);
        let baseHeight = this.constructor.title_height || 20;
        if (this.inputs) {
            this.inputs.forEach(input => { if (input.name !== graphDataWidgetName) { baseHeight += 20; } });
        }
        if (this.outputs) { baseHeight += this.outputs.length * 20; }
        size[1] = baseHeight + customWidgetContentHeight;
        size[1] = Math.max(280, size[1]);
        if (out) { out[0] = size[0]; out[1] = size[1]; }
        return size;
    };
    nodeType.prototype.onResize = function() { /* No-op */ };
  }, // End of beforeRegisterNodeDef
}); // End of app.registerExtension
