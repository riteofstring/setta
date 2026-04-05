package frontendbindings

import (
	"fmt"
	"reflect"
	"strings"

	"setta/internal/realtime"
)

var frontendSafeParseSchemaRootTypes = map[reflect.Type]struct{}{
	reflect.TypeOf(realtime.UISettingRevealContent{}): {},
}

type safeParseFieldSpec struct {
	Name         string
	Type         reflect.Type
	AllowMissing bool
	FallbackExpr string
}

type safeParseEmitter struct {
	seen         map[reflect.Type]struct{}
	declarations []TypeDeclaration
}

func safeParseSupportDeclarations() []TypeDeclaration {
	return []TypeDeclaration{
		localAliasDeclaration("SafeParseSuccess", "<T>", `{
  success: true;
  data: T;
}`),
		localAliasDeclaration("SafeParseFailure", "", `{
  success: false;
  error: {
    issues: Array<string>;
  };
}`),
		localAliasDeclaration("SafeParseResult", "<T>", "SafeParseSuccess<T> | SafeParseFailure"),
		functionDeclaration(
			"generatedSafeParseFieldPath",
			false,
			"string",
			`  return fieldName === "" ? propertyName : fieldName + "." + propertyName;`,
			TypeProperty{Name: "fieldName", TypeExpr: "string"},
			TypeProperty{Name: "propertyName", TypeExpr: "string"},
		),
	}
}

func safeParseSchemaDeclarationsForType(t reflect.Type) ([]TypeDeclaration, bool) {
	t = canonicalFrontendBindingType(t)
	if _, ok := frontendSafeParseSchemaRootTypes[t]; !ok {
		return nil, false
	}
	emitter := &safeParseEmitter{
		seen: make(map[reflect.Type]struct{}),
	}
	if err := emitter.addStructHelper(t); err != nil {
		panic(err)
	}
	declarations := append([]TypeDeclaration{}, emitter.declarations...)
	declarations = append(declarations, safeParseSchemaRootDeclaration(t))
	return declarations, true
}

func (e *safeParseEmitter) addStructHelper(t reflect.Type) error {
	t = canonicalFrontendBindingType(t)
	for t != nil && t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t == nil || t.Kind() != reflect.Struct {
		return fmt.Errorf("safe parse helper requires a struct type, got %v", t)
	}
	if _, ok := e.seen[t]; ok {
		return nil
	}
	e.seen[t] = struct{}{}

	fields, err := safeParseFieldSpecs(t)
	if err != nil {
		return err
	}
	for _, field := range fields {
		nested := safeParseNestedStructType(field.Type)
		if nested == nil {
			continue
		}
		if err := e.addStructHelper(nested); err != nil {
			return err
		}
	}
	declaration, err := safeParseStructHelperDeclaration(t, fields)
	if err != nil {
		return err
	}
	e.declarations = append(e.declarations, declaration)
	return nil
}

func safeParseFieldSpecs(t reflect.Type) ([]safeParseFieldSpec, error) {
	fields := []safeParseFieldSpec{}
	if err := appendSafeParseFieldSpecs(&fields, t); err != nil {
		return nil, err
	}
	return fields, nil
}

func appendSafeParseFieldSpecs(
	dst *[]safeParseFieldSpec,
	t reflect.Type,
) error {
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t.Kind() != reflect.Struct {
		return fmt.Errorf("safe parse fields require struct type, got %s", t)
	}
	for fieldIndex := range t.NumField() {
		field := t.Field(fieldIndex)
		if !field.IsExported() {
			continue
		}
		if field.Anonymous {
			if err := appendSafeParseFieldSpecs(dst, field.Type); err != nil {
				return err
			}
			continue
		}
		name, jsonOptional, skip := jsonFieldName(field)
		if skip {
			continue
		}
		tsMetadata, err := tsFieldMetadata(field)
		if err != nil {
			return fmt.Errorf("%s.%s: %w", t.Name(), field.Name, err)
		}
		if tsMetadata.Skip {
			continue
		}
		optional := jsonOptional
		if tsMetadata.Optional != nil {
			optional = *tsMetadata.Optional
		}
		fallbackExpr := safeParseFallbackExpr(field.Type, nil, false)
		allowMissing := optional
		if tsMetadata.ParseFallback != "" {
			fallbackExpr = tsMetadata.ParseFallback
			allowMissing = true
		} else if jsonOptional && !optional && safeParseWireOmissionFallbackAllowed(field.Type) {
			allowMissing = true
		}
		*dst = append(*dst, safeParseFieldSpec{
			Name:         name,
			Type:         field.Type,
			AllowMissing: allowMissing,
			FallbackExpr: fallbackExpr,
		})
	}
	return nil
}

func safeParseWireOmissionFallbackAllowed(t reflect.Type) bool {
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	switch t.Kind() {
	case reflect.Slice, reflect.Array, reflect.Map:
		return true
	default:
		return false
	}
}

func safeParseNestedStructType(t reflect.Type) reflect.Type {
	for t != nil && t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t == nil {
		return nil
	}
	switch t.Kind() {
	case reflect.Slice, reflect.Array:
		return safeParseNestedStructType(t.Elem())
	case reflect.Struct:
		if t.Name() == "" || t.PkgPath() == "" {
			return nil
		}
		return t
	default:
		return nil
	}
}

func safeParseSchemaRootDeclaration(t reflect.Type) TypeDeclaration {
	typeName := frontendBindingTypeName(t)
	helperName := safeParseStructHelperName(t)
	return constDeclaration(typeName+"Schema", true, `{
  safeParse(value: unknown): SafeParseResult<`+typeName+`> {
    const issues: Array<string> = [];
    const data = `+helperName+`(value, "", issues);
    if (issues.length > 0) {
      return {
        success: false,
        error: {
          issues,
        },
      };
    }
    return {
      success: true,
      data,
    };
  },
}`)
}

func safeParseStructHelperDeclaration(
	t reflect.Type,
	fields []safeParseFieldSpec,
) (TypeDeclaration, error) {
	var builder strings.Builder
	typeName := frontendBindingTypeName(t)
	builder.WriteString("  if (!generatedBindingRuntime.websocketSupportIsRecord(value)) {\n")
	builder.WriteString("    if (fieldName === \"\") {\n")
	builder.WriteString("      issues.push(\"Expected ")
	builder.WriteString(typeName)
	builder.WriteString(" object.\");\n")
	builder.WriteString("    } else {\n")
	builder.WriteString("      issues.push(fieldName + \" must be an object.\");\n")
	builder.WriteString("    }\n")
	builder.WriteString("    return {\n")
	for _, field := range fields {
		builder.WriteString("      ")
		builder.WriteString(renderTSObjectKey(field.Name))
		builder.WriteString(": ")
		builder.WriteString(field.FallbackExpr)
		builder.WriteString(",\n")
	}
	builder.WriteString("    };\n")
	builder.WriteString("  }\n")
	builder.WriteString("  const record = value;\n")
	builder.WriteString("  return {\n")
	for _, field := range fields {
		fieldExpr, err := safeParseFieldExpr(
			field,
			renderTSPropertyAccessExpr("record", field.Name),
			`generatedSafeParseFieldPath(fieldName, `+renderTSLiteralExpr(field.Name)+`)`,
		)
		if err != nil {
			return TypeDeclaration{}, fmt.Errorf("%s.%s: %w", typeName, field.Name, err)
		}
		builder.WriteString("    ")
		builder.WriteString(renderTSObjectKey(field.Name))
		builder.WriteString(": ")
		builder.WriteString(fieldExpr)
		builder.WriteString(",\n")
	}
	builder.WriteString("  };")
	return functionDeclaration(
		safeParseStructHelperName(t),
		false,
		typeName,
		builder.String(),
		TypeProperty{Name: "value", TypeExpr: "unknown"},
		TypeProperty{Name: "fieldName", TypeExpr: "string"},
		TypeProperty{Name: "issues", TypeExpr: "Array<string>"},
	), nil
}

func safeParseStructHelperName(t reflect.Type) string {
	return "generatedSafeParse" + frontendBindingTypeName(t)
}

func safeParseFieldExpr(
	field safeParseFieldSpec,
	valueExpr string,
	fieldPathExpr string,
) (string, error) {
	return safeParseValueExpr(
		field.Type,
		valueExpr,
		fieldPathExpr,
		field.FallbackExpr,
		field.AllowMissing,
	)
}

func safeParseValueExpr(
	t reflect.Type,
	valueExpr string,
	fieldPathExpr string,
	fallbackExpr string,
	allowMissing bool,
) (string, error) {
	for t.Kind() == reflect.Pointer {
		inner := t.Elem()
		switch inner.Kind() {
		case reflect.String:
			return `(` + valueExpr + ` === undefined || ` + valueExpr + ` === null
      ? null
      : generatedBindingRuntime.websocketSupportReadRequiredString(` + valueExpr + `, ` + fieldPathExpr + `, issues))`, nil
		case reflect.Struct:
			return `(` + valueExpr + ` === undefined || ` + valueExpr + ` === null
      ? null
      : ` + safeParseStructHelperName(inner) + `(` + valueExpr + `, ` + fieldPathExpr + `, issues))`, nil
		default:
			return "", fmt.Errorf("unsupported pointer field type %s", t)
		}
	}

	switch t.Kind() {
	case reflect.String:
		if allowMissing {
			return `(` + valueExpr + ` === undefined
      ? ` + fallbackExpr + `
      : generatedBindingRuntime.websocketSupportReadRequiredString(` + valueExpr + `, ` + fieldPathExpr + `, issues))`, nil
		}
		return "generatedBindingRuntime.websocketSupportReadRequiredString(" +
			valueExpr + ", " + fieldPathExpr + ", issues)", nil
	case reflect.Bool:
		return safeParseBooleanExpr(valueExpr, fieldPathExpr, fallbackExpr, allowMissing), nil
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64,
		reflect.Float32, reflect.Float64:
		return safeParseNumberExpr(valueExpr, fieldPathExpr, fallbackExpr, allowMissing), nil
	case reflect.Slice, reflect.Array:
		return safeParseArrayExpr(t, valueExpr, fieldPathExpr, fallbackExpr, allowMissing)
	case reflect.Struct:
		return safeParseStructHelperName(t) + "(" + valueExpr + ", " + fieldPathExpr + ", issues)", nil
	default:
		return "", fmt.Errorf("unsupported safe parse field type %s", t)
	}
}

func safeParseBooleanExpr(
	valueExpr string,
	fieldPathExpr string,
	fallbackExpr string,
	allowMissing bool,
) string {
	if allowMissing {
		return `(() => {
      const raw = ` + valueExpr + `;
      if (raw === undefined) {
        return ` + fallbackExpr + `;
      }
      if (typeof raw === "boolean") {
        return raw;
      }
      issues.push(` + fieldPathExpr + ` + " must be a boolean.");
      return ` + fallbackExpr + `;
    })()`
	}
	return `(() => {
      const raw = ` + valueExpr + `;
      if (typeof raw === "boolean") {
        return raw;
      }
      issues.push(` + fieldPathExpr + ` + " must be a boolean.");
      return ` + fallbackExpr + `;
    })()`
}

func safeParseNumberExpr(
	valueExpr string,
	fieldPathExpr string,
	fallbackExpr string,
	allowMissing bool,
) string {
	if allowMissing {
		return `(() => {
      const raw = ` + valueExpr + `;
      if (raw === undefined) {
        return ` + fallbackExpr + `;
      }
      if (typeof raw === "number" && Number.isFinite(raw)) {
        return raw;
      }
      issues.push(` + fieldPathExpr + ` + " must be a finite number.");
      return ` + fallbackExpr + `;
    })()`
	}
	return `(() => {
      const raw = ` + valueExpr + `;
      if (typeof raw === "number" && Number.isFinite(raw)) {
        return raw;
      }
      issues.push(` + fieldPathExpr + ` + " must be a finite number.");
      return ` + fallbackExpr + `;
    })()`
}

func safeParseArrayExpr(
	t reflect.Type,
	valueExpr string,
	fieldPathExpr string,
	fallbackExpr string,
	allowMissing bool,
) (string, error) {
	elementExpr, err := safeParseArrayElementExpr(
		t.Elem(),
		"entry",
		fieldPathExpr+` + "[" + index + "]"`,
	)
	if err != nil {
		return "", err
	}

	var builder strings.Builder
	builder.WriteString("(() => {\n")
	builder.WriteString("      const raw = ")
	builder.WriteString(valueExpr)
	builder.WriteString(";\n")
	if allowMissing {
		builder.WriteString("      if (raw === undefined) {\n")
		builder.WriteString("        return ")
		builder.WriteString(fallbackExpr)
		builder.WriteString(";\n")
		builder.WriteString("      }\n")
	}
	builder.WriteString("      if (!Array.isArray(raw)) {\n")
	builder.WriteString("        issues.push(")
	builder.WriteString(fieldPathExpr)
	builder.WriteString(" + \" must be an array.\");\n")
	builder.WriteString("        return ")
	builder.WriteString(fallbackExpr)
	builder.WriteString(";\n")
	builder.WriteString("      }\n")
	builder.WriteString("      return raw.map((entry, index) => ")
	builder.WriteString(elementExpr)
	builder.WriteString(");\n")
	builder.WriteString("    })()")
	return builder.String(), nil
}

func safeParseArrayElementExpr(
	t reflect.Type,
	valueExpr string,
	fieldPathExpr string,
) (string, error) {
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	switch t.Kind() {
	case reflect.String:
		return "generatedBindingRuntime.websocketSupportReadRequiredString(" +
			valueExpr + ", " + fieldPathExpr + ", issues)", nil
	case reflect.Bool:
		return safeParseBooleanExpr(valueExpr, fieldPathExpr, "false", false), nil
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64,
		reflect.Float32, reflect.Float64:
		return safeParseNumberExpr(valueExpr, fieldPathExpr, "0", false), nil
	case reflect.Struct:
		return safeParseStructHelperName(t) + "(" + valueExpr + ", " + fieldPathExpr + ", issues)", nil
	default:
		return "", fmt.Errorf("unsupported safe parse array element type %s", t)
	}
}

func safeParseFallbackExpr(t reflect.Type, defaultValue any, hasDefault bool) string {
	if hasDefault {
		return renderTSLiteralExpr(defaultValue)
	}
	for t.Kind() == reflect.Pointer {
		return "null"
	}
	switch t.Kind() {
	case reflect.String:
		return `""`
	case reflect.Bool:
		return "false"
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64,
		reflect.Float32, reflect.Float64:
		return "0"
	case reflect.Slice, reflect.Array:
		return "[]"
	case reflect.Map:
		return "{}"
	case reflect.Struct:
		if t.Name() != "" && t.PkgPath() != "" {
			return "{} as " + frontendBindingTypeName(t)
		}
		return "{}"
	default:
		return "null"
	}
}
