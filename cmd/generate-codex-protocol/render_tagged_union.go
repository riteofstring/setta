package main

import (
	"bytes"
	"fmt"
)

type taggedObjectUnionMember struct {
	FieldName  string
	StructName string
	TypeValue  string
	ConstName  string
	Schema     jsonSchema
}

// taggedObjectUnionTypeNames are the upstream `oneOf` unions Setta decodes by
// discriminator instead of carrying as raw JSON. A union outside this set stays
// a raw alias, because rendering every one of them would generate variant
// structs for payloads nothing reads.
var taggedObjectUnionTypeNames = map[string]bool{
	"PatchChangeKind": true,
	"ThreadItem":      true,
	"ThreadStatus":    true,
}

func isTaggedObjectUnionSchema(schema jsonSchema) bool {
	if len(schema.OneOf) == 0 {
		return false
	}
	for _, member := range schema.OneOf {
		if !isObjectSchema(member) || member.Title == "" {
			return false
		}
		discriminator, ok := member.Properties["type"]
		if !ok || len(discriminator.Enum) != 1 || !schemaTypeAllows(discriminator.Type, "string") {
			return false
		}
	}
	return true
}

func (generator *generator) renderTaggedObjectUnionSchema(buffer *bytes.Buffer, typeName string, schema jsonSchema) error {
	members, err := taggedObjectUnionMembers(typeName, schema)
	if err != nil {
		return err
	}
	values := make([]string, 0, len(members))
	for _, member := range members {
		values = append(values, member.TypeValue)
	}
	renderStringEnum(buffer, typeName+"Type", values)
	for _, member := range members {
		if err := generator.renderObjectSchema(buffer, member.StructName, member.Schema); err != nil {
			return err
		}
	}
	renderTaggedObjectUnionEnvelope(buffer, typeName, members)
	return nil
}

func taggedObjectUnionMembers(typeName string, schema jsonSchema) ([]taggedObjectUnionMember, error) {
	members := make([]taggedObjectUnionMember, 0, len(schema.OneOf))
	seenTypes := map[string]bool{}
	seenStructs := map[string]bool{}
	for index, memberSchema := range schema.OneOf {
		discriminator := memberSchema.Properties["type"]
		typeValue := discriminator.Enum[0]
		if typeValue == "" {
			return nil, fmt.Errorf("%s oneOf[%d] type discriminator is empty", typeName, index)
		}
		if seenTypes[typeValue] {
			return nil, fmt.Errorf("%s has duplicate type discriminator %s", typeName, typeValue)
		}
		seenTypes[typeValue] = true
		structName := exportedName(memberSchema.Title)
		if structName == "" {
			return nil, fmt.Errorf("%s oneOf[%d] title is empty", typeName, index)
		}
		if seenStructs[structName] {
			return nil, fmt.Errorf("%s has duplicate variant struct %s", typeName, structName)
		}
		seenStructs[structName] = true
		members = append(members, taggedObjectUnionMember{
			FieldName:  exportedFieldName(typeValue),
			StructName: structName,
			TypeValue:  typeValue,
			ConstName:  typeName + "Type" + enumValueName(typeValue),
			Schema:     memberSchema,
		})
	}
	return members, nil
}

func renderTaggedObjectUnionEnvelope(buffer *bytes.Buffer, typeName string, members []taggedObjectUnionMember) {
	fmt.Fprintf(buffer, "type %s struct {\n", typeName)
	fmt.Fprintf(buffer, "\tType %sType `json:%q`\n", typeName, "type")
	buffer.WriteString("\tRaw json.RawMessage `json:\"-\"`\n")
	for _, member := range members {
		fmt.Fprintf(buffer, "\t%s *%s `json:\"-\"`\n", member.FieldName, member.StructName)
	}
	buffer.WriteString("}\n\n")
	fmt.Fprintf(buffer, "func (item *%s) UnmarshalJSON(raw []byte) error {\n", typeName)
	fmt.Fprintf(buffer, "\tdecoded, err := decode%s(json.RawMessage(raw), %q)\n", typeName, typeName)
	buffer.WriteString("\tif err != nil {\n")
	buffer.WriteString("\t\treturn err\n")
	buffer.WriteString("\t}\n")
	buffer.WriteString("\t*item = decoded\n")
	buffer.WriteString("\treturn nil\n")
	buffer.WriteString("}\n\n")
	fmt.Fprintf(buffer, "func (item %s) MarshalJSON() ([]byte, error) {\n", typeName)
	buffer.WriteString("\tif len(item.Raw) > 0 {\n")
	buffer.WriteString("\t\treturn append([]byte{}, item.Raw...), nil\n")
	buffer.WriteString("\t}\n")
	buffer.WriteString("\tswitch item.Type {\n")
	for _, member := range members {
		fmt.Fprintf(buffer, "\tcase %s:\n", member.ConstName)
		fmt.Fprintf(buffer, "\t\tif item.%s == nil {\n", member.FieldName)
		fmt.Fprintf(buffer, "\t\t\treturn nil, codexUnsupportedStringValue(%q, string(item.Type))\n", typeName+".type")
		buffer.WriteString("\t\t}\n")
		fmt.Fprintf(buffer, "\t\treturn json.Marshal(item.%s)\n", member.FieldName)
	}
	buffer.WriteString("\tdefault:\n")
	fmt.Fprintf(buffer, "\t\treturn nil, codexUnsupportedStringValue(%q, string(item.Type))\n", typeName+".type")
	buffer.WriteString("\t}\n")
	buffer.WriteString("}\n\n")
	fmt.Fprintf(buffer, "func Decode%s(raw json.RawMessage) (%s, error) {\n", typeName, typeName)
	fmt.Fprintf(buffer, "\treturn decode%s(raw, %q)\n", typeName, typeName)
	buffer.WriteString("}\n\n")
	fmt.Fprintf(buffer, "func decode%s(raw json.RawMessage, name string) (%s, error) {\n", typeName, typeName)
	buffer.WriteString("\tfields, err := codexObjectFields(raw, name)\n")
	buffer.WriteString("\tif err != nil {\n")
	fmt.Fprintf(buffer, "\t\treturn %s{}, err\n", typeName)
	buffer.WriteString("\t}\n")
	buffer.WriteString("\ttypeText, err := codexStringField(fields, \"type\", name)\n")
	buffer.WriteString("\tif err != nil {\n")
	fmt.Fprintf(buffer, "\t\treturn %s{}, err\n", typeName)
	buffer.WriteString("\t}\n")
	fmt.Fprintf(buffer, "\ttypeValue := %sType(typeText)\n", typeName)
	fmt.Fprintf(buffer, "\titem := %s{Type: typeValue, Raw: append(json.RawMessage{}, raw...)}\n", typeName)
	buffer.WriteString("\tswitch typeValue {\n")
	for _, member := range members {
		fmt.Fprintf(buffer, "\tcase %s:\n", member.ConstName)
		fmt.Fprintf(buffer, "\t\tvalue, err := Decode%s(raw)\n", member.StructName)
		buffer.WriteString("\t\tif err != nil {\n")
		fmt.Fprintf(buffer, "\t\t\treturn %s{}, err\n", typeName)
		buffer.WriteString("\t\t}\n")
		fmt.Fprintf(buffer, "\t\titem.%s = &value\n", member.FieldName)
	}
	buffer.WriteString("\tdefault:\n")
	fmt.Fprintf(buffer, "\t\treturn %s{}, codexUnsupportedStringValue(name+\".type\", typeText)\n", typeName)
	buffer.WriteString("\t}\n")
	buffer.WriteString("\treturn item, nil\n")
	buffer.WriteString("}\n\n")
}
