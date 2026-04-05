package frontendbindings

import "reflect"

// setta-go-type-discovery: skip
type NamedRoute struct {
	Name     string
	Path     string
	EnumName string
}

// setta-go-type-discovery: skip
type RouteGroup struct {
	ConstName            string
	HelperConstName      string
	HelperOnlyPathParams bool
	Routes               []NamedRoute
}

func CurrentRouteGroups() []RouteGroup {
	return discoveredCurrentRouteGroups()
}

func CurrentAdditionalDeclarations(converter *typeConverter) []TypeDeclaration {
	declarations := []TypeDeclaration{
		aliasDeclaration(
			"JSONValue",
			"null | boolean | number | string | Array<JSONValue> | { [key: string]: JSONValue | undefined }",
		),
	}
	declarations = append(declarations, additionalFactoryDeclarations()...)
	declarations = append(declarations, discoveredValueDeclarations(converter)...)
	return declarations
}

func CurrentAdditionalTypeRoots() []reflect.Type {
	return DiscoveredConvertibleTypes()
}
