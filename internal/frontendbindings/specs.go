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
	declarations = append(declarations, familyDeclarations...)
	valueDeclarations, err := semanticExportedValueDeclarations()
	if err != nil {
		return nil, err
	}
	declarations = append(declarations, valueDeclarations...)
	return declarations, nil
}
