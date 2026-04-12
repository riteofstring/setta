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

type discriminatedUnionEntryState struct {
	unionName       string
	entry           DiscriminatedUnionEntry
	seenMemberNames map[string]struct{}
	seenValues      map[string]struct{}
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
	state, ok, err := newDiscriminatedUnionEntryState(unionType, memberTypes)
	if err != nil || !ok {
		return DiscriminatedUnionEntry{}, ok, err
	}
	for _, memberType := range memberTypes {
		memberName, ok, err := state.reserveMemberName(memberType)
		if err != nil {
			return DiscriminatedUnionEntry{}, false, err
		}
		if !ok {
			continue
		}
		ok, err = state.addMember(memberName, memberType)
		if err != nil {
		}
		if !ok {
			return DiscriminatedUnionEntry{}, false, nil
		}
	}
	return state.finish()
}

func sharedDiscriminatorFieldForType(t reflect.Type) (sharedDiscriminatorField, bool, error) {
	t = canonicalType(t)
	if t == nil || t.Kind() != reflect.Struct {
		return sharedDiscriminatorField{}, false, nil
	}

	var found sharedDiscriminatorField
	for index := 0; index < t.NumField(); index++ {
		candidate, ok, err := sharedDiscriminatorFieldFromStructField(t.Field(index))
		if err != nil {
			return sharedDiscriminatorField{}, false, err
		}
		if !ok {
			continue
		}
		if found.Value != "" {
			return sharedDiscriminatorField{}, false, fmt.Errorf(
				"multiple %s tags on %s",
				sharedDiscriminatorTag,
				t,
			)
		}
		found = candidate
	}
	if found.Value == "" {
		return sharedDiscriminatorField{}, false, nil
	}
	return found, true, nil
}

func newDiscriminatedUnionEntryState(
	unionType reflect.Type,
	memberTypes []reflect.Type,
) (discriminatedUnionEntryState, bool, error) {
	unionType = canonicalType(unionType)
	unionName := strings.TrimSpace(ContractNameForType(unionType))
	if unionType == nil || unionName == "" {
		return discriminatedUnionEntryState{}, false, nil
	}
	if len(memberTypes) == 0 {
		return discriminatedUnionEntryState{}, false, fmt.Errorf(
			"shared sidecar discriminated union %s has no member types",
			unionName,
		)
	}
	return discriminatedUnionEntryState{
		unionName:       unionName,
		entry:           DiscriminatedUnionEntry{Name: unionName},
		seenMemberNames: map[string]struct{}{},
		seenValues:      map[string]struct{}{},
	}, true, nil
}

func (s *discriminatedUnionEntryState) reserveMemberName(memberType reflect.Type) (string, bool, error) {
	memberType = canonicalType(memberType)
	memberName := strings.TrimSpace(ContractNameForType(memberType))
	if memberName == "" {
		return "", false, fmt.Errorf(
			"shared sidecar discriminated union %s has a member with no contract name: %v",
			s.unionName,
			memberType,
		)
	}
	if _, duplicate := s.seenMemberNames[memberName]; duplicate {
		return "", false, nil
	}
	s.seenMemberNames[memberName] = struct{}{}
	return memberName, true, nil
}

func (s *discriminatedUnionEntryState) addMember(memberName string, memberType reflect.Type) (bool, error) {
	field, ok, err := sharedDiscriminatorFieldForType(memberType)
	if err != nil {
		return false, fmt.Errorf(
			"shared sidecar discriminated union %s member %s: %w",
			s.unionName,
			memberName,
			err,
		)
	}
	if !ok {
		return false, nil
	}
	if err := s.setDiscriminatorField(field); err != nil {
		return false, err
	}
	if err := s.appendMember(memberName, field); err != nil {
		return false, err
	}
	return true, nil
}

func (s *discriminatedUnionEntryState) setDiscriminatorField(field sharedDiscriminatorField) error {
	if s.entry.DiscriminatorField == "" {
		s.entry.DiscriminatorField = field.JSONName
		s.entry.EnumType = strings.TrimSpace(ContractNameForType(field.EnumType))
		return nil
	}
	if s.entry.DiscriminatorField != field.JSONName {
		return fmt.Errorf(
			"shared sidecar discriminated union %s has inconsistent discriminator fields %q and %q",
			s.unionName,
			s.entry.DiscriminatorField,
			field.JSONName,
		)
	}
	enumTypeName := strings.TrimSpace(ContractNameForType(field.EnumType))
	if s.entry.EnumType != enumTypeName {
		return fmt.Errorf(
			"shared sidecar discriminated union %s has inconsistent discriminator enum types %q and %q",
			s.unionName,
			s.entry.EnumType,
			enumTypeName,
		)
	}
	return nil
}

func (s *discriminatedUnionEntryState) appendMember(
	memberName string,
	field sharedDiscriminatorField,
) error {
	if _, duplicate := s.seenValues[field.Value]; duplicate {
		return fmt.Errorf(
			"shared sidecar discriminated union %s has duplicate discriminator value %q",
			s.unionName,
			field.Value,
		)
	}
	s.seenValues[field.Value] = struct{}{}
	s.entry.Members = append(s.entry.Members, DiscriminatedUnionMemberEntry{
		Name:               memberName,
		DiscriminatorValue: field.Value,
	})
	return nil
}

func (s discriminatedUnionEntryState) finish() (DiscriminatedUnionEntry, bool, error) {
	if s.entry.DiscriminatorField == "" || len(s.entry.Members) == 0 {
		return DiscriminatedUnionEntry{}, false, nil
	}
	return s.entry, true, nil
}

func sharedDiscriminatorFieldFromStructField(
	field reflect.StructField,
) (sharedDiscriminatorField, bool, error) {
	if !field.IsExported() {
		return sharedDiscriminatorField{}, false, nil
	}
	jsonName, ok := jsonFieldName(field)
	if !ok {
		return sharedDiscriminatorField{}, false, nil
	}
	value := strings.TrimSpace(field.Tag.Get(sharedDiscriminatorTag))
	if value == "" {
		return sharedDiscriminatorField{}, false, nil
	}
	if strings.TrimSpace(jsonName) == "" {
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
	return sharedDiscriminatorField{
		JSONName: jsonName,
		Value:    value,
		EnumType: enumType,
	}, true, nil
}
