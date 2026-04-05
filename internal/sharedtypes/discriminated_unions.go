package sharedtypes

import (
	"fmt"
	"reflect"
	"sort"
	"strings"

	"setta/internal/frontendbindingmeta"
)

const sharedDiscriminatorTag = "shared_discriminator"

type sharedDiscriminatorField struct {
	JSONName string
	Value    string
	EnumType reflect.Type
}

func buildDiscriminatedUnionEntries() ([]DiscriminatedUnionEntry, error) {
	allTypes := DiscoveredTypes()
	entries := []DiscriminatedUnionEntry{}
	for _, unionType := range allTypes {
		provider, ok := frontendbindingmeta.LookupProvider[frontendbindingmeta.UnionTypesProvider](unionType)
		if !ok {
			continue
		}
		entry, ok, err := discriminatedUnionEntryForType(
			unionType,
			provider.FrontendBindingUnionTypes(),
		)
		if err != nil {
			return nil, err
		}
		if ok {
			entries = append(entries, entry)
		}
	}
	sort.Slice(entries, func(i int, j int) bool {
		return entries[i].Name < entries[j].Name
	})
	return entries, nil
}

func discriminatedUnionEntryForType(
	unionType reflect.Type,
	memberTypes []reflect.Type,
) (DiscriminatedUnionEntry, bool, error) {
	unionType = canonicalType(unionType)
	unionName := strings.TrimSpace(ContractNameForType(unionType))
	if unionType == nil || unionName == "" {
		return DiscriminatedUnionEntry{}, false, nil
	}
	if len(memberTypes) == 0 {
		return DiscriminatedUnionEntry{}, false, fmt.Errorf(
			"shared sidecar discriminated union %s has no member types",
			unionName,
		)
	}

	entry := DiscriminatedUnionEntry{Name: unionName}
	seenMemberNames := map[string]struct{}{}
	seenValues := map[string]struct{}{}
	for _, memberType := range memberTypes {
		memberType = canonicalType(memberType)
		memberName := strings.TrimSpace(ContractNameForType(memberType))
		if memberName == "" {
			return DiscriminatedUnionEntry{}, false, fmt.Errorf(
				"shared sidecar discriminated union %s has a member with no contract name: %v",
				unionName,
				memberType,
			)
		}
		if _, duplicate := seenMemberNames[memberName]; duplicate {
			continue
		}
		seenMemberNames[memberName] = struct{}{}

		field, ok, err := sharedDiscriminatorFieldForType(memberType)
		if err != nil {
			return DiscriminatedUnionEntry{}, false, fmt.Errorf(
				"shared sidecar discriminated union %s member %s: %w",
				unionName,
				memberName,
				err,
			)
		}
		if !ok {
			return DiscriminatedUnionEntry{}, false, nil
		}
		if entry.DiscriminatorField == "" {
			entry.DiscriminatorField = field.JSONName
			entry.EnumType = strings.TrimSpace(ContractNameForType(field.EnumType))
		} else {
			if entry.DiscriminatorField != field.JSONName {
				return DiscriminatedUnionEntry{}, false, fmt.Errorf(
					"shared sidecar discriminated union %s has inconsistent discriminator fields %q and %q",
					unionName,
					entry.DiscriminatorField,
					field.JSONName,
				)
			}
			enumTypeName := strings.TrimSpace(ContractNameForType(field.EnumType))
			if entry.EnumType != enumTypeName {
				return DiscriminatedUnionEntry{}, false, fmt.Errorf(
					"shared sidecar discriminated union %s has inconsistent discriminator enum types %q and %q",
					unionName,
					entry.EnumType,
					enumTypeName,
				)
			}
		}
		if _, duplicate := seenValues[field.Value]; duplicate {
			return DiscriminatedUnionEntry{}, false, fmt.Errorf(
				"shared sidecar discriminated union %s has duplicate discriminator value %q",
				unionName,
				field.Value,
			)
		}
		seenValues[field.Value] = struct{}{}
		entry.Members = append(entry.Members, DiscriminatedUnionMemberEntry{
			Name:               memberName,
			DiscriminatorValue: field.Value,
		})
	}
	if entry.DiscriminatorField == "" || len(entry.Members) == 0 {
		return DiscriminatedUnionEntry{}, false, nil
	}
	return entry, true, nil
}

func sharedDiscriminatorFieldForType(t reflect.Type) (sharedDiscriminatorField, bool, error) {
	t = canonicalType(t)
	if t == nil || t.Kind() != reflect.Struct {
		return sharedDiscriminatorField{}, false, nil
	}

	var found sharedDiscriminatorField
	foundAny := false
	for index := 0; index < t.NumField(); index++ {
		field := t.Field(index)
		if !field.IsExported() || field.Tag.Get("json") == "-" {
			continue
		}
		value := strings.TrimSpace(field.Tag.Get(sharedDiscriminatorTag))
		if value == "" {
			continue
		}
		if foundAny {
			return sharedDiscriminatorField{}, false, fmt.Errorf(
				"multiple %s tags on %s",
				sharedDiscriminatorTag,
				t,
			)
		}
		jsonName, ok := jsonFieldName(field)
		if !ok || strings.TrimSpace(jsonName) == "" {
			return sharedDiscriminatorField{}, false, fmt.Errorf(
				"%s has no JSON field name",
				field.Name,
			)
		}
		enumType := canonicalType(field.Type)
		if enumType == nil || enumType.Kind() != reflect.String {
			return sharedDiscriminatorField{}, false, fmt.Errorf(
				"%s must be a string-like discriminator field, got %s",
				field.Name,
				field.Type,
			)
		}
		found = sharedDiscriminatorField{
			JSONName: jsonName,
			Value:    value,
			EnumType: enumType,
		}
		foundAny = true
	}
	if !foundAny {
		return sharedDiscriminatorField{}, false, nil
	}
	return found, true, nil
}
