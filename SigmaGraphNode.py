# Import necessary libraries
import json
import torch
import math # Import math for isnan

class SigmaGraphNode:
    """
    A ComfyUI node that generates a sigma schedule tensor based on user-defined
    points edited via a custom graph widget in the UI. It also outputs the
    number of steps used. The schedule typically decreases from high sigma
    (noise) to low sigma.
    """
    # Define a small epsilon for floating point comparisons
    EPSILON = 1e-6

    @classmethod
    def INPUT_TYPES(cls):
        default_points = json.dumps([
            {"x": 0.0, "y": 1.0},
            {"x": 1.0, "y": 0.0}
        ])
        return {
            "required": {
                "steps": ("INT", {
                    "default": 20, "min": 1, "max": 1000,
                }),
                # 'graph_data': JSON string representing points [{x, y}, ...].
                # This is now primarily for storing the state set by the JS widget.
                # It no longer has a 'widget' association in Python.
                "graph_data": ("STRING", {
                    "default": default_points,
                    "multiline": True, # Keep multiline for easier debugging if needed
                }),
            },
        }

    RETURN_TYPES = ("SIGMAS", "INT",)
    RETURN_NAMES = ("sigmas", "steps",)
    FUNCTION = "calculate_sigmas"
    CATEGORY = "sampling/custom_sampling"

    def _validate_and_clean_points(self, points_data_str):
        """ Parses, validates, and cleans the points data. """
        points = []
        default_points_list = [{"x": 0.0, "y": 1.0}, {"x": 1.0, "y": 0.0}]
        try:
            points_data = json.loads(points_data_str)
            if not isinstance(points_data, list):
                raise ValueError("Graph data is not a list.")

            # Filter for valid point structure and numeric types, check for NaN/Infinity
            valid_points = []
            for p in points_data:
                if isinstance(p, dict) and 'x' in p and 'y' in p and \
                   isinstance(p['x'], (int, float)) and not math.isnan(p['x']) and not math.isinf(p['x']) and \
                   isinstance(p['y'], (int, float)) and not math.isnan(p['y']) and not math.isinf(p['y']):
                    valid_points.append({"x": float(p['x']), "y": float(p['y'])}) # Ensure float type
                else:
                    print(f"[SigmaGraphNode Warning] Ignoring invalid point data: {p}")

            points = valid_points
            if len(points) != len(points_data):
                 print("[SigmaGraphNode Warning] Some points in graph_data were invalid and ignored.")

        except (json.JSONDecodeError, ValueError, TypeError) as e:
            print(f"[SigmaGraphNode Warning] Invalid graph_data input: {e}. Using default points.")
            return default_points_list # Return default on parse error

        if not points:
             print("[SigmaGraphNode Warning] No valid points found after filtering. Using default points.")
             return default_points_list

        # Ensure boundary points exist using a tolerance
        has_start = any(abs(p['x'] - 0.0) < self.EPSILON for p in points)
        has_end = any(abs(p['x'] - 1.0) < self.EPSILON for p in points)

        if not has_start:
            # Find point closest to x=0 to determine y-value, or default to 1.0
            start_y = min(points, key=lambda p: abs(p['x'] - 0.0))['y'] if points else 1.0
            points.append({"x": 0.0, "y": start_y})
            print("[SigmaGraphNode Info] Added missing start point (x=0).")
        if not has_end:
            # Find point closest to x=1 to determine y-value, or default to 0.0
            end_y = min(points, key=lambda p: abs(p['x'] - 1.0))['y'] if points else 0.0
            points.append({"x": 1.0, "y": end_y})
            print("[SigmaGraphNode Info] Added missing end point (x=1).")

        # Sort points by x-coordinate
        points.sort(key=lambda p: p["x"])

        # Remove duplicate points based on x-coordinate with tolerance
        unique_points = []
        if points:
            unique_points.append(points[0])
            last_x = points[0]['x']
            for i in range(1, len(points)):
                if abs(points[i]["x"] - last_x) > self.EPSILON:
                    unique_points.append(points[i])
                    last_x = points[i]['x']
                else:
                     print(f"[SigmaGraphNode Warning] Removing duplicate point near x={points[i]['x']}.")


        # Ensure minimum number of points (e.g., 2 for interpolation)
        if len(unique_points) < 2:
             print("[SigmaGraphNode Warning] Not enough unique points after cleanup. Using default points.")
             return default_points_list

        return unique_points

    def calculate_sigmas(self, steps, graph_data):
        """
        Calculates a sigma schedule tensor and returns it along with the steps.
        """
        steps = max(1, int(steps))
        points = self._validate_and_clean_points(graph_data)
        num_sigmas_to_generate = steps

        # --- Perform Interpolation ---
        sigma_values = []
        current_point_idx = 0

        # Handle steps = 1 case separately for clarity
        if steps == 1:
             # Find point at x=0
             start_point = next((p for p in points if abs(p['x'] - 0.0) < self.EPSILON), points[0])
             sigma_values.append(max(0.001, start_point['y']))
        else:
            for i in range(num_sigmas_to_generate):
                step_progress = i / (steps - 1)
                step_progress = min(1.0, max(0.0, step_progress)) # Clamp progress [0, 1]

                # Find the correct segment [p1, p2] for interpolation
                # Advance index while the *next* point's x is less than current progress
                while (current_point_idx < len(points) - 2 and
                       points[current_point_idx + 1]["x"] < step_progress - self.EPSILON):
                    current_point_idx += 1

                p1 = points[current_point_idx]
                # Ensure p2 is the next point, or clamp to the last point if already there
                p2 = points[min(current_point_idx + 1, len(points) - 1)]

                x_diff = p2["x"] - p1["x"]
                sigma = 0.0

                # Check for vertical segment or identical points
                if x_diff <= self.EPSILON:
                    # If progress is closer to p2.x, use p2.y, otherwise use p1.y
                    sigma = p2["y"] if abs(step_progress - p2["x"]) < abs(step_progress - p1["x"]) else p1["y"]
                else:
                    # Standard linear interpolation
                    # Clamp progress to the segment bounds before calculating ratio
                    clamped_progress = max(p1["x"], min(p2["x"], step_progress))
                    ratio = (clamped_progress - p1["x"]) / x_diff
                    # Ensure ratio is valid [0, 1] due to potential float errors
                    ratio = max(0.0, min(1.0, ratio))
                    sigma = p1["y"] + ratio * (p2["y"] - p1["y"])

                # Ensure sigma is positive and non-zero
                sigma_values.append(max(0.001, sigma))

        # Convert the final list of sigma values to a PyTorch tensor
        sigmas_tensor = torch.tensor(sigma_values, dtype=torch.float32)

        # print(f"[SigmaGraphNode Debug] Calculated Sigmas ({len(sigma_values)} values, first 5): {sigmas_tensor[:5]}...")
        return (sigmas_tensor, steps,)

# --- Node Registration ---
NODE_CLASS_MAPPINGS = { "SigmaGraphNode": SigmaGraphNode }
NODE_DISPLAY_NAME_MAPPINGS = { "SigmaGraphNode": "Sigma Schedule Graph" }
