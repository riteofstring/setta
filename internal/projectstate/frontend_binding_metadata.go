package projectstate

import (
	"errors"
	"reflect"
	"strings"

	"setta/internal/frontendbindingmeta"
)

var (
	frontendBindingBaseSectionImplType                = reflect.TypeOf(FrontendBaseSectionImpl{})
	frontendBindingBaseCodeObjImplType                = reflect.TypeOf(FrontendBaseCodeObjImpl{})
	frontendBindingChildSectionFieldsType             = reflect.TypeOf(FrontendChildSectionFields{})
	frontendBindingSectionWithParamsLeadingFieldsType = reflect.TypeOf(FrontendSectionWithParamsLeadingFields{})
	frontendBindingBaseValueParamCodeObjImplType      = reflect.TypeOf(FrontendBaseValueParamCodeObjImpl{})
	frontendBindingChildCodeObjFieldsType             = reflect.TypeOf(FrontendChildCodeObjFields{})
	frontendBindingParamCodeObjFieldsType             = reflect.TypeOf(FrontendParamCodeObjFields{})
)

func (FrontendBaseSectionImpl) FrontendBindingDiscriminatedObjectFamily() frontendbindingmeta.DiscriminatedObjectFamily {
	return frontendbindingmeta.DiscriminatedObjectFamily{
		BaseType:           frontendBindingBaseSectionImplType,
		EnumType:           reflect.TypeOf(FrontendSectionType("")),
		DiscriminatorField: "type",
		DiscriminatorValue: frontendBindingConcreteTypeValueWithSuffix("SectionImpl"),
		DefaultValueForDiscriminator: func(value string) (any, bool, error) {
			defaultValue, err := FrontendSectionImplDefaultValue(value)
			if err != nil {
				if errors.Is(err, ErrTopLevelSectionImplTypeUnsupported) {
					return nil, false, nil
				}
				return nil, false, err
			}
			return defaultValue, true, nil
		},
		Traits: []frontendbindingmeta.DiscriminatedObjectTraitSpec{
			{
				UnionName:  "BaseParentSectionImplUnion",
				LocalUnion: true,
				Predicate:  frontendBindingEmbedsAnonymousFieldPredicate(frontendBindingChildSectionFieldsType),
			},
			{
				UnionName:  "BaseSectionWithParamsImplUnion",
				LocalUnion: true,
				Predicate:  frontendBindingEmbedsAnonymousFieldPredicate(frontendBindingSectionWithParamsLeadingFieldsType),
			},
		},
	}
}

func (FrontendBaseCodeObjImpl) FrontendBindingDiscriminatedObjectFamily() frontendbindingmeta.DiscriminatedObjectFamily {
	return frontendbindingmeta.DiscriminatedObjectFamily{
		BaseType:           frontendBindingBaseCodeObjImplType,
		EnumType:           reflect.TypeOf(FrontendCodeObjType("")),
		DiscriminatorField: "type",
		DiscriminatorValue: frontendBindingConcreteTypeValueWithSuffix("CodeObjImpl"),
		DefaultValueForDiscriminator: func(value string) (any, bool, error) {
			if value != string(FrontendCodeObjTypeCodeParam) {
				return nil, false, nil
			}
			return FrontendDefaultCodeParamCodeObjImpl(), true, nil
		},
		BaseExtraLines: []string{"[key: string]: unknown;"},
		Traits: []frontendbindingmeta.DiscriminatedObjectTraitSpec{
			{
				UnionName:   "BaseChildlessCodeObjImplUnion",
				IncludeBase: true,
				Predicate:   frontendBindingEmbedsAnonymousFieldPredicate(frontendBindingBaseValueParamCodeObjImplType),
			},
			{
				UnionName:   "BaseParamCodeObjImplUnion",
				LocalUnion:  true,
				IncludeBase: true,
				Predicate:   frontendBindingEmbedsAnonymousFieldPredicate(frontendBindingParamCodeObjFieldsType),
			},
			{
				UnionName:  "BaseParentCodeObjImplUnion",
				LocalUnion: true,
				Predicate:  frontendBindingEmbedsAnonymousFieldPredicate(frontendBindingChildCodeObjFieldsType),
			},
		},
	}
}

func frontendBindingEmbedsAnonymousFieldPredicate(target reflect.Type) func(reflect.Type) bool {
	return func(t reflect.Type) bool { return frontendBindingContractTypeEmbedsAnonymousField(t, target) }
}
func frontendBindingConcreteTypeValueWithSuffix(suffix string) func(reflect.Type) (string, bool) {
	return func(t reflect.Type) (string, bool) { return frontendBindingNamedConcreteTypeValue(t, suffix) }
}
func frontendBindingNamedConcreteTypeValue(t reflect.Type, suffix string) (string, bool) {
	for t != nil && t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t == nil || t.Kind() != reflect.Struct {
		return "", false
	}
	name := t.Name()
	if !strings.HasPrefix(name, "Frontend") ||
		strings.HasPrefix(name, "FrontendBase") ||
		!strings.HasSuffix(name, suffix) {
		return "", false
	}
	value := strings.TrimSuffix(strings.TrimPrefix(name, "Frontend"), suffix)
	if value == "" || strings.HasPrefix(value, "UserDefault") {
		return "", false
	}
	return value, true
}

func frontendBindingContractTypeEmbedsAnonymousField(t reflect.Type, target reflect.Type) bool {
	for t != nil && t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t == nil || target == nil || t.Kind() != reflect.Struct {
		return false
	}
	for index := 0; index < t.NumField(); index++ {
		field := t.Field(index)
		if !field.Anonymous {
			continue
		}
		fieldType := field.Type
		if fieldType == target {
			return true
		}
		if fieldType.Kind() == reflect.Pointer {
			fieldType = fieldType.Elem()
		}
		if fieldType.Kind() == reflect.Struct &&
			frontendBindingContractTypeEmbedsAnonymousField(fieldType, target) {
			return true
		}
	}
	return false
}
