from setta.types.chat_messages import JSONValue

APP_CATALOG_ID = "setta.app.default"
APP_CATALOG_VERSION = "v1"

APP_CATALOG: JSONValue = {
    "id": APP_CATALOG_ID,
    "version": APP_CATALOG_VERSION,
    "components": [
        {
            "type": "Stack",
            "description": "Layout container for vertical or horizontal stacks.",
            "props": {
                "direction": {
                    "type": "string",
                    "enum": ["column", "row"],
                    "default": "column",
                },
                "gap": {"type": "number", "min": 0, "max": 48, "default": 16},
                "align": {
                    "type": "string",
                    "enum": ["start", "center", "end", "stretch"],
                    "default": "stretch",
                },
                "justify": {
                    "type": "string",
                    "enum": ["start", "center", "end", "between"],
                    "default": "start",
                },
                "className": {"type": "string"},
            },
            "children": True,
        },
        {
            "type": "Box",
            "description": "Generic wrapper with optional padding, radius, border, and background role.",
            "props": {
                "padding": {"type": "number", "min": 0, "max": 96, "default": 0},
                "radius": {"type": "number", "min": 0, "max": 48, "default": 0},
                "background": {
                    "type": "string",
                    "enum": ["none", "background", "surface", "surfaceAlt", "card"],
                    "default": "none",
                },
                "border": {
                    "type": "string",
                    "enum": ["none", "border", "card"],
                    "default": "none",
                },
                "className": {"type": "string"},
            },
            "children": True,
        },
        {
            "type": "Grid",
            "description": "Grid container for multi-column layouts.",
            "props": {
                "columns": {"type": "number", "min": 1, "max": 12, "default": 2},
                "gap": {"type": "number", "min": 0, "max": 48, "default": 16},
                "align": {
                    "type": "string",
                    "enum": ["start", "center", "end", "stretch"],
                    "default": "stretch",
                },
                "justify": {
                    "type": "string",
                    "enum": ["start", "center", "end", "stretch"],
                    "default": "stretch",
                },
                "className": {"type": "string"},
            },
            "children": True,
        },
        {
            "type": "Container",
            "description": "Center content and constrain its max width.",
            "props": {
                "maxWidth": {"type": "number", "min": 320, "max": 1600, "default": 1024},
                "className": {"type": "string"},
            },
            "children": True,
        },
        {
            "type": "Spacer",
            "description": "Fixed-size spacer for layout.",
            "props": {
                "size": {"type": "number", "min": 0, "max": 200, "default": 16},
                "axis": {"type": "string", "enum": ["x", "y"], "default": "y"},
                "className": {"type": "string"},
            },
            "children": False,
        },
        {
            "type": "Card",
            "description": "Framed container for grouping related fields.",
            "props": {
                "title": {"type": "string"},
                "description": {"type": "string"},
                "className": {"type": "string"},
            },
            "children": True,
        },
        {
            "type": "ConfigScope",
            "description": "Scope child components to a project config id.",
            "props": {
                "configId": {"type": "string", "required": True},
                "className": {"type": "string"},
            },
            "children": True,
        },
        {
            "type": "Tabs",
            "description": "Tabbed container for grouping content.",
            "props": {
                "defaultKey": {"type": "string"},
                "className": {"type": "string"},
            },
            "children": True,
        },
        {
            "type": "Tab",
            "description": "Single tab panel within a Tabs container.",
            "props": {
                "title": {"type": "string", "required": True},
                "className": {"type": "string"},
            },
            "children": True,
        },
        {
            "type": "Heading",
            "description": "Section heading text.",
            "props": {
                "text": {"type": "string"},
                "level": {"type": "number", "enum": [1, 2, 3, 4], "default": 2},
            },
            "children": False,
        },
        {
            "type": "Text",
            "description": "Paragraph or helper text.",
            "props": {"text": {"type": "string"}},
            "children": False,
        },
        {
            "type": "ParamInput",
            "description": "Input bound to a Setta param.",
            "props": {
                "sectionId": {"type": "string", "required": True},
                "paramId": {"type": "string", "required": True},
                "label": {"type": "string"},
                "description": {"type": "string"},
                "dataPath": {"type": "string"},
            },
            "children": False,
        },
        {
            "type": "ActionButton",
            "description": "Button that triggers a named action.",
            "props": {
                "label": {"type": "string", "required": True},
                "action": {"type": "string", "required": True},
                "sectionId": {"type": "string"},
                "dataPath": {"type": "string"},
            },
            "children": False,
        },
        {
            "type": "TextOutput",
            "description": "Display a TextBlock section output.",
            "props": {
                "sectionId": {"type": "string", "required": True},
                "label": {"type": "string"},
                "dataPath": {"type": "string"},
            },
            "children": False,
        },
        {
            "type": "ImageOutput",
            "description": "Display an image artifact by id.",
            "props": {
                "artifactId": {"type": "string", "required": True},
                "alt": {"type": "string"},
                "dataPath": {"type": "string"},
            },
            "children": False,
        },
        {
            "type": "Divider",
            "description": "Visual divider.",
            "props": {"className": {"type": "string"}},
            "children": False,
        },
    ],
    "actions": [
        {
            "name": "run",
            "description": "Run a section or entry code block.",
            "params": {"sectionId": {"type": "string"}},
        },
        {
            "name": "reset",
            "description": "Reset bound params to defaults.",
            "params": {},
        },
        {
            "name": "downloadArtifact",
            "description": "Download an artifact by id.",
            "params": {"artifactId": {"type": "string"}},
        },
        {
            "name": "downloadBinary",
            "description": "Download a binary content payload by id.",
            "params": {"contentId": {"type": "string"}},
        },
        {
            "name": "openExternalLink",
            "description": "Open an external link.",
            "params": {"url": {"type": "string"}},
        },
    ],
}


def list_app_components() -> list[str]:
    components = APP_CATALOG.get("components")
    if not isinstance(components, list):
        return []
    output: list[str] = []
    for item in components:
        if not isinstance(item, dict):
            continue
        type_name = item.get("type")
        if isinstance(type_name, str):
            output.append(type_name)
    return output
