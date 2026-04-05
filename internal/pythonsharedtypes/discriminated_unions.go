package pythonsharedtypes

import (
	"fmt"
	"strconv"
	"strings"
	"unicode"

	"setta/internal/sharedtypes"
)

func applyPythonDiscriminatedUnionDeclarations(
	module datamodelModule,
	sidecar sharedtypes.SemanticSidecar,
) (datamodelModule, []string, error) {
	if len(sidecar.DiscriminatedUnions) == 0 {
		return module, nil, nil
	}

	discriminatedByName := map[string]sharedtypes.DiscriminatedUnionEntry{}
	for _, entry := range sidecar.DiscriminatedUnions {
		name := strings.TrimSpace(entry.Name)
		if name == "" {
			continue
		}
		discriminatedByName[name] = entry
	}
	if len(discriminatedByName) == 0 {
		return module, nil, nil
	}

	enumMembersByType := sidecarEnumMembersByType(sidecar)
	declarations := make([]datamodelDeclaration, 0, len(module.Declarations))
	rewroteAny := false
	for _, declaration := range module.Declarations {
		if declaration.Kind != datamodelDeclarationKindType {
			declarations = append(declarations, declaration)
			continue
		}
		entry, ok := discriminatedByName[declaration.Name]
		if !ok {
			declarations = append(declarations, declaration)
			continue
		}
		block, err := pythonDiscriminatedUnionBlock(entry, enumMembersByType)
		if err != nil {
			return datamodelModule{}, nil, err
		}
		declaration.Block = block
		declarations = append(declarations, declaration)
		rewroteAny = true
	}
	if !rewroteAny {
		return module, nil, nil
	}

	module.Declarations = declarations
	return module, []string{
		"from typing import Any",
		"from pydantic import Discriminator, Tag",
	}, nil
}

func sidecarEnumMembersByType(
	sidecar sharedtypes.SemanticSidecar,
) map[string]map[string]string {
	membersByType := map[string]map[string]string{}
	for _, contract := range sidecar.Contracts {
		if strings.TrimSpace(contract.Kind) != "enum" {
			continue
		}
		typeName := strings.TrimSpace(contract.Name)
		if typeName == "" {
			continue
		}
		valuesByLiteral := map[string]string{}
		for _, enumValue := range contract.EnumValues {
			literal := strings.TrimSpace(enumValue.Value)
			memberName := strings.TrimSpace(enumValue.Name)
			if literal == "" || memberName == "" {
				continue
			}
			valuesByLiteral[literal] = memberName
		}
		if len(valuesByLiteral) == 0 {
			continue
		}
		membersByType[typeName] = valuesByLiteral
	}
	return membersByType
}

func pythonDiscriminatedUnionBlock(
	entry sharedtypes.DiscriminatedUnionEntry,
	enumMembersByType map[string]map[string]string,
) (string, error) {
	name := strings.TrimSpace(entry.Name)
	if name == "" {
		return "", fmt.Errorf("python shared types: discriminated union has empty name")
	}
	discriminatorField := strings.TrimSpace(entry.DiscriminatorField)
	if discriminatorField == "" {
		return "", fmt.Errorf("python shared types: discriminated union %s is missing discriminatorField", name)
	}
	if len(entry.Members) == 0 {
		return "", fmt.Errorf("python shared types: discriminated union %s has no members", name)
	}

	helperName := "_" + pythonDiscriminatorHelperName(name)
	enumType := strings.TrimSpace(entry.EnumType)

	var builder strings.Builder
	builder.WriteString("def ")
	builder.WriteString(helperName)
	builder.WriteString("(value: Any) -> str | None:\n")
	builder.WriteString("    raw_value = (\n")
	builder.WriteString("        value.get(")
	builder.WriteString(strconv.Quote(discriminatorField))
	builder.WriteString(") if isinstance(value, dict) else getattr(value, ")
	builder.WriteString(strconv.Quote(discriminatorField))
	builder.WriteString(", None)\n")
	builder.WriteString("    )\n")
	if enumType != "" {
		builder.WriteString("    if isinstance(raw_value, ")
		builder.WriteString(enumType)
		builder.WriteString("):\n")
		builder.WriteString("        return raw_value.value\n")
	}
	builder.WriteString("    if isinstance(raw_value, str):\n")
	builder.WriteString("        return raw_value\n")
	builder.WriteString("    return None\n\n")

	builder.WriteString("type ")
	builder.WriteString(name)
	builder.WriteString(" = Annotated[\n")
	for index, member := range entry.Members {
		memberName := strings.TrimSpace(member.Name)
		if memberName == "" {
			return "", fmt.Errorf("python shared types: discriminated union %s has a member with empty name", name)
		}
		tagExpr := pythonDiscriminatorTagExpr(enumType, member.DiscriminatorValue, enumMembersByType)
		if index == 0 {
			builder.WriteString("    Annotated[")
		} else {
			builder.WriteString("    | Annotated[")
		}
		builder.WriteString(memberName)
		builder.WriteString(", Tag(")
		builder.WriteString(tagExpr)
		builder.WriteString(")]")
		if index == len(entry.Members)-1 {
			builder.WriteString(",\n")
		} else {
			builder.WriteString("\n")
		}
	}
	builder.WriteString("    Discriminator(")
	builder.WriteString(helperName)
	builder.WriteString("),\n")
	builder.WriteString("]")
	return builder.String(), nil
}

func pythonDiscriminatorTagExpr(
	enumType string,
	value string,
	enumMembersByType map[string]map[string]string,
) string {
	enumType = strings.TrimSpace(enumType)
	value = strings.TrimSpace(value)
	if enumType != "" {
		if valuesByLiteral, ok := enumMembersByType[enumType]; ok {
			if memberName, ok := valuesByLiteral[value]; ok && memberName != "" {
				return fmt.Sprintf("%s.%s.value", enumType, memberName)
			}
		}
	}
	return strconv.Quote(value)
}

func pythonDiscriminatorHelperName(name string) string {
	parts := splitPythonIdentifierWords(name)
	if len(parts) == 0 {
		return "discriminator"
	}
	for index, part := range parts {
		parts[index] = strings.ToLower(part)
	}
	return strings.Join(parts, "_") + "_discriminator"
}

func splitPythonIdentifierWords(name string) []string {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil
	}
	runes := []rune(name)
	parts := []string{}
	start := 0
	for index := 1; index < len(runes); index++ {
		prev := runes[index-1]
		current := runes[index]
		next := rune(0)
		if index+1 < len(runes) {
			next = runes[index+1]
		}
		if unicode.IsUpper(current) && unicode.IsLower(prev) {
			parts = append(parts, string(runes[start:index]))
			start = index
			continue
		}
		if unicode.IsUpper(current) && unicode.IsUpper(prev) && next != 0 && unicode.IsLower(next) {
			parts = append(parts, string(runes[start:index]))
			start = index
		}
	}
	parts = append(parts, string(runes[start:]))
	return compactPythonIdentifierParts(parts)
}

func compactPythonIdentifierParts(parts []string) []string {
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		out = append(out, part)
	}
	return out
}
