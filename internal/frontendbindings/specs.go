package frontendbindings

import "reflect"

func CurrentAdditionalDeclarations(converter *typeConverter) []TypeDeclaration {
	declarations := []TypeDeclaration{
		aliasDeclaration(
			"JSONValue",
			"gt.RawMessage",
		),
	}
	declarations = append(declarations, discoveredValueDeclarations(converter)...)
	return declarations
}

func CurrentAdditionalTypeRoots() []reflect.Type {
	return DiscoveredConvertibleTypes()
}
