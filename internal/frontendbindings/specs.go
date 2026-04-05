package frontendbindings

import "reflect"

func CurrentAdditionalDeclarations(converter *typeConverter) ([]TypeDeclaration, error) {
	declarations := []TypeDeclaration{
		aliasDeclaration(
			"JSONValue",
			"gt.RawMessage",
		),
	}
	familyDeclarations, err := semanticDiscriminatedFamilyDeclarations()
	if err != nil {
		return nil, err
	}
	declarations = append(declarations, familyDeclarations...)
	declarations = append(declarations, discoveredValueDeclarations(converter)...)
	return declarations, nil
}

func CurrentAdditionalTypeRoots() []reflect.Type {
	return DiscoveredConvertibleTypes()
}
