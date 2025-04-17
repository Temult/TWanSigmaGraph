# Sigma Schedule Graph Node for ComfyUI & Wan‑Video

A compact, bidirectional sigma‐schedule editor for diffusion sampling.  
Sketch your noise schedule with just a handful of points. Refine the shape quickly.  
Design your conceptual curve once and use for any number of steps!  
Node will automatically extrapolate schedule to desired step count and save for later.  

---

## Features

- 🎨 **Interactive Graph**  
  Click & Drag graph points to shape your sigma curve.  
  ➕ to add new graph point for fine tuning   
  ➖ to remove one graph point.

- ✍️ **Textual Workspace**  
  The top textarea shows your control‑point y‑values.  
  Paste comma lists or full JSON point arrays.  
  Textual edits auto‑sync to the graph.

- 🔄 **Dynamic Extrapolation**  
  The bottom preview displays the final sigma list of length=`steps`.   
  Change `steps` and immediately see how your low‑point curve scales.  
  (obscured by default on-load for compactness) 

- 💾 **Save & Load Presets**  
  Toggle save‑mode with the 💾 button, then click a slot to store or recall curves.

- ℹ️ **Built‑in Help**  
  Click the ℹ️ button for quick tips.

---

## Preview

![Interactive Graph](https://github.com/user-attachments/assets/0e666fa7-b203-4233-9862-23ec066ed097)

---

## Installation

1. **Copy the Folder**  
   Place this directory under:
   
   ComfyUI/custom_nodes/TWanSigmaGraph/
   
2. **Restart ComfyUI**  
   Relaunch the server or reload your browser.

3. **Locate the Node**  
   Find **Sigma Schedule Graph** under **sampling → custom**.

---

## Usage

1. **Set Steps**  
   Adjust the `steps` input—this defines how many sigma values you’ll get.

2. **Design Your Curve**  
   • Edit the top text box or drag points on the graph.  
   • The graph and text box stay in sync.

3. **Adjust Density (Optional)**  
   Click **+ / –** to add or remove handles for finer or coarser control.

4. **View Final Sigmas (Optional)**  
   Expand the node to see the full sigma list interpolated to `steps`.

5. **Save Presets**  
   • Click 💾 to enter save mode.  
   • Click a slot to store or load a curve.

6. **Info & Reset**  
   Use the ℹ️ popup for instructions.  
   To reset, clear the node’s cache in your browser’s `localStorage`.

7. **Connect to Sampler**  
   Plug the `SIGMAS` output into any sampler that accepts custom sigma schedules (e.g. KSampler).

---

## File Structure

```
TWanSigmaGraph/
├── __init__.py                 # Node registration & widget directory
├── TWanSigmaGraph.py           # Backend: parse & interpolate points
└── js/
    └── TWanSigmaGraphWidget.js # Frontend: graph UI, text sync, presets
```

---

## Troubleshooting

- **Blank Widget on First Load**  
  Refresh the page—this alpha‑stage bug will be fixed soon.

- **Presets Not Saving**  
  Check that `localStorage` is enabled for `127.0.0.1` in your browser.

- **Curve Reverts to Default**  
  The node defaults to four points (`1.00, 0.67, 0.33, 0.00`). To clear your custom curve, delete the key `TWanSigmaGraph_last_<node.id>` in dev‑tools → Application → localStorage.

---

## Thanks & Credits

- **Realistic_Studio_930** — Curve design inspiration  
- **huchenlei** — JavaScript guidance  
- **ComfyUI Community** — Testing & feedback  

Licensed under the MIT License. See [LICENSE.txt](LICENSE.txt) for details.
```
