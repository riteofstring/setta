package frontendbindings

import (
	"setta/internal/deployments"
)

type generatedTypeSetSpec struct {
	Name     string
	TypeExpr string
	Members  []string
	Exported bool
}

type generatedTypeGuardSpec struct {
	Name           string
	InputTypeExpr  string
	ReturnTypeExpr string
	TypeSetName    string
}

var projectStateTypeGuardTypeSets = []generatedTypeSetSpec{
	{
		Name:     "BaseChildlessCodeObjImplTypeSet",
		TypeExpr: "CodeObjType",
		Members: []string{
			"CodeObjTypeEnum.CodeParam",
			"CodeObjTypeEnum.ColorPickerParam",
			"CodeObjTypeEnum.DateParam",
			"CodeObjTypeEnum.DropdownParam",
			"CodeObjTypeEnum.DropzoneParam",
			"CodeObjTypeEnum.PasswordParam",
			"CodeObjTypeEnum.RotaryParam",
			"CodeObjTypeEnum.SliderParam",
			"CodeObjTypeEnum.SwitchParam",
			"CodeObjTypeEnum.TextAreaParam",
			"CodeObjTypeEnum.TextParam",
			"CodeObjTypeEnum.TimeParam",
		},
		Exported: true,
	},
	{
		Name:     "BaseParamCodeObjImplTypeSet",
		TypeExpr: "CodeObjType",
		Members: []string{
			"CodeObjTypeEnum.ButtonParam",
			"CodeObjTypeEnum.CodeParam",
			"CodeObjTypeEnum.ColorPickerParam",
			"CodeObjTypeEnum.DateParam",
			"CodeObjTypeEnum.DropdownParam",
			"CodeObjTypeEnum.DropzoneParam",
			"CodeObjTypeEnum.NestedParam",
			"CodeObjTypeEnum.PasswordParam",
			"CodeObjTypeEnum.RotaryParam",
			"CodeObjTypeEnum.SliderParam",
			"CodeObjTypeEnum.SwitchParam",
			"CodeObjTypeEnum.TextAreaParam",
			"CodeObjTypeEnum.TextParam",
			"CodeObjTypeEnum.TimeParam",
		},
		Exported: true,
	},
	{
		Name:     "BaseParentCodeObjImplTypeSet",
		TypeExpr: "CodeObjType",
		Members: []string{
			"CodeObjTypeEnum.CodeCallable",
			"CodeObjTypeEnum.NestedParam",
		},
	},
	{
		Name:     "ControlCodeObjTypeSet",
		TypeExpr: "CodeObjType",
		Members: []string{
			"CodeObjTypeEnum.CodeParam",
			"CodeObjTypeEnum.TextParam",
			"CodeObjTypeEnum.DateParam",
			"CodeObjTypeEnum.TimeParam",
			"CodeObjTypeEnum.TextAreaParam",
			"CodeObjTypeEnum.ButtonParam",
			"CodeObjTypeEnum.SliderParam",
			"CodeObjTypeEnum.RotaryParam",
			"CodeObjTypeEnum.SwitchParam",
			"CodeObjTypeEnum.ColorPickerParam",
			"CodeObjTypeEnum.DropdownParam",
			"CodeObjTypeEnum.PasswordParam",
			"CodeObjTypeEnum.DropzoneParam",
		},
		Exported: true,
	},
	{
		Name:     "SectionParamCodeObjTypeSet",
		TypeExpr: "CodeObjType",
		Members: []string{
			"CodeObjTypeEnum.CodeParam",
			"CodeObjTypeEnum.TextParam",
			"CodeObjTypeEnum.DateParam",
			"CodeObjTypeEnum.TimeParam",
			"CodeObjTypeEnum.TextAreaParam",
			"CodeObjTypeEnum.SliderParam",
			"CodeObjTypeEnum.RotaryParam",
			"CodeObjTypeEnum.SwitchParam",
			"CodeObjTypeEnum.ColorPickerParam",
			"CodeObjTypeEnum.DropdownParam",
			"CodeObjTypeEnum.PasswordParam",
			"CodeObjTypeEnum.DropzoneParam",
			"CodeObjTypeEnum.NestedParam",
		},
		Exported: true,
	},
	{
		Name:     "BaseParentSectionImplTypeSet",
		TypeExpr: "SectionType",
		Members: []string{
			"SectionTypeEnum.Code",
			"SectionTypeEnum.GenPythonCode",
			"SectionTypeEnum.GenPythonMetadata",
			"SectionTypeEnum.Group",
			"SectionTypeEnum.ListRoot",
		},
	},
	{
		Name:     "BaseDictSectionImplTypeSet",
		TypeExpr: "SectionType",
		Members: []string{
			"SectionTypeEnum.Dict",
			"SectionTypeEnum.GlobalVariables",
		},
	},
	{
		Name:     "BaseSectionWithParamsImplTypeSet",
		TypeExpr: "SectionType",
		Members: []string{
			"SectionTypeEnum.Callable",
			"SectionTypeEnum.Dict",
			"SectionTypeEnum.GlobalVariables",
		},
	},
}

var projectStateTypeGuards = []generatedTypeGuardSpec{
	{
		Name:           "isBaseChildlessCodeObjImpl",
		InputTypeExpr:  "BaseCodeObjImplUnion",
		ReturnTypeExpr: "BaseChildlessCodeObjImplUnion",
		TypeSetName:    "BaseChildlessCodeObjImplTypeSet",
	},
	{
		Name:           "isBaseParamCodeObjImpl",
		InputTypeExpr:  "BaseCodeObjImplUnion",
		ReturnTypeExpr: "BaseParamCodeObjImplUnion",
		TypeSetName:    "BaseParamCodeObjImplTypeSet",
	},
	{
		Name:           "isBaseParentCodeObjImpl",
		InputTypeExpr:  "BaseCodeObjImplUnion",
		ReturnTypeExpr: "BaseParentCodeObjImplUnion",
		TypeSetName:    "BaseParentCodeObjImplTypeSet",
	},
	{
		Name:           "isBaseParentSectionImpl",
		InputTypeExpr:  "BaseSectionImplUnion",
		ReturnTypeExpr: "BaseParentSectionImplUnion",
		TypeSetName:    "BaseParentSectionImplTypeSet",
	},
	{
		Name:           "isBaseDictSectionImpl",
		InputTypeExpr:  "BaseSectionImplUnion",
		ReturnTypeExpr: "BaseDictSectionImplUnion",
		TypeSetName:    "BaseDictSectionImplTypeSet",
	},
	{
		Name:           "isBaseSectionWithParamsImpl",
		InputTypeExpr:  "BaseSectionImplUnion",
		ReturnTypeExpr: "BaseSectionWithParamsImplUnion",
		TypeSetName:    "BaseSectionWithParamsImplTypeSet",
	},
}

func projectStateTypeGuardDeclarations() []TypeDeclaration {
	declarations := make([]TypeDeclaration, 0, len(projectStateTypeGuardTypeSets)+len(projectStateTypeGuards))
	for _, spec := range projectStateTypeGuardTypeSets {
		declarations = append(
			declarations,
			setDeclaration(spec.Name, spec.TypeExpr, spec.Exported, spec.Members...),
		)
	}
	for _, spec := range projectStateTypeGuards {
		declarations = append(
			declarations,
			typeGuardDeclaration(spec.Name, spec.InputTypeExpr, spec.ReturnTypeExpr, spec.TypeSetName),
		)
	}
	return declarations
}

func buildDefaultSharePolicyCreateExprTS() string {
	return buildSharePolicyCreateExprTS(deployments.DefaultPolicy())
}

func buildSharePolicyCreateExprTS(policy deployments.Policy) string {
	return buildTSMergeGeneratedOptionsExprFromGoValueTS(
		"frontend share policy defaults",
		policy,
		goJSONFieldOrder(policy),
		"options",
		"SharePolicy",
	)
}

func defaultAppPolicyDeclaration() TypeDeclaration {
	return exportedFunctionDeclaration(
		"createDefaultAppPolicy",
		"SharePolicy",
		buildDefaultAppPolicyFunctionBodyTS(),
		TypeProperty{Name: "options", TypeExpr: "Partial<SharePolicy>", DefaultValue: "{}"},
	)
}

func buildDefaultAppPolicyFunctionBodyTS() string {
	return buildTSMergeGeneratedOptionsCreateBodyFromGoValueTS(
		"frontend default app policy",
		deployments.DefaultAppPolicy(),
		goJSONFieldOrder(deployments.Policy{}),
		"options",
		"SharePolicy",
	)
}

func projectStateSupportDeclarations() []TypeDeclaration {
	declarations := []TypeDeclaration{
		aliasDeclaration(
			"ImplArgsBundleMap",
			`{
  BaseSection: {
    impl: BaseSectionImplUnion;
    args: {
      [K in keyof BaseSectionImplUnion]?: BaseSectionImplUnion[K] | ((prev: BaseSectionImplUnion[K]) => BaseSectionImplUnion[K]);
    };
  };
  BaseSectionWithParams: {
    impl: BaseSectionWithParamsImplUnion;
    args: {
      [K in keyof BaseSectionWithParamsImplUnion]?: BaseSectionWithParamsImplUnion[K] | ((prev: BaseSectionWithParamsImplUnion[K]) => BaseSectionWithParamsImplUnion[K]);
    };
  };
  BaseParentSection: {
    impl: BaseParentSectionImplUnion;
    args: {
      [K in keyof BaseParentSectionImplUnion]?: BaseParentSectionImplUnion[K] | ((prev: BaseParentSectionImplUnion[K]) => BaseParentSectionImplUnion[K]);
    };
  };
  BaseCodeSection: {
    impl: BaseParentSectionImplUnion;
    args: {
      [K in keyof BaseParentSectionImplUnion]?: BaseParentSectionImplUnion[K] | ((prev: BaseParentSectionImplUnion[K]) => BaseParentSectionImplUnion[K]);
    };
  };
  ChatSection: {
    impl: BaseSectionImplUnion;
    args: {
      [K in keyof BaseSectionImplUnion]?: BaseSectionImplUnion[K] | ((prev: BaseSectionImplUnion[K]) => BaseSectionImplUnion[K]);
    };
  };
  CodeSection: {
    impl: BaseParentSectionImplUnion;
    args: {
      [K in keyof BaseParentSectionImplUnion]?: BaseParentSectionImplUnion[K] | ((prev: BaseParentSectionImplUnion[K]) => BaseParentSectionImplUnion[K]);
    };
  };
  GroupSection: {
    impl: GroupSectionImpl;
    args: {
      [K in keyof GroupSectionImpl]?: GroupSectionImpl[K] | ((prev: GroupSectionImpl[K]) => GroupSectionImpl[K]);
    };
  };
  ListRootSection: {
    impl: BaseParentSectionImplUnion;
    args: {
      [K in keyof BaseParentSectionImplUnion]?: BaseParentSectionImplUnion[K] | ((prev: BaseParentSectionImplUnion[K]) => BaseParentSectionImplUnion[K]);
    };
  };
  BrowserSection: {
    impl: BrowserSectionImpl;
    args: {
      [K in keyof BrowserSectionImpl]?: BrowserSectionImpl[K] | ((prev: BrowserSectionImpl[K]) => BrowserSectionImpl[K]);
    };
  };
  TextBlockSection: {
    impl: BaseSectionImplUnion;
    args: {
      [K in keyof BaseSectionImplUnion]?: BaseSectionImplUnion[K] | ((prev: BaseSectionImplUnion[K]) => BaseSectionImplUnion[K]);
    };
  };
  PromptSection: {
    impl: PromptSectionImpl;
    args: {
      [K in keyof PromptSectionImpl]?: PromptSectionImpl[K] | ((prev: PromptSectionImpl[K]) => PromptSectionImpl[K]);
    };
  };
  BaseDictSection: {
    impl: BaseDictSectionImplUnion;
    args: {
      [K in keyof BaseDictSectionImplUnion]?: BaseDictSectionImplUnion[K] | ((prev: BaseDictSectionImplUnion[K]) => BaseDictSectionImplUnion[K]);
    };
  };
  BaseChildlessCodeObj: {
    impl: BaseChildlessCodeObjImplUnion;
    args: {
      [K in keyof BaseChildlessCodeObjImplUnion]?: BaseChildlessCodeObjImplUnion[K] | ((prev: BaseChildlessCodeObjImplUnion[K]) => BaseChildlessCodeObjImplUnion[K]);
    };
  };
  BaseCodeObj: {
    impl: BaseCodeObjImplUnion;
    args: {
      [K in keyof BaseCodeObjImplUnion]?: BaseCodeObjImplUnion[K] | ((prev: BaseCodeObjImplUnion[K]) => BaseCodeObjImplUnion[K]);
    };
  };
}`,
		),
		defaultAppPolicyDeclaration(),
	}
	declarations = append(declarations, projectStateTypeGuardDeclarations()...)
	return declarations
}
