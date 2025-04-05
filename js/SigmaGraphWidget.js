// SigmaGraphWidget.js
// Provides a custom UI widget for editing a sigma schedule graph.

import { app } from "../../scripts/app.js";
import { $el } from "../../scripts/ui.js";

/** Node and widget constants */
const nodeClassName = "SigmaGraphNode";
const graphWidgetName = "graph_data";
const stepsWidgetName = "steps";

/** How many preset slots we allow for saving/loading graph shapes. */
const numPresetSlots = 9;

/**
 * A local JS utility to approximate the same sigma schedule you do in Python,
 * but used only for the text area preview inside the widget.
 */
function calculateSigmasJS(points, steps) {
  const sigmaValues = [];
  if (steps <= 0) return [];
  if (steps === 1) {
    // If there's only 1 step, return the y-value at x=0 (if found), else default to 1.0
    const startPoint = points?.find((p) => p.x === 0);
    return [startPoint ? Math.max(0.001, startPoint.y) : 1.0];
  }

  // Defensive copy of the points
  let localPoints = JSON.parse(JSON.stringify(points || []));
  if (!Array.isArray(localPoints) || localPoints.length < 2) {
    // Fallback to linear if no valid points
    for (let i = 0; i < steps; i++) {
      sigmaValues.push(1.0 - i / (steps - 1));
    }
    return sigmaValues;
  }

  // Sort by x, ensure boundary points at x=0 and x=1
  localPoints.sort((a, b) => a.x - b.x);
  if (localPoints[0].x > 0) {
    localPoints.unshift({ x: 0.0, y: localPoints[0].y });
  }
  if (localPoints[localPoints.length - 1].x < 1) {
    localPoints.push({ x: 1.0, y: localPoints[localPoints.length - 1].y });
  }

  // Interpolate
  let currentPointIndex = 0;
  for (let i = 0; i < steps; i++) {
    const stepProgress = i / (steps - 1);
    while (
      currentPointIndex < localPoints.length - 2 &&
      localPoints[currentPointIndex + 1].x < stepProgress
    ) {
      currentPointIndex++;
    }
    const p1 = localPoints[currentPointIndex];
    const p2 = localPoints[currentPointIndex + 1] || p1;
    let sigma;
    if (p2.x <= p1.x) {
      sigma = p1.y;
    } else {
      const interpFactor = (stepProgress - p1.x) / (p2.x - p1.x);
      sigma = p1.y + interpFactor * (p2.y - p1.y);
    }
    sigmaValues.push(Math.max(0.001, sigma));
  }

  return sigmaValues;
}

/**
 * Initialize the custom graph UI for the given widget on the node.
 */
function setupSigmaGraph(widget, node) {
  // Create a container for everything
  const container = $el("div", {
    style: { display: "flex", flexDirection: "column", gap: "10px" },
  });
  widget.element = container;

  // ----------------------------------------------------------------
  // 1. A row for the sigma text area and the stacked buttons
	const sigmaDisplayContainer = $el("div", {
	  style: { display: "flex", flexDirection: "row", gap: "5px" },
	});
	const sigmaDisplay = $el("textarea", {
	  placeholder: "Sigma values...",
	  style: {
		flexGrow: "1",
		minHeight: "45px",
		fontSize: "0.9em",
		background: "#181818",
		color: "#ccc",
		border: "1px solid #555",
		borderRadius: "3px",
		boxSizing: "border-box",
		resize: "auto",
		fontFamily: "monospace",
		padding: "2px 4px",
	  },
	});
	widget.sigmaDisplayEl = sigmaDisplay;
	sigmaDisplayContainer.appendChild(sigmaDisplay);

	// Instead of one tall button, we have a container with two stacked buttons:
	const stackedButtonsContainer = $el("div", {
	  style: {
		display: "flex",
		flexDirection: "column",
		alignItems: "stretch",
		width: "20px",
		height: "42px",
		borderRadius: "3px",
		overflow: "hidden",
		border: "1px solid #555",
		background: "#444",
	  },
	});
	sigmaDisplayContainer.appendChild(stackedButtonsContainer);
	container.appendChild(sigmaDisplayContainer);

	// Top half: "ℹ" info button
	const infoButton = $el("button", {
	  textContent: "ℹ", // Unicode info symbol
	  style: {
		flex: "1 1 auto",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		fontSize: "13px",
		border: "none",
		borderBottom: "1px solid #555", // thin border separating from bottom button
		background: "transparent",
		color: "#ccc",
		cursor: "pointer",
		lineHeight: "normal",
	  },
	  title: "Show instructions about this node",
	});
	stackedButtonsContainer.appendChild(infoButton);

	// Bottom half: the down-arrow apply button
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
	  },
	  title: "Apply sigma values from the text area to the graph points",
	});
	stackedButtonsContainer.appendChild(applyButton);

	// 1a. The overlay or note for instructions (initially hidden):
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
		pointerEvents: "none", // so it doesn't block interaction
	  },
	});
	infoOverlay.innerHTML = `
	  <div style="font-size: 10px; line-height: 1.4;">
		<strong>Sigma Schedule Editor</strong><br>
		Bidirectional editor for sigma schedules.<br>
		Use graph or text input interchangeably.<br>
		Click <strong>▼</strong> to apply text to graph.<br>
		Drag, double-click, or right-click to edit points.<br>
		<i>Special thanks to huchenlei for js help!!<i>
	  </div>
	`;

	container.appendChild(infoOverlay);

	infoButton.addEventListener("click", () => {
	  // Toggle the overlay's visibility
	  infoOverlay.style.display = (infoOverlay.style.display === "none")
		? "block"
		: "none";
	});


  // ----------------------------------------------------------------
  // 2. The canvas for interactive editing
  // ----------------------------------------------------------------
  const canvasContainer = $el("div", {
    style: {
      position: "relative",
      width: "100%",
      height: "100%",
      boxSizing: "border-box",
      cursor: "crosshair",
      overflow: "visible",
    },
  });
  const canvas = $el("canvas", {
    style: {
      flexGrow: "1",
      width: "100%",
      height: "120px",
      background: "#282828",
      display: "block",
      minHeight: "40px",
      border: "2px solid #555",
      borderRadius: "3px",
      boxSizing: "border-box",
      resize: "both",
    },
  });
  canvasContainer.appendChild(canvas);
  container.appendChild(canvasContainer);

  // ----------------------------------------------------------------
  // 3. A row of Save/Load preset slots
  // ----------------------------------------------------------------
  const presetContainer = $el("div", {
    style: {
      display: "inline-flex",
      flexDirection: "row",
      alignItems: "center",
      gap: "5px",
      marginTop: "0px",
    },
  });
  container.appendChild(presetContainer);

  // Single toggle button for "save mode" on/off
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
      textAlign: "center",
    },
    title: "Toggle Save Mode (then click a slot to save). Otherwise, click to load.",
  });
  presetContainer.appendChild(saveModeButton);

  widget._recordMode = false;
  widget._saveSlots = new Array(numPresetSlots).fill(null);
  widget._saveSlotButtons = [];

  // Retrieve previously saved slots from localStorage.
  const savedSlotsJSON = localStorage.getItem("sigma_graph_saveSlots");
  if (savedSlotsJSON) {
    try {
      const savedSlots = JSON.parse(savedSlotsJSON);
      if (Array.isArray(savedSlots) && savedSlots.length === numPresetSlots) {
        widget._saveSlots = savedSlots;
      }
    } catch (err) {
      console.error("Error parsing saved slots from localStorage:", err);
    }
  }

  // Create each preset slot
  for (let i = 0; i < numPresetSlots; i++) {
    const slotContainer = $el("div", {
      style: {
        width: "30px",
        height: "30px",
        display: "inline-block",
      },
    });
    const slotButton = $el("button", {
      textContent: `${i + 1}`,
      style: {
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        padding: "0",
        borderRadius: "3px",
        border: "1px solid #555",
        background: "#333",
        color: "#fff",
        fontSize: "15px",
        cursor: "pointer",
      },
      title: `Slot #${i + 1}`,
    });
    slotButton.addEventListener("click", () => {
      if (widget._recordMode) {
        // Save to this slot
        widget._saveSlots[i] = widget.value;
        localStorage.setItem("sigma_graph_saveSlots", JSON.stringify(widget._saveSlots));
        widget._recordMode = false;
        updateSaveSlotVisibility();
      } else {
        // Load from this slot if available
        if (widget._saveSlots[i]) {
          widget.value = widget._saveSlots[i];
          try {
            widget._points = JSON.parse(widget.value);
          } catch (e) {
            console.error(
              `[SigmaGraphWidget] Error parsing saved profile in slot ${i + 1}:`,
              e
            );
          }
          widget.drawCurve?.();
          widget.updateSigmaDisplay?.();
          console.log(`[SigmaGraphWidget] Loaded from slot ${i + 1}`);
        }
      }
    });
    widget._saveSlotButtons.push(slotButton);
    slotContainer.appendChild(slotButton);
    presetContainer.appendChild(slotContainer);
  }

  function updateSaveSlotVisibility() {
    widget._saveSlotButtons.forEach((btn, idx) => {
      // In record mode, show all slots
      if (widget._recordMode) {
        btn.style.visibility = "visible";
        btn.style.backgroundColor = "#4caf50";
      } else {
        // If a slot is saved, make it visible; otherwise, hide it
        if (widget._saveSlots[idx]) {
          btn.style.visibility = "visible";
          btn.style.backgroundColor = "#273648";
        } else {
          btn.style.visibility = "hidden";
        }
      }
    });
  }
  updateSaveSlotVisibility();

  saveModeButton.addEventListener("click", () => {
    widget._recordMode = !widget._recordMode;
    updateSaveSlotVisibility();
    // Also update the toggle button’s background color
    saveModeButton.style.background = widget._recordMode ? "#4caf50" : "#333";
  });

  // ----------------------------------------------------------------
  // 4. Hook up references
  // ----------------------------------------------------------------
  widget.sigmaDisplayContainerEl = sigmaDisplayContainer;
  widget.canvasContainerEl = canvasContainer;
  widget.presetContainerEl = presetContainer;

  // Hide the default input element (the raw text field) if present
  if (widget.inputEl) widget.inputEl.style.display = "none";

  /**
   * A method to re-generate the sigma values in text area, given the current points and steps.
   */
  widget.updateSigmaDisplay = function () {
    if (!widget.sigmaDisplayEl) return;
    const stepsWidget = node.widgets.find((w) => w.name === stepsWidgetName);
    if (!stepsWidget) {
      widget.sigmaDisplayEl.value = "Error: steps widget not found.";
      return;
    }
    const steps = stepsWidget.value;
    const sigmas = calculateSigmasJS(widget._points, steps);
    widget.sigmaDisplayEl.value = sigmas.map((s) => s.toFixed(3)).join(", ");
  };

  /**
   * Redraw the curve on the canvas.
   */
  widget.drawCurve = function () {
    const canvasEl = widget.canvasContainerEl.querySelector("canvas");
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    // Resize the canvas if needed
    if (
      Math.abs(canvasEl.width - rect.width) > 1 ||
      Math.abs(canvasEl.height - rect.height) > 1
    ) {
      canvasEl.width = rect.width;
      canvasEl.height = rect.height;
    }
    const ctx = canvasEl.getContext("2d");
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    // Draw background grid
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let i = 1; i < 10; i++) {
      const vx = (i * canvasEl.width) / 10;
      const vy = (i * canvasEl.height) / 10;
      ctx.moveTo(vx, 0);
      ctx.lineTo(vx, canvasEl.height);
      ctx.moveTo(0, vy);
      ctx.lineTo(canvasEl.width, vy);
    }
    ctx.stroke();

    // Sort points by x
    const sortedPoints = [...widget._points].sort((a, b) => a.x - b.x);

    // Draw the line
    ctx.strokeStyle = "white";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    sortedPoints.forEach((pt, idx) => {
      const px = pt.x * canvasEl.width;
      const py = (1 - pt.y) * canvasEl.height;
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Draw the control points
    widget._points.forEach((pt, idx) => {
	  // Compute ratio for interpolation across the total number of points.
	  const ratio = idx / (widget._points.length - 1);
	  // Define start and end colors:
	  const startColor = { r: 61, g: 3, b: 0 };   // Black
	  const endColor   = { r: 255, g: 0, b: 0 };   // Red

	  // Linear interpolation for each channel:
	  const r = Math.round(startColor.r + ratio * (endColor.r - startColor.r));
	  const g = Math.round(startColor.g + ratio * (endColor.g - startColor.g));
	  const b = Math.round(startColor.b + ratio * (endColor.b - startColor.b));
	  
	  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
	  
	  const px = pt.x * canvasEl.width;
	  const py = (1 - pt.y) * canvasEl.height;
	  ctx.beginPath();
	  ctx.arc(px, py, 4, 0, Math.PI * 2);
	  ctx.fill();
	});


  };

  // ----------------------------------------------------------------
  // 5. Updating the underlying widget value (the JSON string)
  //    whenever the user modifies points
  // ----------------------------------------------------------------
  widget._points = [];
  const updateValue = (function () {
    let timer = null;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(() => {
        widget._points.sort((a, b) => a.x - b.x);
        const serialized = JSON.stringify(widget._points);
        if (widget.value !== serialized) {
          widget.value = serialized;
          if (widget.callback) widget.callback(widget.value);
          node.setDirtyCanvas(true, true);
          // ALSO refresh the text area with new sigmas
          widget.updateSigmaDisplay?.();
        }
      }, 80);
    };
  })();

  // ----------------------------------------------------------------
  // 6. “Apply” button event:
  //    Rebuild points from typed sigma values, one point per step
  // ----------------------------------------------------------------
  applyButton.addEventListener("click", () => {
    const stepsWidget = node.widgets.find((w) => w.name === stepsWidgetName);
    if (!stepsWidget) {
      alert("Error: 'steps' widget not found.");
      return;
    }
    const steps = stepsWidget.value;
    const textValue = sigmaDisplay.value.trim();
    if (!textValue) {
      alert("Error: Sigma text input is empty.");
      return;
    }
    const parts = textValue.split(",").map((s) => s.trim()).filter((s) => s !== "");
    const parsedSigmas = parts.map(Number);

    if (parsedSigmas.some(isNaN)) {
      alert("Error: Input contains non-numeric values.");
      return;
    }
    if (parsedSigmas.length !== steps) {
      alert(`Error: Expected ${steps} sigma values, got ${parsedSigmas.length}.`);
      return;
    }

    // Rebuild the entire _points array from typed sigmas
    const newPoints = [];
    if (steps === 1) {
      newPoints.push({ x: 0, y: parsedSigmas[0] });
    } else {
      for (let i = 0; i < steps; i++) {
        const x = i / (steps - 1);
        const y = parsedSigmas[i];
        newPoints.push({ x, y });
      }
    }
    widget._points = newPoints;

    widget.drawCurve();
    updateValue();
  });

  // ----------------------------------------------------------------
  // 7. Mouse interactions on the canvas: drag, add, remove points
  // ----------------------------------------------------------------
  widget._draggingIndex = -1;
  widget._rightClickIndex = -1;

  const handleMouseUp = () => {
    if (widget._draggingIndex >= 0) {
      widget._draggingIndex = -1;
      canvas.style.cursor = "crosshair";
      updateValue();
    }
  };
  document.addEventListener("mouseup", handleMouseUp, true);

  canvas.addEventListener("mousedown", (evt) => {
    evt.stopPropagation();
    const rect = canvas.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;
    const clickRadiusSq = 64;
    widget._draggingIndex = -1;
    widget._rightClickIndex = -1;
    let closestDistSq = Infinity;
    let clickedIndex = -1;

    widget._points.forEach((pt, i) => {
      const px = pt.x * canvas.width;
      const py = (1 - pt.y) * canvas.height;
      const distSq = (px - x) ** 2 + (py - y) ** 2;
      if (distSq < clickRadiusSq && distSq < closestDistSq) {
        closestDistSq = distSq;
        clickedIndex = i;
      }
    });

    // Left button = drag, right button = mark for removal
    if (clickedIndex !== -1) {
      if (evt.button === 0) {
        widget._draggingIndex = clickedIndex;
        canvas.style.cursor = "grabbing";
      } else if (evt.button === 2) {
        widget._rightClickIndex = clickedIndex;
      }
    }
  });

  canvas.addEventListener("mousemove", (evt) => {
    const rect = canvas.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;
    if (widget._draggingIndex >= 0) {
      evt.stopPropagation();
      let nx = x / canvas.width;
      let ny = 1 - y / canvas.height;
      nx = Math.max(0, Math.min(1, nx));
      ny = Math.max(0, Math.min(1, ny));
      const point = widget._points[widget._draggingIndex];
      // Keep boundary points pinned at x=0 or x=1
      if (point.x === 0 || point.x === 1) {
        nx = point.x;
      }
      widget._points[widget._draggingIndex] = { x: nx, y: ny };
      widget.drawCurve();
      updateValue();
    } else {
      // Cursor feedback if near a point
      let hovering = false;
      const hoverRadiusSq = 64;
      widget._points.forEach((pt) => {
        const px = pt.x * canvas.width;
        const py = (1 - pt.y) * canvas.height;
        if ((px - x) ** 2 + (py - y) ** 2 < hoverRadiusSq) hovering = true;
      });
      canvas.style.cursor = hovering ? "grab" : "crosshair";
    }
  });

  canvas.addEventListener("dblclick", (evt) => {
    // Double-click to add a new control point
    evt.stopPropagation();
    const rect = canvas.getBoundingClientRect();
    let nx = (evt.clientX - rect.left) / canvas.width;
    let ny = 1 - (evt.clientY - rect.top) / canvas.height;
    nx = Math.max(0, Math.min(1, nx));
    ny = Math.max(0, Math.min(1, ny));
    widget._points.push({ x: nx, y: ny });
    widget.drawCurve();
    updateValue();
  });

  canvas.addEventListener("contextmenu", (evt) => {
    // Right-click (context menu) to remove a point (except boundaries)
    evt.preventDefault();
    evt.stopPropagation();
    if (widget._rightClickIndex >= 0) {
      const pt = widget._points[widget._rightClickIndex];
      // Only remove if it's not the forced boundary
      if (pt.x > 0 && pt.x < 1) {
        widget._points.splice(widget._rightClickIndex, 1);
        widget.drawCurve();
        updateValue();
      } else {
        console.log("[SigmaGraphWidget] Can't remove boundary points at x=0 or x=1.");
      }
    }
    widget._rightClickIndex = -1;
  });

  // ----------------------------------------------------------------
  // 8. Initialize the widget with any existing data
  // ----------------------------------------------------------------
  let initialValue =
    widget.value ?? widget.options?.default ?? '[{"x":0,"y":1},{"x":1,"y":0}]';
  try {
    widget._points = JSON.parse(initialValue);
    // Force boundary points if missing
    if (!widget._points.some((p) => p.x === 0)) widget._points.push({ x: 0, y: 1 });
    if (!widget._points.some((p) => p.x === 1)) widget._points.push({ x: 1, y: 0 });
    widget._points.sort((a, b) => a.x - b.x);
    // Remove duplicates
    widget._points = widget._points.filter(
      (p, i, arr) => !(i > 0 && p.x === arr[i - 1].x)
    );
    widget.value = JSON.stringify(widget._points);
  } catch (e) {
    console.error("[SigmaGraphWidget] Failed to parse initial JSON:", e);
    widget._points = [
      { x: 0, y: 1 },
      { x: 1, y: 0 },
    ];
    widget.value = JSON.stringify(widget._points);
  }
  widget.updateSigmaDisplay?.();

  // ----------------------------------------------------------------
  // 9. Observe size changes for the canvas container
  // ----------------------------------------------------------------
  widget.resizeObserver = new ResizeObserver(() => {
    const canvasEl = widget.canvasContainerEl.querySelector("canvas");
    if (!canvasEl) return;
    requestAnimationFrame(() => {
      widget.drawCurve?.();
    });
  });
  widget.resizeObserver.observe(widget.canvasContainerEl);

  // Cleanup if the widget is removed
  const originalOnRemoved = widget.onRemoved;
  widget.onRemoved = function () {
    document.removeEventListener("mouseup", handleMouseUp, true);
    if (widget.resizeObserver) {
      widget.resizeObserver.disconnect();
      widget.resizeObserver = null;
    }
    if (originalOnRemoved) originalOnRemoved.call(widget);
  };
}

/**
 * Register the extension with ComfyUI, patching the node definition.
 */
app.registerExtension({
  name: "sigma_graph.widget",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    // Only patch the SigmaGraphNode
    if (nodeData.name !== nodeClassName) return;

    // === Make the node non-resizable and force a fixed size ===
    nodeType.prototype.resizable = false;
    nodeType.prototype.computeSize = function () {
      // Width=290, Height=280, as an example. Adjust to taste.
      return [290, 280];
    };

    // Remove or no-op any onResize if it exists, because we've locked the size
    if (nodeType.prototype.onResize) {
      nodeType.prototype.onResize = function () {
        // No-op: size is fixed
      };
    }

    // Patch onConfigure to set up the custom widget if needed
    const originalOnConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function (info) {
      if (originalOnConfigure) {
        originalOnConfigure.call(this, info);
      }
      const graphWidget = this.widgets?.find((w) => w.name === graphWidgetName);
      if (
        graphWidget &&
        (!graphWidget.element || graphWidget.element.tagName !== "DIV")
      ) {
        setupSigmaGraph(graphWidget, this);
      }
      requestAnimationFrame(() => {
        this.setSize(this.computeSize());
      });
    };

    // Patch onRemoved to clean up the widget
    const originalOnRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      const graphWidget = this.widgets?.find((w) => w.name === graphWidgetName);
      if (graphWidget && graphWidget.onRemoved) {
        graphWidget.onRemoved();
      }
      if (originalOnRemoved) originalOnRemoved.call(this);
    };
  },

  // When a new node is created, set up the graph UI right away
  async nodeCreated(node) {
    if (node.comfyClass !== nodeClassName) return;
    setTimeout(() => {
      const graphWidget = node.widgets?.find((w) => w.name === graphWidgetName);
      if (
        graphWidget &&
        (!graphWidget.element || graphWidget.element.tagName !== "DIV")
      ) {
        setupSigmaGraph(graphWidget, node);
        requestAnimationFrame(() => {
          graphWidget.updateSigmaDisplay?.();
          graphWidget.drawCurve?.();
          node.setDirtyCanvas(true, true);
        });
      }
    }, 100);
  },
});
