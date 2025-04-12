# Sigma Graph Node for [ComfyUI](https://github.com/comfyanonymous/ComfyUI) and [Wan-Video](https://github.com/Wan-Video)

Prototype - Node is in early development, not intended for active use. 

**A compact, bidirectional editor for sigma schedules used in diffusion sampling.**

- 📈 **Interactive Graph:** Drag points on the graph to shape your sigma schedule.
- ✍️ **Text Editing:** Edit sigma values directly in the text box – changes are auto-synced.
- 🔁 **Apply Changes:** Click the ▼ button to apply text changes to the graph.
- 💾 **Presets:** Save/load custom curve presets with the 💾 button.

![screen1](https://github.com/user-attachments/assets/5de063e7-8034-4827-b48e-308af790de91)

> **Note:** On first load the node's UI may render incorrectly (it may appear empty). If this happens, please refresh the page until the issue is resolved. This is a known alpha-stage bug that will be addressed in future updates.

## Installation

1. **Copy the Folder:**  
   Copy this folder to your ComfyUI custom nodes directory:  
   `ComfyUI/custom_nodes/sigma_graph`
2. **Restart ComfyUI:**  
   Restart ComfyUI so that it can register the new node.
3. **Locate the Node:**  
   In the ComfyUI interface, find **SigmaGraphNode** under the **sampling → custom** category.

## How to Use

![screen2](https://github.com/user-attachments/assets/571a47bb-d376-48c2-9bdc-0a70eec291ea)

1. **Set Steps:**  
   Adjust the `steps` input to define the number of sampling steps. The output sigma tensor will contain `steps + 1` values.
2. **Design Your Curve:**  
   Use either the interactive graph or the text box to shape your sigma curve.
3. **Apply & Sync:**  
   - Click the ▼ button to apply the sigma values from the text box to update the graph.
   - The graph and the text box are automatically synced.
4. **Connect the Output:**  
   Connect the output labeled `SIGMAS` to your preferred diffusion sampler (e.g., KSampler) that supports external sigma schedules.
5. **Save Presets (Optional):**  
   - Toggle the save mode using the 💾 button.
   - Click on a preset slot to save the current curve or load a previously saved curve.

## File Overview

| File                     | Purpose                                                   |
|--------------------------|-----------------------------------------------------------|
| `__init__.py`            | Registers the node and instructs ComfyUI where to find the widget code  |
| `SigmaGraphNode.py`      | Contains the backend logic to generate the sigma tensor schedule  |
| `js/SigmaGraphWidget.js` | Implements the custom graph widget UI (drag, sync, and presets)       |

## Troubleshooting

- **Node Not Rendering Correctly:**  
  On the first load, the node’s widget may sometimes render incorrectly (e.g., it might appear empty). Simply refresh the page until the widget appears as expected.
- **Empty or Incorrect Presets:**  
  Ensure that your browser’s local storage is not blocking data saves if presets aren’t showing.

## Thanks

- **Realistic_Studio_930:**  
  For introducing the concept of sigma schedules and inspiring the graph’s design.
- **huchenlei:**  
  For providing invaluable guidance and reviewing the JavaScript implementation.
- **Google & OpenAI:**  
  Special thanks to Gemini 2.5 Pro and ChatGPT, which were instrumental in refining the development process.

## License

This project is released under the MIT License. See the [LICENSE.txt](LICENSE.txt) file for details.
