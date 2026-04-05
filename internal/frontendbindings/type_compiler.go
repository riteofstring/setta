package frontendbindings

import (
	"fmt"
	"reflect"
	"strconv"
	"strings"

	"setta/internal/stringenumvalues"
)

var frontendSDKMirrorOwnerTypesByName = newFrontendSDKMirrorOwnerTypesByName()

func discoveredFrontendEnumValues(t reflect.Type) ([]stringenumvalues.EnumValue, bool, error) {
	values, ok, err := stringenumvalues.Default().Values(canonicalFrontendBindingType(t))
	if err != nil || !ok || len(values) < 2 {
		return values, ok, err
	}
	deduped := make([]stringenumvalues.EnumValue, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		key := value.Name + "\x00" + value.Value
		if _, duplicate := seen[key]; duplicate {
			continue
		}
		seen[key] = struct{}{}
		deduped = append(deduped, value)
	}
	return deduped, true, nil
}

type typeConverter struct {
	declarations []TypeDeclaration
	seen         map[reflect.Type]struct{}
}

type reflectedObjectDeclarationSpec struct {
	DefaultValue any
}

var discoveredFrontendDefaultValueProviderRegistry = discoveredFrontendDefaultValueProviders()

func newFrontendSDKMirrorOwnerTypesByName() map[string]reflect.Type {
	owners := map[string]reflect.Type{}
	for _, t := range DiscoveredConvertibleTypes() {
		if t.PkgPath() != "setta/internal/realtime" {
			continue
		}
		if strings.TrimSpace(t.Name()) == "" {
			continue
		}
		owners[t.Name()] = t
	}
	return owners
}

func newTypeConverter() *typeConverter {
	return &typeConverter{
		seen: make(map[reflect.Type]struct{}),
	}
}

func (c *typeConverter) AddRootType(root reflect.Type) error {
	if root == nil {
		return nil
	}
	_, err := c.renderTypeExpr(root)
	return err
}

func (c *typeConverter) Declarations() []TypeDeclaration {
	return c.declarations
}

func (c *typeConverter) appendAdditionalDeclarationsForType(t reflect.Type) error {
	extras, ok := additionalDeclarationsForType(c, t)
	if !ok {
		return nil
	}
	c.declarations = append(c.declarations, extras...)
	return nil
}

func (c *typeConverter) renderTypeExpr(t reflect.Type) (string, error) {
	return c.renderTypeExprWithQualifier(t, "")
}

func (c *typeConverter) renderTypeExprWithQualifier(
	t reflect.Type,
	qualifier string,
) (string, error) {
	t = canonicalFrontendBindingType(t)
	if t == nil {
		return "null", nil
	}
	if t == timeType {
		return "string", nil
	}
	if t == rawJSONType {
		return qualifier + "JSONValue", nil
	}
	if t.Name() != "" && t.PkgPath() != "" {
		if err := c.ensureDeclaration(t); err != nil {
			return "", err
		}
		return qualifier + frontendBindingTypeName(t), nil
	}

	switch t.Kind() {
	case reflect.Pointer:
		inner, err := c.renderTypeExprWithQualifier(t.Elem(), qualifier)
		if err != nil {
			return "", err
		}
		return inner + " | null", nil
	case reflect.String:
		return "string", nil
	case reflect.Bool:
		return "boolean", nil
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64,
		reflect.Float32, reflect.Float64:
		return "number", nil
	case reflect.Slice, reflect.Array:
		if t.Kind() == reflect.Array {
			tuple, ok, err := c.renderTupleTypeExprWithQualifier(t, qualifier)
			if err != nil {
				return "", err
			}
			if ok {
				return tuple, nil
			}
		}
		inner, err := c.renderTypeExprWithQualifier(t.Elem(), qualifier)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("Array<%s>", inner), nil
	case reflect.Map:
		keyExpr, err := c.renderMapKeyExpr(t.Key())
		if err != nil {
			return "", err
		}
		valueExpr, err := c.renderTypeExprWithQualifier(t.Elem(), qualifier)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("Record<%s, %s>", keyExpr, valueExpr), nil
	case reflect.Struct:
		properties, err := c.structProperties(t, nil, nil, nil)
		if err != nil {
			return "", err
		}
		return renderInlineObject(properties), nil
	case reflect.Interface:
		return "unknown", nil
	default:
		if t.Name() != "" && t.PkgPath() != "" {
			if err := c.ensureDeclaration(t); err != nil {
				return "", err
			}
			return qualifier + frontendBindingTypeName(t), nil
		}
		return "", fmt.Errorf("unsupported Go type for TS conversion: %s", t.String())
	}
}

func (c *typeConverter) ensureDeclaration(t reflect.Type) error {
	t = canonicalFrontendBindingType(t)
	if t == nil || t.PkgPath() == "" || t == timeType {
		return nil
	}
	if _, ok := c.seen[t]; ok {
		return nil
	}
	c.seen[t] = struct{}{}

	if decl, ok, err := specialTypeDeclaration(c, t); err != nil {
		return err
	} else if ok {
		c.declarations = append(c.declarations, decl)
		return c.appendAdditionalDeclarationsForType(t)
	}

	if spec, ok := ownerBackedReflectedObjectDeclarationSpec(t); ok {
		declaration, err := c.reflectedObjectDeclaration(t, spec)
		if err != nil {
			return err
		}
		c.declarations = append(c.declarations, declaration)
		return c.appendAdditionalDeclarationsForType(t)
	}

	if values, ok, err := discoveredFrontendEnumValues(t); err != nil {
		return err
	} else if ok {
		c.declarations = append(c.declarations, TypeDeclaration{
			Name:       frontendBindingTypeName(t),
			Kind:       "enum",
			EnumValues: values,
		})
		return c.appendAdditionalDeclarationsForType(t)
	}

	switch t.Kind() {
	case reflect.Struct:
		properties, err := c.structProperties(t, nil, nil, nil)
		if err != nil {
			return err
		}
		c.declarations = append(c.declarations, TypeDeclaration{
			Name:       frontendBindingTypeName(t),
			Kind:       "object",
			Properties: properties,
		})
		return c.appendAdditionalDeclarationsForType(t)
	case reflect.String:
		c.declarations = append(c.declarations, TypeDeclaration{
			Name:  frontendBindingTypeName(t),
			Kind:  "alias",
			Alias: "string",
		})
		return c.appendAdditionalDeclarationsForType(t)
	case reflect.Bool:
		c.declarations = append(c.declarations, TypeDeclaration{
			Name:  frontendBindingTypeName(t),
			Kind:  "alias",
			Alias: "boolean",
		})
		return c.appendAdditionalDeclarationsForType(t)
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64,
		reflect.Float32, reflect.Float64:
		c.declarations = append(c.declarations, TypeDeclaration{
			Name:  frontendBindingTypeName(t),
			Kind:  "alias",
			Alias: "number",
		})
		return c.appendAdditionalDeclarationsForType(t)
	case reflect.Slice, reflect.Array:
		aliasExpr := ""
		if t.Kind() == reflect.Array {
			tuple, ok, err := c.renderTupleTypeExpr(t)
			if err != nil {
				return err
			}
			if ok {
				aliasExpr = tuple
			}
		}
		if aliasExpr == "" {
			inner, err := c.renderTypeExpr(t.Elem())
			if err != nil {
				return err
			}
			aliasExpr = fmt.Sprintf("Array<%s>", inner)
		}
		c.declarations = append(c.declarations, TypeDeclaration{
			Name:  frontendBindingTypeName(t),
			Kind:  "alias",
			Alias: aliasExpr,
		})
		return c.appendAdditionalDeclarationsForType(t)
	case reflect.Map:
		keyExpr, err := c.renderMapKeyExpr(t.Key())
		if err != nil {
			return err
		}
		valueExpr, err := c.renderTypeExpr(t.Elem())
		if err != nil {
			return err
		}
		c.declarations = append(c.declarations, TypeDeclaration{
			Name:  frontendBindingTypeName(t),
			Kind:  "alias",
			Alias: fmt.Sprintf("Record<%s, %s>", keyExpr, valueExpr),
		})
		return c.appendAdditionalDeclarationsForType(t)
	default:
		return fmt.Errorf("unsupported named Go type for TS declaration: %s", t.String())
	}
}

func canonicalFrontendBindingType(t reflect.Type) reflect.Type {
	if t == nil {
		return nil
	}
	if t.PkgPath() == "setta/internal/pythonsdkcontracts" {
		if ownerType, ok := frontendSDKMirrorOwnerTypesByName[t.Name()]; ok {
			return ownerType
		}
	}
	return t
}

func frontendBindingTypeName(t reflect.Type) string {
	t = canonicalFrontendBindingType(t)
	if t == nil {
		return ""
	}
	if name, ok := frontendBindingPublicTypeNames()[t]; ok && strings.TrimSpace(name) != "" {
		return name
	}
	return normalizedFrontendBindingTypeName(t.Name())
}

func ownerBackedReflectedObjectDeclarationSpec(t reflect.Type) (reflectedObjectDeclarationSpec, bool) {
	provider, ok := discoveredFrontendDefaultValueProviderRegistry[t]
	if !ok || provider == nil {
		return reflectedObjectDeclarationSpec{}, false
	}
	return reflectedObjectDeclarationSpec{
		DefaultValue: provider(),
	}, true
}

func (c *typeConverter) reflectedObjectDeclaration(
	t reflect.Type,
	spec reflectedObjectDeclarationSpec,
) (TypeDeclaration, error) {
	properties, err := c.structProperties(t, nil, nil, nil)
	if err != nil {
		return TypeDeclaration{}, err
	}
	fieldSpecsByName, err := reflectedFieldCreateSpecsByJSONName(t)
	if err != nil {
		return TypeDeclaration{}, err
	}
	declarationName := frontendBindingTypeName(t)
	if spec.DefaultValue == nil {
		return TypeDeclaration{}, fmt.Errorf("%s has no Go default value", declarationName)
	}
	declaration := objectDeclaration(declarationName, properties...)
	useGenericCreateBody := reflectedStructNeedsGenericCreateBody(properties, fieldSpecsByName)
	if useGenericCreateBody {
		context := "frontend create defaults " + declarationName
		createBody, err := buildGenericGoBackedCreateBodyTS(
			context,
			declarationName,
			t,
			spec.DefaultValue,
			properties,
			fieldSpecsByName,
		)
		if err != nil {
			return TypeDeclaration{}, err
		}
		declaration.CreateBody = createBody
	} else {
		declaration.CreateExpr = buildGoBackedCreateExprTS(
			"frontend create defaults "+declarationName,
			declarationName,
			spec.DefaultValue,
			properties,
			fieldSpecsByName,
		)
	}
	return declaration, nil
}

func reflectedStructNeedsGenericCreateBody(
	properties []TypeProperty,
	fieldSpecs map[string]reflectedFieldCreateSpec,
) bool {
	needsGenericCreateBody := false
	for _, property := range properties {
		fieldSpec, ok := fieldSpecs[property.Name]
		if !ok {
			continue
		}
		if fieldSpec.CreateMapValues {
			needsGenericCreateBody = true
			continue
		}
		if reflectedMapFieldNeedsGeneratedCreate(fieldSpec.Type) {
			return false
		}
		if reflectedNamedStructFieldNeedsGeneratedCreate(fieldSpec.Type) {
			needsGenericCreateBody = true
		}
	}
	return needsGenericCreateBody
}

func reflectedNamedStructFieldNeedsGeneratedCreate(fieldType reflect.Type) bool {
	if _, _, _, ok := frontendObjectCreateFunctionName(fieldType); ok {
		return true
	}
	return false
}

func reflectedMapFieldNeedsGeneratedCreate(fieldType reflect.Type) bool {
	for fieldType.Kind() == reflect.Pointer {
		fieldType = fieldType.Elem()
	}
	if fieldType.Kind() != reflect.Map {
		return false
	}
	_, _, _, ok := frontendObjectCreateFunctionName(fieldType.Elem())
	return ok
}

func (c *typeConverter) structProperties(
	t reflect.Type,
	typeExprOverrides map[string]string,
	optionalOverrides map[string]bool,
	ignoredProperties map[string]struct{},
) ([]TypeProperty, error) {
	properties := make([]TypeProperty, 0, t.NumField())
	for i := range t.NumField() {
		field := t.Field(i)
		if !field.IsExported() {
			continue
		}
		if field.Anonymous {
			embeddedType := field.Type
			for embeddedType.Kind() == reflect.Pointer {
				embeddedType = embeddedType.Elem()
			}
			if embeddedType.Kind() != reflect.Struct {
				return nil, fmt.Errorf(
					"%s.%s: anonymous field must be a struct, got %s",
					t.Name(),
					field.Name,
					field.Type.String(),
				)
			}
			embeddedProperties, err := c.structProperties(
				embeddedType,
				typeExprOverrides,
				optionalOverrides,
				ignoredProperties,
			)
			if err != nil {
				return nil, err
			}
			properties = append(properties, embeddedProperties...)
			continue
		}
		name, optional, skip := jsonFieldName(field)
		if skip {
			continue
		}
		tsMetadata, err := tsFieldMetadata(field)
		if err != nil {
			return nil, fmt.Errorf("%s.%s: %w", t.Name(), field.Name, err)
		}
		if tsMetadata.Skip {
			continue
		}
		if ignoredProperties != nil {
			if _, ignored := ignoredProperties[name]; ignored {
				continue
			}
		}
		typeExprOverride := ""
		if typeExprOverrides != nil {
			typeExprOverride = typeExprOverrides[name]
		}
		typeExpr := typeExprOverride
		if typeExpr == "" {
			typeExpr = tsMetadata.TypeExpr
		}
		if typeExpr == "" {
			var err error
			typeExpr, err = c.renderTypeExpr(field.Type)
			if err != nil {
				return nil, fmt.Errorf("%s.%s: %w", t.Name(), field.Name, err)
			}
		}
		if optionalOverrides != nil {
			if override, ok := optionalOverrides[name]; ok {
				optional = override
			}
		}
		if tsMetadata.Optional != nil {
			optional = *tsMetadata.Optional
		}
		properties = append(properties, TypeProperty{
			Name:     name,
			TypeExpr: typeExpr,
			Optional: optional,
		})
	}
	return properties, nil
}

func (c *typeConverter) renderMapKeyExpr(t reflect.Type) (string, error) {
	if t.Kind() == reflect.Pointer {
		return c.renderMapKeyExpr(t.Elem())
	}
	switch t.Kind() {
	case reflect.String:
		return "string", nil
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64,
		reflect.Float32, reflect.Float64:
		return "number", nil
	case reflect.Bool:
		return "boolean", nil
	default:
		return "", fmt.Errorf("unsupported map key type for TS conversion: %s", t.String())
	}
}

func jsonFieldName(field reflect.StructField) (name string, optional bool, skip bool) {
	tag := field.Tag.Get("json")
	if tag == "-" {
		return "", false, true
	}
	if tag == "" {
		return lowerCamelCase(field.Name), false, false
	}
	parts := strings.Split(tag, ",")
	name = strings.TrimSpace(parts[0])
	if name == "" {
		name = lowerCamelCase(field.Name)
	}
	for _, part := range parts[1:] {
		if strings.TrimSpace(part) == "omitempty" {
			optional = true
		}
	}
	return name, optional, false
}

func lowerCamelCase(value string) string {
	if value == "" {
		return value
	}
	return strings.ToLower(value[:1]) + value[1:]
}

func (c *typeConverter) renderTupleTypeExpr(t reflect.Type) (string, bool, error) {
	return c.renderTupleTypeExprWithQualifier(t, "")
}

func (c *typeConverter) renderTupleTypeExprWithQualifier(
	t reflect.Type,
	qualifier string,
) (string, bool, error) {
	if t.Kind() != reflect.Array {
		return "", false, nil
	}
	if t.Len() == 0 {
		return "[]", true, nil
	}
	inner, err := c.renderTypeExprWithQualifier(t.Elem(), qualifier)
	if err != nil {
		return "", false, err
	}
	members := make([]string, 0, t.Len())
	for range t.Len() {
		members = append(members, inner)
	}
	return "[" + strings.Join(members, ", ") + "]", true, nil
}

type tsFieldMetadataSpec struct {
	TypeExpr        string
	Optional        *bool
	CreateExpr      string
	CreateMapValues bool
	Skip            bool
}

func tsFieldMetadata(field reflect.StructField) (tsFieldMetadataSpec, error) {
	spec := tsFieldMetadataSpec{}

	if tag := strings.TrimSpace(field.Tag.Get("ts_type")); tag != "" {
		spec.TypeExpr = tag
	}

	if tag := strings.TrimSpace(field.Tag.Get("ts_optional")); tag != "" {
		optional, err := strconv.ParseBool(tag)
		if err != nil {
			return tsFieldMetadataSpec{}, fmt.Errorf("invalid ts_optional value %q", tag)
		}
		spec.Optional = &optional
	}

	if tag := strings.TrimSpace(field.Tag.Get("ts_create_expr")); tag != "" {
		spec.CreateExpr = tag
	}

	if tag := strings.TrimSpace(field.Tag.Get("ts_create_map_values")); tag != "" {
		createMapValues, err := strconv.ParseBool(tag)
		if err != nil {
			return tsFieldMetadataSpec{}, fmt.Errorf("invalid ts_create_map_values value %q", tag)
		}
		spec.CreateMapValues = createMapValues
	}

	if tag := strings.TrimSpace(field.Tag.Get("ts_skip")); tag != "" {
		skip, err := strconv.ParseBool(tag)
		if err != nil {
			return tsFieldMetadataSpec{}, fmt.Errorf("invalid ts_skip value %q", tag)
		}
		spec.Skip = skip
	}

	return spec, nil
}

func renderInlineObject(properties []TypeProperty) string {
	if len(properties) == 0 {
		return "Record<string, never>"
	}
	lines := make([]string, 0, len(properties)+2)
	lines = append(lines, "{")
	for _, property := range properties {
		optional := ""
		if property.Optional {
			optional = "?"
		}
		lines = append(lines, fmt.Sprintf("  %s%s: %s;", property.Name, optional, property.TypeExpr))
	}
	lines = append(lines, "}")
	return strings.Join(lines, "\n")
}
