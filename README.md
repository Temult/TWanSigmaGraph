3. **Restart** or **start** ComfyUI.  
4. Look under **Nodes → sampling → custom** in ComfyUI’s UI. The **`SigmaGraphNode`** should appear.

## Usage

1. **Add** the Sigma Graph Node to your ComfyUI workflow.  
2. **Connect** its output (`SIGMAS`) to a sampler that accepts custom sigmas (for example, a KSampler node set to external sigmas).  
3. **Adjust** the `steps` parameter.  
4. **Drag** points on the graph or **edit** the sigma values in the text box (comma-separated).  
- Click the **▼** button to apply text changes to the graph.  
- The node automatically recalculates your schedule after each drag or text edit.  
5. **(Optional)** Use the presets to save and load different graph shapes.

## File Overview

- **`__init__.py`**  
Ties this folder into ComfyUI’s extension system. Sets the `WEB_DIRECTORY` to the `js` subfolder so ComfyUI can serve `SigmaGraphWidget.js`.

- **`SigmaGraphNode.py`**  
Defines the custom node class. Handles:
- Input parameters: `steps` (int) and `graph_data` (JSON string).
- Conversion of graph points into a PyTorch tensor of sigmas.
- The final reversed schedule (since many ComfyUI samplers read sigmas in that order).

- **`SigmaGraphWidget.js`**  
JavaScript front-end controlling the **interactive graph** and the **bidirectional** text input. It:
- Registers a custom DOM widget type (`"sigma_graph"`).
- Draws a canvas for the curve, with points you can drag, double-click, or remove by right-click.
- Syncs changes to the node’s internal JSON string value (`graph_data`).
- Updates a live text preview of the sigma schedule and can parse new sigma values from the text.

## Contributing

Feel free to open issues or pull requests if you have improvements or bug fixes!

---

**Happy sampling!** Enjoy your interactive sigma graph editor.
