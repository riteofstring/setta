package frontendbindings

import (
	"fmt"
	"reflect"
	"strings"
	"time"
)

var timeType = reflect.TypeOf(time.Time{})

type TypeDeclaration struct {
	Name       string
	Kind       string
	Alias      string
	Properties []TypeProperty
	EnumValues []EnumValue
	Raw        string
}

type EnumValue struct {
	Name  string
	Value string
}

type TypeProperty struct {
	Name     string
	TypeExpr string
	Optional bool
}

type typeConverter struct {
	declarations []TypeDeclaration
	seen         map[reflect.Type]struct{}
	stringEnums  map[reflect.Type][]EnumValue
	manualTypes  map[reflect.Type]TypeDeclaration
}

func newTypeConverter() *typeConverter {
	return &typeConverter{
		seen: make(map[reflect.Type]struct{}),
		stringEnums: map[reflect.Type][]EnumValue{
			reflect.TypeOf(DependencyKeyType("")): {
				{Name: "Section", Value: "Section"},
				{Name: "SectionParam", Value: "SectionParam"},
			},
			reflect.TypeOf(DependencyValueType("")): {
				{Name: "Literal", Value: "Literal"},
				{Name: "Binary", Value: "Binary"},
				{Name: "FileRead", Value: "FileRead"},
			},
			reflect.TypeOf(ServerMode("")): {
				{Name: "IDE", Value: "ide"},
				{Name: "Share", Value: "share"},
				{Name: "App", Value: "app"},
				{Name: "Launcher", Value: "launcher"},
			},
			reflect.TypeOf(LaunchSettaFilesLocation("")): {
				{Name: "Auto", Value: "auto"},
				{Name: "Local", Value: "local"},
				{Name: "Global", Value: "global"},
			},
			reflect.TypeOf(LaunchResolvedSettaFilesLocation("")): {
				{Name: "Local", Value: "local"},
				{Name: "Global", Value: "global"},
			},
			reflect.TypeOf(LauncherOpenMode("")): {
				{Name: "Browser", Value: "browser"},
				{Name: "ChromeApp", Value: "chrome-app"},
			},
			reflect.TypeOf(LauncherWorkspaceBehavior("")): {
				{Name: "LastUsedOrPrompt", Value: "last_used_or_prompt"},
				{Name: "AlwaysPrompt", Value: "always_prompt"},
			},
			reflect.TypeOf(SetupLauncherWorkspaceBehavior("")): {
				{Name: "LastUsedOrPrompt", Value: "last-used-or-prompt"},
				{Name: "AlwaysPrompt", Value: "always-prompt"},
			},
			reflect.TypeOf(LauncherInstallSource("")): {
				{Name: "UVTool", Value: "uv-tool"},
				{Name: "InstallerManaged", Value: "installer-managed"},
				{Name: "Unsupported", Value: "unsupported"},
			},
			reflect.TypeOf(LauncherUpdateCapability("")): {
				{Name: "InApp", Value: "in_app"},
				{Name: "InstallerManaged", Value: "installer_managed"},
				{Name: "Unsupported", Value: "unsupported"},
			},
			reflect.TypeOf(AppCatalogPropType("")): {
				{Name: "String", Value: "string"},
				{Name: "Number", Value: "number"},
				{Name: "Dimension", Value: "dimension"},
				{Name: "Boolean", Value: "boolean"},
			},
			reflect.TypeOf(PluginScope("")): {
				{Name: "Workspace", Value: "workspace"},
				{Name: "SettaFiles", Value: "setta_files"},
				{Name: "Global", Value: "global"},
			},
			reflect.TypeOf(PluginRuntimeState("")): {
				{Name: "active", Value: "active"},
				{Name: "disabled", Value: "disabled"},
				{Name: "invalid", Value: "invalid"},
				{Name: "shadowed", Value: "shadowed"},
				{Name: "pending_restart", Value: "pending_restart"},
			},
			reflect.TypeOf(PluginEnablementSource("")): {
				{Name: "WorkspaceDisabled", Value: "workspace_disabled"},
				{Name: "WorkspaceEnabled", Value: "workspace_enabled"},
				{Name: "GlobalAutoEnabled", Value: "global_auto_enabled"},
				{Name: "ManifestDefault", Value: "manifest_default"},
			},
			reflect.TypeOf(PluginSourceManager("")): {
				{Name: "Setta", Value: "setta"},
				{Name: "PackageManager", Value: "package_manager"},
			},
			reflect.TypeOf(PluginInstallerBackend("")): {
				{Name: "Auto", Value: "auto"},
				{Name: "Pip", Value: "pip"},
				{Name: "UV", Value: "uv"},
			},
			reflect.TypeOf(PluginSourceTrustStatus("")): {
				{Name: "Unverified", Value: "unverified"},
			},
			reflect.TypeOf(PluginBlockedCapabilityReason("")): {
				{Name: "ModePolicy", Value: "mode_policy"},
				{Name: "HostPolicy", Value: "host_policy"},
				{Name: "ManifestInvalid", Value: "manifest_invalid"},
			},
			reflect.TypeOf(PluginRestartCapabilityMode("")): {
				{Name: "Manual", Value: "manual"},
				{Name: "Programmatic", Value: "programmatic"},
			},
		},
		manualTypes: map[reflect.Type]TypeDeclaration{
			reflect.TypeOf(SectionDependencyKey{}): {
				Name: "SectionDependencyKey",
				Kind: "object",
				Properties: []TypeProperty{
					{Name: "sectionId", TypeExpr: "string"},
					{Name: "type", TypeExpr: "typeof DependencyKeyTypeEnum.Section"},
				},
			},
			reflect.TypeOf(SectionParamDependencyKey{}): {
				Name: "SectionParamDependencyKey",
				Kind: "object",
				Properties: []TypeProperty{
					{Name: "sectionId", TypeExpr: "string"},
					{Name: "codeObjId", TypeExpr: "string"},
					{Name: "type", TypeExpr: "typeof DependencyKeyTypeEnum.SectionParam"},
				},
			},
			reflect.TypeOf(BaseDependencyKeyUnion{}): {
				Name:  "BaseDependencyKeyUnion",
				Kind:  "alias",
				Alias: "SectionDependencyKey | SectionParamDependencyKey",
			},
			reflect.TypeOf(LiteralDependencyValue{}): {
				Name: "LiteralDependencyValue",
				Kind: "object",
				Properties: []TypeProperty{
					{Name: "payload", TypeExpr: "string"},
					{Name: "type", TypeExpr: "typeof DependencyValueTypeEnum.Literal"},
				},
			},
			reflect.TypeOf(FileReadDependencyValue{}): {
				Name: "FileReadDependencyValue",
				Kind: "object",
				Properties: []TypeProperty{
					{Name: "payload", TypeExpr: "string"},
					{Name: "type", TypeExpr: "typeof DependencyValueTypeEnum.FileRead"},
				},
			},
			reflect.TypeOf(BinaryDependencyValue{}): {
				Name: "BinaryDependencyValue",
				Kind: "object",
				Properties: []TypeProperty{
					{Name: "payload", TypeExpr: "BinaryContentRef"},
					{Name: "type", TypeExpr: "typeof DependencyValueTypeEnum.Binary"},
				},
			},
			reflect.TypeOf(BaseDependencyValueUnion{}): {
				Name:  "BaseDependencyValueUnion",
				Kind:  "alias",
				Alias: "LiteralDependencyValue | FileReadDependencyValue | BinaryDependencyValue",
			},
			reflect.TypeOf(ProjectStateSingleConfig{}): {
				Name: "ProjectStateSingleConfig",
				Kind: "raw",
				Raw:  projectStateFrontendSupportRawTS,
			},
			reflect.TypeOf(AIRuntimeSupport{}): {
				Name: "AIRuntimeSupport",
				Kind: "raw",
				Raw:  aiRuntimeFrontendSupportRawTS,
			},
			reflect.TypeOf(PluginListEntry{}): {
				Name: "PluginListEntry",
				Kind: "raw",
				Raw:  pluginListEntryRawTS,
			},
			reflect.TypeOf(PluginStatusEntry{}): {
				Name: "PluginStatusEntry",
				Kind: "raw",
				Raw:  pluginStatusEntryRawTS,
			},
		},
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

func (c *typeConverter) renderTypeExpr(t reflect.Type) (string, error) {
	if t == nil {
		return "null", nil
	}
	if t == timeType {
		return "string", nil
	}
	if t.Name() != "" && t.PkgPath() != "" {
		if err := c.ensureDeclaration(t); err != nil {
			return "", err
		}
		return t.Name(), nil
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
		properties, err := c.structProperties(t)
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
			return t.Name(), nil
		}
		return "", fmt.Errorf("unsupported Go type for TS conversion: %s", t.String())
	}
}

func (c *typeConverter) ensureDeclaration(t reflect.Type) error {
	if t == nil || t.PkgPath() == "" || t == timeType {
		return nil
	}
	if _, ok := c.seen[t]; ok {
		return nil
	}
	c.seen[t] = struct{}{}

	if decl, ok := c.manualTypes[t]; ok {
		c.declarations = append(c.declarations, decl)
		return nil
	}

	if values, ok := c.stringEnums[t]; ok {
		c.declarations = append(c.declarations, TypeDeclaration{
			Name:       t.Name(),
			Kind:       "enum",
			EnumValues: values,
		})
		return nil
	}

	switch t.Kind() {
	case reflect.Struct:
		properties, err := c.structProperties(t)
		if err != nil {
			return err
		}
		c.declarations = append(c.declarations, TypeDeclaration{
			Name:       t.Name(),
			Kind:       "object",
			Properties: properties,
		})
		return nil
	case reflect.String:
		c.declarations = append(c.declarations, TypeDeclaration{
			Name:  t.Name(),
			Kind:  "alias",
			Alias: "string",
		})
		return nil
	case reflect.Bool:
		c.declarations = append(c.declarations, TypeDeclaration{
			Name:  t.Name(),
			Kind:  "alias",
			Alias: "boolean",
		})
		return nil
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64,
		reflect.Float32, reflect.Float64:
		c.declarations = append(c.declarations, TypeDeclaration{
			Name:  t.Name(),
			Kind:  "alias",
			Alias: "number",
		})
		return nil
	case reflect.Slice, reflect.Array:
		inner, err := c.renderTypeExpr(t.Elem())
		if err != nil {
			return err
		}
		c.declarations = append(c.declarations, TypeDeclaration{
			Name:  t.Name(),
			Kind:  "alias",
			Alias: fmt.Sprintf("Array<%s>", inner),
		})
		return nil
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
			Name:  t.Name(),
			Kind:  "alias",
			Alias: fmt.Sprintf("Record<%s, %s>", keyExpr, valueExpr),
		})
		return nil
	default:
		return fmt.Errorf("unsupported named Go type for TS declaration: %s", t.String())
	}
}

func (c *typeConverter) structProperties(t reflect.Type) ([]TypeProperty, error) {
	properties := make([]TypeProperty, 0, t.NumField())
	for i := range t.NumField() {
		field := t.Field(i)
		if !field.IsExported() {
			continue
		}
		name, optional, skip := jsonFieldName(field)
		if skip {
			continue
		}
		typeExpr, err := c.renderTypeExpr(field.Type)
		if err != nil {
			return nil, fmt.Errorf("%s.%s: %w", t.Name(), field.Name, err)
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
