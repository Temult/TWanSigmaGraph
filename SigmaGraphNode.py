import json
import torch

class SigmaGraphNode:
    @classmethod
    def INPUT_TYPES(cls):
        """
        Defines what inputs the node expects.
        'graph_data' is a JSON string that the custom JS widget manipulates.
        """
        default_points = json.dumps([
            {"x": 0.0, "y": 1.0},
            {"x": 0.5, "y": 0.5},
            {"x": 1.0, "y": 0.0}
        ])
        return {
            "required": {
                "steps": ("INT", {"default": 20, "min": 1, "max": 200}),
                "graph_data": (
                    "STRING",
                    {
                        "default": default_points,
                        "widget": "sigma_graph",
                        "multiline": True,
                        "forceInput": False,
                    },
                ),
            },
        }

    # We only return the sigma schedule, no extra text debug info.
    RETURN_TYPES = ("SIGMAS",)  # single output
    RETURN_NAMES = ("sigmas",)
    FUNCTION = "calculate_sigmas"
    CATEGORY = "sampling/custom"

    def calculate_sigmas(self, steps, graph_data):
        """
        This method receives 'graph_data' (the JSON string from the UI) and 'steps',
        then computes the sigma schedule.
        """
        try:
            points = json.loads(graph_data)
        except json.JSONDecodeError:
            # Fallback to a simple linear schedule if JSON is invalid.
            points = []

        # If the user didn't provide valid points, or fewer than 2 points, do a simple linear fallback.
        if not points or len(points) < 2:
            sigma_values = [
                1.0 - (i / (steps - 1 if steps > 1 else 1))
                for i in range(steps)
            ]
            sigma_values.reverse()
            sigmas_tensor = torch.tensor(sigma_values, dtype=torch.float32)
            return (sigmas_tensor,)

        # Sort by x-value
        points.sort(key=lambda p: p["x"])
        # Ensure a point at x=0 and x=1 for boundary conditions
        if points[0]["x"] > 0:
            points.insert(0, {"x": 0.0, "y": points[0]["y"]})
        if points[-1]["x"] < 1:
            points.append({"x": 1.0, "y": points[-1]["y"]})

        sigma_values = []
        current_idx = 0

        for i in range(steps):
            step_progress = i / (steps - 1 if steps > 1 else 1)

            # Move the current point index if needed
            while (current_idx < len(points) - 2 and
                   points[current_idx + 1]["x"] <= step_progress):
                current_idx += 1

            p1 = points[current_idx]
            p2 = points[min(current_idx + 1, len(points) - 1)]

            if p2["x"] <= p1["x"]:
                # If points overlap or are invalid
                sigma = p1["y"]
            else:
                # Linear interpolation
                ratio = (step_progress - p1["x"]) / (p2["x"] - p1["x"])
                sigma = p1["y"] + ratio * (p2["y"] - p1["y"])

            # Keep sigma above 0 for safety
            sigma_values.append(max(0.001, sigma))

        # Reverse the final schedule to match typical usage
        sigma_values.reverse()

        # Convert to a PyTorch tensor
        sigmas_tensor = torch.tensor(sigma_values, dtype=torch.float32)
        return (sigmas_tensor,)

# Map the class name to the node name
NODE_CLASS_MAPPINGS = {"SigmaGraphNode": SigmaGraphNode}
NODE_DISPLAY_NAME_MAPPINGS = {}
