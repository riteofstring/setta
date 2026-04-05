package projectstate

import (
	"errors"
	"reflect"

	"setta/internal/frontendbindingmeta"
)

func (FrontendBaseSectionImpl) FrontendBindingDiscriminatedObjectFamily() frontendbindingmeta.DiscriminatedObjectFamily {
	return frontendbindingmeta.DiscriminatedObjectFamily{
		BaseType:           reflect.TypeFor[FrontendBaseSectionImpl](),
		EnumType:           reflect.TypeFor[FrontendSectionType](),
		DiscriminatorField: "type",
		ConcreteTypeSuffix: "SectionImpl",
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
				UnionName:         "BaseParentSectionImplUnion",
				LocalUnion:        true,
				EmbeddedFieldType: reflect.TypeFor[FrontendChildSectionFields](),
			},
			{
				UnionName:         "BaseSectionWithParamsImplUnion",
				LocalUnion:        true,
				EmbeddedFieldType: reflect.TypeFor[FrontendSectionWithParamsLeadingFields](),
			},
		},
	}
}

func (FrontendBaseCodeObjImpl) FrontendBindingDiscriminatedObjectFamily() frontendbindingmeta.DiscriminatedObjectFamily {
	return frontendbindingmeta.DiscriminatedObjectFamily{
		BaseType:           reflect.TypeFor[FrontendBaseCodeObjImpl](),
		EnumType:           reflect.TypeFor[FrontendCodeObjType](),
		DiscriminatorField: "type",
		ConcreteTypeSuffix: "CodeObjImpl",
		DefaultValueForDiscriminator: func(value string) (any, bool, error) {
			if value != string(FrontendCodeObjTypeCodeParam) {
				return nil, false, nil
			}
			return FrontendDefaultCodeParamCodeObjImpl(), true, nil
		},
		Traits: []frontendbindingmeta.DiscriminatedObjectTraitSpec{
			{
				UnionName:         "BaseChildlessCodeObjImplUnion",
				IncludeBase:       true,
				EmbeddedFieldType: reflect.TypeFor[FrontendBaseValueParamCodeObjImpl](),
			},
			{
				UnionName:         "BaseParamCodeObjImplUnion",
				LocalUnion:        true,
				IncludeBase:       true,
				EmbeddedFieldType: reflect.TypeFor[FrontendParamCodeObjFields](),
			},
			{
				UnionName:         "BaseParentCodeObjImplUnion",
				LocalUnion:        true,
				EmbeddedFieldType: reflect.TypeFor[FrontendChildCodeObjFields](),
			},
		},
	}
}
