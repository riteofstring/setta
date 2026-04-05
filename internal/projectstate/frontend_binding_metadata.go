package projectstate

import (
	"errors"
	"reflect"
	"strings"

	"setta/internal/frontendbindingmeta"
)

var frontendBindingBaseSectionImplType = reflect.TypeOf(FrontendBaseSectionImpl{})
var frontendBindingBaseCodeObjImplType = reflect.TypeOf(FrontendBaseCodeObjImpl{})
var frontendBindingBaseValueParamCodeObjImplType = reflect.TypeOf(FrontendBaseValueParamCodeObjImpl{})
var frontendBindingParamCodeObjFieldsType = reflect.TypeOf(FrontendParamCodeObjFields{})

func (FrontendBaseSectionImpl) FrontendBindingDiscriminatedObjectFamily() frontendbindingmeta.DiscriminatedObjectFamily {
	return frontendbindingmeta.DiscriminatedObjectFamily{
		BaseType:           frontendBindingBaseSectionImplType,
		EnumType:           reflect.TypeOf(FrontendSectionType("")),
		DiscriminatorField: "type",
		DiscriminatorValue: frontendBindingSectionDiscriminatorValue,
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
				UnionName:   "BaseParentSectionImplUnion",
				LocalUnion:  true,
				IncludeBase: false,
				Predicate: func(t reflect.Type) bool {
					return frontendBindingContractTypeHasJSONField(t, "children")
				},
				SetName:    "BaseParentSectionImplTypeSet",
				GuardName:  "isBaseParentSectionImpl",
				GuardInput: "BaseSectionImplUnion",
			},
			{
				UnionName:   "BaseDictSectionImplUnion",
				IncludeBase: false,
				Predicate: func(t reflect.Type) bool {
					return frontendBindingContractTypeHasJSONField(t, "topLevelParamId")
				},
				SetName:    "BaseDictSectionImplTypeSet",
				GuardName:  "isBaseDictSectionImpl",
				GuardInput: "BaseSectionImplUnion",
			},
			{
				UnionName:   "BaseSectionWithParamsImplUnion",
				LocalUnion:  true,
				IncludeBase: false,
				Predicate: func(t reflect.Type) bool {
					return frontendBindingContractTypeHasJSONField(t, "codeObjVariantMap")
				},
				SetName:    "BaseSectionWithParamsImplTypeSet",
				GuardName:  "isBaseSectionWithParamsImpl",
				GuardInput: "BaseSectionImplUnion",
			},
		},
	}
}

func (FrontendBaseCodeObjImpl) FrontendBindingDiscriminatedObjectFamily() frontendbindingmeta.DiscriminatedObjectFamily {
	return frontendbindingmeta.DiscriminatedObjectFamily{
		BaseType:           frontendBindingBaseCodeObjImplType,
		EnumType:           reflect.TypeOf(FrontendCodeObjType("")),
		DiscriminatorField: "type",
		DiscriminatorValue: frontendBindingCodeObjDiscriminatorValue,
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
				Predicate: func(t reflect.Type) bool {
					return frontendBindingContractTypeEmbedsAnonymousField(t, frontendBindingBaseValueParamCodeObjImplType)
				},
				SetName:    "BaseChildlessCodeObjImplTypeSet",
				GuardName:  "isBaseChildlessCodeObjImpl",
				GuardInput: "BaseCodeObjImplUnion",
			},
			{
				UnionName:   "BaseParamCodeObjImplUnion",
				LocalUnion:  true,
				IncludeBase: true,
				Predicate: func(t reflect.Type) bool {
					return frontendBindingContractTypeEmbedsAnonymousField(t, frontendBindingParamCodeObjFieldsType)
				},
				SetName:     "BaseParamCodeObjImplTypeSet",
				SetExported: true,
				GuardName:   "isBaseParamCodeObjImpl",
				GuardInput:  "BaseCodeObjImplUnion",
			},
			{
				UnionName:   "BaseParentCodeObjImplUnion",
				LocalUnion:  true,
				IncludeBase: false,
				Predicate: func(t reflect.Type) bool {
					return frontendBindingContractTypeHasJSONField(t, "children")
				},
				SetName:    "BaseParentCodeObjImplTypeSet",
				GuardName:  "isBaseParentCodeObjImpl",
				GuardInput: "BaseCodeObjImplUnion",
			},
			{
				SetName:     "ControlCodeObjTypeSet",
				SetExported: true,
				Predicate: func(t reflect.Type) bool {
					return frontendBindingContractTypeEmbedsAnonymousField(t, frontendBindingParamCodeObjFieldsType) &&
						!frontendBindingContractTypeHasJSONField(t, "children")
				},
			},
			{
				SetName:     "SectionParamCodeObjTypeSet",
				SetExported: true,
				Predicate: func(t reflect.Type) bool {
					return frontendBindingContractTypeEmbedsAnonymousField(t, frontendBindingParamCodeObjFieldsType) &&
						(frontendBindingContractTypeEmbedsAnonymousField(t, frontendBindingBaseValueParamCodeObjImplType) ||
							frontendBindingContractTypeHasJSONField(t, "children"))
				},
			},
		},
	}
}

func frontendBindingSectionDiscriminatorValue(t reflect.Type) (string, bool) {
	return frontendBindingNamedConcreteTypeValue(t, "SectionImpl")
}

func frontendBindingCodeObjDiscriminatorValue(t reflect.Type) (string, bool) {
	return frontendBindingNamedConcreteTypeValue(t, "CodeObjImpl")
}

func frontendBindingNamedConcreteTypeValue(t reflect.Type, suffix string) (string, bool) {
	for t != nil && t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t == nil || t.Kind() != reflect.Struct {
		return "", false
	}
	name := strings.TrimSpace(t.Name())
	if !strings.HasPrefix(name, "Frontend") || strings.HasPrefix(name, "FrontendBase") {
		return "", false
	}
	name = strings.TrimPrefix(name, "Frontend")
	if !strings.HasSuffix(name, suffix) {
		return "", false
	}
	value := strings.TrimSuffix(name, suffix)
	if strings.TrimSpace(value) == "" || strings.HasPrefix(value, "UserDefault") {
		return "", false
	}
	return value, true
}

func frontendBindingContractTypeHasJSONField(t reflect.Type, fieldName string) bool {
	for t != nil && t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t == nil || t.Kind() != reflect.Struct {
		return false
	}
	for index := range t.NumField() {
		field := t.Field(index)
		if !field.IsExported() {
			continue
		}
		if field.Anonymous && frontendBindingContractTypeHasJSONField(field.Type, fieldName) {
			return true
		}
		name, _, skip := frontendBindingJSONFieldName(field)
		if !skip && name == fieldName {
			return true
		}
	}
	return false
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

func frontendBindingJSONFieldName(field reflect.StructField) (name string, optional bool, skip bool) {
	tag := strings.TrimSpace(field.Tag.Get("json"))
	if tag == "-" {
		return "", false, true
	}
	if tag == "" {
		return frontendBindingLowerCamelCase(field.Name), false, false
	}
	parts := strings.Split(tag, ",")
	name = strings.TrimSpace(parts[0])
	if name == "" {
		name = frontendBindingLowerCamelCase(field.Name)
	}
	for _, part := range parts[1:] {
		if strings.TrimSpace(part) == "omitempty" {
			optional = true
		}
	}
	return name, optional, false
}

func frontendBindingLowerCamelCase(value string) string {
	if value == "" {
		return value
	}
	return strings.ToLower(value[:1]) + value[1:]
}
