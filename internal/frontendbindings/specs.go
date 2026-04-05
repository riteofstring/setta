package frontendbindings

import "reflect"

func CurrentAdditionalDeclarations(converter *typeConverter) []TypeDeclaration {
	declarations := []TypeDeclaration{
		aliasDeclaration(
			"JSONValue",
			"null | boolean | number | string | Array<JSONValue> | { [key: string]: JSONValue | undefined }",
		),
	}
	declarations = append(declarations, discoveredValueDeclarations(converter)...)
	return declarations
}

func CurrentAdditionalTypeRoots() []reflect.Type {
	return DiscoveredConvertibleTypes()
}
