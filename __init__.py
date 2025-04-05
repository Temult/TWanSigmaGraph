# __init__.py in your sigma_graph folder
# This file tells ComfyUI about the custom node class and where to find its UI widget code.

from .SigmaGraphNode import NODE_CLASS_MAPPINGS

WEB_DIRECTORY = "./js"  # Serve .js files in the "js" folder as an extension.

NODE_DISPLAY_NAME_MAPPINGS = {}

__all__ = [
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "WEB_DIRECTORY",
]
