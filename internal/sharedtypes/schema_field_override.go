package sharedtypes

import "reflect"

type SchemaFieldOverride struct {
	Ref         string
	ItemsRef    string
	MapValueRef string
}

func SchemaFieldOverrideForField(field reflect.StructField) (SchemaFieldOverride, bool, error) {
	override, ok, err := parseSharedSchemaFieldOverride(field)
	if err != nil || !ok {
		return SchemaFieldOverride{}, ok, err
	}
	return SchemaFieldOverride{
		Ref:         override.Ref,
		ItemsRef:    override.ItemsRef,
		MapValueRef: override.MapValueRef,
	}, true, nil
}
