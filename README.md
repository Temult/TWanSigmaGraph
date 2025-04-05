# Sigma Graph Node for ComfyUI

A compact, bidirectional editor for sigma schedules in diffusion sampling.

- 📈 Drag points on a graph to shape the schedule
- ✍️ Edit sigma values in text form (auto-synced)
- 🔁 Click ▼ to apply text changes to the graph
- 💾 Save/load custom curve presets

## Installation

1. Copy this folder to: `ComfyUI/custom_nodes/sigma_graph`
2. Restart ComfyUI
3. Look for **SigmaGraphNode** under **sampling → custom**

## How to Use

1. Set your desired `steps`
2. Use the graph or text box to shape the sigma curve
3. Connect the output (`SIGMAS`) to a sampler that supports external schedules (e.g., KSampler)
4. (Optional) Use the 💾 button to toggle save mode and store/load your favorite curves

## File Overview

| File                     | Purpose                                              |
|--------------------------|------------------------------------------------------|
| `__init__.py`            | Registers the node and loads the front-end widget    |
| `SigmaGraphNode.py`      | Backend logic: interpolates a sigma tensor schedule  |
| `js/SigmaGraphWidget.js` | Custom graph widget UI (drag, sync, presets)         |

## Screenshots
![sreenie1](https://github.com/user-attachments/assets/cd109324-e47d-48bf-883f-059edf733159)
![sreenie2](https://github.com/user-attachments/assets/277a2617-8c78-440d-bfe6-cb23b2062e4e)


