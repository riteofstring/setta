package sharedtypes

import (
	"encoding/json"
	"fmt"
	"strings"
)

const (
	OpenAPIProjectionVersion = "3.1.0"
	OpenAPIProjectionTitle   = "Setta Non-HTTP Shared Types"
)

func BuildOpenAPIProjectionDocument() (map[string]any, error) {
	schema, err := BuildSchemaDocument()
	if err != nil {
		return nil, err
	}

	payload, err := json.Marshal(schema)
	if err != nil {
		return nil, fmt.Errorf("marshal shared schema for OpenAPI projection: %w", err)
	}

	var schemaDocument map[string]any
	if err := json.Unmarshal(payload, &schemaDocument); err != nil {
		return nil, fmt.Errorf("decode shared schema for OpenAPI projection: %w", err)
	}

	defsValue, ok := schemaDocument["$defs"]
	if !ok {
		return nil, fmt.Errorf("shared schema document is missing $defs")
	}
	defs, ok := defsValue.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("shared schema $defs has unsupported shape %T", defsValue)
	}
	rewriteOpenAPIProjectionRefs(defs)
	if err := applyOpenAPIProjectionDiscriminators(defs); err != nil {
		return nil, err
	}

	return map[string]any{
		"openapi":             OpenAPIProjectionVersion,
		"jsonSchemaDialect":   JSONSchemaDraft202012,
		"info":                map[string]any{"title": OpenAPIProjectionTitle, "version": "1"},
		"paths":               map[string]any{},
		"components":          map[string]any{"schemas": defs},
		"x-setta-schema-kind": "non-http-shared-types-openapi-projection",
	}, nil
}

func applyOpenAPIProjectionDiscriminators(defs map[string]any) error {
	sidecar, err := BuildSemanticSidecar()
	if err != nil {
		return fmt.Errorf("build semantic sidecar for OpenAPI projection: %w", err)
	}
	for _, entry := range sidecar.DiscriminatedUnions {
		if err := applyOpenAPIProjectionDiscriminator(defs, entry); err != nil {
			return err
		}
	}
	return nil
}

func applyOpenAPIProjectionDiscriminator(
	defs map[string]any,
	entry DiscriminatedUnionEntry,
) error {
	name := strings.TrimSpace(entry.Name)
	if name == "" || strings.TrimSpace(entry.DiscriminatorField) == "" || len(entry.Members) == 0 {
		return nil
	}

	rawSchema, ok := defs[name]
	if !ok {
		return fmt.Errorf("OpenAPI projection discriminated union %s is missing a schema", name)
	}
	schema, ok := rawSchema.(map[string]any)
	if !ok {
		return fmt.Errorf("OpenAPI projection discriminated union %s has unsupported schema shape %T", name, rawSchema)
	}

	memberRefs, err := projectionUnionMemberRefs(schema)
	if err != nil {
		return fmt.Errorf("OpenAPI projection discriminated union %s: %w", name, err)
	}

	mapping := make(map[string]any, len(entry.Members))
	for _, member := range entry.Members {
		memberName := strings.TrimSpace(member.Name)
		discriminatorValue := strings.TrimSpace(member.DiscriminatorValue)
		if memberName == "" || discriminatorValue == "" {
			return fmt.Errorf("OpenAPI projection discriminated union %s has incomplete member metadata", name)
		}
		ref := "#/components/schemas/" + memberName
		if _, ok := memberRefs[ref]; !ok {
			return fmt.Errorf(
				"OpenAPI projection discriminated union %s member %s is missing from projected union schema",
				name,
				memberName,
			)
		}
		mapping[discriminatorValue] = ref
	}

	schema["discriminator"] = map[string]any{
		"propertyName": strings.TrimSpace(entry.DiscriminatorField),
		"mapping":      mapping,
	}
	return nil
}

func projectionUnionMemberRefs(schema map[string]any) (map[string]struct{}, error) {
	rawMembers, ok := schema["oneOf"]
	if !ok {
		rawMembers, ok = schema["anyOf"]
		if ok {
			schema["oneOf"] = rawMembers
			delete(schema, "anyOf")
		}
	}
	if !ok {
		return nil, fmt.Errorf("schema is missing anyOf/oneOf members")
	}

	members, ok := rawMembers.([]any)
	if !ok || len(members) == 0 {
		return nil, fmt.Errorf("union members have unsupported shape %T", rawMembers)
	}

	refs := make(map[string]struct{}, len(members))
	for _, rawMember := range members {
		member, ok := rawMember.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("union member has unsupported shape %T", rawMember)
		}
		ref, ok := member["$ref"].(string)
		if !ok || strings.TrimSpace(ref) == "" {
			return nil, fmt.Errorf("union member is missing a $ref")
		}
		refs[ref] = struct{}{}
	}
	return refs, nil
}

func rewriteOpenAPIProjectionRefs(value any) {
	switch typed := value.(type) {
	case map[string]any:
		for key, entry := range typed {
			if key == "$ref" {
				ref, ok := entry.(string)
				if ok && strings.HasPrefix(ref, "#/$defs/") {
					typed[key] = "#/components/schemas/" + strings.TrimPrefix(ref, "#/$defs/")
				}
				continue
			}
			rewriteOpenAPIProjectionRefs(entry)
		}
	case []any:
		for _, entry := range typed {
			rewriteOpenAPIProjectionRefs(entry)
		}
	}
}
