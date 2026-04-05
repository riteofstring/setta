package frontendbindings

import (
	"fmt"
	"reflect"
	"strings"
)

type frontendBindingTypeScriptExprProvider interface {
	FrontendBindingTypeScriptExpr() string
}

type frontendBindingUnionTypesProvider interface {
	FrontendBindingUnionTypes() []reflect.Type
}

func ownerProvidedTypeDeclaration(
	converter *typeConverter,
	t reflect.Type,
) (TypeDeclaration, bool, error) {
	if provider, ok := frontendBindingOwnerMetadataProvider[frontendBindingTypeScriptExprProvider](t); ok {
		expr := provider.FrontendBindingTypeScriptExpr()
		if strings.TrimSpace(expr) == "" {
			return TypeDeclaration{}, false, fmt.Errorf("%s returned an empty frontend TS alias expression", t.String())
		}
		return aliasDeclaration(frontendBindingTypeName(t), expr), true, nil
	}

	provider, ok := frontendBindingOwnerMetadataProvider[frontendBindingUnionTypesProvider](t)
	if !ok {
		return TypeDeclaration{}, false, nil
	}
	memberTypes := append([]reflect.Type(nil), provider.FrontendBindingUnionTypes()...)
	if len(memberTypes) == 0 {
		return TypeDeclaration{}, false, fmt.Errorf("%s returned no frontend union members", t.String())
	}

	members := make([]string, 0, len(memberTypes))
	seen := map[string]struct{}{}
	for _, memberType := range memberTypes {
		memberExpr, err := converter.renderTypeExpr(memberType)
		if err != nil {
			return TypeDeclaration{}, false, fmt.Errorf("%s union member %v: %w", t.String(), memberType, err)
		}
		if _, duplicate := seen[memberExpr]; duplicate {
			continue
		}
		seen[memberExpr] = struct{}{}
		members = append(members, memberExpr)
	}
	if len(members) == 0 {
		return TypeDeclaration{}, false, fmt.Errorf("%s returned no renderable frontend union members", t.String())
	}

	return aliasUnionDeclaration(frontendBindingTypeName(t), members...), true, nil
}

func frontendBindingOwnerMetadataProvider[P any](t reflect.Type) (P, bool) {
	var zero P
	t = canonicalFrontendBindingType(t)
	for t != nil && t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t == nil || strings.TrimSpace(t.PkgPath()) == "" {
		return zero, false
	}

	value := reflect.Zero(t)
	if value.IsValid() && value.CanInterface() {
		if provider, ok := value.Interface().(P); ok {
			return provider, true
		}
	}
	if t.Kind() == reflect.Interface {
		return zero, false
	}
	ptr := reflect.New(t)
	if !ptr.IsValid() || !ptr.CanInterface() {
		return zero, false
	}
	provider, ok := ptr.Interface().(P)
	return provider, ok
}
