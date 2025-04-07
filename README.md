Edit: On first load, the node may render incorrectly. If empty, please refresh page until I can track down the cause.

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

## Thanks
- Special thanks to Realistic_Studio_930 for introducing me to sigma schedules and inspiring the graph.
- Special thanks as well to huchenlei for graciously helping review and guide the js portion of this code
- Special thanks to Google and OpenAI - Gemini 2.5 Pro and ChatGPT o1/o3-mini(high) were utilized during this project

## File Overview

| File                     | Purpose                                              |
|--------------------------|------------------------------------------------------|
| `__init__.py`            | Registers the node and loads the front-end widget    |
| `SigmaGraphNode.py`      | Backend logic: interpolates a sigma tensor schedule  |
| `js/SigmaGraphWidget.js` | Custom graph widget UI (drag, sync, presets)         |

## Screenshots

![screen1](https://github.com/user-attachments/assets/5de063e7-8034-4827-b48e-308af790de91)
![screen2](https://github.com/user-attachments/assets/571a47bb-d376-48c2-9bdc-0a70eec291ea)


