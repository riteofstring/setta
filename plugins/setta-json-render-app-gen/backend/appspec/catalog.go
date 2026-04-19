package appspec

import "sort"

type PropType string

const (
	PropTypeString    PropType = "string"
	PropTypeNumber    PropType = "number"
	PropTypeDimension PropType = "dimension"
	PropTypeBoolean   PropType = "boolean"
)

const (
	DefaultCatalogID      = "setta.app.default"
	DefaultCatalogVersion = "v1"
)

type PropSchema struct {
	Type       PropType
	Responsive bool
	Required   bool
	Min        *float64
	Max        *float64
	Enum       []any
	Default    any
}

type ComponentSchema struct {
	Type      string
	Children  bool
	Props     map[string]PropSchema
	PropOrder []string
}

type Catalog struct {
	ID         string
	Version    string
	Components map[string]ComponentSchema
	Actions    map[string]struct{}
}

var defaultCatalogComponentOrder = []string{
	"Stack",
	"Box",
	"Grid",
	"Container",
	"Spacer",
	"Motion",
	"Stagger",
	"Card",
	"ConfigScope",
	"Tabs",
	"Tab",
	"Heading",
	"Text",
	"ParamInput",
	"ActionButton",
	"TextOutput",
	"ImageOutput",
	"Divider",
}

var defaultCatalogActionOrder = []string{
	"run",
	"reset",
	"downloadArtifact",
	"downloadBinary",
	"openExternalLink",
}

var defaultCatalogComponentDescriptions = map[string]string{
	"Stack":        "Layout container for vertical or horizontal stacks.",
	"Box":          "Generic wrapper with optional padding, radius, border, and background role.",
	"Grid":         "Grid container for multi-column layouts.",
	"Container":    "Center content and constrain its max width.",
	"Spacer":       "Fixed-size spacer for layout.",
	"Motion":       "Animate children on mount using built-in motion presets.",
	"Stagger":      "Animate direct children with incremental delays.",
	"Card":         "Framed container for grouping related fields.",
	"ConfigScope":  "Scope child components to a project config id.",
	"Tabs":         "Tabbed container for grouping content.",
	"Tab":          "Single tab panel within a Tabs container.",
	"Heading":      "Section heading text.",
	"Text":         "Paragraph or helper text.",
	"ParamInput":   "Input bound to a Setta param.",
	"ActionButton": "Button that triggers a named action.",
	"TextOutput":   "Display a TextBlock section output.",
	"ImageOutput":  "Display an image artifact by id.",
	"Divider":      "Visual divider.",
}

func numberProp(min float64, max float64, required bool, responsive bool, enum ...any) PropSchema {
	minValue := min
	maxValue := max
	return PropSchema{
		Type:       PropTypeNumber,
		Responsive: responsive,
		Required:   required,
		Min:        &minValue,
		Max:        &maxValue,
		Enum:       append([]any(nil), enum...),
	}
}

func dimensionProp(min float64, max float64, responsive bool) PropSchema {
	minValue := min
	maxValue := max
	return PropSchema{
		Type:       PropTypeDimension,
		Responsive: responsive,
		Min:        &minValue,
		Max:        &maxValue,
	}
}

func stringProp(required bool, enum ...string) PropSchema {
	values := make([]any, 0, len(enum))
	for _, value := range enum {
		values = append(values, value)
	}
	return PropSchema{
		Type:     PropTypeString,
		Required: required,
		Enum:     values,
	}
}

func propWithDefault(schema PropSchema, value any) PropSchema {
	schema.Default = value
	return schema
}

func DefaultCatalog() Catalog {
	return Catalog{
		ID:      DefaultCatalogID,
		Version: DefaultCatalogVersion,
		Components: map[string]ComponentSchema{
			"Stack": {
				Type:     "Stack",
				Children: true,
				Props: map[string]PropSchema{
					"direction": propWithDefault(stringProp(false, "column", "row"), "column"),
					"gap":       propWithDefault(dimensionProp(0, 48, true), float64(16)),
					"align":     propWithDefault(stringProp(false, "start", "center", "end", "stretch"), "stretch"),
					"justify":   propWithDefault(stringProp(false, "start", "center", "end", "between"), "start"),
					"className": stringProp(false),
				},
			},
			"Box": {
				Type:     "Box",
				Children: true,
				Props: map[string]PropSchema{
					"padding":    propWithDefault(dimensionProp(0, 96, true), float64(0)),
					"radius":     propWithDefault(dimensionProp(0, 48, true), float64(0)),
					"background": propWithDefault(stringProp(false, "none", "background", "surface", "surfaceAlt", "card"), "none"),
					"border":     propWithDefault(stringProp(false, "none", "border", "card"), "none"),
					"className":  stringProp(false),
				},
			},
			"Grid": {
				Type:     "Grid",
				Children: true,
				Props: map[string]PropSchema{
					"columns":   propWithDefault(numberProp(1, 12, false, true), float64(2)),
					"gap":       propWithDefault(dimensionProp(0, 48, true), float64(16)),
					"align":     propWithDefault(stringProp(false, "start", "center", "end", "stretch"), "stretch"),
					"justify":   propWithDefault(stringProp(false, "start", "center", "end", "stretch"), "stretch"),
					"className": stringProp(false),
				},
			},
			"Container": {
				Type:     "Container",
				Children: true,
				Props: map[string]PropSchema{
					"maxWidth":  propWithDefault(dimensionProp(320, 1600, true), float64(1024)),
					"className": stringProp(false),
				},
			},
			"Spacer": {
				Type:     "Spacer",
				Children: false,
				Props: map[string]PropSchema{
					"size":      propWithDefault(dimensionProp(0, 200, true), float64(16)),
					"axis":      propWithDefault(stringProp(false, "x", "y"), "y"),
					"className": stringProp(false),
				},
			},
			"Motion": {
				Type:     "Motion",
				Children: true,
				Props: map[string]PropSchema{
					"preset":     propWithDefault(stringProp(false, "none", "fadeIn", "slideUp", "slideDown", "slideLeft", "slideRight", "scaleIn"), "fadeIn"),
					"durationMs": propWithDefault(numberProp(0, 5000, false, false), float64(220)),
					"delayMs":    propWithDefault(numberProp(0, 5000, false, false), float64(0)),
					"easing":     stringProp(false),
					"className":  stringProp(false),
				},
			},
			"Stagger": {
				Type:     "Stagger",
				Children: true,
				Props: map[string]PropSchema{
					"preset":     propWithDefault(stringProp(false, "none", "fadeIn", "slideUp", "slideDown", "slideLeft", "slideRight", "scaleIn"), "fadeIn"),
					"durationMs": propWithDefault(numberProp(0, 5000, false, false), float64(220)),
					"delayMs":    propWithDefault(numberProp(0, 5000, false, false), float64(0)),
					"staggerMs":  propWithDefault(numberProp(0, 2000, false, false), float64(70)),
					"easing":     stringProp(false),
					"className":  stringProp(false),
				},
			},
			"Card": {
				Type:     "Card",
				Children: true,
				Props: map[string]PropSchema{
					"title":       stringProp(false),
					"description": stringProp(false),
					"className":   stringProp(false),
				},
			},
			"ConfigScope": {
				Type:     "ConfigScope",
				Children: true,
				Props: map[string]PropSchema{
					"configId":  stringProp(true),
					"className": stringProp(false),
				},
				PropOrder: []string{"configId", "className"},
			},
			"Tabs": {
				Type:     "Tabs",
				Children: true,
				Props: map[string]PropSchema{
					"defaultKey": stringProp(false),
					"className":  stringProp(false),
				},
			},
			"Tab": {
				Type:     "Tab",
				Children: true,
				Props: map[string]PropSchema{
					"title":     stringProp(true),
					"className": stringProp(false),
				},
				PropOrder: []string{"title", "className"},
			},
			"Heading": {
				Type:     "Heading",
				Children: false,
				Props: map[string]PropSchema{
					"text":  stringProp(false),
					"level": propWithDefault(numberProp(1, 4, false, false, float64(1), float64(2), float64(3), float64(4)), float64(2)),
				},
			},
			"Text": {
				Type:     "Text",
				Children: false,
				Props: map[string]PropSchema{
					"text": stringProp(false),
				},
			},
			"ParamInput": {
				Type:     "ParamInput",
				Children: false,
				Props: map[string]PropSchema{
					"configId":    stringProp(false),
					"sectionId":   stringProp(true),
					"paramId":     stringProp(true),
					"label":       stringProp(false),
					"description": stringProp(false),
					"dataPath":    stringProp(false),
				},
				PropOrder: []string{"configId", "sectionId", "paramId", "label", "description", "dataPath"},
			},
			"ActionButton": {
				Type:     "ActionButton",
				Children: false,
				Props: map[string]PropSchema{
					"label":     stringProp(true),
					"action":    stringProp(true),
					"configId":  stringProp(false),
					"sectionId": stringProp(false),
					"dataPath":  stringProp(false),
				},
				PropOrder: []string{"label", "action", "configId", "sectionId", "dataPath"},
			},
			"TextOutput": {
				Type:     "TextOutput",
				Children: false,
				Props: map[string]PropSchema{
					"configId":  stringProp(false),
					"sectionId": stringProp(true),
					"label":     stringProp(false),
					"dataPath":  stringProp(false),
				},
				PropOrder: []string{"configId", "sectionId", "label", "dataPath"},
			},
			"ImageOutput": {
				Type:     "ImageOutput",
				Children: false,
				Props: map[string]PropSchema{
					"configId":   stringProp(false),
					"artifactId": stringProp(true),
					"alt":        stringProp(false),
					"dataPath":   stringProp(false),
				},
				PropOrder: []string{"configId", "artifactId", "alt", "dataPath"},
			},
			"Divider": {
				Type:     "Divider",
				Children: false,
				Props: map[string]PropSchema{
					"className": stringProp(false),
				},
			},
		},
		Actions: map[string]struct{}{
			"run":              {},
			"reset":            {},
			"downloadArtifact": {},
			"downloadBinary":   {},
			"openExternalLink": {},
		},
	}
}

func DefaultComponentTypes() []string {
	return append([]string(nil), defaultCatalogComponentOrder...)
}

func DefaultCatalogJSON() map[string]any {
	catalog := DefaultCatalog()
	components := make([]any, 0, len(defaultCatalogComponentOrder))
	for _, componentType := range defaultCatalogComponentOrder {
		component, ok := catalog.Components[componentType]
		if !ok {
			continue
		}
		components = append(components, defaultCatalogComponentJSON(component))
	}

	return map[string]any{
		"id":         catalog.ID,
		"version":    catalog.Version,
		"components": components,
		"actions":    defaultCatalogActionsJSON(),
	}
}

func defaultCatalogComponentJSON(component ComponentSchema) map[string]any {
	propNames := make([]string, 0, len(component.Props))
	for propName := range component.Props {
		propNames = append(propNames, propName)
	}
	sort.Strings(propNames)

	props := make(map[string]any, len(component.Props))
	for _, propName := range propNames {
		props[propName] = defaultCatalogPropJSON(component.Props[propName])
	}

	return map[string]any{
		"type":        component.Type,
		"description": defaultCatalogComponentDescription(component.Type),
		"props":       props,
		"children":    component.Children,
	}
}

func orderedComponentPropKeys(component ComponentSchema) []string {
	ordered := make([]string, 0, len(component.Props))
	seen := make(map[string]struct{}, len(component.Props))
	for _, propName := range component.PropOrder {
		if _, ok := component.Props[propName]; !ok {
			continue
		}
		ordered = append(ordered, propName)
		seen[propName] = struct{}{}
	}
	remaining := make([]string, 0, len(component.Props)-len(seen))
	for propName := range component.Props {
		if _, ok := seen[propName]; ok {
			continue
		}
		remaining = append(remaining, propName)
	}
	sort.Strings(remaining)
	return append(ordered, remaining...)
}

func defaultCatalogPropJSON(prop PropSchema) map[string]any {
	payload := map[string]any{
		"type": string(prop.Type),
	}
	if prop.Responsive {
		payload["responsive"] = true
	}
	if prop.Required {
		payload["required"] = true
	}
	if prop.Min != nil {
		payload["min"] = *prop.Min
	}
	if prop.Max != nil {
		payload["max"] = *prop.Max
	}
	if len(prop.Enum) > 0 {
		payload["enum"] = append([]any(nil), prop.Enum...)
	}
	if prop.Default != nil {
		payload["default"] = prop.Default
	}
	return payload
}

func defaultCatalogComponentDescription(componentType string) string {
	return defaultCatalogComponentDescriptions[componentType]
}

func defaultCatalogActionsJSON() []any {
	actions := make([]any, 0, len(defaultCatalogActionOrder))
	for _, actionName := range defaultCatalogActionOrder {
		actions = append(actions, map[string]any{
			"name":        actionName,
			"description": defaultCatalogActionDescription(actionName),
			"params":      defaultCatalogActionParams(actionName),
		})
	}
	return actions
}

func defaultCatalogActionDescription(actionName string) string {
	switch actionName {
	case "run":
		return "Run a section or entry code block."
	case "reset":
		return "Reset bound params to defaults."
	case "downloadArtifact":
		return "Download an artifact by id."
	case "downloadBinary":
		return "Download a binary content payload by id."
	case "openExternalLink":
		return "Open an external link."
	default:
		return ""
	}
}

func defaultCatalogActionParams(actionName string) map[string]any {
	switch actionName {
	case "run":
		return map[string]any{
			"sectionId": map[string]any{"type": "string"},
		}
	case "downloadArtifact":
		return map[string]any{
			"artifactId": map[string]any{"type": "string"},
		}
	case "downloadBinary":
		return map[string]any{
			"contentId": map[string]any{"type": "string"},
		}
	case "openExternalLink":
		return map[string]any{
			"url": map[string]any{"type": "string"},
		}
	default:
		return map[string]any{}
	}
}
