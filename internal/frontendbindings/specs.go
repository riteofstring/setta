package frontendbindings

import (
	"reflect"
)

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

// setta-go-type-discovery: skip
type EndpointSpec struct {
	FunctionName    string
	Method          string
	RouteCollection string
	RouteName       string
	RequestType     reflect.Type
	PathParamsType  reflect.Type
	ResponseType    reflect.Type
	BinaryResponse  bool
}

func CurrentRouteGroups() []RouteGroup {
	return discoveredCurrentRouteGroups()
}

func CurrentAdditionalDeclarations(converter *typeConverter) []TypeDeclaration {
	declarations := []TypeDeclaration{}
	declarations = append(declarations, typeMetadataDeclarations(converter)...)
	declarations = append(declarations, mustGeneratedUserDefaultDeclarations(converter)...)
	declarations = append(declarations, additionalFactoryDeclarations()...)
	declarations = append(declarations, discoveredValueDeclarations(converter)...)
	declarations = append(declarations, safeParseSupportDeclarations()...)
	return declarations
}

func CurrentAdditionalTypeRoots() []reflect.Type {
	return DiscoveredConvertibleTypes()
}
