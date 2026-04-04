package frontendbindings

import (
	"fmt"
	"reflect"
	"strings"
)

type typeConverter struct {
	declarations []TypeDeclaration
	seen         map[reflect.Type]struct{}
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
	extras, ok := additionalDeclarationsForType(t)
	if !ok {
		return nil
	}
	c.declarations = append(c.declarations, extras...)
	return nil
}

func (c *typeConverter) renderTypeExpr(t reflect.Type) (string, error) {
	t = canonicalFrontendBindingType(t)
	if t == nil {
		return "null", nil
	}
	if t == timeType {
		return "string", nil
	}
	if t == rawJSONType {
		return "JSONValue", nil
	}
	if t.Name() != "" && t.PkgPath() != "" {
		if err := c.ensureDeclaration(t); err != nil {
			return "", err
		}
		return frontendBindingTypeName(t), nil
	}

	switch t.Kind() {
	case reflect.Pointer:
		inner, err := c.renderTypeExpr(t.Elem())
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
		inner, err := c.renderTypeExpr(t.Elem())
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("Array<%s>", inner), nil
	case reflect.Map:
		keyExpr, err := c.renderMapKeyExpr(t.Key())
		if err != nil {
			return "", err
		}
		valueExpr, err := c.renderTypeExpr(t.Elem())
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
			return frontendBindingTypeName(t), nil
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

	if values, ok, err := frontendBindingEnumValues(t); err != nil {
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
		inner, err := c.renderTypeExpr(t.Elem())
		if err != nil {
			return err
		}
		c.declarations = append(c.declarations, TypeDeclaration{
			Name:  frontendBindingTypeName(t),
			Kind:  "alias",
			Alias: fmt.Sprintf("Array<%s>", inner),
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
	if override, ok := discoveredWrapperTypeOverrides[t]; ok {
		return override
	}
	return t
}

func frontendBindingTypeName(t reflect.Type) string {
	t = canonicalFrontendBindingType(t)
	if t == nil {
		return ""
	}
	if spec, ok := ownerBackedReflectedObjectDeclarationSpec(t); ok && spec.DeclarationName != "" {
		return spec.DeclarationName
	}
	return t.Name()
}

func (c *typeConverter) reflectedObjectDeclaration(
	t reflect.Type,
	spec reflectedObjectDeclarationSpec,
) (TypeDeclaration, error) {
	properties, err := c.structProperties(
		t,
		spec.PropertyTypeExprOverrides,
		spec.PropertyOptionalOverrides,
		spec.IgnoredProperties,
	)
	if err != nil {
		return TypeDeclaration{}, err
	}
	if len(spec.ExtraProperties) > 0 {
		properties = append(properties, spec.ExtraProperties...)
	}
	declarationName := frontendBindingTypeName(t)
	declaration := objectDeclaration(declarationName, properties...)
	if spec.UseGenericCreateBody {
		context := "frontend create defaults " + declarationName
		createBody, err := buildGenericGoBackedCreateBodyTS(
			context,
			declarationName,
			t,
			spec.DefaultValue,
			properties,
			spec.CreateExprOverrides,
		)
		if err != nil {
			return TypeDeclaration{}, err
		}
		declaration.CreateBody = createBody
	} else if spec.CreateBody != "" {
		declaration.CreateBody = spec.CreateBody
	} else if spec.HasCreateExpr {
		context := "frontend create defaults " + declarationName
		if len(spec.CreateExprOverrides) > 0 {
			declaration.CreateExpr = buildGoBackedCreateExprWithExprOverridesTS(
				context,
				spec.DefaultValue,
				properties,
				spec.CreateExprOverrides,
			)
		} else {
			declaration.CreateExpr = buildGoBackedCreateExprTS(
				context,
				spec.DefaultValue,
				properties,
			)
		}
	}
	return declaration, nil
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
