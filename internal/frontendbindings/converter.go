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
	CreateExpr string
	FactoryTS  string
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

func objectDeclaration(name string, properties ...TypeProperty) TypeDeclaration {
	return TypeDeclaration{
		Name:       name,
		Kind:       "object",
		Properties: properties,
	}
}

func objectDeclarationWithCreateExpr(name string, createExpr string, properties ...TypeProperty) TypeDeclaration {
	declaration := objectDeclaration(name, properties...)
	declaration.CreateExpr = createExpr
	return declaration
}

func objectDeclarationWithFactory(name string, factoryTS string, properties ...TypeProperty) TypeDeclaration {
	declaration := objectDeclaration(name, properties...)
	declaration.FactoryTS = factoryTS
	return declaration
}

func aliasDeclaration(name string, alias string) TypeDeclaration {
	return TypeDeclaration{
		Name:  name,
		Kind:  "alias",
		Alias: alias,
	}
}

func aliasDeclarationWithCreateExpr(name string, alias string, createExpr string) TypeDeclaration {
	declaration := aliasDeclaration(name, alias)
	declaration.CreateExpr = createExpr
	return declaration
}

func aliasDeclarationWithFactory(name string, alias string, factoryTS string) TypeDeclaration {
	declaration := aliasDeclaration(name, alias)
	declaration.FactoryTS = factoryTS
	return declaration
}

func rawDeclaration(name string, raw string) TypeDeclaration {
	return TypeDeclaration{
		Name: name,
		Kind: "raw",
		Raw:  raw,
	}
}

const metaControlSizingPolicyByTypeFactoryTS = `export function createMetaControlSizingPolicyByType(
  options: Partial<MetaControlSizingPolicyByType> = {},
): MetaControlSizingPolicyByType {
  return {
    ...mergeGeneratedOptions<MetaControlSizingPolicyByType>(
      {
        CodeCallable: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: MetaControlSizeModeEnum.any,
          sizeModeWidth: MetaControlSizeModeEnum.any,
        },
        CodeParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: MetaControlSizeModeEnum.any,
          sizeModeWidth: MetaControlSizeModeEnum.any,
        },
        TextParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: MetaControlSizeModeEnum.any,
          sizeModeWidth: MetaControlSizeModeEnum.any,
        },
        DateParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: MetaControlSizeModeEnum.any,
          sizeModeWidth: MetaControlSizeModeEnum.any,
        },
        TimeParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: MetaControlSizeModeEnum.any,
          sizeModeWidth: MetaControlSizeModeEnum.any,
        },
        ButtonParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: MetaControlSizeModeEnum.any,
          sizeModeWidth: MetaControlSizeModeEnum.any,
        },
        SliderParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: MetaControlSizeModeEnum.auto_only,
          sizeModeWidth: MetaControlSizeModeEnum.any,
        },
        RotaryParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: MetaControlSizeModeEnum.any,
          sizeModeWidth: MetaControlSizeModeEnum.any,
        },
        SwitchParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: MetaControlSizeModeEnum.any,
          sizeModeWidth: MetaControlSizeModeEnum.any,
        },
        ColorPickerParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: MetaControlSizeModeEnum.any,
          sizeModeWidth: MetaControlSizeModeEnum.any,
        },
        DropdownParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: MetaControlSizeModeEnum.auto_only,
          sizeModeWidth: MetaControlSizeModeEnum.any,
        },
        PasswordParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: MetaControlSizeModeEnum.auto_only,
          sizeModeWidth: MetaControlSizeModeEnum.any,
        },
        TextAreaParam: {
          minHeight: 80,
          minWidth: 200,
          sizeModeHeight: MetaControlSizeModeEnum.any,
          sizeModeWidth: MetaControlSizeModeEnum.any,
        },
        DropzoneParam: {
          minHeight: 120,
          minWidth: 240,
          sizeModeHeight: MetaControlSizeModeEnum.any,
          sizeModeWidth: MetaControlSizeModeEnum.any,
        },
        NestedParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: MetaControlSizeModeEnum.any,
          sizeModeWidth: MetaControlSizeModeEnum.any,
        },
      },
      options,
    ),
    CodeCallable: mergeGeneratedOptions<MetaControlSizingPolicyTypeEntry>(
      {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: MetaControlSizeModeEnum.any,
        sizeModeWidth: MetaControlSizeModeEnum.any,
      },
      options.CodeCallable ?? {},
    ),
    CodeParam: mergeGeneratedOptions<MetaControlSizingPolicyTypeEntry>(
      {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: MetaControlSizeModeEnum.any,
        sizeModeWidth: MetaControlSizeModeEnum.any,
      },
      options.CodeParam ?? {},
    ),
    TextParam: mergeGeneratedOptions<MetaControlSizingPolicyTypeEntry>(
      {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: MetaControlSizeModeEnum.any,
        sizeModeWidth: MetaControlSizeModeEnum.any,
      },
      options.TextParam ?? {},
    ),
    DateParam: mergeGeneratedOptions<MetaControlSizingPolicyTypeEntry>(
      {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: MetaControlSizeModeEnum.any,
        sizeModeWidth: MetaControlSizeModeEnum.any,
      },
      options.DateParam ?? {},
    ),
    TimeParam: mergeGeneratedOptions<MetaControlSizingPolicyTypeEntry>(
      {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: MetaControlSizeModeEnum.any,
        sizeModeWidth: MetaControlSizeModeEnum.any,
      },
      options.TimeParam ?? {},
    ),
    ButtonParam: mergeGeneratedOptions<MetaControlSizingPolicyTypeEntry>(
      {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: MetaControlSizeModeEnum.any,
        sizeModeWidth: MetaControlSizeModeEnum.any,
      },
      options.ButtonParam ?? {},
    ),
    SliderParam: mergeGeneratedOptions<MetaControlSizingPolicyTypeEntry>(
      {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: MetaControlSizeModeEnum.auto_only,
        sizeModeWidth: MetaControlSizeModeEnum.any,
      },
      options.SliderParam ?? {},
    ),
    RotaryParam: mergeGeneratedOptions<MetaControlSizingPolicyTypeEntry>(
      {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: MetaControlSizeModeEnum.any,
        sizeModeWidth: MetaControlSizeModeEnum.any,
      },
      options.RotaryParam ?? {},
    ),
    SwitchParam: mergeGeneratedOptions<MetaControlSizingPolicyTypeEntry>(
      {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: MetaControlSizeModeEnum.any,
        sizeModeWidth: MetaControlSizeModeEnum.any,
      },
      options.SwitchParam ?? {},
    ),
    ColorPickerParam: mergeGeneratedOptions<MetaControlSizingPolicyTypeEntry>(
      {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: MetaControlSizeModeEnum.any,
        sizeModeWidth: MetaControlSizeModeEnum.any,
      },
      options.ColorPickerParam ?? {},
    ),
    DropdownParam: mergeGeneratedOptions<MetaControlSizingPolicyTypeEntry>(
      {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: MetaControlSizeModeEnum.auto_only,
        sizeModeWidth: MetaControlSizeModeEnum.any,
      },
      options.DropdownParam ?? {},
    ),
    PasswordParam: mergeGeneratedOptions<MetaControlSizingPolicyTypeEntry>(
      {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: MetaControlSizeModeEnum.auto_only,
        sizeModeWidth: MetaControlSizeModeEnum.any,
      },
      options.PasswordParam ?? {},
    ),
    TextAreaParam: mergeGeneratedOptions<MetaControlSizingPolicyTypeEntry>(
      {
        minHeight: 80,
        minWidth: 200,
        sizeModeHeight: MetaControlSizeModeEnum.any,
        sizeModeWidth: MetaControlSizeModeEnum.any,
      },
      options.TextAreaParam ?? {},
    ),
    DropzoneParam: mergeGeneratedOptions<MetaControlSizingPolicyTypeEntry>(
      {
        minHeight: 120,
        minWidth: 240,
        sizeModeHeight: MetaControlSizeModeEnum.any,
        sizeModeWidth: MetaControlSizeModeEnum.any,
      },
      options.DropzoneParam ?? {},
    ),
    NestedParam: mergeGeneratedOptions<MetaControlSizingPolicyTypeEntry>(
      {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: MetaControlSizeModeEnum.any,
        sizeModeWidth: MetaControlSizeModeEnum.any,
      },
      options.NestedParam ?? {},
    ),
  };
}`

const sectionSizingPolicyByTypeFactoryTS = `export function createSectionSizingPolicyByType(
  options: Partial<SectionSizingPolicyByType> = {},
): SectionSizingPolicyByType {
  return {
    ...mergeGeneratedOptions(
      {
        Callable: {
          minHeight: 104,
          maxHeight: 100000,
          minWidth: 200,
          maxWidth: 100000,
          hideSearchMinHeight: 42,
          hideParamsMinHeight: 90,
        },
        Dict: {
          minHeight: 78,
          maxHeight: 100000,
          minWidth: 200,
          maxWidth: 100000,
        },
        ListRoot: {
          minHeight: 50,
          maxHeight: 50,
          minWidth: 200,
          maxWidth: 100000,
        },
        Group: {
          minHeight: 0,
          maxHeight: 100000,
          minWidth: 200,
          maxWidth: 100000,
        },
        Image: {
          minHeight: 100,
          maxHeight: 100000,
          minWidth: 200,
          maxWidth: 100000,
        },
        Chart: {
          minHeight: 300,
          maxHeight: 100000,
          minWidth: 300,
          maxWidth: 100000,
        },
        Draw: {
          minHeight: 100,
          maxHeight: 100000,
          minWidth: 402,
          maxWidth: 100000,
        },
        Prompt: {
          minHeight: 150,
          maxHeight: 100000,
          minWidth: 300,
          maxWidth: 100000,
        },
        TextBlock: {
          minHeight: 49,
          maxHeight: 100000,
          minWidth: 100,
          maxWidth: 100000,
        },
        MetaControl: {
          minHeight: 10,
          maxHeight: 100000,
          minWidth: 100,
          maxWidth: 100000,
        },
        Social: {
          minHeight: 50,
          maxHeight: 100000,
          minWidth: 200,
          maxWidth: 100000,
        },
        GlobalVariables: {
          minHeight: 78,
          maxHeight: 100000,
          minWidth: 200,
          maxWidth: 100000,
        },
        Code: {
          minHeight: 58.2,
          maxHeight: 100000,
          minWidth: 200,
          maxWidth: 100000,
        },
        GenPythonCode: {
          minHeight: 0,
          maxHeight: 100000,
          minWidth: 200,
          maxWidth: 100000,
        },
        GenPythonMetadata: {
          minHeight: 0,
          maxHeight: 100000,
          minWidth: 200,
          maxWidth: 100000,
        },
        Terminal: {
          minHeight: 100,
          maxHeight: 100000,
          minWidth: 200,
          maxWidth: 100000,
        },
        IFrame: {
          minHeight: 0,
          maxHeight: 100000,
          minWidth: 200,
          maxWidth: 100000,
        },
        Chat: {
          minHeight: 200,
          maxHeight: 100000,
          minWidth: 400,
          maxWidth: 100000,
        },
        Browser: {
          minHeight: 250,
          maxHeight: 100000,
          minWidth: 200,
          maxWidth: 100000,
        },
        Plugin: {
          minHeight: 80,
          maxHeight: 100000,
          minWidth: 200,
          maxWidth: 100000,
        },
        TaskBoard: {
          minHeight: 240,
          maxHeight: 100000,
          minWidth: 360,
          maxWidth: 100000,
        },
        Spreadsheet: {
          minHeight: 260,
          maxHeight: 100000,
          minWidth: 420,
          maxWidth: 100000,
        },
      },
      options,
    ),
    Callable: mergeGeneratedOptions(
      {
        minHeight: 104,
        maxHeight: 100000,
        minWidth: 200,
        maxWidth: 100000,
        hideSearchMinHeight: 42,
        hideParamsMinHeight: 90,
      },
      options.Callable ?? {},
    ),
    Dict: mergeGeneratedOptions(
      {
        minHeight: 78,
        maxHeight: 100000,
        minWidth: 200,
        maxWidth: 100000,
      },
      options.Dict ?? {},
    ),
    ListRoot: mergeGeneratedOptions(
      {
        minHeight: 50,
        maxHeight: 50,
        minWidth: 200,
        maxWidth: 100000,
      },
      options.ListRoot ?? {},
    ),
    Group: mergeGeneratedOptions(
      {
        minHeight: 0,
        maxHeight: 100000,
        minWidth: 200,
        maxWidth: 100000,
      },
      options.Group ?? {},
    ),
    Image: mergeGeneratedOptions(
      {
        minHeight: 100,
        maxHeight: 100000,
        minWidth: 200,
        maxWidth: 100000,
      },
      options.Image ?? {},
    ),
    Chart: mergeGeneratedOptions(
      {
        minHeight: 300,
        maxHeight: 100000,
        minWidth: 300,
        maxWidth: 100000,
      },
      options.Chart ?? {},
    ),
    Draw: mergeGeneratedOptions(
      {
        minHeight: 100,
        maxHeight: 100000,
        minWidth: 402,
        maxWidth: 100000,
      },
      options.Draw ?? {},
    ),
    Prompt: mergeGeneratedOptions(
      {
        minHeight: 150,
        maxHeight: 100000,
        minWidth: 300,
        maxWidth: 100000,
      },
      options.Prompt ?? {},
    ),
    TextBlock: mergeGeneratedOptions(
      {
        minHeight: 49,
        maxHeight: 100000,
        minWidth: 100,
        maxWidth: 100000,
      },
      options.TextBlock ?? {},
    ),
    MetaControl: mergeGeneratedOptions(
      {
        minHeight: 10,
        maxHeight: 100000,
        minWidth: 100,
        maxWidth: 100000,
      },
      options.MetaControl ?? {},
    ),
    Social: mergeGeneratedOptions(
      {
        minHeight: 50,
        maxHeight: 100000,
        minWidth: 200,
        maxWidth: 100000,
      },
      options.Social ?? {},
    ),
    GlobalVariables: mergeGeneratedOptions(
      {
        minHeight: 78,
        maxHeight: 100000,
        minWidth: 200,
        maxWidth: 100000,
      },
      options.GlobalVariables ?? {},
    ),
    Code: mergeGeneratedOptions(
      {
        minHeight: 58.2,
        maxHeight: 100000,
        minWidth: 200,
        maxWidth: 100000,
      },
      options.Code ?? {},
    ),
    GenPythonCode: mergeGeneratedOptions(
      {
        minHeight: 0,
        maxHeight: 100000,
        minWidth: 200,
        maxWidth: 100000,
      },
      options.GenPythonCode ?? {},
    ),
    GenPythonMetadata: mergeGeneratedOptions(
      {
        minHeight: 0,
        maxHeight: 100000,
        minWidth: 200,
        maxWidth: 100000,
      },
      options.GenPythonMetadata ?? {},
    ),
    Terminal: mergeGeneratedOptions(
      {
        minHeight: 100,
        maxHeight: 100000,
        minWidth: 200,
        maxWidth: 100000,
      },
      options.Terminal ?? {},
    ),
    IFrame: mergeGeneratedOptions(
      {
        minHeight: 0,
        maxHeight: 100000,
        minWidth: 200,
        maxWidth: 100000,
      },
      options.IFrame ?? {},
    ),
    Chat: mergeGeneratedOptions(
      {
        minHeight: 200,
        maxHeight: 100000,
        minWidth: 400,
        maxWidth: 100000,
      },
      options.Chat ?? {},
    ),
    Browser: mergeGeneratedOptions(
      {
        minHeight: 250,
        maxHeight: 100000,
        minWidth: 200,
        maxWidth: 100000,
      },
      options.Browser ?? {},
    ),
    Plugin: mergeGeneratedOptions(
      {
        minHeight: 80,
        maxHeight: 100000,
        minWidth: 200,
        maxWidth: 100000,
      },
      options.Plugin ?? {},
    ),
    TaskBoard: mergeGeneratedOptions(
      {
        minHeight: 240,
        maxHeight: 100000,
        minWidth: 360,
        maxWidth: 100000,
      },
      options.TaskBoard ?? {},
    ),
    Spreadsheet: mergeGeneratedOptions(
      {
        minHeight: 260,
        maxHeight: 100000,
        minWidth: 420,
        maxWidth: 100000,
      },
      options.Spreadsheet ?? {},
    ),
  };
}`

const sectionSizingPolicyFactoryTS = `export function createSectionSizingPolicy(
  options: Partial<SectionSizingPolicy> = {},
): SectionSizingPolicy {
  const byType = createSectionSizingPolicyByType(options.byType ?? {});
  const metaControlByType = createMetaControlSizingPolicyByType(
    options.metaControlByType ?? {},
  );
  const globals = createSectionSizingPolicyGlobals(options.globals ?? {});
  return {
    ...mergeGeneratedOptions(
      {
        byType,
        metaControlByType,
        globals,
      },
      options,
    ),
    byType,
    metaControlByType,
    globals,
  };
}`

const settingsStateFactoryTS = `export function createSettingsState(
  options: Partial<SettingsState> = {},
): SettingsState {
  const shortcuts = createSettingsShortcuts(options.shortcuts ?? {});
  const gui = createSettingsGUI(options.gui ?? {});
  const backend = createSettingsBackend(options.backend ?? {});
  const sectionSizingPolicy = createSectionSizingPolicy(
    options.sectionSizingPolicy ?? {},
  );
  const defaults: SettingsState = {
    shortcuts,
    gui,
    backend,
    sectionSizingPolicy,
    languageServer: {
      basedpyright: {
        analysis: {
          diagnosticSeverityOverrides: {
            reportUnknownVariableType: "none",
            reportUnknownMemberType: "none",
            reportUnannotatedClassAttribute: "none",
            reportSelfClsParameterName: "none",
          },
        },
      },
    },
  };
  return {
    ...mergeGeneratedOptions(defaults, options),
    shortcuts,
    gui,
    backend,
    sectionSizingPolicy,
    languageServer: cloneGeneratedValue(
      options.languageServer ?? defaults.languageServer,
    ),
  };
}`

const sectionCodegenPolicyFactoryTS = `export function createSectionCodegenPolicy(
  options: Partial<SectionCodegenPolicy> = {},
): SectionCodegenPolicy {
  const defaultSectionCodegenAllowlist: Array<SectionType> = [
    SectionTypeEnum.Callable,
    SectionTypeEnum.Dict,
    SectionTypeEnum.ListRoot,
    SectionTypeEnum.Group,
    SectionTypeEnum.GlobalVariables,
    SectionTypeEnum.TextBlock,
    SectionTypeEnum.Draw,
    SectionTypeEnum.MetaControl,
    SectionTypeEnum.TaskBoard,
    SectionTypeEnum.Spreadsheet,
  ];
  const defaultMetaControlCodegenAllowlist: Array<CodeObjType> = [
    CodeObjTypeEnum.CodeParam,
    CodeObjTypeEnum.TextParam,
    CodeObjTypeEnum.DateParam,
    CodeObjTypeEnum.TimeParam,
    CodeObjTypeEnum.TextAreaParam,
    CodeObjTypeEnum.SliderParam,
    CodeObjTypeEnum.RotaryParam,
    CodeObjTypeEnum.SwitchParam,
    CodeObjTypeEnum.ColorPickerParam,
    CodeObjTypeEnum.DropdownParam,
    CodeObjTypeEnum.PasswordParam,
    CodeObjTypeEnum.ButtonParam,
    CodeObjTypeEnum.DropzoneParam,
  ];
  function defaultSectionRepresentation(
    sectionType: SectionType,
  ): SectionRepresentationMode {
    switch (sectionType) {
      case SectionTypeEnum.Chat:
      case SectionTypeEnum.Draw:
      case SectionTypeEnum.Image:
        return SectionRepresentationModeEnum.file_read;
      default:
        return SectionRepresentationModeEnum.expression;
    }
  }
  const typePolicies = Object.fromEntries(
    (Object.values(SectionTypeEnum) as Array<SectionType>).map(
      (sectionType) => [
        sectionType,
        createSectionTypeCodegenPolicy({
          representation: defaultSectionRepresentation(sectionType),
        }),
      ],
    ),
  ) as Record<SectionType, SectionTypeCodegenPolicy>;
  for (const [sectionType, policy] of Object.entries(
    options.typePolicies ?? {},
  ) as Array<[SectionType, SectionTypeCodegenPolicy]>) {
    typePolicies[sectionType] = createSectionTypeCodegenPolicy(policy);
  }
  const sectionOverrides = Object.fromEntries(
    Object.entries(options.sectionOverrides ?? {}).map(([sectionId, override]) => [
      sectionId,
      createSectionCodegenOverride(override),
    ]),
  ) as Record<string, SectionCodegenOverride>;
  return {
    ...mergeGeneratedOptions(
      {
        allowlist: defaultSectionCodegenAllowlist,
        metaControlAllowlist: defaultMetaControlCodegenAllowlist,
        exclude: [],
        typePolicies,
        sectionOverrides,
      },
      options,
    ),
    allowlist:
      options.allowlist === null
        ? null
        : [...(options.allowlist ?? defaultSectionCodegenAllowlist)],
    metaControlAllowlist:
      options.metaControlAllowlist === null
        ? null
        : [
            ...(options.metaControlAllowlist ??
              defaultMetaControlCodegenAllowlist),
          ],
    exclude: [...(options.exclude ?? [])],
    typePolicies,
    sectionOverrides,
  };
}`

const codeObjValuePolicyFactoryTS = `export function createCodeObjValuePolicy(
  options: Partial<CodeObjValuePolicy> = {},
): CodeObjValuePolicy {
  function defaultCodeObjValueRepresentation(
    codeObjType: CodeObjType,
  ): CodeObjValueRepresentationMode {
    switch (codeObjType) {
      case CodeObjTypeEnum.TextParam:
      case CodeObjTypeEnum.DateParam:
      case CodeObjTypeEnum.TimeParam:
      case CodeObjTypeEnum.TextAreaParam:
      case CodeObjTypeEnum.PasswordParam:
      case CodeObjTypeEnum.ColorPickerParam:
        return CodeObjValueRepresentationModeEnum.string;
      case CodeObjTypeEnum.DropzoneParam:
        return CodeObjValueRepresentationModeEnum.file_path;
      default:
        return CodeObjValueRepresentationModeEnum.expression;
    }
  }
  const typePolicies = Object.fromEntries(
    (Object.values(CodeObjTypeEnum) as Array<CodeObjType>).map((codeObjType) => [
      codeObjType,
      createCodeObjTypeValuePolicy({
        representation: defaultCodeObjValueRepresentation(codeObjType),
      }),
    ]),
  ) as Record<CodeObjType, CodeObjTypeValuePolicy>;
  for (const [codeObjType, policy] of Object.entries(
    options.typePolicies ?? {},
  ) as Array<[CodeObjType, CodeObjTypeValuePolicy]>) {
    typePolicies[codeObjType] = createCodeObjTypeValuePolicy(policy);
  }
  const codeObjOverrides = Object.fromEntries(
    Object.entries(options.codeObjOverrides ?? {}).map(([codeObjId, override]) => [
      codeObjId,
      createCodeObjValueOverride(override),
    ]),
  ) as Record<string, CodeObjValueOverride>;
  return {
    ...mergeGeneratedOptions(
      {
        typePolicies,
        codeObjOverrides,
      },
      options,
    ),
    typePolicies,
    codeObjOverrides,
  };
}`

const projectCodegenPythonTargetFactoryTS = `export function createProjectCodegenPythonTarget(
  options: Partial<ProjectCodegenPythonTarget> = {},
): ProjectCodegenPythonTarget {
  const sectionPolicy = createSectionCodegenPolicy(options.sectionPolicy ?? {});
  const codeObjValuePolicy = createCodeObjValuePolicy(
    options.codeObjValuePolicy ?? {},
  );
  return {
    ...mergeGeneratedOptions(
      {
        language: ProjectCodegenLanguageEnum.python,
        genCodePrefix: "",
        genCodeSuffix: "state = SettaState()",
        generateMetadata: false,
        sectionPolicy,
        codeObjValuePolicy,
      },
      options,
    ),
    language: ProjectCodegenLanguageEnum.python,
    sectionPolicy,
    codeObjValuePolicy,
  };
}`

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
			reflect.TypeOf(MCPServerTransport("")): {
				{Name: "sse", Value: "sse"},
				{Name: "streamable_http", Value: "streamable_http"},
				{Name: "stdio", Value: "stdio"},
			},
			reflect.TypeOf(PromptFormat("")): {
				{Name: "Jinja", Value: "Jinja"},
			},
			reflect.TypeOf(ExternalAgentToolType("")): {
				{Name: "claude_code", Value: "claude_code"},
				{Name: "codex", Value: "codex"},
				{Name: "opencode", Value: "opencode"},
				{Name: "plugin", Value: "plugin"},
			},
			reflect.TypeOf(ExternalAgentRunMode("")): {
				{Name: "mcp", Value: "mcp"},
				{Name: "server", Value: "server"},
				{Name: "sdk", Value: "sdk"},
				{Name: "app_server", Value: "app_server"},
			},
			reflect.TypeOf(ExternalAgentSettingsMode("")): {
				{Name: "read_only", Value: "read_only"},
				{Name: "managed_local", Value: "managed_local"},
				{Name: "managed_project", Value: "managed_project"},
				{Name: "explicit_path", Value: "explicit_path"},
			},
			reflect.TypeOf(ExternalAgentWorkingDirStrategy("")): {
				{Name: "project_root", Value: "project_root"},
				{Name: "temp_dir", Value: "temp_dir"},
				{Name: "custom", Value: "custom"},
			},
			reflect.TypeOf(ClaudeSettingsSource("")): {
				{Name: "user", Value: "user"},
				{Name: "project", Value: "project"},
				{Name: "local", Value: "local"},
			},
			reflect.TypeOf(SettaNotificationType("")): {
				{Name: "error", Value: "error"},
				{Name: "warning", Value: "warning"},
				{Name: "info", Value: "info"},
				{Name: "save", Value: "save"},
			},
			reflect.TypeOf(ChatRole("")): {
				{Name: "system", Value: "system"},
				{Name: "user", Value: "user"},
				{Name: "assistant", Value: "assistant"},
				{Name: "tool", Value: "tool"},
			},
			reflect.TypeOf(ChatPermissionMode("")): {
				{Name: "minimal", Value: "minimal"},
				{Name: "yolo", Value: "yolo"},
				{Name: "config_toml_custom", Value: "config_toml_custom"},
			},
			reflect.TypeOf(ChatDictationMode("")): {
				{Name: "auto", Value: "auto"},
				{Name: "browser", Value: "browser"},
				{Name: "provider", Value: "provider"},
			},
			reflect.TypeOf(SectionType("")): {
				{Name: "Callable", Value: "Callable"},
				{Name: "Dict", Value: "Dict"},
				{Name: "ListRoot", Value: "ListRoot"},
				{Name: "Group", Value: "Group"},
				{Name: "Image", Value: "Image"},
				{Name: "Chart", Value: "Chart"},
				{Name: "Draw", Value: "Draw"},
				{Name: "TextBlock", Value: "TextBlock"},
				{Name: "Prompt", Value: "Prompt"},
				{Name: "MetaControl", Value: "MetaControl"},
				{Name: "Social", Value: "Social"},
				{Name: "GlobalVariables", Value: "GlobalVariables"},
				{Name: "Code", Value: "Code"},
				{Name: "GenPythonCode", Value: "GenPythonCode"},
				{Name: "GenPythonMetadata", Value: "GenPythonMetadata"},
				{Name: "Terminal", Value: "Terminal"},
				{Name: "IFrame", Value: "IFrame"},
				{Name: "Chat", Value: "Chat"},
				{Name: "Browser", Value: "Browser"},
				{Name: "Plugin", Value: "Plugin"},
				{Name: "TaskBoard", Value: "TaskBoard"},
				{Name: "Spreadsheet", Value: "Spreadsheet"},
			},
			reflect.TypeOf(CodeObjType("")): {
				{Name: "CodeCallable", Value: "CodeCallable"},
				{Name: "CodeParam", Value: "CodeParam"},
				{Name: "TextParam", Value: "TextParam"},
				{Name: "DateParam", Value: "DateParam"},
				{Name: "TimeParam", Value: "TimeParam"},
				{Name: "ButtonParam", Value: "ButtonParam"},
				{Name: "SliderParam", Value: "SliderParam"},
				{Name: "RotaryParam", Value: "RotaryParam"},
				{Name: "SwitchParam", Value: "SwitchParam"},
				{Name: "ColorPickerParam", Value: "ColorPickerParam"},
				{Name: "DropdownParam", Value: "DropdownParam"},
				{Name: "PasswordParam", Value: "PasswordParam"},
				{Name: "TextAreaParam", Value: "TextAreaParam"},
				{Name: "DropzoneParam", Value: "DropzoneParam"},
				{Name: "NestedParam", Value: "NestedParam"},
			},
			reflect.TypeOf(CodeLanguage("")): {
				{Name: "python", Value: "python"},
				{Name: "bash", Value: "bash"},
				{Name: "javascript", Value: "javascript"},
				{Name: "typescript", Value: "typescript"},
				{Name: "json", Value: "json"},
				{Name: "yaml", Value: "yaml"},
				{Name: "toml", Value: "toml"},
				{Name: "markdown", Value: "markdown"},
				{Name: "plaintext", Value: "plaintext"},
			},
			reflect.TypeOf(ConfigLanguage("")): {
				{Name: "python", Value: "python"},
				{Name: "json", Value: "json"},
			},
			reflect.TypeOf(ParameterPassingStyle("")): {
				{Name: "DEFAULT", Value: "DEFAULT"},
				{Name: "ARGS", Value: "ARGS"},
				{Name: "KWARGS", Value: "KWARGS"},
				{Name: "POSITIONAL_ONLY", Value: "POSITIONAL_ONLY"},
				{Name: "KEYWORD_ONLY", Value: "KEYWORD_ONLY"},
			},
			reflect.TypeOf(ParamNameType("")): {
				{Name: "CODE", Value: "CODE"},
				{Name: "TEXT", Value: "TEXT"},
			},
			reflect.TypeOf(ButtonActionMode("")): {
				{Name: "WEBSOCKET_LISTENER", Value: "WEBSOCKET_LISTENER"},
				{Name: "HTTP_REQUEST", Value: "HTTP_REQUEST"},
				{Name: "SETTA_API", Value: "SETTA_API"},
			},
			reflect.TypeOf(HttpRequestMethod("")): {
				{Name: "GET", Value: "GET"},
				{Name: "POST", Value: "POST"},
				{Name: "PUT", Value: "PUT"},
				{Name: "PATCH", Value: "PATCH"},
				{Name: "DELETE", Value: "DELETE"},
				{Name: "HEAD", Value: "HEAD"},
				{Name: "OPTIONS", Value: "OPTIONS"},
			},
			reflect.TypeOf(DropzoneMode("")): {
				{Name: "STATEFUL", Value: "STATEFUL"},
				{Name: "STATELESS", Value: "STATELESS"},
			},
			reflect.TypeOf(TextParamInputUIType("")): {
				{Name: "plain", Value: "plain"},
				{Name: "time", Value: "time"},
				{Name: "date", Value: "date"},
			},
			reflect.TypeOf(TimeDisplayFormat("")): {
				{Name: "twenty_four_hour", Value: "twenty_four_hour"},
				{Name: "twelve_hour", Value: "twelve_hour"},
			},
			reflect.TypeOf(TimeControlMode("")): {
				{Name: "input", Value: "input"},
				{Name: "display", Value: "display"},
			},
			reflect.TypeOf(TimeDisplayFont("")): {
				{Name: "clock", Value: "clock"},
				{Name: "monospace", Value: "monospace"},
				{Name: "system", Value: "system"},
			},
			reflect.TypeOf(DateDisplayFormat("")): {
				{Name: "iso", Value: "iso"},
				{Name: "us", Value: "us"},
				{Name: "eu", Value: "eu"},
				{Name: "long", Value: "long"},
			},
			reflect.TypeOf(DateControlMode("")): {
				{Name: "input", Value: "input"},
				{Name: "calendar", Value: "calendar"},
			},
			reflect.TypeOf(DateSelectionMode("")): {
				{Name: "single", Value: "single"},
				{Name: "multiple", Value: "multiple"},
			},
			reflect.TypeOf(DateCalendarWeekStart("")): {
				{Name: "sunday", Value: "sunday"},
				{Name: "monday", Value: "monday"},
			},
			reflect.TypeOf(BrowserAreaViewMode("")): {
				{Name: "list", Value: "list"},
				{Name: "thumbnail", Value: "thumbnail"},
				{Name: "carousel", Value: "carousel"},
			},
			reflect.TypeOf(BrowserSearchScope("")): {
				{Name: "recursive", Value: "recursive"},
				{Name: "local", Value: "local"},
			},
			reflect.TypeOf(RunSnapshotMode("")): {
				{Name: "ephemeral", Value: "ephemeral"},
				{Name: "always", Value: "always"},
				{Name: "never", Value: "never"},
			},
			reflect.TypeOf(RenameRefactorMode("")): {
				{Name: "ALWAYS_ASK", Value: "ALWAYS_ASK"},
				{Name: "ALWAYS_RENAME", Value: "ALWAYS_RENAME"},
				{Name: "NEVER_RENAME", Value: "NEVER_RENAME"},
			},
			reflect.TypeOf(BackgroundVariant("")): {
				{Name: "lines", Value: "lines"},
				{Name: "dots", Value: "dots"},
				{Name: "cross", Value: "cross"},
			},
			reflect.TypeOf(SelectionMode("")): {
				{Name: "partial", Value: "partial"},
				{Name: "full", Value: "full"},
			},
			reflect.TypeOf(PanOnScrollMode("")): {
				{Name: "free", Value: "free"},
				{Name: "vertical", Value: "vertical"},
				{Name: "horizontal", Value: "horizontal"},
			},
			reflect.TypeOf(ProjectCodegenLanguage("")): {
				{Name: "python", Value: "python"},
			},
			reflect.TypeOf(SectionCodegenMode("")): {
				{Name: "inherit", Value: "inherit"},
				{Name: "include", Value: "include"},
				{Name: "exclude", Value: "exclude"},
			},
			reflect.TypeOf(SectionRepresentationMode("")): {
				{Name: "expression", Value: "expression"},
				{Name: "file_path", Value: "file_path"},
				{Name: "file_read", Value: "file_read"},
			},
			reflect.TypeOf(CodeObjValueRepresentationMode("")): {
				{Name: "expression", Value: "expression"},
				{Name: "json_parsed", Value: "json_parsed"},
				{Name: "string", Value: "string"},
				{Name: "file_path", Value: "file_path"},
				{Name: "file_read", Value: "file_read"},
			},
			reflect.TypeOf(MetaControlSizeMode("")): {
				{Name: "any", Value: "any"},
				{Name: "auto_only", Value: "auto_only"},
				{Name: "manual_only", Value: "manual_only"},
			},
			reflect.TypeOf(SectionSizeMode("")): {
				{Name: "auto", Value: "auto"},
			},
			reflect.TypeOf(ListRootViewMode("")): {
				{Name: "default", Value: "default"},
				{Name: "task_list", Value: "task_list"},
				{Name: "kanban", Value: "kanban"},
			},
			reflect.TypeOf(TextBlockDisplayMode("")): {
				{Name: "Render", Value: "Render"},
				{Name: "Edit", Value: "Edit"},
			},
			reflect.TypeOf(TextBlockFormat("")): {
				{Name: "Plaintext", Value: "Plaintext"},
				{Name: "Markdown", Value: "Markdown"},
			},
			reflect.TypeOf(TaskBoardViewMode("")): {
				{Name: "task_list", Value: "task_list"},
				{Name: "kanban", Value: "kanban"},
			},
			reflect.TypeOf(TaskBoardTaskRecurrence("")): {
				{Name: "none", Value: "none"},
				{Name: "hourly", Value: "hourly"},
				{Name: "daily", Value: "daily"},
				{Name: "specified_days", Value: "specified_days"},
				{Name: "specified_months", Value: "specified_months"},
				{Name: "specified_years", Value: "specified_years"},
			},
			reflect.TypeOf(TaskBoardRecurringWeekday("")): {
				{Name: "monday", Value: "monday"},
				{Name: "tuesday", Value: "tuesday"},
				{Name: "wednesday", Value: "wednesday"},
				{Name: "thursday", Value: "thursday"},
				{Name: "friday", Value: "friday"},
				{Name: "saturday", Value: "saturday"},
				{Name: "sunday", Value: "sunday"},
			},
			reflect.TypeOf(TaskBoardRecurringMonth("")): {
				{Name: "january", Value: "january"},
				{Name: "february", Value: "february"},
				{Name: "march", Value: "march"},
				{Name: "april", Value: "april"},
				{Name: "may", Value: "may"},
				{Name: "june", Value: "june"},
				{Name: "july", Value: "july"},
				{Name: "august", Value: "august"},
				{Name: "september", Value: "september"},
				{Name: "october", Value: "october"},
				{Name: "november", Value: "november"},
				{Name: "december", Value: "december"},
			},
			reflect.TypeOf(AgenticEdgeKind("")): {
				{Name: "chat_chat", Value: "chat_chat"},
				{Name: "section_chat", Value: "section_chat"},
				{Name: "chat_section", Value: "chat_section"},
			},
			reflect.TypeOf(AgenticEdgeContextMode("")): {
				{Name: "reference_only", Value: "reference_only"},
				{Name: "inline_text", Value: "inline_text"},
				{Name: "summary", Value: "summary"},
			},
			reflect.TypeOf(CodeFileAccessMode("")): {
				{Name: "read_write", Value: "read_write"},
				{Name: "read_only", Value: "read_only"},
				{Name: "write_only", Value: "write_only"},
			},
			reflect.TypeOf(ClipboardDataType("")): {
				{Name: "Sections", Value: "Sections"},
			},
			reflect.TypeOf(ChartType("")): {
				{Name: "line", Value: "line"},
				{Name: "scatter", Value: "scatter"},
			},
			reflect.TypeOf(SpreadsheetGridDensity("")): {
				{Name: "compact", Value: "compact"},
				{Name: "comfortable", Value: "comfortable"},
			},
			reflect.TypeOf(EngineType("")): {
				{Name: "setta_llm", Value: "setta_llm"},
				{Name: "external_agent", Value: "external_agent"},
			},
			reflect.TypeOf(TranscriptionTransportMode("")): {
				{Name: "auto", Value: "auto"},
				{Name: "file", Value: "file"},
				{Name: "realtime", Value: "realtime"},
			},
			reflect.TypeOf(AgentRunStatus("")): {
				{Name: "queued", Value: "queued"},
				{Name: "running", Value: "running"},
				{Name: "completed", Value: "completed"},
				{Name: "failed", Value: "failed"},
				{Name: "cancelled", Value: "cancelled"},
			},
			reflect.TypeOf(StreamingEventType("")): {
				{Name: "MESSAGE_START", Value: "message_start"},
				{Name: "DELTA", Value: "delta"},
				{Name: "TOOL_CALL_DELTA", Value: "tool_call_delta"},
				{Name: "TOOL_ARGUMENT_PREVIEW_DELTA", Value: "tool_argument_preview_delta"},
				{Name: "TOOL_RESULT", Value: "tool_result"},
				{Name: "MESSAGE_STOP", Value: "message_stop"},
				{Name: "MESSAGE_FINALIZED", Value: "message_finalized"},
			},
			reflect.TypeOf(WebsocketConnectionType("")): {
				{Name: "CLI", Value: "CLI"},
				{Name: "SERVER", Value: "SERVER"},
				{Name: "PYTHON_LOGGER", Value: "PYTHON_LOGGER"},
				{Name: "PYTHON_SCRIPT", Value: "PYTHON_SCRIPT"},
				{Name: "FRONTEND", Value: "FRONTEND"},
			},
			reflect.TypeOf(WebsocketMsgTypeForFrontend("")): {
				{Name: "AllConnections", Value: "AllConnections"},
				{Name: "FrontendIdentity", Value: "FrontendIdentity"},
				{Name: "Notification", Value: "Notification"},
				{Name: "LLMStreamingResponse", Value: "LLMStreamingResponse"},
				{Name: "LSPDiagnostics", Value: "LSPDiagnostics"},
				{Name: "NameValidationErrors", Value: "NameValidationErrors"},
				{Name: "ReturnRenameRefactorResults", Value: "ReturnRenameRefactorResults"},
				{Name: "TerminalMetadata", Value: "TerminalMetadata"},
				{Name: "UpdateFrontendProjectState", Value: "UpdateFrontendProjectState"},
				{Name: "UpdateSettings", Value: "UpdateSettings"},
				{Name: "AllProjectMetadata", Value: "AllProjectMetadata"},
				{Name: "UpdateArtifacts", Value: "UpdateArtifacts"},
				{Name: "ListenerCoverageSnapshot", Value: "ListenerCoverageSnapshot"},
				{Name: "LLMConfigUpdated", Value: "LLMConfigUpdated"},
				{Name: "LLMApiKeysUpdated", Value: "LLMApiKeysUpdated"},
				{Name: "BackendLogEvent", Value: "BackendLogEvent"},
				{Name: "AIFollowToolArgumentsUpdate", Value: "AIFollowToolArgumentsUpdate"},
				{Name: "AIFollowToolResultUpdate", Value: "AIFollowToolResultUpdate"},
				{Name: "UISettingReveal", Value: "UISettingReveal"},
				{Name: "AgentProfilesUpdated", Value: "AgentProfilesUpdated"},
				{Name: "PromptTemplatesUpdated", Value: "PromptTemplatesUpdated"},
				{Name: "ExternalAgentConfigsUpdated", Value: "ExternalAgentConfigsUpdated"},
				{Name: "EngineConfigsUpdated", Value: "EngineConfigsUpdated"},
				{Name: "TranscriptionProfilesUpdated", Value: "TranscriptionProfilesUpdated"},
			},
			reflect.TypeOf(WebsocketMsgTypeForBackend("")): {
				{Name: "CurrentAddressUpdate", Value: "CurrentAddressUpdate"},
				{Name: "UISettingRevealResult", Value: "UISettingRevealResult"},
				{Name: "RealtimeUIChange", Value: "RealtimeUIChange"},
				{Name: "RealtimeDependencyEvent", Value: "RealtimeDependencyEvent"},
			},
			reflect.TypeOf(ArtifactType("")): {
				{Name: "Image", Value: "Image"},
				{Name: "BrushStroke", Value: "BrushStroke"},
				{Name: "DrawAreaLayerItemTransform", Value: "DrawAreaLayerItemTransform"},
				{Name: "ChartData", Value: "ChartData"},
				{Name: "File", Value: "File"},
			},
			reflect.TypeOf(DrawAreaBrushShape("")): {
				{Name: "butt", Value: "butt"},
				{Name: "round", Value: "round"},
				{Name: "square", Value: "square"},
			},
			reflect.TypeOf(DrawAreaMode("")): {
				{Name: "draw", Value: "draw"},
				{Name: "erase", Value: "erase"},
				{Name: "edit", Value: "edit"},
			},
			reflect.TypeOf(ArtifactSaveConflictStrategy("")): {
				{Name: "skip", Value: "skip"},
				{Name: "backup", Value: "backup"},
				{Name: "overwrite", Value: "overwrite"},
			},
			reflect.TypeOf(ArtifactSaveStatus("")): {
				{Name: "saved", Value: "saved"},
				{Name: "unchanged", Value: "unchanged"},
				{Name: "skipped", Value: "skipped"},
				{Name: "conflict", Value: "conflict"},
			},
			reflect.TypeOf(MissingFolderBehavior("")): {
				{Name: "error", Value: "error"},
				{Name: "empty", Value: "empty"},
			},
			reflect.TypeOf(FolderContentItemType("")): {
				{Name: "folder", Value: "folder"},
				{Name: "file", Value: "file"},
			},
			reflect.TypeOf(TransferOperation("")): {
				{Name: "copy", Value: "copy"},
				{Name: "move", Value: "move"},
			},
			reflect.TypeOf(GitDiffMode("")): {
				{Name: "unstaged", Value: "unstaged"},
				{Name: "staged", Value: "staged"},
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
			reflect.TypeOf(BuiltinCodeLanguage{}): aliasDeclaration(
				"BuiltinCodeLanguage",
				"CodeLanguage",
			),
			reflect.TypeOf(RunCodeRequestInput{}): {
				Name: "RunCodeRequestInput",
				Kind: "object",
				Properties: []TypeProperty{
					{Name: "projectConfigId", TypeExpr: "string"},
					{Name: "sectionId", TypeExpr: "string | null"},
					{Name: "terminalSectionId", TypeExpr: "string | null", Optional: true},
					{Name: "cliId", TypeExpr: "string | null", Optional: true},
					{Name: "runSnapshotMode", TypeExpr: "RunSnapshotMode | null", Optional: true},
					{Name: "drawSnapshotsBySectionId", TypeExpr: "Record<string, BinaryContentRef> | null", Optional: true},
					{Name: "sectionVariantOverrides", TypeExpr: "Record<string, string> | null", Optional: true},
					{Name: "paramOverrides", TypeExpr: "Record<string, string> | null", Optional: true},
				},
			},
			reflect.TypeOf(ProjectStateFrontendSupport{}): {
				Name: "ProjectStateFrontendSupport",
				Kind: "raw",
				Raw:  projectStateFrontendSupportRawTS,
			},
			reflect.TypeOf(EngineConfigDefaults{}): objectDeclarationWithCreateExpr(
				"EngineConfigDefaults",
				`mergeGeneratedOptions(
    {
      thinking: null,
    },
    options,
  )`,
				TypeProperty{Name: "thinking", TypeExpr: "boolean | null", Optional: true},
			),
			reflect.TypeOf(EngineConfig{}): objectDeclarationWithCreateExpr(
				"EngineConfig",
				`(() => {
    const defaults = createEngineConfigDefaults();
    return {
      ...mergeGeneratedOptions(
        {
          id: "",
          name: "",
          engineType: EngineTypeEnum.setta_llm,
          settaLlmConfigId: null,
          externalAgentConfigId: null,
          defaults,
        },
        options,
      ),
      defaults: mergeGeneratedOptions(defaults, options.defaults ?? {}),
    };
  })()`,
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "engineType", TypeExpr: "EngineType"},
				TypeProperty{Name: "settaLlmConfigId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "externalAgentConfigId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "defaults", TypeExpr: "EngineConfigDefaults"},
			),
			reflect.TypeOf(AgentProfile{}): objectDeclaration(
				"AgentProfile",
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "description", TypeExpr: "string"},
				TypeProperty{Name: "systemPrompt", TypeExpr: "string"},
				TypeProperty{Name: "enableBackgroundSummaryFill", TypeExpr: "boolean"},
				TypeProperty{Name: "enableLlmChatTitles", TypeExpr: "boolean"},
				TypeProperty{Name: "engineConfigId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "toolAllowlist", TypeExpr: "Array<string>"},
				TypeProperty{Name: "memoryScope", TypeExpr: "string | null", Optional: true},
			),
			reflect.TypeOf(TranscriptionProfile{}): objectDeclaration(
				"TranscriptionProfile",
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "transcriptionLlmConfigId", TypeExpr: "string"},
				TypeProperty{Name: "transportMode", TypeExpr: "TranscriptionTransportMode"},
				TypeProperty{Name: "chunkMs", TypeExpr: "number"},
				TypeProperty{Name: "supportsRealtimeTranscription", TypeExpr: "boolean"},
				TypeProperty{Name: "language", TypeExpr: "string | null", Optional: true},
			),
			reflect.TypeOf(RunEvent{}): objectDeclarationWithCreateExpr(
				"RunEvent",
				`mergeGeneratedOptions(
    {
      id: "",
      timestamp: "",
      type: "",
      payload: {},
    },
    options,
  )`,
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "timestamp", TypeExpr: "string"},
				TypeProperty{Name: "type", TypeExpr: "string"},
				TypeProperty{Name: "payload", TypeExpr: "Record<string, unknown>", Optional: true},
			),
			reflect.TypeOf(AgentRun{}): objectDeclarationWithCreateExpr(
				"AgentRun",
				`mergeGeneratedOptions(
    {
      id: "",
      profileId: null,
      status: AgentRunStatusEnum.queued,
      startedAt: null,
      finishedAt: null,
      inputs: null,
      outputs: null,
      toolCalls: [],
      cost: null,
      events: [],
    },
    options,
  )`,
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "profileId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "status", TypeExpr: "AgentRunStatus"},
				TypeProperty{Name: "startedAt", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "finishedAt", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "inputs", TypeExpr: "Record<string, unknown> | null", Optional: true},
				TypeProperty{Name: "outputs", TypeExpr: "Record<string, unknown> | null", Optional: true},
				TypeProperty{Name: "toolCalls", TypeExpr: "Array<Record<string, unknown>>"},
				TypeProperty{Name: "cost", TypeExpr: "number | null", Optional: true},
				TypeProperty{Name: "events", TypeExpr: "Array<RunEvent>"},
			),
			reflect.TypeOf(AgentRunList{}): aliasDeclaration(
				"AgentRunList",
				"Array<AgentRun>",
			),
			reflect.TypeOf(MessageTextDelta{}): objectDeclaration(
				"MessageTextDelta",
				TypeProperty{Name: "type", TypeExpr: `"text_delta"`},
				TypeProperty{Name: "index", TypeExpr: "number"},
				TypeProperty{Name: "text", TypeExpr: "string"},
			),
			reflect.TypeOf(MessageThinkingDelta{}): objectDeclaration(
				"MessageThinkingDelta",
				TypeProperty{Name: "type", TypeExpr: `"thinking_delta"`},
				TypeProperty{Name: "index", TypeExpr: "number"},
				TypeProperty{Name: "thinking", TypeExpr: "string"},
				TypeProperty{Name: "summary", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "signature", TypeExpr: "string | null", Optional: true},
			),
			reflect.TypeOf((*MessageContentDelta)(nil)).Elem(): aliasDeclaration(
				"MessageContentDelta",
				"MessageTextDelta | MessageThinkingDelta",
			),
			reflect.TypeOf(MessageStartEvent{}): objectDeclaration(
				"MessageStartEvent",
				TypeProperty{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.MESSAGE_START"},
				TypeProperty{Name: "message", TypeExpr: "BaseChatMessageUnion"},
			),
			reflect.TypeOf(MessageDeltaEvent{}): objectDeclaration(
				"MessageDeltaEvent",
				TypeProperty{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.DELTA"},
				TypeProperty{Name: "message_id", TypeExpr: "string"},
				TypeProperty{Name: "content", TypeExpr: "Array<MessageContentDelta> | null", Optional: true},
			),
			reflect.TypeOf(ToolCallDeltaEvent{}): objectDeclaration(
				"ToolCallDeltaEvent",
				TypeProperty{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.TOOL_CALL_DELTA"},
				TypeProperty{Name: "message_id", TypeExpr: "string"},
				TypeProperty{Name: "tool_call_id", TypeExpr: "string"},
				TypeProperty{Name: "arguments_delta", TypeExpr: "string"},
				TypeProperty{Name: "tool_name", TypeExpr: "string | null", Optional: true},
			),
			reflect.TypeOf(ToolResultEvent{}): objectDeclaration(
				"ToolResultEvent",
				TypeProperty{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.TOOL_RESULT"},
				TypeProperty{Name: "result", TypeExpr: "ToolChatMessage"},
			),
			reflect.TypeOf(ToolArgumentPreviewDeltaEvent{}): objectDeclaration(
				"ToolArgumentPreviewDeltaEvent",
				TypeProperty{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.TOOL_ARGUMENT_PREVIEW_DELTA"},
				TypeProperty{Name: "message_id", TypeExpr: "string"},
				TypeProperty{Name: "tool_call_id", TypeExpr: "string"},
				TypeProperty{Name: "tool_name", TypeExpr: "string"},
				TypeProperty{Name: "arguments_delta", TypeExpr: "string"},
				TypeProperty{Name: "preview_kind", TypeExpr: "string"},
				TypeProperty{Name: "target_ids_by_type", TypeExpr: "Record<string, Array<string>>"},
				TypeProperty{Name: "preview_value_delta", TypeExpr: "string"},
			),
			reflect.TypeOf(MessageStopEvent{}): objectDeclaration(
				"MessageStopEvent",
				TypeProperty{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.MESSAGE_STOP"},
				TypeProperty{Name: "message_id", TypeExpr: "string"},
			),
			reflect.TypeOf(MessageFinalizedEvent{}): objectDeclaration(
				"MessageFinalizedEvent",
				TypeProperty{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.MESSAGE_FINALIZED"},
				TypeProperty{Name: "message", TypeExpr: "BaseChatMessageUnion"},
			),
			reflect.TypeOf((*LLMStreamingResponseChunk)(nil)).Elem(): aliasDeclaration(
				"LLMStreamingResponseChunk",
				"MessageStartEvent | MessageDeltaEvent | ToolCallDeltaEvent | ToolResultEvent | ToolArgumentPreviewDeltaEvent | MessageStopEvent | MessageFinalizedEvent",
			),
			reflect.TypeOf(LLMStreamingResponse{}): objectDeclaration(
				"LLMStreamingResponse",
				TypeProperty{Name: "chatId", TypeExpr: "string"},
				TypeProperty{Name: "chunk", TypeExpr: "LLMStreamingResponseChunk"},
				TypeProperty{Name: "sectionId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string | null", Optional: true},
			),
			reflect.TypeOf(AgentProfileResponse{}): {
				Name:  "AgentProfileResponse",
				Kind:  "alias",
				Alias: "AgentProfile",
			},
			reflect.TypeOf(AgentProfileListResponse{}): {
				Name:  "AgentProfileListResponse",
				Kind:  "alias",
				Alias: "Array<AgentProfile>",
			},
			reflect.TypeOf(AgentRunResponse{}): {
				Name:  "AgentRunResponse",
				Kind:  "alias",
				Alias: "AgentRun",
			},
			reflect.TypeOf(AgentRunListResponse{}): {
				Name:  "AgentRunListResponse",
				Kind:  "alias",
				Alias: "Array<AgentRun>",
			},
			reflect.TypeOf(EngineConfigResponse{}): {
				Name:  "EngineConfigResponse",
				Kind:  "alias",
				Alias: "EngineConfig",
			},
			reflect.TypeOf(EngineConfigListResponse{}): {
				Name:  "EngineConfigListResponse",
				Kind:  "alias",
				Alias: "Array<EngineConfig>",
			},
			reflect.TypeOf(TranscriptionProfileResponse{}): {
				Name:  "TranscriptionProfileResponse",
				Kind:  "alias",
				Alias: "TranscriptionProfile",
			},
			reflect.TypeOf(TranscriptionProfileListResponse{}): {
				Name:  "TranscriptionProfileListResponse",
				Kind:  "alias",
				Alias: "Array<TranscriptionProfile>",
			},
			reflect.TypeOf(UpdateAgentProfileRequestInput{}): objectDeclaration(
				"UpdateAgentProfileRequestInput",
				TypeProperty{Name: "profile", TypeExpr: "AgentProfile"},
			),
			reflect.TypeOf(UpdateEngineConfigRequestInput{}): objectDeclaration(
				"UpdateEngineConfigRequestInput",
				TypeProperty{Name: "config", TypeExpr: "EngineConfig"},
			),
			reflect.TypeOf(CreateTranscriptionProfileRequestInput{}): objectDeclaration(
				"CreateTranscriptionProfileRequestInput",
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "transcriptionLlmConfigId", TypeExpr: "string"},
				TypeProperty{Name: "transportMode", TypeExpr: "TranscriptionTransportMode"},
				TypeProperty{Name: "chunkMs", TypeExpr: "number"},
				TypeProperty{Name: "language", TypeExpr: "string | null", Optional: true},
			),
			reflect.TypeOf(UpdateTranscriptionProfileRequestInput{}): objectDeclaration(
				"UpdateTranscriptionProfileRequestInput",
				TypeProperty{Name: "profile", TypeExpr: "TranscriptionProfile"},
			),
			reflect.TypeOf(SetChatSectionStateRequestInput{}): objectDeclaration(
				"SetChatSectionStateRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "state", TypeExpr: "ChatSectionState"},
			),
			reflect.TypeOf(SectionSizeValue{}): aliasDeclaration(
				"SectionSizeValue",
				"number | SectionSizeMode",
			),
			reflect.TypeOf(SectionSize{}): objectDeclarationWithCreateExpr(
				"SectionSize",
				`mergeGeneratedOptions(
    {
      width: SectionSizeModeEnum.auto,
      height: SectionSizeModeEnum.auto,
    },
    options,
  )`,
				TypeProperty{Name: "width", TypeExpr: "SectionSizeValue"},
				TypeProperty{Name: "height", TypeExpr: "SectionSizeValue"},
			),
			reflect.TypeOf(SectionSizingPolicyTypeEntry{}): objectDeclaration(
				"SectionSizingPolicyTypeEntry",
				TypeProperty{Name: "minHeight", TypeExpr: "number"},
				TypeProperty{Name: "maxHeight", TypeExpr: "number"},
				TypeProperty{Name: "minWidth", TypeExpr: "number"},
				TypeProperty{Name: "maxWidth", TypeExpr: "number"},
			),
			reflect.TypeOf(SectionSizingPolicyCallableTypeEntry{}): aliasDeclaration(
				"SectionSizingPolicyCallableTypeEntry",
				`SectionSizingPolicyTypeEntry & {
  hideSearchMinHeight: number;
  hideParamsMinHeight: number;
}`,
			),
			reflect.TypeOf(MetaControlSizingPolicyTypeEntry{}): objectDeclaration(
				"MetaControlSizingPolicyTypeEntry",
				TypeProperty{Name: "minHeight", TypeExpr: "number"},
				TypeProperty{Name: "minWidth", TypeExpr: "number"},
				TypeProperty{Name: "sizeModeHeight", TypeExpr: "MetaControlSizeMode"},
				TypeProperty{Name: "sizeModeWidth", TypeExpr: "MetaControlSizeMode"},
			),
			reflect.TypeOf(MetaControlSizingPolicyByType{}): objectDeclarationWithFactory(
				"MetaControlSizingPolicyByType",
				metaControlSizingPolicyByTypeFactoryTS,
				TypeProperty{Name: "CodeCallable", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
				TypeProperty{Name: "CodeParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
				TypeProperty{Name: "TextParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
				TypeProperty{Name: "DateParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
				TypeProperty{Name: "TimeParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
				TypeProperty{Name: "ButtonParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
				TypeProperty{Name: "SliderParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
				TypeProperty{Name: "RotaryParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
				TypeProperty{Name: "SwitchParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
				TypeProperty{Name: "ColorPickerParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
				TypeProperty{Name: "DropdownParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
				TypeProperty{Name: "PasswordParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
				TypeProperty{Name: "TextAreaParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
				TypeProperty{Name: "DropzoneParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
				TypeProperty{Name: "NestedParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
			),
			reflect.TypeOf(SectionSizingPolicyGlobals{}): objectDeclarationWithCreateExpr(
				"SectionSizingPolicyGlobals",
				`mergeGeneratedOptions(
    {
      pinnedParamsAreaMinHeight: 64,
      unpinnedParamsAreaMinHeight: 36,
      minimizedHeight: 32,
      infiniteMaxHeight: 100000,
      infiniteMaxWidth: 100000,
      autoMaxHeight: 350,
    },
    options,
  )`,
				TypeProperty{Name: "pinnedParamsAreaMinHeight", TypeExpr: "number"},
				TypeProperty{Name: "unpinnedParamsAreaMinHeight", TypeExpr: "number"},
				TypeProperty{Name: "minimizedHeight", TypeExpr: "number"},
				TypeProperty{Name: "infiniteMaxHeight", TypeExpr: "number"},
				TypeProperty{Name: "infiniteMaxWidth", TypeExpr: "number"},
				TypeProperty{Name: "autoMaxHeight", TypeExpr: "number"},
			),
			reflect.TypeOf(SectionSizingPolicyByType{}): objectDeclarationWithFactory(
				"SectionSizingPolicyByType",
				sectionSizingPolicyByTypeFactoryTS,
				TypeProperty{Name: "Callable", TypeExpr: "SectionSizingPolicyCallableTypeEntry"},
				TypeProperty{Name: "Dict", TypeExpr: "SectionSizingPolicyTypeEntry"},
				TypeProperty{Name: "ListRoot", TypeExpr: "SectionSizingPolicyTypeEntry"},
				TypeProperty{Name: "Group", TypeExpr: "SectionSizingPolicyTypeEntry"},
				TypeProperty{Name: "Image", TypeExpr: "SectionSizingPolicyTypeEntry"},
				TypeProperty{Name: "Chart", TypeExpr: "SectionSizingPolicyTypeEntry"},
				TypeProperty{Name: "Draw", TypeExpr: "SectionSizingPolicyTypeEntry"},
				TypeProperty{Name: "Prompt", TypeExpr: "SectionSizingPolicyTypeEntry"},
				TypeProperty{Name: "TextBlock", TypeExpr: "SectionSizingPolicyTypeEntry"},
				TypeProperty{Name: "MetaControl", TypeExpr: "SectionSizingPolicyTypeEntry"},
				TypeProperty{Name: "Social", TypeExpr: "SectionSizingPolicyTypeEntry"},
				TypeProperty{Name: "GlobalVariables", TypeExpr: "SectionSizingPolicyTypeEntry"},
				TypeProperty{Name: "Code", TypeExpr: "SectionSizingPolicyTypeEntry"},
				TypeProperty{Name: "GenPythonCode", TypeExpr: "SectionSizingPolicyTypeEntry"},
				TypeProperty{Name: "GenPythonMetadata", TypeExpr: "SectionSizingPolicyTypeEntry"},
				TypeProperty{Name: "Terminal", TypeExpr: "SectionSizingPolicyTypeEntry"},
				TypeProperty{Name: "IFrame", TypeExpr: "SectionSizingPolicyTypeEntry"},
				TypeProperty{Name: "Chat", TypeExpr: "SectionSizingPolicyTypeEntry"},
				TypeProperty{Name: "Browser", TypeExpr: "SectionSizingPolicyTypeEntry"},
				TypeProperty{Name: "Plugin", TypeExpr: "SectionSizingPolicyTypeEntry"},
				TypeProperty{Name: "TaskBoard", TypeExpr: "SectionSizingPolicyTypeEntry"},
				TypeProperty{Name: "Spreadsheet", TypeExpr: "SectionSizingPolicyTypeEntry"},
			),
			reflect.TypeOf(SectionSizingPolicy{}): objectDeclarationWithFactory(
				"SectionSizingPolicy",
				sectionSizingPolicyFactoryTS,
				TypeProperty{Name: "byType", TypeExpr: "SectionSizingPolicyByType"},
				TypeProperty{Name: "metaControlByType", TypeExpr: "MetaControlSizingPolicyByType"},
				TypeProperty{Name: "globals", TypeExpr: "SectionSizingPolicyGlobals"},
			),
			reflect.TypeOf(SharePolicy{}): objectDeclarationWithCreateExpr(
				"SharePolicy",
				`mergeGeneratedOptions(
    {
      allowParamChanges: true,
      allowVariantChanges: true,
      allowLayoutChanges: true,
      allowRun: false,
      allowLLM: false,
      allowExternalLinks: false,
      allowFileDownloads: false,
      allowMultipleRuns: true,
      runSnapshotMode: RunSnapshotModeEnum.ephemeral,
    },
    options,
  )`,
				TypeProperty{Name: "allowParamChanges", TypeExpr: "boolean"},
				TypeProperty{Name: "allowVariantChanges", TypeExpr: "boolean"},
				TypeProperty{Name: "allowLayoutChanges", TypeExpr: "boolean"},
				TypeProperty{Name: "allowRun", TypeExpr: "boolean"},
				TypeProperty{Name: "allowLLM", TypeExpr: "boolean"},
				TypeProperty{Name: "allowExternalLinks", TypeExpr: "boolean"},
				TypeProperty{Name: "allowFileDownloads", TypeExpr: "boolean"},
				TypeProperty{Name: "allowMultipleRuns", TypeExpr: "boolean"},
				TypeProperty{Name: "runSnapshotMode", TypeExpr: "RunSnapshotMode"},
			),
			reflect.TypeOf(SettingsShortcuts{}): objectDeclarationWithCreateExpr(
				"SettingsShortcuts",
				`mergeGeneratedOptions(
    {
      newCardShortcut: "N",
      newGroupShortcut: "G",
      typeCheckShortcut: "",
      newProjectConfigShortcut: "",
      undoShortcut: "Mod + Z",
      redoShortcut: "Mod + Shift + Z",
      groupShortcut: "Mod + G",
      ungroupShortcut: "Shift + Mod + G",
      saveShortcut: "Mod + S",
      saveAsShortcut: "Mod + Shift + S",
      loadShortcut: "Mod + L",
      searchShortcut: "Mod + K",
      advancedSearchShortcut: "Mod + P",
      commandPaletteShortcut: "Mod + Shift + P",
      resetZoomShortcut: "Mod + Comma",
      copyShortcut: "Mod + C",
      pasteShortcut: "Mod + V",
      pasteAsRefShortcut: "Mod + Shift + V",
      sortingShortcut: "Mod + Alt",
      movingFreeShortcut: "Alt",
      showTooltipShortcut: "Q",
      tooltipToPlaintextShortcut: "Q + S",
      tooltipToMarkdownShortcut: "Q + W",
      freezeTooltipShortcut: "Q + F",
      frozenTooltipToPlaintextShortcut: "S",
      frozenTooltipToMarkdownShortcut: "W",
      incrementTooltipPageShortcut: "Q + ArrowRight",
      decrementTooltipPageShortcut: "Q + ArrowLeft",
      copyTooltipTextShortcut: "Q + C",
      frozenTooltipIncrementShortcut: "ArrowRight",
      frozenTooltipDecrementShortcut: "ArrowLeft",
      frozenTooltipCopyShortcut: "C",
      newTerminalShortcut: "Ctrl + \u0060",
      fitViewShortcut: "F",
      zoomToMouseShortcut: "Z",
      deleteSectionShortcut: "Backspace",
      selectAll: "Mod + A",
      selectTopLevelNonGroupSections: "Mod + Shift + A",
      showVersionsTabShortcut: "V",
      showParamUITypeTabShortcut: "P",
      showProjectOverviewTabShortcut: "O",
      focusHeaderShortcut: "Ctrl + Shift + 1",
      focusOverviewShortcut: "Ctrl + Shift + 2",
      focusCanvasShortcut: "Ctrl + Shift + 3",
      focusUiEditorShortcut: "Ctrl + Shift + 4",
      nextTopLevelSectionShortcut: "Alt + J",
      prevTopLevelSectionShortcut: "Alt + K",
      runCodeShortcut: "Mod + Enter",
      runEntryCodeBlockShortcut: "Mod + Shift + Enter",
      paramSelect: "Mod + Shift",
      paramIndentShortcut: "Tab",
      paramUnindentShortcut: "Shift + Tab",
      paramMoveUpShortcut: "Alt + ArrowUp",
      paramMoveDownShortcut: "Alt + ArrowDown",
      formatCode: "Shift + Alt + F",
      selectionKeyCode: "Shift",
      multiSelectionKeyCode: "Mod",
      panActivationKeyCode: "Space",
      zoomActivationKeyCode: "Mod",
      zoomInShortcut: "Equal",
      zoomOutShortcut: "Minus",
      restartLanguageServerShortcut: "Alt + Shift + R",
    },
    options,
  )`,
				TypeProperty{Name: "newCardShortcut", TypeExpr: "string"},
				TypeProperty{Name: "newGroupShortcut", TypeExpr: "string"},
				TypeProperty{Name: "typeCheckShortcut", TypeExpr: "string"},
				TypeProperty{Name: "newProjectConfigShortcut", TypeExpr: "string"},
				TypeProperty{Name: "undoShortcut", TypeExpr: "string"},
				TypeProperty{Name: "redoShortcut", TypeExpr: "string"},
				TypeProperty{Name: "groupShortcut", TypeExpr: "string"},
				TypeProperty{Name: "ungroupShortcut", TypeExpr: "string"},
				TypeProperty{Name: "saveShortcut", TypeExpr: "string"},
				TypeProperty{Name: "saveAsShortcut", TypeExpr: "string"},
				TypeProperty{Name: "loadShortcut", TypeExpr: "string"},
				TypeProperty{Name: "searchShortcut", TypeExpr: "string"},
				TypeProperty{Name: "advancedSearchShortcut", TypeExpr: "string"},
				TypeProperty{Name: "commandPaletteShortcut", TypeExpr: "string"},
				TypeProperty{Name: "resetZoomShortcut", TypeExpr: "string"},
				TypeProperty{Name: "copyShortcut", TypeExpr: "string"},
				TypeProperty{Name: "pasteShortcut", TypeExpr: "string"},
				TypeProperty{Name: "pasteAsRefShortcut", TypeExpr: "string"},
				TypeProperty{Name: "sortingShortcut", TypeExpr: "string"},
				TypeProperty{Name: "movingFreeShortcut", TypeExpr: "string"},
				TypeProperty{Name: "showTooltipShortcut", TypeExpr: "string"},
				TypeProperty{Name: "tooltipToPlaintextShortcut", TypeExpr: "string"},
				TypeProperty{Name: "tooltipToMarkdownShortcut", TypeExpr: "string"},
				TypeProperty{Name: "freezeTooltipShortcut", TypeExpr: "string"},
				TypeProperty{Name: "frozenTooltipToPlaintextShortcut", TypeExpr: "string"},
				TypeProperty{Name: "frozenTooltipToMarkdownShortcut", TypeExpr: "string"},
				TypeProperty{Name: "incrementTooltipPageShortcut", TypeExpr: "string"},
				TypeProperty{Name: "decrementTooltipPageShortcut", TypeExpr: "string"},
				TypeProperty{Name: "copyTooltipTextShortcut", TypeExpr: "string"},
				TypeProperty{Name: "frozenTooltipIncrementShortcut", TypeExpr: "string"},
				TypeProperty{Name: "frozenTooltipDecrementShortcut", TypeExpr: "string"},
				TypeProperty{Name: "frozenTooltipCopyShortcut", TypeExpr: "string"},
				TypeProperty{Name: "newTerminalShortcut", TypeExpr: "string"},
				TypeProperty{Name: "fitViewShortcut", TypeExpr: "string"},
				TypeProperty{Name: "zoomToMouseShortcut", TypeExpr: "string"},
				TypeProperty{Name: "deleteSectionShortcut", TypeExpr: "string"},
				TypeProperty{Name: "selectAll", TypeExpr: "string"},
				TypeProperty{Name: "selectTopLevelNonGroupSections", TypeExpr: "string"},
				TypeProperty{Name: "showVersionsTabShortcut", TypeExpr: "string"},
				TypeProperty{Name: "showParamUITypeTabShortcut", TypeExpr: "string"},
				TypeProperty{Name: "showProjectOverviewTabShortcut", TypeExpr: "string"},
				TypeProperty{Name: "focusHeaderShortcut", TypeExpr: "string"},
				TypeProperty{Name: "focusOverviewShortcut", TypeExpr: "string"},
				TypeProperty{Name: "focusCanvasShortcut", TypeExpr: "string"},
				TypeProperty{Name: "focusUiEditorShortcut", TypeExpr: "string"},
				TypeProperty{Name: "nextTopLevelSectionShortcut", TypeExpr: "string"},
				TypeProperty{Name: "prevTopLevelSectionShortcut", TypeExpr: "string"},
				TypeProperty{Name: "runCodeShortcut", TypeExpr: "string"},
				TypeProperty{Name: "runEntryCodeBlockShortcut", TypeExpr: "string"},
				TypeProperty{Name: "paramSelect", TypeExpr: "string"},
				TypeProperty{Name: "paramIndentShortcut", TypeExpr: "string"},
				TypeProperty{Name: "paramUnindentShortcut", TypeExpr: "string"},
				TypeProperty{Name: "paramMoveUpShortcut", TypeExpr: "string"},
				TypeProperty{Name: "paramMoveDownShortcut", TypeExpr: "string"},
				TypeProperty{Name: "formatCode", TypeExpr: "string"},
				TypeProperty{Name: "selectionKeyCode", TypeExpr: "string"},
				TypeProperty{Name: "multiSelectionKeyCode", TypeExpr: "string"},
				TypeProperty{Name: "panActivationKeyCode", TypeExpr: "string"},
				TypeProperty{Name: "zoomActivationKeyCode", TypeExpr: "string"},
				TypeProperty{Name: "zoomInShortcut", TypeExpr: "string"},
				TypeProperty{Name: "zoomOutShortcut", TypeExpr: "string"},
				TypeProperty{Name: "restartLanguageServerShortcut", TypeExpr: "string"},
			),
			reflect.TypeOf(SettingsGUI{}): objectDeclarationWithCreateExpr(
				"SettingsGUI",
				`mergeGeneratedOptions(
    {
      snapGrid: [15, 15],
      showGridLines: true,
      gridPattern: BackgroundVariantEnum.dots,
      gridPatternSize: 2,
      gridColor: "#afbacf",
      gridColorDarkMode: "#2b364a",
      wireColor: "#41506c",
      wireColorDarkMode: "#bac2d3",
      defaultZoomLevel: 1.0,
      minZoom: 0.1,
      maxZoom: 10.0,
      panOnDrag: true,
      panOnScroll: true,
      panOnScrollSpeed: 1.0,
      panOnScrollMode: PanOnScrollModeEnum.free,
      zoomOnScroll: true,
      zoomOnPinch: true,
      zoomOnDoubleClick: false,
      selectionMode: SelectionModeEnum.partial,
      leftSidePaneShiftsMap: true,
      transitionDuration: 50,
      sectionTagColorChoices: [
        { color: "#ef4444", description: "Red" },
        { color: "#f97316", description: "Orange" },
        { color: "#eab308", description: "Yellow" },
        { color: "#22c55e", description: "Green" },
        { color: "#06b6d4", description: "Cyan" },
        { color: "#3b82f6", description: "Blue" },
        { color: "#a855f7", description: "Purple" },
        { color: "#64748b", description: "Slate" },
      ],
    },
    options,
  )`,
				TypeProperty{Name: "snapGrid", TypeExpr: "[number, number]"},
				TypeProperty{Name: "showGridLines", TypeExpr: "boolean"},
				TypeProperty{Name: "gridPattern", TypeExpr: "BackgroundVariant"},
				TypeProperty{Name: "gridPatternSize", TypeExpr: "number"},
				TypeProperty{Name: "gridColor", TypeExpr: "string"},
				TypeProperty{Name: "gridColorDarkMode", TypeExpr: "string"},
				TypeProperty{Name: "wireColor", TypeExpr: "string"},
				TypeProperty{Name: "wireColorDarkMode", TypeExpr: "string"},
				TypeProperty{Name: "defaultZoomLevel", TypeExpr: "number"},
				TypeProperty{Name: "minZoom", TypeExpr: "number"},
				TypeProperty{Name: "maxZoom", TypeExpr: "number"},
				TypeProperty{Name: "panOnDrag", TypeExpr: "boolean"},
				TypeProperty{Name: "panOnScroll", TypeExpr: "boolean"},
				TypeProperty{Name: "panOnScrollSpeed", TypeExpr: "number"},
				TypeProperty{Name: "panOnScrollMode", TypeExpr: "PanOnScrollMode"},
				TypeProperty{Name: "zoomOnScroll", TypeExpr: "boolean"},
				TypeProperty{Name: "zoomOnPinch", TypeExpr: "boolean"},
				TypeProperty{Name: "zoomOnDoubleClick", TypeExpr: "boolean"},
				TypeProperty{Name: "selectionMode", TypeExpr: "SelectionMode"},
				TypeProperty{Name: "leftSidePaneShiftsMap", TypeExpr: "boolean"},
				TypeProperty{Name: "transitionDuration", TypeExpr: "number"},
				TypeProperty{Name: "sectionTagColorChoices", TypeExpr: "Array<{ color: string; description: string; }>"},
			),
			reflect.TypeOf(SettingsBackend{}): objectDeclarationWithCreateExpr(
				"SettingsBackend",
				`mergeGeneratedOptions(
    {
      showDefaultConfigOnLoad: true,
      autosave: true,
      autobackup: true,
      autobackupFreq: 300,
      autobackupKeepLastN: 10,
      clearTerminalBeforeMarkingAsReady: true,
      defaultTerminalShell: null,
      exportDbReadableOnSave: false,
      exportDbReadableWithVariantsOnSave: false,
      autoRefetchCallableParamsOnLspMismatch: true,
      renameRefactorMode: RenameRefactorModeEnum.ALWAYS_ASK,
      saveRenderedValues: false,
      runSnapshotMode: RunSnapshotModeEnum.ephemeral,
      completionGuardEnabled: false,
    },
    options,
  )`,
				TypeProperty{Name: "showDefaultConfigOnLoad", TypeExpr: "boolean"},
				TypeProperty{Name: "autosave", TypeExpr: "boolean"},
				TypeProperty{Name: "autobackup", TypeExpr: "boolean"},
				TypeProperty{Name: "autobackupFreq", TypeExpr: "number"},
				TypeProperty{Name: "autobackupKeepLastN", TypeExpr: "number"},
				TypeProperty{Name: "clearTerminalBeforeMarkingAsReady", TypeExpr: "boolean"},
				TypeProperty{Name: "defaultTerminalShell", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "exportDbReadableOnSave", TypeExpr: "boolean"},
				TypeProperty{Name: "exportDbReadableWithVariantsOnSave", TypeExpr: "boolean"},
				TypeProperty{Name: "autoRefetchCallableParamsOnLspMismatch", TypeExpr: "boolean"},
				TypeProperty{Name: "renameRefactorMode", TypeExpr: "RenameRefactorMode"},
				TypeProperty{Name: "saveRenderedValues", TypeExpr: "boolean"},
				TypeProperty{Name: "runSnapshotMode", TypeExpr: "RunSnapshotMode"},
				TypeProperty{Name: "completionGuardEnabled", TypeExpr: "boolean"},
			),
			reflect.TypeOf(SettingsState{}): objectDeclarationWithFactory(
				"SettingsState",
				settingsStateFactoryTS,
				TypeProperty{Name: "shortcuts", TypeExpr: "SettingsShortcuts"},
				TypeProperty{Name: "gui", TypeExpr: "SettingsGUI"},
				TypeProperty{Name: "backend", TypeExpr: "SettingsBackend"},
				TypeProperty{Name: "sectionSizingPolicy", TypeExpr: "SectionSizingPolicy"},
				TypeProperty{Name: "languageServer", TypeExpr: "Record<string, unknown>"},
			),
			reflect.TypeOf(SectionTypeCodegenPolicy{}): objectDeclarationWithCreateExpr(
				"SectionTypeCodegenPolicy",
				`mergeGeneratedOptions(
    {
      mode: SectionCodegenModeEnum.inherit,
      representation: SectionRepresentationModeEnum.expression,
    },
    options,
  )`,
				TypeProperty{Name: "mode", TypeExpr: "SectionCodegenMode"},
				TypeProperty{Name: "representation", TypeExpr: "SectionRepresentationMode"},
			),
			reflect.TypeOf(SectionCodegenOverride{}): objectDeclarationWithCreateExpr(
				"SectionCodegenOverride",
				`mergeGeneratedOptions(
    {
      mode: SectionCodegenModeEnum.inherit,
      representation: SectionRepresentationModeEnum.expression,
    },
    options,
  )`,
				TypeProperty{Name: "mode", TypeExpr: "SectionCodegenMode"},
				TypeProperty{Name: "representation", TypeExpr: "SectionRepresentationMode"},
			),
			reflect.TypeOf(SectionCodegenPolicy{}): objectDeclarationWithFactory(
				"SectionCodegenPolicy",
				sectionCodegenPolicyFactoryTS,
				TypeProperty{Name: "allowlist", TypeExpr: "Array<SectionType> | null", Optional: true},
				TypeProperty{Name: "metaControlAllowlist", TypeExpr: "Array<CodeObjType> | null", Optional: true},
				TypeProperty{Name: "exclude", TypeExpr: "Array<string>"},
				TypeProperty{Name: "typePolicies", TypeExpr: "Record<SectionType, SectionTypeCodegenPolicy>"},
				TypeProperty{Name: "sectionOverrides", TypeExpr: "Record<string, SectionCodegenOverride>"},
			),
			reflect.TypeOf(CodeObjTypeValuePolicy{}): objectDeclarationWithCreateExpr(
				"CodeObjTypeValuePolicy",
				`mergeGeneratedOptions(
    {
      representation: CodeObjValueRepresentationModeEnum.expression,
    },
    options,
  )`,
				TypeProperty{Name: "representation", TypeExpr: "CodeObjValueRepresentationMode"},
			),
			reflect.TypeOf(CodeObjValueOverride{}): objectDeclarationWithCreateExpr(
				"CodeObjValueOverride",
				`mergeGeneratedOptions(
    {
      representation: CodeObjValueRepresentationModeEnum.expression,
    },
    options,
  )`,
				TypeProperty{Name: "representation", TypeExpr: "CodeObjValueRepresentationMode"},
			),
			reflect.TypeOf(CodeObjValuePolicy{}): objectDeclarationWithFactory(
				"CodeObjValuePolicy",
				codeObjValuePolicyFactoryTS,
				TypeProperty{Name: "typePolicies", TypeExpr: "Record<CodeObjType, CodeObjTypeValuePolicy>"},
				TypeProperty{Name: "codeObjOverrides", TypeExpr: "Record<string, CodeObjValueOverride>"},
			),
			reflect.TypeOf(ProjectCodegenPythonTarget{}): objectDeclarationWithFactory(
				"ProjectCodegenPythonTarget",
				projectCodegenPythonTargetFactoryTS,
				TypeProperty{Name: "language", TypeExpr: "typeof ProjectCodegenLanguageEnum.python"},
				TypeProperty{Name: "genCodePrefix", TypeExpr: "string"},
				TypeProperty{Name: "genCodeSuffix", TypeExpr: "string"},
				TypeProperty{Name: "generateMetadata", TypeExpr: "boolean"},
				TypeProperty{Name: "sectionPolicy", TypeExpr: "SectionCodegenPolicy"},
				TypeProperty{Name: "codeObjValuePolicy", TypeExpr: "CodeObjValuePolicy"},
			),
			reflect.TypeOf(ProjectCodegenPluginTarget{}): objectDeclarationWithCreateExpr(
				"ProjectCodegenPluginTarget",
				`mergeGeneratedOptions(
    {
      language: "",
      options: {},
    },
    options,
  )`,
				TypeProperty{Name: "language", TypeExpr: "string"},
				TypeProperty{Name: "options", TypeExpr: "Record<string, unknown>"},
			),
			reflect.TypeOf(ProjectCodegenTarget{}): aliasDeclaration(
				"ProjectCodegenTarget",
				"ProjectCodegenPythonTarget | ProjectCodegenPluginTarget",
			),
			reflect.TypeOf(Viewport{}): objectDeclaration(
				"Viewport",
				TypeProperty{Name: "x", TypeExpr: "number"},
				TypeProperty{Name: "y", TypeExpr: "number"},
				TypeProperty{Name: "zoom", TypeExpr: "number"},
			),
			reflect.TypeOf(TopLevelSectionLayout{}): objectDeclarationWithCreateExpr(
				"TopLevelSectionLayout",
				`mergeGeneratedOptions(
    {
      x: 0,
      y: 0,
      zIndex: 0,
      w: null,
      h: null,
    },
    options,
  )`,
				TypeProperty{Name: "x", TypeExpr: "number"},
				TypeProperty{Name: "y", TypeExpr: "number"},
				TypeProperty{Name: "zIndex", TypeExpr: "number", Optional: true},
				TypeProperty{Name: "w", TypeExpr: "number | null", Optional: true},
				TypeProperty{Name: "h", TypeExpr: "number | null", Optional: true},
			),
			reflect.TypeOf(ViewMode{}): objectDeclarationWithCreateExpr(
				"ViewMode",
				`mergeGeneratedOptions(
    {
      id: "",
      name: "",
      sortIndex: 0,
      isUserFacing: false,
      isTab: false,
      visibilityBySectionId: {},
      viewport: null,
      viewportInitialized: false,
      topLevelSections: {},
    },
    options,
  )`,
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "sortIndex", TypeExpr: "number", Optional: true},
				TypeProperty{Name: "isUserFacing", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "isTab", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "visibilityBySectionId", TypeExpr: "Record<string, boolean>", Optional: true},
				TypeProperty{Name: "viewport", TypeExpr: "Viewport | null", Optional: true},
				TypeProperty{Name: "viewportInitialized", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "topLevelSections", TypeExpr: "Record<string, TopLevelSectionLayout>", Optional: true},
			),
			reflect.TypeOf(ViewModeConfig{}): aliasDeclarationWithCreateExpr(
				"ViewModeConfig",
				"ViewMode",
				"createViewMode(options)",
			),
			reflect.TypeOf(Edge{}): objectDeclaration(
				"Edge",
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "sourceSectionId", TypeExpr: "string"},
				TypeProperty{Name: "sourceVariantId", TypeExpr: "string"},
				TypeProperty{Name: "sourcePortId", TypeExpr: "string"},
				TypeProperty{Name: "targetSectionId", TypeExpr: "string"},
				TypeProperty{Name: "targetVariantId", TypeExpr: "string"},
				TypeProperty{Name: "targetPortId", TypeExpr: "string"},
				TypeProperty{Name: "type", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "label", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "style", TypeExpr: "Record<string, unknown>", Optional: true},
				TypeProperty{Name: "animated", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "hidden", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "zIndex", TypeExpr: "number", Optional: true},
				TypeProperty{Name: "data", TypeExpr: "Record<string, unknown>", Optional: true},
				TypeProperty{Name: "selected", TypeExpr: "boolean", Optional: true},
			),
			reflect.TypeOf(AgenticEdge{}): objectDeclarationWithCreateExpr(
				"AgenticEdge",
				`mergeGeneratedOptions(
    {
      id: "",
      sourceSectionId: "",
      targetSectionId: "",
      kind: AgenticEdgeKindEnum.section_chat,
      contextMode: null,
      style: {},
      hidden: false,
      zIndex: 0,
      selected: false,
    },
    options,
  )`,
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "sourceSectionId", TypeExpr: "string"},
				TypeProperty{Name: "targetSectionId", TypeExpr: "string"},
				TypeProperty{Name: "kind", TypeExpr: "AgenticEdgeKind"},
				TypeProperty{Name: "contextMode", TypeExpr: "AgenticEdgeContextMode | null", Optional: true},
				TypeProperty{Name: "style", TypeExpr: "Record<string, unknown>", Optional: true},
				TypeProperty{Name: "hidden", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "zIndex", TypeExpr: "number", Optional: true},
				TypeProperty{Name: "selected", TypeExpr: "boolean", Optional: true},
			),
			reflect.TypeOf(WatchCodeFolder{}): objectDeclaration(
				"WatchCodeFolder",
				TypeProperty{Name: "path", TypeExpr: "string"},
				TypeProperty{Name: "recursive", TypeExpr: "boolean"},
			),
			reflect.TypeOf(WatchCodeRegistryEntry{}): objectDeclaration(
				"WatchCodeRegistryEntry",
				TypeProperty{Name: "callableName", TypeExpr: "string"},
				TypeProperty{Name: "kind", TypeExpr: "string"},
				TypeProperty{Name: "signatureHash", TypeExpr: "string"},
				TypeProperty{Name: "bodyHash", TypeExpr: "string"},
				TypeProperty{Name: "sourcePath", TypeExpr: "string"},
				TypeProperty{Name: "sectionIds", TypeExpr: "Array<string>", Optional: true},
				TypeProperty{Name: "sectionsCount", TypeExpr: "number", Optional: true},
			),
			reflect.TypeOf(CodeFileBinding{}): objectDeclaration(
				"CodeFileBinding",
				TypeProperty{Name: "canonical_path", TypeExpr: "string"},
				TypeProperty{Name: "access_mode", TypeExpr: "CodeFileAccessMode"},
				TypeProperty{Name: "autoBinding", TypeExpr: "boolean"},
			),
			reflect.TypeOf(ClipboardProjectStateCore{}): objectDeclarationWithCreateExpr(
				"ClipboardProjectStateCore",
				`mergeGeneratedOptions(
    {
      sections: {},
      sectionImpls: {},
      sectionVariants: {},
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
    },
    options,
  )`,
				TypeProperty{Name: "sections", TypeExpr: "Record<string, Core>"},
				TypeProperty{Name: "sectionImpls", TypeExpr: "Record<string, BaseSectionImplUnion>"},
				TypeProperty{Name: "sectionVariants", TypeExpr: "Record<string, Variant>"},
				TypeProperty{Name: "codeObjs", TypeExpr: "Record<string, Core>"},
				TypeProperty{Name: "codeObjImpls", TypeExpr: "Record<string, BaseCodeObjImplUnion>"},
				TypeProperty{Name: "codeObjVariants", TypeExpr: "Record<string, Variant>"},
			),
			reflect.TypeOf(ClipboardProjectStateCoreWithSectionVariantMap{}): objectDeclarationWithCreateExpr(
				"ClipboardProjectStateCoreWithSectionVariantMap",
				`mergeGeneratedOptions(
    {
      core: createClipboardProjectStateCore(),
      sectionVariantMap: {},
    },
    options,
  )`,
				TypeProperty{Name: "core", TypeExpr: "ClipboardProjectStateCore"},
				TypeProperty{Name: "sectionVariantMap", TypeExpr: "Record<string, string>"},
			),
			reflect.TypeOf(SectionsClipboardData{}): objectDeclarationWithCreateExpr(
				"SectionsClipboardData",
				`mergeGeneratedOptions(
    {
      type: ClipboardDataTypeEnum.Sections,
      data: createClipboardProjectStateCoreWithSectionVariantMap(),
    },
    options,
  )`,
				TypeProperty{Name: "type", TypeExpr: "typeof ClipboardDataTypeEnum.Sections"},
				TypeProperty{Name: "data", TypeExpr: "ClipboardProjectStateCoreWithSectionVariantMap"},
			),
			reflect.TypeOf(BaseClipboardDataUnionWithDiscriminator{}): aliasDeclaration(
				"BaseClipboardDataUnionWithDiscriminator",
				"SectionsClipboardData",
			),
			reflect.TypeOf(Core{}): objectDeclarationWithCreateExpr(
				"Core",
				`mergeGeneratedOptions(
    {
      id: "",
      name: "",
      displayName: "",
      variants: [],
      defaultVariant: null,
      sharedModifier: {},
      unsharedKeys: [],
    },
    options,
  )`,
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "displayName", TypeExpr: "string"},
				TypeProperty{Name: "variants", TypeExpr: "Array<string>"},
				TypeProperty{Name: "defaultVariant", TypeExpr: "string | null"},
				TypeProperty{Name: "sharedModifier", TypeExpr: "Record<string, unknown>"},
				TypeProperty{Name: "unsharedKeys", TypeExpr: "Array<string>"},
			),
			reflect.TypeOf(Variant{}): objectDeclarationWithCreateExpr(
				"Variant",
				`mergeGeneratedOptions(
    {
      id: "",
      name: "",
      impl: "",
      nonPresetImpls: [],
      modifier: {},
      isFrozen: false,
    },
    options,
  )`,
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "impl", TypeExpr: "string"},
				TypeProperty{Name: "nonPresetImpls", TypeExpr: "Array<string>"},
				TypeProperty{Name: "modifier", TypeExpr: "Record<string, unknown>"},
				TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
			),
			reflect.TypeOf(SingletonSections{}): objectDeclarationWithCreateExpr(
				"SingletonSections",
				`mergeGeneratedOptions(
    {
      GlobalVariables: null,
      GenPythonCode: null,
      GenPythonMetadata: null,
    },
    options,
  )`,
				TypeProperty{Name: "GlobalVariables", TypeExpr: "string | null"},
				TypeProperty{Name: "GenPythonCode", TypeExpr: "string | null"},
				TypeProperty{Name: "GenPythonMetadata", TypeExpr: "string | null"},
			),
			reflect.TypeOf(ShownParamIdDetails{}): objectDeclarationWithCreateExpr(
				"ShownParamIdDetails",
				`mergeGeneratedOptions(
    {
      requiredParamIdsToPaths: {},
      topLevelParamIds: [],
    },
    options,
  )`,
				TypeProperty{Name: "requiredParamIdsToPaths", TypeExpr: "Record<string, Array<string>>"},
				TypeProperty{Name: "topLevelParamIds", TypeExpr: "Array<string>"},
			),
			reflect.TypeOf(ShownParamIds{}): objectDeclarationWithCreateExpr(
				"ShownParamIds",
				`mergeGeneratedOptions(
    {
      pinned: createShownParamIdDetails(),
      unpinned: createShownParamIdDetails(),
    },
    options,
  )`,
				TypeProperty{Name: "pinned", TypeExpr: "ShownParamIdDetails"},
				TypeProperty{Name: "unpinned", TypeExpr: "ShownParamIdDetails"},
			),
			reflect.TypeOf(ProjectStateSingleConfigWithCompletedOpIds{}): objectDeclarationWithCreateExpr(
				"ProjectStateSingleConfigWithCompletedOpIds",
				`mergeGeneratedOptions(
    {
      projectState: createProjectStateSingleConfig(),
      completedOpIds: [],
      pendingOpIds: [],
    },
    options,
  )`,
				TypeProperty{Name: "projectState", TypeExpr: "ProjectStateSingleConfig"},
				TypeProperty{Name: "completedOpIds", TypeExpr: "Array<string>"},
				TypeProperty{Name: "pendingOpIds", TypeExpr: "Array<string>"},
			),
			reflect.TypeOf(SectionsClipboardDataResponse{}): aliasDeclaration(
				"SectionsClipboardDataResponse",
				"SectionsClipboardData",
			),
			reflect.TypeOf(ProjectConfig{}): objectDeclarationWithCreateExpr(
				"ProjectConfig",
				`mergeGeneratedOptions(
    {
      id: "",
      name: "",
      showParamDisplayNames: false,
      allowJsonSourceKeyEdits: false,
      previewImgColor: "",
      viewport: null,
      viewportInitialized: false,
      viewModes: {},
      activeViewModeId: null,
      isEditingViewMode: false,
      codegenTargets: [],
      watchCodeEnabled: false,
      watchCodeFolders: [],
      watchCodeFiles: [],
      watchCodeRegistry: {},
      watchCodeBaselineByPath: {},
      entryCodeBlockId: null,
      topLevelSections: {},
      sectionVariantMap: {},
      activeIds: [],
      edges: [],
      agenticEdges: [],
    },
    options,
  )`,
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "showParamDisplayNames", TypeExpr: "boolean"},
				TypeProperty{Name: "allowJsonSourceKeyEdits", TypeExpr: "boolean"},
				TypeProperty{Name: "previewImgColor", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "viewport", TypeExpr: "Viewport | null", Optional: true},
				TypeProperty{Name: "viewportInitialized", TypeExpr: "boolean"},
				TypeProperty{Name: "viewModes", TypeExpr: "Record<string, ViewMode>"},
				TypeProperty{Name: "activeViewModeId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "isEditingViewMode", TypeExpr: "boolean"},
				TypeProperty{Name: "codegenTargets", TypeExpr: "Array<ProjectCodegenTarget>"},
				TypeProperty{Name: "watchCodeEnabled", TypeExpr: "boolean"},
				TypeProperty{Name: "watchCodeFolders", TypeExpr: "Array<WatchCodeFolder>"},
				TypeProperty{Name: "watchCodeFiles", TypeExpr: "Array<string>"},
				TypeProperty{Name: "watchCodeRegistry", TypeExpr: "Record<string, WatchCodeRegistryEntry>"},
				TypeProperty{Name: "watchCodeBaselineByPath", TypeExpr: "Record<string, Array<string>>"},
				TypeProperty{Name: "entryCodeBlockId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "topLevelSections", TypeExpr: "Record<string, TopLevelSectionLayout>"},
				TypeProperty{Name: "sectionVariantMap", TypeExpr: "Record<string, string>"},
				TypeProperty{Name: "activeIds", TypeExpr: "Array<string>"},
				TypeProperty{Name: "edges", TypeExpr: "Array<Edge>"},
				TypeProperty{Name: "agenticEdges", TypeExpr: "Array<AgenticEdge>"},
			),
			reflect.TypeOf(ProjectStateSingleConfig{}): objectDeclarationWithCreateExpr(
				"ProjectStateSingleConfig",
				`mergeGeneratedOptions(
    {
      projectConfig: createProjectConfig(),
      sections: {},
      sectionImpls: {},
      sectionVariants: {},
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {},
      shownParamIds: {},
      requiredDecodedImages: [],
      genCodeBinding: null,
    },
    options,
  )`,
				TypeProperty{Name: "projectConfig", TypeExpr: "ProjectConfig"},
				TypeProperty{Name: "sections", TypeExpr: "Record<string, Core>"},
				TypeProperty{Name: "sectionImpls", TypeExpr: "Record<string, BaseSectionImplUnion>"},
				TypeProperty{Name: "sectionVariants", TypeExpr: "Record<string, Variant>"},
				TypeProperty{Name: "codeObjs", TypeExpr: "Record<string, Core>"},
				TypeProperty{Name: "codeObjImpls", TypeExpr: "Record<string, BaseCodeObjImplUnion>"},
				TypeProperty{Name: "codeObjVariants", TypeExpr: "Record<string, Variant>"},
				TypeProperty{Name: "artifactGroups", TypeExpr: "Record<string, unknown>", Optional: true},
				TypeProperty{Name: "singletonSections", TypeExpr: "SingletonSections"},
				TypeProperty{Name: "parentSectionMap", TypeExpr: "Record<string, string | null>"},
				TypeProperty{Name: "shownParamIds", TypeExpr: "Record<string, ShownParamIds>"},
				TypeProperty{Name: "requiredDecodedImages", TypeExpr: "Array<string>"},
				TypeProperty{Name: "genCodeBinding", TypeExpr: "CodeFileBinding | null", Optional: true},
			),
			reflect.TypeOf(BaseSectionImpl{}): objectDeclaration(
				"BaseSectionImpl",
				TypeProperty{Name: "type", TypeExpr: "SectionType"},
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
				TypeProperty{Name: "isInOtherProjectConfigs", TypeExpr: "boolean"},
				TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
				TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
				TypeProperty{Name: "size", TypeExpr: "SectionSize"},
				TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
				TypeProperty{Name: "aspectRatioExtraHeight", TypeExpr: "number"},
				TypeProperty{Name: "aspectRatioExtraWidth", TypeExpr: "number"},
				TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
				TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
				TypeProperty{Name: "isPreset", TypeExpr: "boolean"},
				TypeProperty{Name: "children", TypeExpr: "Array<string>", Optional: true},
				TypeProperty{Name: "codeObjVariantMap", TypeExpr: "Record<string, string>", Optional: true},
				TypeProperty{Name: "hideUnpinnedParams", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "paramFilter", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "columnWidth", TypeExpr: "number | null", Optional: true},
				TypeProperty{Name: "configLanguage", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "pinnedParams", TypeExpr: "Array<string>", Optional: true},
				TypeProperty{Name: "selectedParams", TypeExpr: "Array<string>", Optional: true},
				TypeProperty{Name: "ignoreTypeErrors", TypeExpr: "TypeErrorIgnoreState", Optional: true},
				TypeProperty{Name: "edgeInputParams", TypeExpr: "Array<string>", Optional: true},
				TypeProperty{Name: "edgeOutputPorts", TypeExpr: "Array<EdgePort>", Optional: true},
				TypeProperty{Name: "topLevelParamId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "isJsonSource", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "jsonSourceKeys", TypeExpr: "Array<string>", Optional: true},
				TypeProperty{Name: "jsonSourceMissing", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "metaControlParamId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "showSectionTitle", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "attachedTerminalSectionId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "code", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "codeLanguage", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "codeFileBinding", TypeExpr: "CodeFileBinding | null", Optional: true},
				TypeProperty{Name: "messages", TypeExpr: "Array<BaseChatMessageUnion>", Optional: true},
				TypeProperty{Name: "inputText", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "waitingForResponse", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "toolCallArguments", TypeExpr: "Record<string, string>", Optional: true},
				TypeProperty{Name: "pluginId", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "kind", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "data", TypeExpr: "Record<string, unknown>", Optional: true},
				TypeProperty{Name: "schemaVersion", TypeExpr: "number | null", Optional: true},
				TypeProperty{Name: "viewMode", TypeExpr: "ListRootViewMode", Optional: true},
				TypeProperty{Name: "defaultChildSectionType", TypeExpr: "SectionType", Optional: true},
				TypeProperty{Name: "isHorizontalOrientation", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "overflowMode", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "hideColumn", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "folder", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "filePath", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "activeSheet", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "readOnly", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "showRowNumbers", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "density", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "autoReloadOnExternalChange", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "text", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "metaControlStyle", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "imagePath", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "dataPath", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "chartSettings", TypeExpr: "BaseChartSettingsUnion", Optional: true},
			),
			reflect.TypeOf(CallableSectionImpl{}): aliasDeclarationWithFactory(
				"CallableSectionImpl",
				`BaseSectionImpl & {
  type: typeof SectionTypeEnum.Callable;
  codeObjVariantMap: Record<string, string>;
  hideUnpinnedParams: boolean;
  paramFilter: string;
  columnWidth: number | null;
  configLanguage: ConfigLanguage;
  pinnedParams: Array<string>;
  selectedParams: Array<string>;
  ignoreTypeErrors: TypeErrorIgnoreState;
  edgeInputParams: Array<string>;
  edgeOutputPorts: Array<EdgePort>;
  callable?: string | null;
  hideParams: boolean;
}`,
				`export function createCallableSectionImpl(
  defaultsOrOverrides:
    | Partial<UserDefaultCallableSectionImpl>
    | Partial<CallableSectionImpl> = {},
  overrides?: Partial<CallableSectionImpl>,
): CallableSectionImpl {
  const resolved = resolveGeneratedFactoryInputs<
    UserDefaultCallableSectionImpl,
    CallableSectionImpl
  >(createUserDefaultCallableSectionImpl(), defaultsOrOverrides, overrides);
  return mergeGeneratedOptions(
    {
      type: SectionTypeEnum.Callable,
      id: "",
      name: "",
      isFrozen: resolved.defaults.isFrozen,
      isInOtherProjectConfigs: false,
      tagColor: resolved.defaults.tagColor,
      styleColor: resolved.defaults.styleColor,
      size: resolved.defaults.size,
      aspectRatio: resolved.defaults.aspectRatio,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: resolved.defaults.isMinimized,
      positionAndSizeLocked: resolved.defaults.positionAndSizeLocked,
      isPreset: false,
      codeObjVariantMap: {},
      hideUnpinnedParams: resolved.defaults.hideUnpinnedParams,
      paramFilter: resolved.defaults.paramFilter,
      columnWidth: resolved.defaults.columnWidth,
      configLanguage: resolved.defaults.configLanguage,
      pinnedParams: [],
      selectedParams: [],
      ignoreTypeErrors: {
        callable: false,
        params: {},
      },
      edgeInputParams: resolved.defaults.edgeInputParams,
      edgeOutputPorts: resolved.defaults.edgeOutputPorts,
      callable: null,
      hideParams: resolved.defaults.hideParams,
    },
    resolved.overrides,
  );
}`,
			),
			reflect.TypeOf(BaseParentSectionImplUnion{}): aliasDeclaration(
				"BaseParentSectionImplUnion",
				`BaseSectionImpl & {
  children: Array<string>;
}`,
			),
			reflect.TypeOf(BaseSectionWithParamsImplUnion{}): aliasDeclaration(
				"BaseSectionWithParamsImplUnion",
				`BaseSectionImpl & {
  codeObjVariantMap: Record<string, string>;
}`,
			),
			reflect.TypeOf(DictSectionImpl{}): aliasDeclarationWithFactory(
				"DictSectionImpl",
				`BaseSectionImpl & {
  type: typeof SectionTypeEnum.Dict;
  codeObjVariantMap: Record<string, string>;
  hideUnpinnedParams: boolean;
  paramFilter: string;
  columnWidth: number | null;
  configLanguage: string;
  pinnedParams: Array<string>;
  selectedParams: Array<string>;
  ignoreTypeErrors: TypeErrorIgnoreState;
  edgeInputParams: Array<string>;
  edgeOutputPorts: Array<EdgePort>;
  topLevelParamId: string | null;
  isJsonSource: boolean;
  jsonSourceKeys: Array<string>;
  jsonSourceMissing: boolean;
}`,
				`export function createDictSectionImpl(
  defaults: UserDefaultDictSectionImpl,
  overrides: Partial<DictSectionImpl> = {},
): DictSectionImpl {
  return mergeGeneratedOptions(
    {
      type: SectionTypeEnum.Dict,
      id: "",
      name: "",
      isFrozen: defaults.isFrozen,
      isInOtherProjectConfigs: false,
      tagColor: defaults.tagColor,
      styleColor: defaults.styleColor,
      size: defaults.size,
      aspectRatio: defaults.aspectRatio,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: defaults.isMinimized,
      positionAndSizeLocked: defaults.positionAndSizeLocked,
      isPreset: false,
      codeObjVariantMap: {},
      hideUnpinnedParams: defaults.hideUnpinnedParams,
      paramFilter: defaults.paramFilter,
      columnWidth: defaults.columnWidth,
      configLanguage: defaults.configLanguage,
      pinnedParams: [],
      selectedParams: [],
      ignoreTypeErrors: {
        callable: false,
        params: {},
      },
      edgeInputParams: defaults.edgeInputParams,
      edgeOutputPorts: defaults.edgeOutputPorts,
      topLevelParamId: null,
      isJsonSource: defaults.isJsonSource,
      jsonSourceKeys: defaults.jsonSourceKeys,
      jsonSourceMissing: false,
    },
    overrides,
  );
}`,
			),
			reflect.TypeOf(UserDefaultCallableSectionImpl{}): objectDeclarationWithCreateExpr(
				"UserDefaultCallableSectionImpl",
				`mergeGeneratedOptions(
    {
      ...createGeneratedBaseSectionWithParamsDefaults(),
      hideParams: false,
    },
    options,
  )`,
				TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
				TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
				TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
				TypeProperty{Name: "size", TypeExpr: "SectionSize"},
				TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
				TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
				TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
				TypeProperty{Name: "hideUnpinnedParams", TypeExpr: "boolean"},
				TypeProperty{Name: "paramFilter", TypeExpr: "string"},
				TypeProperty{Name: "columnWidth", TypeExpr: "number | null"},
				TypeProperty{Name: "configLanguage", TypeExpr: "ConfigLanguage"},
				TypeProperty{Name: "edgeInputParams", TypeExpr: "Array<string>"},
				TypeProperty{Name: "edgeOutputPorts", TypeExpr: "Array<EdgePort>"},
				TypeProperty{Name: "hideParams", TypeExpr: "boolean"},
			),
			reflect.TypeOf(UserDefaultDictSectionImpl{}): objectDeclarationWithCreateExpr(
				"UserDefaultDictSectionImpl",
				`mergeGeneratedOptions(
    {
      ...createGeneratedBaseSectionWithParamsDefaults(),
      isJsonSource: false,
      jsonSourceKeys: [],
    },
    options,
  )`,
				TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
				TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
				TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
				TypeProperty{Name: "size", TypeExpr: "SectionSize"},
				TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
				TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
				TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
				TypeProperty{Name: "hideUnpinnedParams", TypeExpr: "boolean"},
				TypeProperty{Name: "paramFilter", TypeExpr: "string"},
				TypeProperty{Name: "columnWidth", TypeExpr: "number | null"},
				TypeProperty{Name: "configLanguage", TypeExpr: "string"},
				TypeProperty{Name: "edgeInputParams", TypeExpr: "Array<string>"},
				TypeProperty{Name: "edgeOutputPorts", TypeExpr: "Array<EdgePort>"},
				TypeProperty{Name: "isJsonSource", TypeExpr: "boolean"},
				TypeProperty{Name: "jsonSourceKeys", TypeExpr: "Array<string>"},
			),
			reflect.TypeOf(BaseDictSectionImplUnion{}): aliasDeclaration(
				"BaseDictSectionImplUnion",
				`BaseSectionImpl & {
  type: typeof SectionTypeEnum.Dict | typeof SectionTypeEnum.GlobalVariables;
  codeObjVariantMap: Record<string, string>;
  hideUnpinnedParams: boolean;
  paramFilter: string;
  columnWidth: number | null;
  configLanguage: string;
  pinnedParams: Array<string>;
  selectedParams: Array<string>;
  ignoreTypeErrors: TypeErrorIgnoreState;
  edgeInputParams: Array<string>;
  edgeOutputPorts: Array<EdgePort>;
  topLevelParamId: string | null;
  isJsonSource: boolean;
  jsonSourceKeys: Array<string>;
  jsonSourceMissing: boolean;
}`,
			),
			reflect.TypeOf(BaseCodeObjImpl{}): aliasDeclaration(
				"BaseCodeObjImpl",
				`{
  type: CodeObjType;
  id: string;
  name: string;
  description: string;
  isPreset: boolean;
  children?: Array<string>;
  coreNameType?: ParamNameType;
  coreNameEditable?: boolean;
  passingStyle?: ParameterPassingStyle;
  typeAnnotation?: string;
  defaultVal?: string;
  value?: string;
  [key: string]: unknown;
}`,
			),
			reflect.TypeOf(CodeParamCodeObjImpl{}): aliasDeclarationWithFactory(
				"CodeParamCodeObjImpl",
				`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.CodeParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
}`,
				`export function createCodeParamCodeObjImpl(
  defaultsOrOverrides:
    | Partial<UserDefaultCodeParamCodeObjImpl>
    | Partial<CodeParamCodeObjImpl> = {},
  overrides?: Partial<CodeParamCodeObjImpl>,
): CodeParamCodeObjImpl {
  const resolved = resolveGeneratedFactoryInputs<
    UserDefaultCodeParamCodeObjImpl,
    CodeParamCodeObjImpl
  >(createUserDefaultCodeParamCodeObjImpl(), defaultsOrOverrides, overrides);
  return mergeGeneratedOptions(
    {
      type: CodeObjTypeEnum.CodeParam,
      id: "",
      name: "",
      description: "",
      isPreset: false,
      coreNameType: resolved.defaults.coreNameType,
      coreNameEditable: resolved.defaults.coreNameEditable,
      passingStyle: ParameterPassingStyleEnum.DEFAULT,
      typeAnnotation: resolved.defaults.typeAnnotation,
      defaultVal: resolved.defaults.defaultVal,
      value: resolved.defaults.value,
    },
    resolved.overrides,
  );
}`,
			),
			reflect.TypeOf(CodeCallableCodeObjImpl{}): aliasDeclaration(
				"CodeCallableCodeObjImpl",
				`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.CodeCallable;
  children: Array<string>;
}`,
			),
			reflect.TypeOf(NestedParamCodeObjImpl{}): aliasDeclaration(
				"NestedParamCodeObjImpl",
				`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.NestedParam;
  children: Array<string>;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
}`,
			),
			reflect.TypeOf(BaseCodeObjImplUnion{}): aliasDeclaration(
				"BaseCodeObjImplUnion",
				`BaseCodeObjImpl
  | CodeCallableCodeObjImpl
  | CodeParamCodeObjImpl
  | TextParamCodeObjImpl
  | DateParamCodeObjImpl
  | TimeParamCodeObjImpl
  | ButtonParamCodeObjImpl
  | SliderParamCodeObjImpl
  | RotaryParamCodeObjImpl
  | SwitchParamCodeObjImpl
  | ColorPickerParamCodeObjImpl
  | DropdownParamCodeObjImpl
  | PasswordParamCodeObjImpl
  | TextAreaParamCodeObjImpl
  | DropzoneParamCodeObjImpl
  | NestedParamCodeObjImpl`,
			),
			reflect.TypeOf(BaseChildlessCodeObjImplUnion{}): aliasDeclaration(
				"BaseChildlessCodeObjImplUnion",
				`BaseCodeObjImpl
  | CodeParamCodeObjImpl
  | TextParamCodeObjImpl
  | DateParamCodeObjImpl
  | TimeParamCodeObjImpl
  | SliderParamCodeObjImpl
  | RotaryParamCodeObjImpl
  | SwitchParamCodeObjImpl
  | ColorPickerParamCodeObjImpl
  | DropdownParamCodeObjImpl
  | PasswordParamCodeObjImpl
  | TextAreaParamCodeObjImpl
  | DropzoneParamCodeObjImpl`,
			),
			reflect.TypeOf(BaseParamCodeObjImplUnion{}): aliasDeclaration(
				"BaseParamCodeObjImplUnion",
				`BaseCodeObjImpl
  | CodeParamCodeObjImpl
  | TextParamCodeObjImpl
  | DateParamCodeObjImpl
  | TimeParamCodeObjImpl
  | ButtonParamCodeObjImpl
  | SliderParamCodeObjImpl
  | RotaryParamCodeObjImpl
  | SwitchParamCodeObjImpl
  | ColorPickerParamCodeObjImpl
  | DropdownParamCodeObjImpl
  | PasswordParamCodeObjImpl
  | TextAreaParamCodeObjImpl
  | DropzoneParamCodeObjImpl
  | NestedParamCodeObjImpl`,
			),
			reflect.TypeOf(BaseParentCodeObjImplUnion{}): aliasDeclaration(
				"BaseParentCodeObjImplUnion",
				`CodeCallableCodeObjImpl
  | NestedParamCodeObjImpl`,
			),
			reflect.TypeOf(UserDefaultCodeParamCodeObjImpl{}): objectDeclarationWithCreateExpr(
				"UserDefaultCodeParamCodeObjImpl",
				`mergeGeneratedOptions(
    {
      coreNameType: ParamNameTypeEnum.TEXT,
      coreNameEditable: false,
      typeAnnotation: "",
      defaultVal: "",
      value: "",
    },
    options,
  )`,
				TypeProperty{Name: "coreNameType", TypeExpr: "ParamNameType"},
				TypeProperty{Name: "coreNameEditable", TypeExpr: "boolean"},
				TypeProperty{Name: "typeAnnotation", TypeExpr: "string"},
				TypeProperty{Name: "defaultVal", TypeExpr: "string"},
				TypeProperty{Name: "value", TypeExpr: "string"},
			),
			reflect.TypeOf(ColorPickerChoice{}): objectDeclaration(
				"ColorPickerChoice",
				TypeProperty{Name: "color", TypeExpr: "string"},
				TypeProperty{Name: "description", TypeExpr: "string"},
			),
			reflect.TypeOf(TextParamCodeObjImpl{}): aliasDeclaration(
				"TextParamCodeObjImpl",
				`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.TextParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  uiType: TextParamInputUIType;
}`,
			),
			reflect.TypeOf(DateParamCodeObjImpl{}): aliasDeclaration(
				"DateParamCodeObjImpl",
				`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.DateParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  dateDisplayFormat: DateDisplayFormat;
  dateControlMode: DateControlMode;
  dateSelectionMode: DateSelectionMode;
  dateCalendarWeekStart: DateCalendarWeekStart;
  dateIncludesTime: boolean;
}`,
			),
			reflect.TypeOf(TimeParamCodeObjImpl{}): aliasDeclaration(
				"TimeParamCodeObjImpl",
				`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.TimeParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  timeControlMode: TimeControlMode;
  timeDisplayFormat: TimeDisplayFormat;
  timeDisplayTransparent: boolean;
  timeDisplayScale: number;
  timeDisplayFont: TimeDisplayFont;
}`,
			),
			reflect.TypeOf(ButtonParamCodeObjImpl{}): aliasDeclaration(
				"ButtonParamCodeObjImpl",
				`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.ButtonParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  label: string;
  actionMode: ButtonActionMode;
  requestMethod: HttpRequestMethod;
  requestUrl: string;
  requestHeaderKey: string;
  requestHeaderValue: string;
  requestBody: string;
}`,
			),
			reflect.TypeOf(SliderParamCodeObjImpl{}): aliasDeclaration(
				"SliderParamCodeObjImpl",
				`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.SliderParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  min: number;
  max: number;
  step: number;
}`,
			),
			reflect.TypeOf(RotaryParamCodeObjImpl{}): aliasDeclaration(
				"RotaryParamCodeObjImpl",
				`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.RotaryParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  min: number;
  max: number;
  step: number;
}`,
			),
			reflect.TypeOf(SwitchParamCodeObjImpl{}): aliasDeclaration(
				"SwitchParamCodeObjImpl",
				`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.SwitchParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
}`,
			),
			reflect.TypeOf(ColorPickerParamCodeObjImpl{}): aliasDeclaration(
				"ColorPickerParamCodeObjImpl",
				`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.ColorPickerParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  colorChoices: Array<ColorPickerChoice>;
}`,
			),
			reflect.TypeOf(DropdownParamCodeObjImpl{}): aliasDeclaration(
				"DropdownParamCodeObjImpl",
				`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.DropdownParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  choices: Array<string>;
}`,
			),
			reflect.TypeOf(PasswordParamCodeObjImpl{}): aliasDeclaration(
				"PasswordParamCodeObjImpl",
				`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.PasswordParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  hasSecret: boolean;
}`,
			),
			reflect.TypeOf(TextAreaParamCodeObjImpl{}): aliasDeclaration(
				"TextAreaParamCodeObjImpl",
				`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.TextAreaParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
}`,
			),
			reflect.TypeOf(DropzoneParamCodeObjImpl{}): aliasDeclaration(
				"DropzoneParamCodeObjImpl",
				`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.DropzoneParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  mode: DropzoneMode;
  maxAttachments?: number | null;
  placeholder: string;
}`,
			),
			reflect.TypeOf(UserDefaultListRootSectionImpl{}): objectDeclarationWithCreateExpr(
				"UserDefaultListRootSectionImpl",
				`mergeGeneratedOptions(
    {
      ...createGeneratedBaseSectionDefaults(),
      defaultChildSectionType: SectionTypeEnum.Callable,
      viewMode: ListRootViewModeEnum.default,
    },
    options,
  )`,
				TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
				TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
				TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
				TypeProperty{Name: "size", TypeExpr: "SectionSize"},
				TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
				TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
				TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
				TypeProperty{Name: "defaultChildSectionType", TypeExpr: "SectionType"},
				TypeProperty{Name: "viewMode", TypeExpr: "ListRootViewMode"},
			),
			reflect.TypeOf(ListRootSectionImpl{}): aliasDeclarationWithFactory(
				"ListRootSectionImpl",
				`BaseSectionImpl & {
  type: typeof SectionTypeEnum.ListRoot;
  children: Array<string>;
  defaultChildSectionType: SectionType;
  viewMode: ListRootViewMode;
}`,
				`export function createListRootSectionImpl(
  defaultsOrOverrides:
    | Partial<UserDefaultListRootSectionImpl>
    | Partial<ListRootSectionImpl> = {},
  overrides?: Partial<ListRootSectionImpl>,
): ListRootSectionImpl {
  const resolved = resolveGeneratedFactoryInputs<
    UserDefaultListRootSectionImpl,
    ListRootSectionImpl
  >(createUserDefaultListRootSectionImpl(), defaultsOrOverrides, overrides);
  return mergeGeneratedOptions(
    {
      type: SectionTypeEnum.ListRoot,
      id: "",
      name: "",
      isFrozen: resolved.defaults.isFrozen,
      isInOtherProjectConfigs: false,
      tagColor: resolved.defaults.tagColor,
      styleColor: resolved.defaults.styleColor,
      size: resolved.defaults.size,
      aspectRatio: resolved.defaults.aspectRatio,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: resolved.defaults.isMinimized,
      positionAndSizeLocked: resolved.defaults.positionAndSizeLocked,
      isPreset: false,
      children: [],
      defaultChildSectionType: resolved.defaults.defaultChildSectionType,
      viewMode: resolved.defaults.viewMode,
    },
    resolved.overrides,
  );
}`,
			),
			reflect.TypeOf(UserDefaultTextBlockSectionImpl{}): objectDeclarationWithCreateExpr(
				"UserDefaultTextBlockSectionImpl",
				`mergeGeneratedOptions(
    {
      ...createGeneratedBaseSectionDefaults(),
      size: {
        width: 500,
        height: 150,
      },
      format: TextBlockFormatEnum.Plaintext,
      masterFontSizePx: 14,
      headingAsSectionName: false,
      metaControlStyle: false,
      textDisplayMode: TextBlockDisplayModeEnum.Render,
      text: "",
    },
    options,
  )`,
				TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
				TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
				TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
				TypeProperty{Name: "size", TypeExpr: "SectionSize"},
				TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
				TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
				TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
				TypeProperty{Name: "format", TypeExpr: "TextBlockFormat"},
				TypeProperty{Name: "masterFontSizePx", TypeExpr: "number"},
				TypeProperty{Name: "headingAsSectionName", TypeExpr: "boolean"},
				TypeProperty{Name: "metaControlStyle", TypeExpr: "boolean"},
				TypeProperty{Name: "textDisplayMode", TypeExpr: "TextBlockDisplayMode"},
				TypeProperty{Name: "text", TypeExpr: "string"},
			),
			reflect.TypeOf(TextBlockSectionImpl{}): aliasDeclarationWithFactory(
				"TextBlockSectionImpl",
				`BaseSectionImpl & {
  type: typeof SectionTypeEnum.TextBlock;
  format: TextBlockFormat;
  masterFontSizePx: number;
  headingAsSectionName: boolean;
  metaControlStyle: boolean;
  textDisplayMode: TextBlockDisplayMode;
  text: string;
}`,
				`export function createTextBlockSectionImpl(
  defaultsOrOverrides:
    | Partial<UserDefaultTextBlockSectionImpl>
    | Partial<TextBlockSectionImpl> = {},
  overrides?: Partial<TextBlockSectionImpl>,
): TextBlockSectionImpl {
  const resolved = resolveGeneratedFactoryInputs<
    UserDefaultTextBlockSectionImpl,
    TextBlockSectionImpl
  >(createUserDefaultTextBlockSectionImpl(), defaultsOrOverrides, overrides);
  return mergeGeneratedOptions(
    {
      type: SectionTypeEnum.TextBlock,
      id: "",
      name: "",
      isFrozen: resolved.defaults.isFrozen,
      isInOtherProjectConfigs: false,
      tagColor: resolved.defaults.tagColor,
      styleColor: resolved.defaults.styleColor,
      size: resolved.defaults.size,
      aspectRatio: resolved.defaults.aspectRatio,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: resolved.defaults.isMinimized,
      positionAndSizeLocked: resolved.defaults.positionAndSizeLocked,
      isPreset: false,
      format: resolved.defaults.format,
      masterFontSizePx: resolved.defaults.masterFontSizePx,
      headingAsSectionName: resolved.defaults.headingAsSectionName,
      metaControlStyle: resolved.defaults.metaControlStyle,
      textDisplayMode: resolved.defaults.textDisplayMode,
      text: resolved.defaults.text,
    },
    resolved.overrides,
  );
}`,
			),
			reflect.TypeOf(CodeSectionDiagnosticsIgnoreState{}): objectDeclaration(
				"CodeSectionDiagnosticsIgnoreState",
				TypeProperty{Name: "muted", TypeExpr: "boolean"},
				TypeProperty{Name: "suppressedCodes", TypeExpr: "Array<string | number>"},
			),
			reflect.TypeOf(UserDefaultCodeSectionImpl{}): objectDeclarationWithCreateExpr(
				"UserDefaultCodeSectionImpl",
				`mergeGeneratedOptions(
    {
      ...createGeneratedBaseCodeSectionDefaults(),
      codeLanguage: CodeLanguageEnum.python,
      diagnosticsIgnoreState: {
        muted: false,
        suppressedCodes: [],
      },
    },
    options,
  )`,
				TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
				TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
				TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
				TypeProperty{Name: "size", TypeExpr: "SectionSize"},
				TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
				TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
				TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
				TypeProperty{Name: "code", TypeExpr: "string"},
				TypeProperty{Name: "codeFileBinding", TypeExpr: "CodeFileBinding | null"},
				TypeProperty{Name: "attachedTerminalSectionId", TypeExpr: "string | null"},
				TypeProperty{Name: "codeLanguage", TypeExpr: "string"},
				TypeProperty{Name: "diagnosticsIgnoreState", TypeExpr: "CodeSectionDiagnosticsIgnoreState"},
			),
			reflect.TypeOf(CodeSectionImpl{}): aliasDeclarationWithFactory(
				"CodeSectionImpl",
				`BaseSectionImpl & {
  type: typeof SectionTypeEnum.Code;
  children: Array<string>;
  code: string;
  codeLanguage: string;
  codeFileBinding?: CodeFileBinding | null;
  attachedTerminalSectionId?: string | null;
  diagnosticsIgnoreState: CodeSectionDiagnosticsIgnoreState;
}`,
				`export function createCodeSectionImpl(
  defaultsOrOverrides:
    | Partial<UserDefaultCodeSectionImpl>
    | Partial<CodeSectionImpl> = {},
  overrides?: Partial<CodeSectionImpl>,
): CodeSectionImpl {
  const resolved = resolveGeneratedFactoryInputs<
    UserDefaultCodeSectionImpl,
    CodeSectionImpl
  >(createUserDefaultCodeSectionImpl(), defaultsOrOverrides, overrides);
  return mergeGeneratedOptions(
    {
      type: SectionTypeEnum.Code,
      id: "",
      name: "",
      isFrozen: resolved.defaults.isFrozen,
      isInOtherProjectConfigs: false,
      tagColor: resolved.defaults.tagColor,
      styleColor: resolved.defaults.styleColor,
      size: resolved.defaults.size,
      aspectRatio: resolved.defaults.aspectRatio,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: resolved.defaults.isMinimized,
      positionAndSizeLocked: resolved.defaults.positionAndSizeLocked,
      isPreset: false,
      children: [],
      code: resolved.defaults.code,
      codeLanguage: resolved.defaults.codeLanguage,
      codeFileBinding: resolved.defaults.codeFileBinding,
      attachedTerminalSectionId: resolved.defaults.attachedTerminalSectionId,
      diagnosticsIgnoreState: cloneGeneratedValue(
        resolved.defaults.diagnosticsIgnoreState,
      ),
    },
    resolved.overrides,
  );
}`,
			),
			reflect.TypeOf(UserDefaultTerminalSectionImpl{}): objectDeclarationWithCreateExpr(
				"UserDefaultTerminalSectionImpl",
				`mergeGeneratedOptions(
    {
      ...createGeneratedBaseSectionDefaults(),
    },
    options,
  )`,
				TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
				TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
				TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
				TypeProperty{Name: "size", TypeExpr: "SectionSize"},
				TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
				TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
				TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
			),
			reflect.TypeOf(TerminalSectionImpl{}): aliasDeclarationWithFactory(
				"TerminalSectionImpl",
				`BaseSectionImpl & {
  type: typeof SectionTypeEnum.Terminal;
}`,
				`export function createTerminalSectionImpl(
  defaultsOrOverrides:
    | Partial<UserDefaultTerminalSectionImpl>
    | Partial<TerminalSectionImpl> = {},
  overrides?: Partial<TerminalSectionImpl>,
): TerminalSectionImpl {
  const resolved = resolveGeneratedFactoryInputs<
    UserDefaultTerminalSectionImpl,
    TerminalSectionImpl
  >(createUserDefaultTerminalSectionImpl(), defaultsOrOverrides, overrides);
  return mergeGeneratedOptions(
    {
      type: SectionTypeEnum.Terminal,
      id: "",
      name: "",
      isFrozen: resolved.defaults.isFrozen,
      isInOtherProjectConfigs: false,
      tagColor: resolved.defaults.tagColor,
      styleColor: resolved.defaults.styleColor,
      size: resolved.defaults.size,
      aspectRatio: resolved.defaults.aspectRatio,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: resolved.defaults.isMinimized,
      positionAndSizeLocked: resolved.defaults.positionAndSizeLocked,
      isPreset: false,
    },
    resolved.overrides,
  );
}`,
			),
			reflect.TypeOf(BaseSectionImplUnion{}): aliasDeclaration(
				"BaseSectionImplUnion",
				`CallableSectionImpl
  | DictSectionImpl
  | ListRootSectionImpl
  | TextBlockSectionImpl
  | CodeSectionImpl
  | TerminalSectionImpl
  | ChatSectionImpl
  | BrowserSectionImpl
  | ChartSectionImpl
  | TaskBoardSectionImpl
  | SpreadsheetSectionImpl
  | BaseSectionImpl`,
			),
			reflect.TypeOf(JSONValue{}): aliasDeclaration(
				"JSONValue",
				"null | boolean | number | string | Array<JSONValue> | { [key: string]: JSONValue | undefined }",
			),
			reflect.TypeOf(ChatFileAttachment{}): objectDeclaration(
				"ChatFileAttachment",
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "mimeType", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "size", TypeExpr: "number | null", Optional: true},
			),
			reflect.TypeOf(MessageTextContent{}): objectDeclarationWithCreateExpr(
				"MessageTextContent",
				`mergeGeneratedOptions(
    {
      type: "text",
      text: "",
    },
    options,
  )`,
				TypeProperty{Name: "type", TypeExpr: `"text"`},
				TypeProperty{Name: "text", TypeExpr: "string"},
			),
			reflect.TypeOf(MessageImageURL{}): objectDeclaration(
				"MessageImageUrl",
				TypeProperty{Name: "url", TypeExpr: "string"},
				TypeProperty{Name: "detail", TypeExpr: `"auto" | "low" | "high" | null`, Optional: true},
			),
			reflect.TypeOf(MessageImageURLContent{}): objectDeclaration(
				"MessageImageUrlContent",
				TypeProperty{Name: "type", TypeExpr: `"image_url"`},
				TypeProperty{Name: "image_url", TypeExpr: "MessageImageUrl"},
			),
			reflect.TypeOf(MessageThinkingContent{}): objectDeclarationWithCreateExpr(
				"MessageThinkingContent",
				`mergeGeneratedOptions(
    {
      type: "thinking",
      thinking: "",
      summary: "",
      signature: "",
    },
    options,
  )`,
				TypeProperty{Name: "type", TypeExpr: `"thinking"`},
				TypeProperty{Name: "thinking", TypeExpr: "string"},
				TypeProperty{Name: "summary", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "signature", TypeExpr: "string | null", Optional: true},
			),
			reflect.TypeOf(MessageContent{}): aliasDeclaration(
				"MessageContent",
				"MessageTextContent | MessageImageUrlContent | MessageThinkingContent",
			),
			reflect.TypeOf(ToolReferenceContent{}): objectDeclaration(
				"ToolReferenceContent",
				TypeProperty{Name: "type", TypeExpr: `"tool_reference"`},
				TypeProperty{Name: "tool_name", TypeExpr: "string"},
			),
			reflect.TypeOf(ToolCallFunction{}): objectDeclarationWithCreateExpr(
				"ToolCallFunction",
				`mergeGeneratedOptions(
    {
      name: "",
      arguments: {},
    },
    options,
  )`,
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "arguments", TypeExpr: "{ [key: string]: JSONValue | undefined }"},
			),
			reflect.TypeOf(ToolCall{}): objectDeclarationWithCreateExpr(
				"ToolCall",
				`mergeGeneratedOptions(
    {
      id: "",
      type: "function",
      function: createToolCallFunction(),
    },
    options,
  )`,
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "type", TypeExpr: `"function"`},
				TypeProperty{Name: "function", TypeExpr: "ToolCallFunction"},
			),
			reflect.TypeOf(SystemChatMessage{}): objectDeclarationWithCreateExpr(
				"SystemChatMessage",
				`mergeGeneratedOptions(
    {
      id: "",
      role: ChatRoleEnum.system,
      content: [],
      attachments: [],
    },
    options,
  )`,
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "content", TypeExpr: "Array<MessageContent>"},
				TypeProperty{Name: "attachments", TypeExpr: "Array<ChatFileAttachment>"},
				TypeProperty{Name: "role", TypeExpr: "typeof ChatRoleEnum.system"},
			),
			reflect.TypeOf(AssistantChatMessage{}): objectDeclarationWithCreateExpr(
				"AssistantChatMessage",
				`mergeGeneratedOptions(
    {
      id: "",
      role: ChatRoleEnum.assistant,
      content: [],
      attachments: [],
      tool_calls: null,
    },
    options,
  )`,
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "content", TypeExpr: "Array<MessageContent>"},
				TypeProperty{Name: "attachments", TypeExpr: "Array<ChatFileAttachment>"},
				TypeProperty{Name: "role", TypeExpr: "typeof ChatRoleEnum.assistant"},
				TypeProperty{Name: "tool_calls", TypeExpr: "Array<ToolCall> | null", Optional: true},
			),
			reflect.TypeOf(UserChatMessage{}): objectDeclarationWithCreateExpr(
				"UserChatMessage",
				`mergeGeneratedOptions(
    {
      id: "",
      role: ChatRoleEnum.user,
      content: [],
      attachments: [],
    },
    options,
  )`,
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "content", TypeExpr: "Array<MessageContent>"},
				TypeProperty{Name: "attachments", TypeExpr: "Array<ChatFileAttachment>"},
				TypeProperty{Name: "role", TypeExpr: "typeof ChatRoleEnum.user"},
			),
			reflect.TypeOf(ToolChatMessage{}): objectDeclarationWithCreateExpr(
				"ToolChatMessage",
				`mergeGeneratedOptions(
    {
      id: "",
      role: ChatRoleEnum.tool,
      tool_call_id: "",
      tool_name: null,
      arguments: {},
      result: null,
      content: [],
      is_error: false,
      started_at: "",
      completed_at: null,
    },
    options,
  )`,
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "role", TypeExpr: "typeof ChatRoleEnum.tool"},
				TypeProperty{Name: "tool_call_id", TypeExpr: "string"},
				TypeProperty{Name: "tool_name", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "arguments", TypeExpr: "JSONValue"},
				TypeProperty{Name: "result", TypeExpr: "JSONValue"},
				TypeProperty{Name: "content", TypeExpr: "Array<ToolReferenceContent | Record<string, unknown>>"},
				TypeProperty{Name: "is_error", TypeExpr: "boolean"},
				TypeProperty{Name: "started_at", TypeExpr: "string"},
				TypeProperty{Name: "completed_at", TypeExpr: "string | null", Optional: true},
			),
			reflect.TypeOf(BaseChatMessageUnion{}): aliasDeclaration(
				"BaseChatMessageUnion",
				"SystemChatMessage | AssistantChatMessage | UserChatMessage | ToolChatMessage",
			),
			reflect.TypeOf(ChatSectionBranch{}): objectDeclaration(
				"ChatSectionBranch",
				TypeProperty{Name: "messages", TypeExpr: "Array<BaseChatMessageUnion>"},
				TypeProperty{Name: "createdAt", TypeExpr: "number"},
				TypeProperty{Name: "parentBranchId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "branchFromMessageId", TypeExpr: "string | null", Optional: true},
			),
			reflect.TypeOf(ChatSectionState{}): objectDeclaration(
				"ChatSectionState",
				TypeProperty{Name: "messages", TypeExpr: "Array<BaseChatMessageUnion>"},
				TypeProperty{Name: "inputText", TypeExpr: "string"},
				TypeProperty{Name: "waitingForResponse", TypeExpr: "boolean"},
				TypeProperty{Name: "toolCallArguments", TypeExpr: "Record<string, string>"},
				TypeProperty{Name: "activeBranchId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "branches", TypeExpr: "Record<string, ChatSectionBranch>"},
			),
			reflect.TypeOf(UserDefaultChatSectionImpl{}): objectDeclarationWithCreateExpr(
				"UserDefaultChatSectionImpl",
				`mergeGeneratedOptions(
    {
      ...createGeneratedBaseSectionDefaults(),
      size: {
        width: 400,
        height: 200,
      },
      managed: false,
      engineConfigId: null,
      transcriptionProfileId: null,
      agentProfileId: null,
      chatId: null,
      thinking: true,
      permissionMode: ChatPermissionModeEnum.minimal,
      searchEnabled: true,
      dictationMode: ChatDictationModeEnum.auto,
      messages: [],
      inputText: "",
      waitingForResponse: false,
      toolCallArguments: {},
      activeBranchId: null,
      branches: {},
    },
    options,
  )`,
				TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
				TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
				TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
				TypeProperty{Name: "size", TypeExpr: "SectionSize"},
				TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
				TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
				TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
				TypeProperty{Name: "managed", TypeExpr: "boolean"},
				TypeProperty{Name: "engineConfigId", TypeExpr: "string | null"},
				TypeProperty{Name: "transcriptionProfileId", TypeExpr: "string | null"},
				TypeProperty{Name: "agentProfileId", TypeExpr: "string | null"},
				TypeProperty{Name: "chatId", TypeExpr: "string | null"},
				TypeProperty{Name: "thinking", TypeExpr: "boolean"},
				TypeProperty{Name: "permissionMode", TypeExpr: "ChatPermissionMode"},
				TypeProperty{Name: "searchEnabled", TypeExpr: "boolean"},
				TypeProperty{Name: "dictationMode", TypeExpr: "ChatDictationMode"},
				TypeProperty{Name: "messages", TypeExpr: "Array<BaseChatMessageUnion>"},
				TypeProperty{Name: "inputText", TypeExpr: "string"},
				TypeProperty{Name: "waitingForResponse", TypeExpr: "boolean"},
				TypeProperty{Name: "toolCallArguments", TypeExpr: "Record<string, string>"},
				TypeProperty{Name: "activeBranchId", TypeExpr: "string | null"},
				TypeProperty{Name: "branches", TypeExpr: "Record<string, ChatSectionBranch>"},
			),
			reflect.TypeOf(ChatSectionImpl{}): aliasDeclarationWithFactory(
				"ChatSectionImpl",
				`BaseSectionImpl & ChatSectionState & {
  type: typeof SectionTypeEnum.Chat;
  managed: boolean;
  engineConfigId?: string | null;
  transcriptionProfileId?: string | null;
  agentProfileId?: string | null;
  chatId?: string | null;
  thinking: boolean;
  permissionMode: ChatPermissionMode;
  searchEnabled: boolean;
  dictationMode: ChatDictationMode;
}`,
				`export function createChatSectionImpl(
  defaultsOrOverrides:
    | Partial<UserDefaultChatSectionImpl>
    | Partial<ChatSectionImpl> = {},
  overrides?: Partial<ChatSectionImpl>,
): ChatSectionImpl {
  const resolved = resolveGeneratedFactoryInputs<
    UserDefaultChatSectionImpl,
    ChatSectionImpl
  >(createUserDefaultChatSectionImpl(), defaultsOrOverrides, overrides);
  return mergeGeneratedOptions(
    {
      type: SectionTypeEnum.Chat,
      id: "",
      name: "",
      isFrozen: resolved.defaults.isFrozen,
      isInOtherProjectConfigs: false,
      tagColor: resolved.defaults.tagColor,
      styleColor: resolved.defaults.styleColor,
      size: resolved.defaults.size,
      aspectRatio: resolved.defaults.aspectRatio,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: resolved.defaults.isMinimized,
      positionAndSizeLocked: resolved.defaults.positionAndSizeLocked,
      isPreset: false,
      managed: resolved.defaults.managed,
      engineConfigId: resolved.defaults.engineConfigId,
      transcriptionProfileId: resolved.defaults.transcriptionProfileId,
      agentProfileId: resolved.defaults.agentProfileId,
      chatId: resolved.defaults.chatId,
      thinking: resolved.defaults.thinking,
      permissionMode: resolved.defaults.permissionMode,
      searchEnabled: resolved.defaults.searchEnabled,
      dictationMode: resolved.defaults.dictationMode,
      messages: resolved.defaults.messages,
      inputText: resolved.defaults.inputText,
      waitingForResponse: resolved.defaults.waitingForResponse,
      toolCallArguments: resolved.defaults.toolCallArguments,
      activeBranchId: resolved.defaults.activeBranchId,
      branches: resolved.defaults.branches,
    },
    resolved.overrides,
  );
}`,
			),
			reflect.TypeOf(BrowserSavedSearchTypeFilters{}): objectDeclarationWithCreateExpr(
				"BrowserSavedSearchTypeFilters",
				`mergeGeneratedOptions(
    {
      image: true,
      video: true,
      audio: true,
      text: true,
      data: true,
    },
    options,
  )`,
				TypeProperty{Name: "image", TypeExpr: "boolean"},
				TypeProperty{Name: "video", TypeExpr: "boolean"},
				TypeProperty{Name: "audio", TypeExpr: "boolean"},
				TypeProperty{Name: "text", TypeExpr: "boolean"},
				TypeProperty{Name: "data", TypeExpr: "boolean"},
			),
			reflect.TypeOf(BrowserSavedSearch{}): objectDeclarationWithCreateExpr(
				"BrowserSavedSearch",
				`mergeGeneratedOptions(
    {
      id: "",
      name: "",
      query: "",
      searchScope: BrowserSearchScopeEnum.recursive,
      typeFilters: createBrowserSavedSearchTypeFilters(),
      color: "#3b82f6",
      quickInfo: "",
    },
    options,
  )`,
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "query", TypeExpr: "string"},
				TypeProperty{Name: "searchScope", TypeExpr: "BrowserSearchScope"},
				TypeProperty{Name: "typeFilters", TypeExpr: "BrowserSavedSearchTypeFilters"},
				TypeProperty{Name: "color", TypeExpr: "string"},
				TypeProperty{Name: "quickInfo", TypeExpr: "string"},
			),
			reflect.TypeOf(UserDefaultBrowserSectionImpl{}): objectDeclarationWithCreateExpr(
				"UserDefaultBrowserSectionImpl",
				`mergeGeneratedOptions(
    {
      ...createGeneratedBaseSectionDefaults(),
      size: {
        width: 720,
        height: 460,
      },
      folder: "",
      hideColumn: false,
      columnWidth: null,
      typesColumnWidth: null,
      viewMode: BrowserAreaViewModeEnum.list,
      savedSearches: [],
    },
    options,
  )`,
				TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
				TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
				TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
				TypeProperty{Name: "size", TypeExpr: "SectionSize"},
				TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
				TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
				TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
				TypeProperty{Name: "folder", TypeExpr: "string"},
				TypeProperty{Name: "hideColumn", TypeExpr: "boolean"},
				TypeProperty{Name: "columnWidth", TypeExpr: "number | null"},
				TypeProperty{Name: "typesColumnWidth", TypeExpr: "number | null"},
				TypeProperty{Name: "viewMode", TypeExpr: "BrowserAreaViewMode"},
				TypeProperty{Name: "savedSearches", TypeExpr: "Array<BrowserSavedSearch>"},
			),
			reflect.TypeOf(BrowserSectionImpl{}): aliasDeclarationWithFactory(
				"BrowserSectionImpl",
				`Omit<BaseSectionImpl, "viewMode"> & {
  type: typeof SectionTypeEnum.Browser;
  folder: string;
  hideColumn: boolean;
  columnWidth?: number | null;
  typesColumnWidth?: number | null;
  viewMode: BrowserAreaViewMode;
  savedSearches: Array<BrowserSavedSearch>;
}`,
				`export function createBrowserSectionImpl(
  defaultsOrOverrides:
    | Partial<UserDefaultBrowserSectionImpl>
    | Partial<BrowserSectionImpl> = {},
  overrides?: Partial<BrowserSectionImpl>,
): BrowserSectionImpl {
  const resolved = resolveGeneratedFactoryInputs<
    UserDefaultBrowserSectionImpl,
    BrowserSectionImpl
  >(createUserDefaultBrowserSectionImpl(), defaultsOrOverrides, overrides);
  return mergeGeneratedOptions(
    {
      type: SectionTypeEnum.Browser,
      id: "",
      name: "",
      isFrozen: resolved.defaults.isFrozen,
      isInOtherProjectConfigs: false,
      tagColor: resolved.defaults.tagColor,
      styleColor: resolved.defaults.styleColor,
      size: resolved.defaults.size,
      aspectRatio: resolved.defaults.aspectRatio,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: resolved.defaults.isMinimized,
      positionAndSizeLocked: resolved.defaults.positionAndSizeLocked,
      isPreset: false,
      folder: resolved.defaults.folder,
      hideColumn: resolved.defaults.hideColumn,
      columnWidth: resolved.defaults.columnWidth,
      typesColumnWidth: resolved.defaults.typesColumnWidth,
      viewMode: resolved.defaults.viewMode,
      savedSearches: resolved.defaults.savedSearches,
    },
    resolved.overrides,
  );
}`,
			),
			reflect.TypeOf(TaskBoardColumn{}): objectDeclarationWithCreateExpr(
				"TaskBoardColumn",
				`mergeGeneratedOptions(
    {
      id: "",
      name: "",
      color: "#3b82f6",
      sortIndex: 0,
    },
    options,
  )`,
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "color", TypeExpr: "string"},
				TypeProperty{Name: "sortIndex", TypeExpr: "number"},
			),
			reflect.TypeOf(TaskBoardTask{}): objectDeclarationWithCreateExpr(
				"TaskBoardTask",
				`mergeGeneratedOptions(
    {
      id: "",
      title: "",
      description: "",
      completed: false,
      columnId: null,
      dueDateIso: "",
      recurrence: TaskBoardTaskRecurrenceEnum.none,
      recurrenceDays: [],
      recurrenceMonths: [],
      recurrenceYears: [],
      sortIndex: 0,
    },
    options,
  )`,
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "title", TypeExpr: "string"},
				TypeProperty{Name: "description", TypeExpr: "string"},
				TypeProperty{Name: "completed", TypeExpr: "boolean"},
				TypeProperty{Name: "columnId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "dueDateIso", TypeExpr: "string"},
				TypeProperty{Name: "recurrence", TypeExpr: "TaskBoardTaskRecurrence"},
				TypeProperty{Name: "recurrenceDays", TypeExpr: "Array<TaskBoardRecurringWeekday>"},
				TypeProperty{Name: "recurrenceMonths", TypeExpr: "Array<TaskBoardRecurringMonth>"},
				TypeProperty{Name: "recurrenceYears", TypeExpr: "Array<number>"},
				TypeProperty{Name: "sortIndex", TypeExpr: "number"},
			),
			reflect.TypeOf(UserDefaultTaskBoardSectionImpl{}): objectDeclarationWithCreateExpr(
				"UserDefaultTaskBoardSectionImpl",
				`mergeGeneratedOptions(
    {
      ...createGeneratedBaseSectionDefaults(),
      size: {
        width: 720,
        height: 430,
      },
      viewMode: TaskBoardViewModeEnum.kanban,
      columns: null,
      tasks: [],
    },
    options,
  )`,
				TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
				TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
				TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
				TypeProperty{Name: "size", TypeExpr: "SectionSize"},
				TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
				TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
				TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
				TypeProperty{Name: "viewMode", TypeExpr: "TaskBoardViewMode"},
				TypeProperty{Name: "columns", TypeExpr: "Array<TaskBoardColumn> | null"},
				TypeProperty{Name: "tasks", TypeExpr: "Array<TaskBoardTask>"},
			),
			reflect.TypeOf(TaskBoardSectionImpl{}): aliasDeclarationWithFactory(
				"TaskBoardSectionImpl",
				`Omit<BaseSectionImpl, "viewMode"> & {
  type: typeof SectionTypeEnum.TaskBoard;
  viewMode: TaskBoardViewMode;
  columns: Array<TaskBoardColumn>;
  tasks: Array<TaskBoardTask>;
}`,
				`export function createTaskBoardSectionImpl(
  defaultsOrOverrides:
    | Partial<UserDefaultTaskBoardSectionImpl>
    | Partial<TaskBoardSectionImpl> = {},
  overrides?: Partial<TaskBoardSectionImpl>,
): TaskBoardSectionImpl {
  const resolved = resolveGeneratedFactoryInputs<
    UserDefaultTaskBoardSectionImpl,
    TaskBoardSectionImpl
  >(createUserDefaultTaskBoardSectionImpl(), defaultsOrOverrides, overrides);
  const normalizedOverrides: Partial<TaskBoardSectionImpl> = {
    ...resolved.overrides,
  };
  if (normalizedOverrides.columns === undefined) {
    delete normalizedOverrides.columns;
  }
  if (normalizedOverrides.tasks === undefined) {
    delete normalizedOverrides.tasks;
  }
  return mergeGeneratedOptions(
    {
      type: SectionTypeEnum.TaskBoard,
      id: "",
      name: "",
      isFrozen: resolved.defaults.isFrozen,
      isInOtherProjectConfigs: false,
      tagColor: resolved.defaults.tagColor,
      styleColor: resolved.defaults.styleColor,
      size: resolved.defaults.size,
      aspectRatio: resolved.defaults.aspectRatio,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: resolved.defaults.isMinimized,
      positionAndSizeLocked: resolved.defaults.positionAndSizeLocked,
      isPreset: false,
      viewMode: resolved.defaults.viewMode,
      columns:
        resolved.defaults.columns === null ||
        resolved.defaults.columns === undefined
          ? []
          : cloneGeneratedValue(resolved.defaults.columns),
      tasks: resolved.defaults.tasks,
    },
    normalizedOverrides,
  );
}`,
			),
			reflect.TypeOf(LineChartSettings{}): objectDeclarationWithCreateExpr(
				"LineChartSettings",
				`mergeGeneratedOptions(
    {
      type: ChartTypeEnum.line,
      xAxisColumn: null,
      secondYAxisColumns: [],
      xAxisLog: false,
      y1AxisLog: false,
      y2AxisLog: false,
    },
    options,
  )`,
				TypeProperty{Name: "type", TypeExpr: "typeof ChartTypeEnum.line"},
				TypeProperty{Name: "xAxisColumn", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "secondYAxisColumns", TypeExpr: "Array<string>"},
				TypeProperty{Name: "xAxisLog", TypeExpr: "boolean"},
				TypeProperty{Name: "y1AxisLog", TypeExpr: "boolean"},
				TypeProperty{Name: "y2AxisLog", TypeExpr: "boolean"},
			),
			reflect.TypeOf(ScatterChartSettings{}): objectDeclarationWithCreateExpr(
				"ScatterChartSettings",
				`mergeGeneratedOptions(
    {
      type: ChartTypeEnum.scatter,
      xAxisColumn: null,
      categoryColumn: null,
      xAxisLog: false,
      yAxisLog: false,
    },
    options,
  )`,
				TypeProperty{Name: "type", TypeExpr: "typeof ChartTypeEnum.scatter"},
				TypeProperty{Name: "xAxisColumn", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "categoryColumn", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "xAxisLog", TypeExpr: "boolean"},
				TypeProperty{Name: "yAxisLog", TypeExpr: "boolean"},
			),
			reflect.TypeOf(BaseChartSettingsUnion{}): aliasDeclarationWithFactory(
				"BaseChartSettingsUnion",
				"LineChartSettings | ScatterChartSettings",
				`export function createBaseChartSettingsUnionWithDiscriminator(
  options:
    | ({ type: typeof ChartTypeEnum.line } & Partial<LineChartSettings>)
    | ({ type: typeof ChartTypeEnum.scatter } & Partial<ScatterChartSettings>),
): BaseChartSettingsUnion {
  switch (options.type) {
    case ChartTypeEnum.line:
      return createLineChartSettings(options);
    case ChartTypeEnum.scatter:
      return createScatterChartSettings(options);
    default:
      throw new Error("Unsupported chart type.");
  }
}`,
			),
			reflect.TypeOf(UserDefaultChartSectionImpl{}): objectDeclarationWithCreateExpr(
				"UserDefaultChartSectionImpl",
				`mergeGeneratedOptions(
    {
      ...createGeneratedBaseSectionDefaults(),
      size: {
        width: 300,
        height: 300,
      },
      dataPath: "",
      chartSettings: createLineChartSettings(),
    },
    options,
  )`,
				TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
				TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
				TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
				TypeProperty{Name: "size", TypeExpr: "SectionSize"},
				TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
				TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
				TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
				TypeProperty{Name: "dataPath", TypeExpr: "string"},
				TypeProperty{Name: "chartSettings", TypeExpr: "BaseChartSettingsUnion"},
			),
			reflect.TypeOf(ChartSectionImpl{}): aliasDeclarationWithFactory(
				"ChartSectionImpl",
				`BaseSectionImpl & {
  type: typeof SectionTypeEnum.Chart;
  dataPath: string;
  chartSettings: BaseChartSettingsUnion;
}`,
				`export function createChartSectionImpl(
  defaultsOrOverrides:
    | Partial<UserDefaultChartSectionImpl>
    | Partial<ChartSectionImpl> = {},
  overrides?: Partial<ChartSectionImpl>,
): ChartSectionImpl {
  const resolved = resolveGeneratedFactoryInputs<
    UserDefaultChartSectionImpl,
    ChartSectionImpl
  >(createUserDefaultChartSectionImpl(), defaultsOrOverrides, overrides);
  return mergeGeneratedOptions(
    {
      type: SectionTypeEnum.Chart,
      id: "",
      name: "",
      isFrozen: resolved.defaults.isFrozen,
      isInOtherProjectConfigs: false,
      tagColor: resolved.defaults.tagColor,
      styleColor: resolved.defaults.styleColor,
      size: resolved.defaults.size,
      aspectRatio: resolved.defaults.aspectRatio,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: resolved.defaults.isMinimized,
      positionAndSizeLocked: resolved.defaults.positionAndSizeLocked,
      isPreset: false,
      dataPath: resolved.defaults.dataPath,
      chartSettings: cloneGeneratedValue(resolved.defaults.chartSettings),
    },
    resolved.overrides,
  );
}`,
			),
			reflect.TypeOf(UserDefaultSpreadsheetSectionImpl{}): objectDeclarationWithCreateExpr(
				"UserDefaultSpreadsheetSectionImpl",
				`mergeGeneratedOptions(
    {
      ...createGeneratedBaseSectionDefaults(),
      size: {
        width: 760,
        height: 500,
      },
      filePath: "",
      activeSheet: null,
      readOnly: false,
      showRowNumbers: true,
      density: SpreadsheetGridDensityEnum.compact,
      autoReloadOnExternalChange: false,
    },
    options,
  )`,
				TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
				TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
				TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
				TypeProperty{Name: "size", TypeExpr: "SectionSize"},
				TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
				TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
				TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
				TypeProperty{Name: "filePath", TypeExpr: "string"},
				TypeProperty{Name: "activeSheet", TypeExpr: "string | null"},
				TypeProperty{Name: "readOnly", TypeExpr: "boolean"},
				TypeProperty{Name: "showRowNumbers", TypeExpr: "boolean"},
				TypeProperty{Name: "density", TypeExpr: "SpreadsheetGridDensity"},
				TypeProperty{Name: "autoReloadOnExternalChange", TypeExpr: "boolean"},
			),
			reflect.TypeOf(SpreadsheetSectionImpl{}): aliasDeclarationWithFactory(
				"SpreadsheetSectionImpl",
				`BaseSectionImpl & {
  type: typeof SectionTypeEnum.Spreadsheet;
  filePath: string;
  activeSheet?: string | null;
  readOnly: boolean;
  showRowNumbers: boolean;
  density: SpreadsheetGridDensity;
  autoReloadOnExternalChange: boolean;
}`,
				`export function createSpreadsheetSectionImpl(
  defaultsOrOverrides:
    | Partial<UserDefaultSpreadsheetSectionImpl>
    | Partial<SpreadsheetSectionImpl> = {},
  overrides?: Partial<SpreadsheetSectionImpl>,
): SpreadsheetSectionImpl {
  const resolved = resolveGeneratedFactoryInputs<
    UserDefaultSpreadsheetSectionImpl,
    SpreadsheetSectionImpl
  >(createUserDefaultSpreadsheetSectionImpl(), defaultsOrOverrides, overrides);
  return mergeGeneratedOptions(
    {
      type: SectionTypeEnum.Spreadsheet,
      id: "",
      name: "",
      isFrozen: resolved.defaults.isFrozen,
      isInOtherProjectConfigs: false,
      tagColor: resolved.defaults.tagColor,
      styleColor: resolved.defaults.styleColor,
      size: resolved.defaults.size,
      aspectRatio: resolved.defaults.aspectRatio,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: resolved.defaults.isMinimized,
      positionAndSizeLocked: resolved.defaults.positionAndSizeLocked,
      isPreset: false,
      filePath: resolved.defaults.filePath,
      activeSheet: resolved.defaults.activeSheet,
      readOnly: resolved.defaults.readOnly,
      showRowNumbers: resolved.defaults.showRowNumbers,
      density: resolved.defaults.density,
      autoReloadOnExternalChange: resolved.defaults.autoReloadOnExternalChange,
    },
    resolved.overrides,
  );
}`,
			),
			reflect.TypeOf(PrepareSectionsForCopyRequestInput{}): objectDeclaration(
				"PrepareSectionsForCopyRequestInput",
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionIds", TypeExpr: "Array<string>"},
			),
			reflect.TypeOf(PasteSectionsRequestInput{}): objectDeclaration(
				"PasteSectionsRequestInput",
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "data", TypeExpr: "ClipboardProjectStateCoreWithSectionVariantMap"},
				TypeProperty{Name: "position", TypeExpr: "Position"},
				TypeProperty{Name: "asRef", TypeExpr: "boolean"},
			),
			reflect.TypeOf(CreateChildSectionsRequestInput{}): objectDeclaration(
				"CreateChildSectionsRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "parentId", TypeExpr: "string"},
				TypeProperty{Name: "implType", TypeExpr: "SectionType"},
				TypeProperty{Name: "numChildren", TypeExpr: "number"},
				TypeProperty{Name: "startIdx", TypeExpr: "number | null", Optional: true},
			),
			reflect.TypeOf(CreateChildSectionsViaIncrementerRequestInput{}): objectDeclaration(
				"CreateChildSectionsViaIncrementerRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "calledBy", TypeExpr: "string"},
				TypeProperty{Name: "implType", TypeExpr: "SectionType"},
				TypeProperty{Name: "numChildren", TypeExpr: "number"},
			),
			reflect.TypeOf(DeleteChildSectionsViaDecrementerRequestInput{}): objectDeclaration(
				"DeleteChildSectionsViaDecrementerRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "calledBy", TypeExpr: "string"},
				TypeProperty{Name: "numChildren", TypeExpr: "number"},
			),
			reflect.TypeOf(CreateEdgeRequestInput{}): objectDeclaration(
				"CreateEdgeRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sourceSectionId", TypeExpr: "string"},
				TypeProperty{Name: "sourceVariantId", TypeExpr: "string"},
				TypeProperty{Name: "sourcePortId", TypeExpr: "string"},
				TypeProperty{Name: "targetSectionId", TypeExpr: "string"},
				TypeProperty{Name: "targetVariantId", TypeExpr: "string"},
				TypeProperty{Name: "targetPortId", TypeExpr: "string"},
				TypeProperty{Name: "type", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "label", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "style", TypeExpr: "Record<string, unknown> | null", Optional: true},
				TypeProperty{Name: "animated", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "hidden", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "zIndex", TypeExpr: "number", Optional: true},
				TypeProperty{Name: "data", TypeExpr: "Record<string, unknown> | null", Optional: true},
			),
			reflect.TypeOf(UpdateEdgeRequestInput{}): objectDeclaration(
				"UpdateEdgeRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "edge", TypeExpr: "Edge"},
			),
			reflect.TypeOf(DeleteEdgesRequestInput{}): objectDeclaration(
				"DeleteEdgesRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "edgeIds", TypeExpr: "Array<string>"},
			),
			reflect.TypeOf(ReconnectEdgeRequestInput{}): objectDeclaration(
				"ReconnectEdgeRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "edgeId", TypeExpr: "string"},
				TypeProperty{Name: "sourceSectionId", TypeExpr: "string"},
				TypeProperty{Name: "sourceVariantId", TypeExpr: "string"},
				TypeProperty{Name: "sourcePortId", TypeExpr: "string"},
				TypeProperty{Name: "targetSectionId", TypeExpr: "string"},
				TypeProperty{Name: "targetVariantId", TypeExpr: "string"},
				TypeProperty{Name: "targetPortId", TypeExpr: "string"},
			),
			reflect.TypeOf(SetEdgesRequestInput{}): objectDeclaration(
				"SetEdgesRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "edges", TypeExpr: "Array<Edge>"},
			),
			reflect.TypeOf(CreateAgenticEdgeRequestInput{}): objectDeclaration(
				"CreateAgenticEdgeRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "id", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "sourceSectionId", TypeExpr: "string"},
				TypeProperty{Name: "targetSectionId", TypeExpr: "string"},
				TypeProperty{Name: "kind", TypeExpr: "AgenticEdgeKind"},
				TypeProperty{Name: "contextMode", TypeExpr: "AgenticEdgeContextMode | null", Optional: true},
				TypeProperty{Name: "style", TypeExpr: "Record<string, unknown> | null", Optional: true},
				TypeProperty{Name: "hidden", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "zIndex", TypeExpr: "number", Optional: true},
			),
			reflect.TypeOf(UpdateAgenticEdgeRequestInput{}): objectDeclaration(
				"UpdateAgenticEdgeRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "edge", TypeExpr: "AgenticEdge"},
			),
			reflect.TypeOf(DeleteAgenticEdgesRequestInput{}): objectDeclaration(
				"DeleteAgenticEdgesRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "edgeIds", TypeExpr: "Array<string>"},
			),
			reflect.TypeOf(SetAgenticEdgesRequestInput{}): objectDeclaration(
				"SetAgenticEdgesRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "edges", TypeExpr: "Array<AgenticEdge>"},
			),
			reflect.TypeOf(MoveSectionsRequestInput{}): objectDeclaration(
				"MoveSectionsRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionIds", TypeExpr: "Array<string>"},
				TypeProperty{Name: "newParentId", TypeExpr: "string | null"},
				TypeProperty{Name: "newIndex", TypeExpr: "number | null"},
				TypeProperty{Name: "positionsById", TypeExpr: "Record<string, Position> | null"},
			),
			reflect.TypeOf(SetSectionSizesRequestInput{}): objectDeclaration(
				"SetSectionSizesRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionSizes", TypeExpr: "Record<string, SectionSize>"},
			),
			reflect.TypeOf(SetSectionEdgeOutputsRequestInput{}): objectDeclaration(
				"SetSectionEdgeOutputsRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "edgeOutputPorts", TypeExpr: "Array<EdgePort>"},
			),
			reflect.TypeOf(SetParentDefaultChildSectionTypeRequestInput{}): objectDeclaration(
				"SetParentDefaultChildSectionTypeRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "defaultChildSectionType", TypeExpr: "SectionType"},
			),
			reflect.TypeOf(SetListRootViewModeRequestInput{}): objectDeclaration(
				"SetListRootViewModeRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "viewMode", TypeExpr: "ListRootViewMode"},
			),
			reflect.TypeOf(SetBrowserAreaViewModeRequestInput{}): objectDeclaration(
				"SetBrowserAreaViewModeRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "viewMode", TypeExpr: "BrowserAreaViewMode"},
			),
			reflect.TypeOf(SetBrowserSavedSearchesRequestInput{}): objectDeclaration(
				"SetBrowserSavedSearchesRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "savedSearches", TypeExpr: "Array<BrowserSavedSearch>"},
			),
			reflect.TypeOf(SetSpreadsheetSectionSettingsRequestInput{}): objectDeclaration(
				"SetSpreadsheetSectionSettingsRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "readOnly", TypeExpr: "boolean"},
				TypeProperty{Name: "showRowNumbers", TypeExpr: "boolean"},
				TypeProperty{Name: "density", TypeExpr: "SpreadsheetGridDensity"},
				TypeProperty{Name: "autoReloadOnExternalChange", TypeExpr: "boolean"},
			),
			reflect.TypeOf(SetTaskBoardSectionStateRequestInput{}): objectDeclaration(
				"SetTaskBoardSectionStateRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "viewMode", TypeExpr: "TaskBoardViewMode"},
				TypeProperty{Name: "columns", TypeExpr: "Array<TaskBoardColumn>"},
				TypeProperty{Name: "tasks", TypeExpr: "Array<TaskBoardTask>"},
			),
			reflect.TypeOf(AppendDrawAreaLayerItemRequestInput{}): objectDeclaration(
				"AppendDrawAreaLayerItemRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "layerIdx", TypeExpr: "number"},
				TypeProperty{Name: "element", TypeExpr: "DrawAreaLayerItem"},
			),
			reflect.TypeOf(SetChartTypeRequestInput{}): objectDeclaration(
				"SetChartTypeRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "chartType", TypeExpr: "ChartType"},
			),
			reflect.TypeOf(SetChartSettingsRequestInput{}): objectDeclaration(
				"SetChartSettingsRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "chartSettings", TypeExpr: "BaseChartSettingsUnion"},
				TypeProperty{Name: "changedSettings", TypeExpr: "Array<string>"},
			),
			reflect.TypeOf(SetTextBlockDisplayModeRequestInput{}): objectDeclaration(
				"SetTextBlockDisplayModeRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "textDisplayMode", TypeExpr: "TextBlockDisplayMode"},
			),
			reflect.TypeOf(SetTextBlockFormatRequestInput{}): objectDeclaration(
				"SetTextBlockFormatRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "format", TypeExpr: "TextBlockFormat"},
			),
			reflect.TypeOf(CodeFileBindingUpdate{}): objectDeclaration(
				"CodeFileBindingUpdate",
				TypeProperty{Name: "canonical_path", TypeExpr: "string"},
				TypeProperty{Name: "access_mode", TypeExpr: "CodeFileAccessMode"},
			),
			reflect.TypeOf(SetCodeFileBindingRequestInput{}): objectDeclaration(
				"SetCodeFileBindingRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "binding", TypeExpr: "CodeFileBindingUpdate"},
			),
			reflect.TypeOf(GetLLMChatResponse{}): objectDeclaration(
				"GetLLMChatResponse",
				TypeProperty{Name: "messages", TypeExpr: "Array<BaseChatMessageUnion>"},
				TypeProperty{Name: "waitingForResponse", TypeExpr: "boolean"},
				TypeProperty{Name: "llmConfig", TypeExpr: "LLMConfig | null", Optional: true},
				TypeProperty{Name: "contextUsage", TypeExpr: "ChatContextUsage | null", Optional: true},
			),
			reflect.TypeOf(ExternalAgentChatResponse{}): objectDeclaration(
				"ExternalAgentChatResponse",
				TypeProperty{Name: "messages", TypeExpr: "Array<BaseChatMessageUnion>"},
				TypeProperty{Name: "waitingForResponse", TypeExpr: "boolean"},
				TypeProperty{Name: "toolCallArguments", TypeExpr: "Record<string, string>"},
				TypeProperty{Name: "contextUsage", TypeExpr: "ChatContextUsage | null", Optional: true},
			),
			reflect.TypeOf(PluginListEntry{}): objectDeclaration(
				"PluginListEntry",
				TypeProperty{Name: "pluginId", TypeExpr: "string"},
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "version", TypeExpr: "string"},
				TypeProperty{Name: "sourceScope", TypeExpr: "PluginScope"},
				TypeProperty{Name: "sourceScopeLabel", TypeExpr: "string"},
				TypeProperty{Name: "sourceManager", TypeExpr: "PluginSourceManager"},
				TypeProperty{Name: "sourceManagerHint", TypeExpr: "string | null"},
				TypeProperty{Name: "canonicalSourceKey", TypeExpr: "string"},
				TypeProperty{Name: "sourceDigestSha256", TypeExpr: "string | null"},
				TypeProperty{Name: "frontend", TypeExpr: "PluginFrontendDescriptor"},
				TypeProperty{Name: "content", TypeExpr: "PluginContentDescriptor"},
				TypeProperty{Name: "config", TypeExpr: "PluginConfigDescriptor"},
				TypeProperty{Name: "effectiveCapabilities", TypeExpr: "Array<string>"},
				TypeProperty{Name: "enablementSource", TypeExpr: "PluginEnablementSource | null"},
				TypeProperty{Name: "restartRequired", TypeExpr: "boolean"},
			),
			reflect.TypeOf(PluginStatusEntry{}): objectDeclaration(
				"PluginStatusEntry",
				TypeProperty{Name: "pluginId", TypeExpr: "string"},
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "version", TypeExpr: "string"},
				TypeProperty{Name: "state", TypeExpr: "PluginRuntimeState"},
				TypeProperty{Name: "sourceScope", TypeExpr: "PluginScope"},
				TypeProperty{Name: "sourceScopeLabel", TypeExpr: "string"},
				TypeProperty{Name: "sourceManager", TypeExpr: "PluginSourceManager"},
				TypeProperty{Name: "sourceManagerHint", TypeExpr: "string | null"},
				TypeProperty{Name: "sourcePath", TypeExpr: "string"},
				TypeProperty{Name: "canonicalSourceKey", TypeExpr: "string"},
				TypeProperty{Name: "sourceDigestSha256", TypeExpr: "string | null"},
				TypeProperty{Name: "shadowedBySourcePath", TypeExpr: "string | null"},
				TypeProperty{Name: "requestedCapabilities", TypeExpr: "Array<string>"},
				TypeProperty{Name: "effectiveCapabilities", TypeExpr: "Array<string>"},
				TypeProperty{Name: "blockedCapabilities", TypeExpr: "Array<PluginBlockedCapability>"},
				TypeProperty{Name: "registeredLanguageServers", TypeExpr: "Array<PluginRegisteredLanguageServer>"},
				TypeProperty{Name: "registeredExternalAgentAdapters", TypeExpr: "Array<PluginRegisteredExternalAgentAdapter>"},
				TypeProperty{Name: "registeredCodegenTargets", TypeExpr: "Array<PluginRegisteredCodegenTarget>"},
				TypeProperty{Name: "enablementSource", TypeExpr: "PluginEnablementSource | null"},
				TypeProperty{Name: "restartRequired", TypeExpr: "boolean"},
				TypeProperty{Name: "runtimePayloadDigestSha256", TypeExpr: "string"},
				TypeProperty{Name: "errors", TypeExpr: "Array<PluginErrorInfo>"},
			),
			reflect.TypeOf(BinaryUploadRequestInput{}): {
				Name:  "BinaryUploadRequestInput",
				Kind:  "alias",
				Alias: "FormData",
			},
			reflect.TypeOf(BinaryDownloadResponse{}): {
				Name:  "BinaryDownloadResponse",
				Kind:  "alias",
				Alias: "Uint8Array",
			},
			reflect.TypeOf(CanvasPoint{}): aliasDeclaration(
				"CanvasPoint",
				"[number, number]",
			),
			reflect.TypeOf(DrawAreaTransform{}): aliasDeclaration(
				"DrawAreaTransform",
				"[number, number, number, number, number, number]",
			),
			reflect.TypeOf(BrushStroke{}): objectDeclarationWithCreateExpr(
				"BrushStroke",
				`mergeGeneratedOptions(
    {
      strokeStyle: "",
      lineWidth: 1,
      lineCap: DrawAreaBrushShapeEnum.round,
      points: [],
      globalCompositeOperation: "source-over",
    },
    options,
  )`,
				TypeProperty{Name: "strokeStyle", TypeExpr: "string"},
				TypeProperty{Name: "lineWidth", TypeExpr: "number"},
				TypeProperty{Name: "lineCap", TypeExpr: "DrawAreaBrushShape"},
				TypeProperty{Name: "points", TypeExpr: `Array<CanvasPoint | "BREAK">`},
				TypeProperty{Name: "globalCompositeOperation", TypeExpr: "string"},
			),
			reflect.TypeOf(BrushStrokeWithTransform{}): objectDeclaration(
				"BrushStrokeWithTransform",
				TypeProperty{Name: "strokeStyle", TypeExpr: "string"},
				TypeProperty{Name: "lineWidth", TypeExpr: "number"},
				TypeProperty{Name: "lineCap", TypeExpr: "DrawAreaBrushShape"},
				TypeProperty{Name: "points", TypeExpr: `Array<CanvasPoint | "BREAK">`},
				TypeProperty{Name: "globalCompositeOperation", TypeExpr: "string"},
				TypeProperty{Name: "transform", TypeExpr: "DrawAreaTransform"},
			),
			reflect.TypeOf(DrawAreaLayerItemTransform{}): objectDeclarationWithCreateExpr(
				"DrawAreaLayerItemTransform",
				`mergeGeneratedOptions(
    {
      transform: [1, 0, 0, 1, 0, 0],
      eraserStrokes: [],
    },
    options,
  )`,
				TypeProperty{Name: "transform", TypeExpr: "DrawAreaTransform"},
				TypeProperty{Name: "eraserStrokes", TypeExpr: "Array<BrushStrokeWithTransform>"},
			),
			reflect.TypeOf(DrawAreaLayerItem{}): objectDeclarationWithCreateExpr(
				"DrawAreaLayerItem",
				`mergeGeneratedOptions(
    {
      type: ArtifactTypeEnum.BrushStroke,
      dataPath: "",
      transformId: "",
    },
    options,
  )`,
				TypeProperty{Name: "type", TypeExpr: "typeof ArtifactTypeEnum.Image | typeof ArtifactTypeEnum.BrushStroke"},
				TypeProperty{Name: "dataPath", TypeExpr: "string"},
				TypeProperty{Name: "transformId", TypeExpr: "string"},
			),
			reflect.TypeOf(DrawAreaLayer{}): objectDeclarationWithCreateExpr(
				"DrawAreaLayer",
				`mergeGeneratedOptions(
    {
      name: createRandomName(),
      elements: [],
      visible: true,
      layerOpacity: 1,
    },
    options,
  )`,
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "elements", TypeExpr: "Array<DrawAreaLayerItem>"},
				TypeProperty{Name: "visible", TypeExpr: "boolean"},
				TypeProperty{Name: "layerOpacity", TypeExpr: "number"},
			),
			reflect.TypeOf(ImageArtifact{}): objectDeclarationWithCreateExpr(
				"ImageArtifact",
				`mergeGeneratedOptions(
    {
      type: ArtifactTypeEnum.Image,
      id: createPngArtifactId(),
      value: createBinaryContentRef(),
    },
    options,
  )`,
				TypeProperty{Name: "type", TypeExpr: "typeof ArtifactTypeEnum.Image"},
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "value", TypeExpr: "BinaryContentRef"},
			),
			reflect.TypeOf(BrushStrokeArtifact{}): objectDeclarationWithCreateExpr(
				"BrushStrokeArtifact",
				`mergeGeneratedOptions(
    {
      type: ArtifactTypeEnum.BrushStroke,
      id: createJsonArtifactId(),
      value: createBrushStroke(),
    },
    options,
  )`,
				TypeProperty{Name: "type", TypeExpr: "typeof ArtifactTypeEnum.BrushStroke"},
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "value", TypeExpr: "BrushStroke"},
			),
			reflect.TypeOf(DrawAreaLayerItemTransformArtifact{}): objectDeclarationWithCreateExpr(
				"DrawAreaLayerItemTransformArtifact",
				`mergeGeneratedOptions(
    {
      type: ArtifactTypeEnum.DrawAreaLayerItemTransform,
      id: createJsonArtifactId(),
      value: createDrawAreaLayerItemTransform(),
    },
    options,
  )`,
				TypeProperty{Name: "type", TypeExpr: "typeof ArtifactTypeEnum.DrawAreaLayerItemTransform"},
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "value", TypeExpr: "DrawAreaLayerItemTransform"},
			),
			reflect.TypeOf(ChartDataValue{}): aliasDeclaration(
				"ChartDataValue",
				"Record<string, Array<string | number>>",
			),
			reflect.TypeOf(ChartData{}): aliasDeclaration(
				"ChartData",
				"ChartDataValue",
			),
			reflect.TypeOf(ChartDataType{}): aliasDeclaration(
				"ChartDataType",
				"ChartDataValue",
			),
			reflect.TypeOf(ChartDataArtifact{}): objectDeclarationWithCreateExpr(
				"ChartDataArtifact",
				`mergeGeneratedOptions(
    {
      type: ArtifactTypeEnum.ChartData,
      id: createCsvArtifactId(),
      value: {},
    },
    options,
  )`,
				TypeProperty{Name: "type", TypeExpr: "typeof ArtifactTypeEnum.ChartData"},
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "value", TypeExpr: "ChartDataValue"},
			),
			reflect.TypeOf(FileArtifact{}): objectDeclarationWithCreateExpr(
				"FileArtifact",
				`mergeGeneratedOptions(
    {
      type: ArtifactTypeEnum.File,
      id: createFileArtifactId(),
      value: createBinaryContentRef(),
    },
    options,
  )`,
				TypeProperty{Name: "type", TypeExpr: "typeof ArtifactTypeEnum.File"},
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "value", TypeExpr: "BinaryContentRef"},
			),
			reflect.TypeOf(ArtifactUnion{}): aliasDeclaration(
				"ArtifactUnion",
				"ImageArtifact | BrushStrokeArtifact | DrawAreaLayerItemTransformArtifact | ChartDataArtifact | FileArtifact",
			),
			reflect.TypeOf(UpdateArtifactMsgContent{}): objectDeclaration(
				"UpdateArtifactMsgContent",
				TypeProperty{Name: "artifacts", TypeExpr: "Array<ArtifactUnion>"},
				TypeProperty{Name: "updateType", TypeExpr: `"update" | "delete"`},
			),
			reflect.TypeOf(WebsocketConnectionInfo{}): objectDeclarationWithCreateExpr(
				"WebsocketConnectionInfo",
				`{
    id: "",
    connectionType: WebsocketConnectionTypeEnum.SERVER,
    currentAddress: null,
    shareSessionId: null,
    ...options,
  }`,
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "connectionType", TypeExpr: "WebsocketConnectionType"},
				TypeProperty{Name: "currentAddress", TypeExpr: "string | null"},
				TypeProperty{Name: "shareSessionId", TypeExpr: "string | null"},
			),
			reflect.TypeOf(WebsocketMsgCurrentAddressUpdate{}): objectDeclarationWithCreateExpr(
				"WebsocketMsgCurrentAddressUpdate",
				`{
    id: null,
    messageType: WebsocketMsgTypeForBackendEnum.CurrentAddressUpdate,
    content: "",
    ...options,
  }`,
				TypeProperty{Name: "id", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "messageType", TypeExpr: "typeof WebsocketMsgTypeForBackendEnum.CurrentAddressUpdate"},
				TypeProperty{Name: "content", TypeExpr: "string"},
			),
			reflect.TypeOf(UISettingRevealActivationStep{}): objectDeclaration(
				"UISettingRevealActivationStep",
				TypeProperty{Name: "type", TypeExpr: "string"},
				TypeProperty{Name: "itemValue", TypeExpr: "string"},
			),
			reflect.TypeOf(UISettingRevealTarget{}): objectDeclaration(
				"UISettingRevealTarget",
				TypeProperty{Name: "settingId", TypeExpr: "string"},
				TypeProperty{Name: "side", TypeExpr: "string"},
				TypeProperty{Name: "overviewTabKey", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "uiEditorTabName", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "pluginId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "paneId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "strategy", TypeExpr: "string"},
				TypeProperty{Name: "anchorId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "pluginRevealKey", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "revealActivationSteps", TypeExpr: "Array<UISettingRevealActivationStep>"},
			),
			reflect.TypeOf(UISettingRevealContent{}): objectDeclaration(
				"UISettingRevealContent",
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "chatId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "activeSectionId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "reveals", TypeExpr: "Array<UISettingRevealTarget>"},
				TypeProperty{Name: "durationMs", TypeExpr: "number"},
				TypeProperty{Name: "requestId", TypeExpr: "string"},
			),
			reflect.TypeOf(UISettingRevealResultStatus{}): objectDeclaration(
				"UISettingRevealResultStatus",
				TypeProperty{Name: "settingId", TypeExpr: "string"},
				TypeProperty{Name: "status", TypeExpr: `"revealed" | "failed"`},
				TypeProperty{Name: "errorCode", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "errorMessage", TypeExpr: "string | null", Optional: true},
			),
			reflect.TypeOf(UISettingRevealResultContent{}): objectDeclaration(
				"UISettingRevealResultContent",
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "requestId", TypeExpr: "string"},
				TypeProperty{Name: "statuses", TypeExpr: "Array<UISettingRevealResultStatus>"},
			),
			reflect.TypeOf(WebsocketMsgRealtimeUIChangeContent{}): objectDeclaration(
				"WebsocketMsgRealtimeUIChangeContent",
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "dependencyKey", TypeExpr: "BaseDependencyKeyUnion"},
				TypeProperty{Name: "value", TypeExpr: "BaseDependencyValueUnion"},
			),
			reflect.TypeOf(WebsocketMsgRealtimeUIChange{}): objectDeclaration(
				"WebsocketMsgRealtimeUIChange",
				TypeProperty{Name: "id", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "messageType", TypeExpr: "typeof WebsocketMsgTypeForBackendEnum.RealtimeUIChange"},
				TypeProperty{Name: "content", TypeExpr: "WebsocketMsgRealtimeUIChangeContent"},
			),
			reflect.TypeOf(WebsocketMsgRealtimeDependencyEventContent{}): objectDeclaration(
				"WebsocketMsgRealtimeDependencyEventContent",
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "dependencyEvent", TypeExpr: "DependencyEvent"},
			),
			reflect.TypeOf(WebsocketMsgRealtimeDependencyEvent{}): objectDeclaration(
				"WebsocketMsgRealtimeDependencyEvent",
				TypeProperty{Name: "id", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "messageType", TypeExpr: "typeof WebsocketMsgTypeForBackendEnum.RealtimeDependencyEvent"},
				TypeProperty{Name: "content", TypeExpr: "WebsocketMsgRealtimeDependencyEventContent"},
			),
			reflect.TypeOf(WebsocketMsgUISettingRevealResult{}): objectDeclaration(
				"WebsocketMsgUISettingRevealResult",
				TypeProperty{Name: "id", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "messageType", TypeExpr: "typeof WebsocketMsgTypeForBackendEnum.UISettingRevealResult"},
				TypeProperty{Name: "content", TypeExpr: "UISettingRevealResultContent"},
			),
			reflect.TypeOf(WebsocketMsg{}): aliasDeclaration(
				"WebsocketMsg",
				"WebsocketMsgCurrentAddressUpdate | WebsocketMsgRealtimeUIChange | WebsocketMsgRealtimeDependencyEvent | WebsocketMsgUISettingRevealResult",
			),
			reflect.TypeOf(FrontendWebsocketMsgUnion{}): objectDeclaration(
				"FrontendWebsocketMsgUnion",
				TypeProperty{Name: "id", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "messageType", TypeExpr: "WebsocketMsgTypeForFrontend"},
				TypeProperty{Name: "content", TypeExpr: "any"},
			),
			reflect.TypeOf(WebsocketFrontendSupport{}): {
				Name: "WebsocketFrontendSupport",
				Kind: "raw",
				Raw:  websocketFrontendSupportRawTS,
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
