package artifactdoc

import (
	"fmt"
	"math"
	"strings"
)

func (builder *compiler) compileExpression(current expression, schema ValueSchema, context scope) (any, bool) {
	if builder.fatal {
		return nil, false
	}
	resolved, restore, ok := builder.resolve(current, context)
	if !ok {
		return nil, false
	}
	defer restore()
	switch schema.Kind {
	case ValueKindString:
		return builder.compileString(resolved, schema, context)
	case ValueKindNumber:
		return builder.compileNumber(resolved, schema, context)
	case ValueKindBoolean:
		return builder.compileBoolean(resolved, context)
	case ValueKindEnum:
		return builder.compileEnum(resolved, schema, context)
	case ValueKindComponent:
		return builder.compileNestedComponent(resolved, schema, context)
	case ValueKindList:
		return builder.compileList(resolved, schema, context)
	case ValueKindObject:
		return builder.compileObject(resolved, schema, context)
	}
	// The catalog is a Go-owned constant, so an unhandled kind is a catalog bug
	// caught by the conformance suite, never model output.
	panic(fmt.Sprintf("artifactdoc: no compiler for value kind %q", schema.Kind))
}

func (builder *compiler) compileString(current expression, schema ValueSchema, context scope) (any, bool) {
	if current.kind != expressionString {
		builder.mismatch(current, context, "a string", `write the value as a quoted string, for example "Quarterly review"`)
		return nil, false
	}
	if failure := validateStringValue(schema, current.text); failure != nil {
		builder.failAt(failure.Code, current.position, context, failure.Message, failure.Correction)
		return nil, false
	}
	return current.text, true
}

func (builder *compiler) compileNumber(current expression, schema ValueSchema, context scope) (any, bool) {
	if current.kind != expressionNumber {
		builder.mismatch(current, context, "a number", "write the value as a plain finite number, for example 12 or -3.5")
		return nil, false
	}
	value := current.number
	if math.IsInf(value, 0) || math.IsNaN(value) {
		builder.failAt(CodeInvalidValue, current.position, context, "the number is not finite", "use a finite number")
		return nil, false
	}
	if schema.Integer && value != math.Trunc(value) {
		builder.failAt(CodeInvalidValue, current.position, context,
			fmt.Sprintf("%v is not a whole number", value), "use a whole number")
		return nil, false
	}
	if !builder.checkNumberRange(current, schema, context, value) {
		return nil, false
	}
	return value, true
}

func (builder *compiler) checkNumberRange(current expression, schema ValueSchema, context scope, value float64) bool {
	if schema.Minimum != nil && value < *schema.Minimum {
		builder.failAt(CodeInvalidValue, current.position, context,
			fmt.Sprintf("%v is below the minimum of %v", value, *schema.Minimum),
			fmt.Sprintf("use a value of at least %v", *schema.Minimum))
		return false
	}
	if schema.Maximum != nil && value > *schema.Maximum {
		builder.failAt(CodeInvalidValue, current.position, context,
			fmt.Sprintf("%v is above the maximum of %v", value, *schema.Maximum),
			fmt.Sprintf("use a value of at most %v", *schema.Maximum))
		return false
	}
	return true
}

func (builder *compiler) compileBoolean(current expression, context scope) (any, bool) {
	if current.kind != expressionBoolean {
		builder.mismatch(current, context, "a boolean", "write true or false")
		return nil, false
	}
	return current.boolean, true
}

func (builder *compiler) compileEnum(current expression, schema ValueSchema, context scope) (any, bool) {
	correction := "use one of: " + strings.Join(quoteAll(schema.EnumValues), ", ")
	if current.kind != expressionString {
		builder.mismatch(current, context, "a string", correction)
		return nil, false
	}
	for _, allowed := range schema.EnumValues {
		if current.text == allowed {
			return current.text, true
		}
	}
	builder.failAt(CodeInvalidValue, current.position, context,
		fmt.Sprintf("%q is not an accepted value", current.text), correction)
	return nil, false
}

func (builder *compiler) compileNestedComponent(current expression, schema ValueSchema, context scope) (any, bool) {
	node, ok := builder.compileComponent(current, schema.Components, context.deeper())
	if !ok {
		return nil, false
	}
	return node, true
}

func (builder *compiler) compileList(current expression, schema ValueSchema, context scope) (any, bool) {
	if current.kind != expressionArray {
		builder.mismatch(current, context, "an array", "write the value as an array, for example [ ... ]")
		return nil, false
	}
	if !builder.checkListLength(current, schema, context) {
		return nil, false
	}
	values := make([]any, 0, len(current.items))
	complete := true
	for _, item := range current.items {
		if item.kind == expressionNull {
			builder.failAt(CodeInvalidValue, item.position, context, "an array entry was null", "remove the entry instead of leaving a null in the array")
			complete = false
			continue
		}
		value, ok := builder.compileExpression(item, *schema.Element, context)
		if !ok {
			complete = false
			continue
		}
		values = append(values, value)
	}
	if !complete {
		return nil, false
	}
	return values, true
}

func (builder *compiler) checkListLength(current expression, schema ValueSchema, context scope) bool {
	count := len(current.items)
	if count < schema.MinItems {
		builder.failAt(CodeInvalidValue, current.position, context,
			fmt.Sprintf("the array has %d entries but needs at least %d", count, schema.MinItems),
			fmt.Sprintf("provide at least %d entries", schema.MinItems))
		return false
	}
	limit := effectiveMaxItems(schema)
	if count > limit {
		builder.failAt(CodeLimitExceeded, current.position, context,
			fmt.Sprintf("the array has %d entries, over the %d entry limit", count, limit),
			fmt.Sprintf("keep the array to %d entries, summarizing or splitting the rest", limit))
		return false
	}
	return true
}

func effectiveMaxItems(schema ValueSchema) int {
	if schema.MaxItems > 0 && schema.MaxItems < MaxArrayEntries {
		return schema.MaxItems
	}
	return MaxArrayEntries
}

func (builder *compiler) compileObject(current expression, schema ValueSchema, context scope) (any, bool) {
	if current.kind != expressionObject {
		builder.mismatch(current, context, "an object", "write the value as an object, for example "+objectShape(schema))
		return nil, false
	}
	members, complete := builder.indexObjectMembers(current, schema, context)
	values := make(map[string]any, len(schema.Fields))
	for _, field := range schema.Fields {
		member, present := members[field.Name]
		if !present || member.value.kind == expressionNull {
			complete = builder.requireField(current, schema, field, context) && complete
			continue
		}
		value, ok := builder.compileExpression(member.value, field.Schema, context)
		if !ok {
			complete = false
			continue
		}
		values[field.Name] = value
	}
	if !complete {
		return nil, false
	}
	return values, true
}

func (builder *compiler) indexObjectMembers(
	current expression,
	schema ValueSchema,
	context scope,
) (map[string]objectMember, bool) {
	members := make(map[string]objectMember, len(current.members))
	complete := true
	for _, member := range current.members {
		if _, duplicate := members[member.key]; duplicate {
			builder.failAt(CodeInvalidValue, member.position, context,
				fmt.Sprintf("the field %q appears twice", member.key), "give each field once")
			complete = false
			continue
		}
		if !hasField(schema, member.key) {
			builder.failAt(CodeInvalidValue, member.position, context,
				fmt.Sprintf("%q is not a field here", member.key),
				"use the object shape "+objectShape(schema))
			complete = false
			continue
		}
		members[member.key] = member
	}
	return members, complete
}

func (builder *compiler) requireField(current expression, schema ValueSchema, field ObjectField, context scope) bool {
	if !field.Required {
		return true
	}
	builder.failAt(CodeMissingProperty, current.position, context,
		fmt.Sprintf("the object is missing the required field %q", field.Name),
		"use the object shape "+objectShape(schema))
	return false
}

func hasField(schema ValueSchema, name string) bool {
	for _, field := range schema.Fields {
		if field.Name == name {
			return true
		}
	}
	return false
}

func (builder *compiler) mismatch(current expression, context scope, expected string, correction string) {
	builder.failAt(CodeInvalidValue, current.position, context,
		fmt.Sprintf("expected %s but found %s", expected, current.kind.label()), correction)
}

func quoteAll(values []string) []string {
	quoted := make([]string, 0, len(values))
	for _, value := range values {
		quoted = append(quoted, fmt.Sprintf("%q", value))
	}
	return quoted
}
