package frontendbindings

import "reflect"

func CurrentAdditionalDeclarations(converter *typeConverter) ([]TypeDeclaration, error) {
	declarations := []TypeDeclaration{
		aliasDeclaration(
			"JSONValue",
			"gt.RawMessage",
		),
	}
	if err := ensureSemanticExportTypeDeclarations(converter); err != nil {
		return nil, err
	}
	enumDeclarations, err := semanticEnumDeclarations(converter)
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

func CurrentAdditionalTypeRoots() []reflect.Type {
	return DiscoveredConvertibleTypes()
}
