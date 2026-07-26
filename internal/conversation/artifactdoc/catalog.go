package artifactdoc

// DocumentLanguage names the composition format an artifact document is written
// in. Setta accepts exactly one.
type DocumentLanguage string

// DocumentLanguageOpenUI is the OpenUI Lang static profile this package owns.
const DocumentLanguageOpenUI DocumentLanguage = "openui_lang"

// CatalogID names one frozen component catalog. The renderer selects its
// component map by exact match, so a catalog change is a deliberate change to
// both sides.
type CatalogID string

// CatalogSettaV1 is the first Setta artifact catalog.
const CatalogSettaV1 CatalogID = "setta.artifacts.v1"

// ComponentName is a catalog component identifier as the model writes it.
type ComponentName string

// ValueKind is the closed set of property value shapes the profile supports.
type ValueKind string

const (
	// ValueKindString is a string literal validated by its role.
	ValueKindString ValueKind = "string"
	// ValueKindNumber is a finite number literal.
	ValueKindNumber ValueKind = "number"
	// ValueKindBoolean is true or false.
	ValueKindBoolean ValueKind = "boolean"
	// ValueKindEnum is a string literal drawn from a catalog-owned value set.
	ValueKindEnum ValueKind = "enum"
	// ValueKindComponent is a single nested component from an allowed set.
	ValueKindComponent ValueKind = "component"
	// ValueKindList is an ordered array of one element schema.
	ValueKindList ValueKind = "list"
	// ValueKindObject is a record with catalog-owned fields.
	ValueKindObject ValueKind = "object"
)

// StringRole selects the size and safety rules a string value is held to.
type StringRole string

const (
	// StringRoleLabel is a short single-line label, title, or caption.
	StringRoleLabel StringRole = "label"
	// StringRolePlain is prose rendered as text, never as markup.
	StringRolePlain StringRole = "plain"
	// StringRoleMarkdown is prose rendered through the safe Markdown subset.
	StringRoleMarkdown StringRole = "markdown"
	// StringRoleCode is verbatim source rendered inside a code block.
	StringRoleCode StringRole = "code"
	// StringRolePath is a workspace-relative file path.
	StringRolePath StringRole = "path"
	// StringRoleCell is one table cell.
	StringRoleCell StringRole = "cell"
)

// ValueSchema declares one property or element value. Only the fields that
// belong to Kind carry meaning; the compiler switches on Kind and never guesses.
type ValueSchema struct {
	Kind       ValueKind       `json:"kind"`
	Role       StringRole      `json:"role,omitempty"`
	MaxBytes   int             `json:"maxBytes,omitempty"`
	EnumValues []string        `json:"enumValues,omitempty"`
	Components []ComponentName `json:"components,omitempty"`
	Element    *ValueSchema    `json:"element,omitempty"`
	MinItems   int             `json:"minItems,omitempty"`
	MaxItems   int             `json:"maxItems,omitempty"`
	Fields     []ObjectField   `json:"fields,omitempty"`
	Integer    bool            `json:"integer,omitempty"`
	Minimum    *float64        `json:"minimum,omitempty"`
	Maximum    *float64        `json:"maximum,omitempty"`
}

// ObjectField is one field of an object value.
type ObjectField struct {
	Name        string      `json:"name"`
	Required    bool        `json:"required"`
	Description string      `json:"description"`
	Schema      ValueSchema `json:"schema"`
}

// Property is one component property. Order is the contract: component
// arguments are positional and are mapped through this order.
type Property struct {
	Name        string      `json:"name"`
	Required    bool        `json:"required"`
	Description string      `json:"description"`
	Schema      ValueSchema `json:"schema"`
}

// Component is one model-visible catalog component.
type Component struct {
	Name       ComponentName `json:"name"`
	Summary    string        `json:"summary"`
	Properties []Property    `json:"properties"`
}

// Catalog is the frozen set of components one artifact document may compose.
type Catalog struct {
	ID         CatalogID        `json:"id"`
	Language   DocumentLanguage `json:"language"`
	Root       ComponentName    `json:"root"`
	Components []Component      `json:"components"`

	index map[ComponentName]int
}

// Component looks up one registered component.
func (catalog Catalog) Component(name ComponentName) (Component, bool) {
	position, ok := catalog.index[name]
	if !ok {
		return Component{}, false
	}
	return catalog.Components[position], true
}

// Names returns every registered component name in catalog order.
func (catalog Catalog) Names() []ComponentName {
	names := make([]ComponentName, 0, len(catalog.Components))
	for _, component := range catalog.Components {
		names = append(names, component.Name)
	}
	return names
}

func newCatalog(id CatalogID, root ComponentName, components []Component) Catalog {
	index := make(map[ComponentName]int, len(components))
	for position, component := range components {
		index[component.Name] = position
	}
	return Catalog{
		ID:         id,
		Language:   DocumentLanguageOpenUI,
		Root:       root,
		Components: components,
		index:      index,
	}
}

// Value schema constructors. They exist so the component manifest reads as the
// product decision it is rather than as struct literals.

func labelValue() ValueSchema {
	return ValueSchema{Kind: ValueKindString, Role: StringRoleLabel, MaxBytes: MaxLabelBytes}
}

func plainValue() ValueSchema {
	return ValueSchema{Kind: ValueKindString, Role: StringRolePlain, MaxBytes: MaxTextBytes}
}

func markdownValue() ValueSchema {
	return ValueSchema{Kind: ValueKindString, Role: StringRoleMarkdown, MaxBytes: MaxMarkdownBytes}
}

func codeValue() ValueSchema {
	return ValueSchema{Kind: ValueKindString, Role: StringRoleCode, MaxBytes: MaxCodeBytes}
}

func pathValue() ValueSchema {
	return ValueSchema{Kind: ValueKindString, Role: StringRolePath, MaxBytes: MaxPathBytes}
}

func cellValue() ValueSchema {
	return ValueSchema{Kind: ValueKindString, Role: StringRoleCell, MaxBytes: MaxCellBytes}
}

func enumValue(values ...string) ValueSchema {
	return ValueSchema{Kind: ValueKindEnum, EnumValues: values}
}

func numberValue() ValueSchema {
	return ValueSchema{Kind: ValueKindNumber}
}

func integerValue(minimum float64, maximum float64) ValueSchema {
	return ValueSchema{Kind: ValueKindNumber, Integer: true, Minimum: &minimum, Maximum: &maximum}
}

func componentValue(components ...ComponentName) ValueSchema {
	return ValueSchema{Kind: ValueKindComponent, Components: components}
}

func listValue(element ValueSchema, minItems int, maxItems int) ValueSchema {
	return ValueSchema{Kind: ValueKindList, Element: &element, MinItems: minItems, MaxItems: maxItems}
}

func objectValue(fields ...ObjectField) ValueSchema {
	return ValueSchema{Kind: ValueKindObject, Fields: fields}
}

func blockListValue() ValueSchema {
	return listValue(componentValue(blockComponents()...), 1, MaxArrayEntries)
}

func requiredField(name string, description string, schema ValueSchema) ObjectField {
	return ObjectField{Name: name, Required: true, Description: description, Schema: schema}
}

func optionalField(name string, description string, schema ValueSchema) ObjectField {
	return ObjectField{Name: name, Description: description, Schema: schema}
}

func requiredProperty(name string, description string, schema ValueSchema) Property {
	return Property{Name: name, Required: true, Description: description, Schema: schema}
}

func optionalProperty(name string, description string, schema ValueSchema) Property {
	return Property{Name: name, Description: description, Schema: schema}
}
