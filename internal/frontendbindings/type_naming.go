package frontendbindings

import (
	"reflect"
	"strings"
)

func normalizedFrontendBindingTypeName(name string) string {
	name = strings.TrimSpace(name)
	if strings.HasPrefix(name, "Frontend") && len(name) > len("Frontend") {
		return strings.TrimPrefix(name, "Frontend")
	}
	return name
}

func frontendBindingPublicTypeNames() map[reflect.Type]string {
	return frontendBindingGeneratedTypeNamesByType
}

func BindingTypeName(t reflect.Type) string {
	return frontendBindingTypeName(t)
}
