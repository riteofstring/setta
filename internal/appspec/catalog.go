package appspec

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
}

type ComponentSchema struct {
	Type     string
	Children bool
	Props    map[string]PropSchema
}

type Catalog struct {
	ID         string
	Version    string
	Components map[string]ComponentSchema
	Actions    map[string]struct{}
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

func DefaultCatalog() Catalog {
	return Catalog{
		ID:      DefaultCatalogID,
		Version: DefaultCatalogVersion,
		Components: map[string]ComponentSchema{
			"Stack": {
				Type:     "Stack",
				Children: true,
				Props: map[string]PropSchema{
					"direction": stringProp(false, "column", "row"),
					"gap":       dimensionProp(0, 48, true),
					"align":     stringProp(false, "start", "center", "end", "stretch"),
					"justify":   stringProp(false, "start", "center", "end", "between"),
					"className": stringProp(false),
				},
			},
			"Box": {
				Type:     "Box",
				Children: true,
				Props: map[string]PropSchema{
					"padding":    dimensionProp(0, 96, true),
					"radius":     dimensionProp(0, 48, true),
					"background": stringProp(false, "none", "background", "surface", "surfaceAlt", "card"),
					"border":     stringProp(false, "none", "border", "card"),
					"className":  stringProp(false),
				},
			},
			"Grid": {
				Type:     "Grid",
				Children: true,
				Props: map[string]PropSchema{
					"columns":   numberProp(1, 12, false, true),
					"gap":       dimensionProp(0, 48, true),
					"align":     stringProp(false, "start", "center", "end", "stretch"),
					"justify":   stringProp(false, "start", "center", "end", "stretch"),
					"className": stringProp(false),
				},
			},
			"Container": {
				Type:     "Container",
				Children: true,
				Props: map[string]PropSchema{
					"maxWidth":  dimensionProp(320, 1600, true),
					"className": stringProp(false),
				},
			},
			"Spacer": {
				Type:     "Spacer",
				Children: false,
				Props: map[string]PropSchema{
					"size":      dimensionProp(0, 200, true),
					"axis":      stringProp(false, "x", "y"),
					"className": stringProp(false),
				},
			},
			"Motion": {
				Type:     "Motion",
				Children: true,
				Props: map[string]PropSchema{
					"preset":     stringProp(false, "none", "fadeIn", "slideUp", "slideDown", "slideLeft", "slideRight", "scaleIn"),
					"durationMs": numberProp(0, 5000, false, false),
					"delayMs":    numberProp(0, 5000, false, false),
					"easing":     stringProp(false),
					"className":  stringProp(false),
				},
			},
			"Stagger": {
				Type:     "Stagger",
				Children: true,
				Props: map[string]PropSchema{
					"preset":     stringProp(false, "none", "fadeIn", "slideUp", "slideDown", "slideLeft", "slideRight", "scaleIn"),
					"durationMs": numberProp(0, 5000, false, false),
					"delayMs":    numberProp(0, 5000, false, false),
					"staggerMs":  numberProp(0, 2000, false, false),
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
			},
			"Heading": {
				Type:     "Heading",
				Children: false,
				Props: map[string]PropSchema{
					"text":  stringProp(false),
					"level": numberProp(1, 4, false, false, float64(1), float64(2), float64(3), float64(4)),
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
