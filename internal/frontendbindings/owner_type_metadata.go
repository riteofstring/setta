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
	if expr, ok := ownerProvidedTypeScriptExpr(t); ok {
		if strings.TrimSpace(expr) == "" {
			return TypeDeclaration{}, false, fmt.Errorf("%s returned an empty frontend TS alias expression", t.String())
		}
		return aliasDeclaration(frontendBindingTypeName(t), expr), true, nil
	}

	memberTypes, ok := ownerProvidedUnionTypes(t)
	if !ok {
		return TypeDeclaration{}, false, nil
	}
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

func ownerProvidedTypeScriptExpr(t reflect.Type) (string, bool) {
	for _, candidate := range ownerProvidedTypeMetadataCandidates(t) {
		provider, ok := candidate.(frontendBindingTypeScriptExprProvider)
		if !ok {
			continue
		}
		return provider.FrontendBindingTypeScriptExpr(), true
	}
	return "", false
}

func ownerProvidedUnionTypes(t reflect.Type) ([]reflect.Type, bool) {
	for _, candidate := range ownerProvidedTypeMetadataCandidates(t) {
		provider, ok := candidate.(frontendBindingUnionTypesProvider)
		if !ok {
			continue
		}
		return append([]reflect.Type(nil), provider.FrontendBindingUnionTypes()...), true
	}
	return nil, false
}

func ownerProvidedTypeMetadataCandidates(t reflect.Type) []any {
	t = canonicalFrontendBindingType(t)
	if t == nil || strings.TrimSpace(t.PkgPath()) == "" {
		return nil
	}
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t == nil {
		return nil
	}

	candidates := []any{}
	value := reflect.Zero(t)
	if value.IsValid() && value.CanInterface() {
		candidates = append(candidates, value.Interface())
	}
	if t.Kind() != reflect.Interface {
		ptr := reflect.New(t)
		if ptr.IsValid() && ptr.CanInterface() {
			candidates = append(candidates, ptr.Interface())
		}
	}
	return candidates
}
