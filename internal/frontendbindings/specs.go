package frontendbindings

func CurrentAdditionalDeclarations() ([]TypeDeclaration, error) {
	declarations := []TypeDeclaration{
		aliasDeclaration(
			"JSONValue",
			"gt.RawMessage",
		),
	}
	enumDeclarations, err := semanticEnumDeclarations()
	if err != nil {
		return nil, err
	}
	declarations = append(declarations, enumDeclarations...)
	familyDeclarations, err := semanticDiscriminatedFamilyDeclarations()
	if err != nil {
		return nil, err
	}
	exportAdditionalDeclaration(familyDeclarations, "BaseParamCodeObjImplTypeSet")
	declarations = append(declarations, familyDeclarations...)
	declarations = append(declarations, runtimeCompatAdditionalDeclarations()...)
	valueDeclarations, err := semanticExportedValueDeclarations()
	if err != nil {
		return nil, err
	}
	declarations = append(declarations, valueDeclarations...)
	return declarations, nil
}

func exportAdditionalDeclaration(declarations []TypeDeclaration, name string) {
	for index := range declarations {
		if declarations[index].Name != name {
			continue
		}
		declarations[index].Exported = true
		return
	}
}

func runtimeCompatAdditionalDeclarations() []TypeDeclaration {
	return []TypeDeclaration{
		aliasDeclaration(
			"BaseDictSectionImplUnion",
			"gt.DictSectionImpl | gt.GlobalVariablesSectionImpl",
		),
		setDeclaration(
			"BaseDictSectionImplTypeSet",
			"SectionType",
			"SectionTypeEnum.Dict",
			"SectionTypeEnum.GlobalVariables",
		),
		typeGuardDeclaration(
			"isBaseDictSectionImpl",
			"BaseSectionImplUnion",
			"BaseDictSectionImplUnion",
			"BaseDictSectionImplTypeSet",
		),
		exportedSetDeclaration(
			"ControlCodeObjTypeSet",
			"CodeObjType",
			"CodeObjTypeEnum.CodeParam",
			"CodeObjTypeEnum.TextParam",
			"CodeObjTypeEnum.DateParam",
			"CodeObjTypeEnum.TimeParam",
			"CodeObjTypeEnum.ButtonParam",
			"CodeObjTypeEnum.SliderParam",
			"CodeObjTypeEnum.RotaryParam",
			"CodeObjTypeEnum.SwitchParam",
			"CodeObjTypeEnum.ColorPickerParam",
			"CodeObjTypeEnum.DropdownParam",
			"CodeObjTypeEnum.PasswordParam",
			"CodeObjTypeEnum.TextAreaParam",
			"CodeObjTypeEnum.DropzoneParam",
		),
		exportedSetDeclaration(
			"SectionParamCodeObjTypeSet",
			"CodeObjType",
			"CodeObjTypeEnum.CodeParam",
			"CodeObjTypeEnum.TextParam",
			"CodeObjTypeEnum.DateParam",
			"CodeObjTypeEnum.TimeParam",
			"CodeObjTypeEnum.SliderParam",
			"CodeObjTypeEnum.RotaryParam",
			"CodeObjTypeEnum.SwitchParam",
			"CodeObjTypeEnum.ColorPickerParam",
			"CodeObjTypeEnum.DropdownParam",
			"CodeObjTypeEnum.PasswordParam",
			"CodeObjTypeEnum.TextAreaParam",
			"CodeObjTypeEnum.DropzoneParam",
			"CodeObjTypeEnum.NestedParam",
		),
	}
}

func exportedSetDeclaration(
	name string,
	elementType string,
	members ...string,
) TypeDeclaration {
	declaration := setDeclaration(name, elementType, members...)
	declaration.Exported = true
	return declaration
}
