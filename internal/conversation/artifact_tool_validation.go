package conversation

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"strings"

	"setta/internal/agent"
)

func decodeEmitArtifactInput(arguments json.RawMessage) (emitArtifactInput, error) {
	fields, err := decodeEmitArtifactArgumentFields(arguments)
	if err != nil {
		return emitArtifactInput{}, err
	}
	if err := rejectUnknownEmitArtifactFields(fields); err != nil {
		return emitArtifactInput{}, err
	}
	kind, err := decodeRequiredEmitArtifactStringField(fields, "kind", "artifact kind")
	if err != nil {
		return emitArtifactInput{}, err
	}
	if !validArtifactKind(ArtifactKind(kind)) {
		return emitArtifactInput{}, newArtifactToolFailureError(
			artifactToolFailureInvalidBranch,
			fmt.Sprintf("unsupported artifact kind %s", kind),
			true,
			[]agent.DynamicToolFieldError{{Field: "kind", Message: "Choose one of markdown, table, bar_chart, or file."}},
			nil,
		)
	}
	input := emitArtifactInput{Kind: ArtifactKind(kind)}
	if err := validateEmitArtifactInputBranchFields(input.Kind, fields); err != nil {
		return emitArtifactInput{}, err
	}
	title, err := decodeRequiredEmitArtifactStringField(fields, "title", "artifact title")
	if err != nil {
		return emitArtifactInput{}, err
	}
	input.Title = title
	if err := validateRequiredEmitArtifactToolText("title", "artifact title", input.Title); err != nil {
		return emitArtifactInput{}, err
	}
	if err := decodeEmitArtifactPayloadFields(fields, &input); err != nil {
		return emitArtifactInput{}, err
	}
	if err := validateEmitArtifactInputPayload(input); err != nil {
		return emitArtifactInput{}, err
	}
	return input, nil
}

func decodeEmitArtifactArgumentFields(arguments json.RawMessage) (map[string]json.RawMessage, error) {
	if len(arguments) == 0 {
		return nil, newArtifactToolFailureError(
			artifactToolFailureMissingRequiredFields,
			"emit_artifact arguments are required",
			true,
			[]agent.DynamicToolFieldError{{Field: "arguments", Message: "Provide a JSON object."}},
			nil,
		)
	}
	decoder := json.NewDecoder(bytes.NewReader(arguments))
	var fields map[string]json.RawMessage
	if err := decoder.Decode(&fields); err != nil || fields == nil {
		return nil, newArtifactToolFailureError(
			artifactToolFailureInvalidArguments,
			"emit_artifact arguments must be a strict JSON object",
			true,
			[]agent.DynamicToolFieldError{{Field: "arguments", Message: "Provide one JSON object."}},
			err,
		)
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return nil, newArtifactToolFailureError(
			artifactToolFailureInvalidArguments,
			"emit_artifact arguments must contain exactly one JSON object",
			true,
			[]agent.DynamicToolFieldError{{Field: "arguments", Message: "Remove trailing JSON values."}},
			err,
		)
	}
	return fields, nil
}

func rejectUnknownEmitArtifactFields(fields map[string]json.RawMessage) error {
	allowed := map[string]bool{"kind": true, "title": true}
	for _, name := range emitArtifactInputPayloadFields() {
		allowed[name] = true
	}
	for name := range fields {
		if allowed[name] {
			continue
		}
		return newArtifactToolFailureError(
			artifactToolFailureInvalidBranch,
			fmt.Sprintf("unknown field %s is not supported by emit_artifact", name),
			true,
			[]agent.DynamicToolFieldError{{Field: name, Message: "Remove this field or choose a branch that declares it."}},
			nil,
		)
	}
	return nil
}

func decodeRequiredEmitArtifactStringField(
	fields map[string]json.RawMessage,
	name string,
	label string,
) (string, error) {
	raw, ok := fields[name]
	if !ok {
		return "", missingEmitArtifactFieldsError("", []string{name})
	}
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return "", newArtifactToolFailureError(
			artifactToolFailureInvalidField,
			fmt.Sprintf("%s must be a string", label),
			true,
			[]agent.DynamicToolFieldError{{Field: name, Message: fmt.Sprintf("%s must be a string.", label)}},
			err,
		)
	}
	return value, nil
}

func validateEmitArtifactInputBranchFields(
	kind ArtifactKind,
	fields map[string]json.RawMessage,
) error {
	branch, _ := emitArtifactBranchSpecForKind(kind)
	missing := []string{}
	if _, ok := fields["title"]; !ok {
		missing = append(missing, "title")
	}
	for _, name := range branch.Required {
		if _, ok := fields[name]; !ok {
			missing = append(missing, name)
		}
	}
	if len(missing) > 0 {
		return missingEmitArtifactFieldsError(kind, missing)
	}
	allowed := map[string]bool{}
	for _, name := range branch.Required {
		allowed[name] = true
	}
	for _, name := range branch.Optional {
		allowed[name] = true
	}
	for _, name := range emitArtifactInputPayloadFields() {
		if _, present := fields[name]; present && !allowed[name] {
			return newArtifactToolFailureError(
				artifactToolFailureInvalidBranch,
				fmt.Sprintf("%s is not valid for this artifact kind", name),
				true,
				[]agent.DynamicToolFieldError{{Field: name, Message: fmt.Sprintf("%s artifacts do not accept this field.", kind)}},
				nil,
			)
		}
	}
	return nil
}

func decodeEmitArtifactPayloadFields(fields map[string]json.RawMessage, input *emitArtifactInput) error {
	var err error
	switch input.Kind {
	case ArtifactKindMarkdown:
		input.Markdown, err = decodeEmitArtifactField[string](fields, "markdown")
	case ArtifactKindTable:
		input.Columns, err = decodeEmitArtifactField[[]ArtifactTableColumn](fields, "columns")
		if err == nil {
			input.Rows, err = decodeEmitArtifactField[[][]string](fields, "rows")
		}
	case ArtifactKindBarChart:
		input.Items, err = decodeEmitArtifactField[[]BarChartArtifactItem](fields, "items")
	case ArtifactKindFile:
		input.Path, err = decodeEmitArtifactField[string](fields, "path")
		if err == nil && fields["description"] != nil {
			input.Description, err = decodeEmitArtifactField[string](fields, "description")
		}
	default:
		err = newArtifactToolFailureError(
			artifactToolFailureInvalidBranch,
			fmt.Sprintf("unsupported artifact kind %s", input.Kind),
			true,
			[]agent.DynamicToolFieldError{{Field: "kind", Message: "Choose one of markdown, table, bar_chart, or file."}},
			nil,
		)
	}
	return err
}

func decodeEmitArtifactField[T any](
	fields map[string]json.RawMessage,
	name string,
) (*T, error) {
	raw, ok := fields[name]
	if !ok {
		return nil, nil
	}
	var value T
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, newArtifactToolFailureError(
			artifactToolFailureInvalidField,
			fmt.Sprintf("emit_artifact field %s has an invalid shape", name),
			true,
			[]agent.DynamicToolFieldError{{Field: name, Message: "Provide the shape declared by this artifact branch."}},
			err,
		)
	}
	return &value, nil
}

func validateEmitArtifactInputPayload(input emitArtifactInput) error {
	switch input.Kind {
	case ArtifactKindMarkdown:
		return validateEmitArtifactMarkdownPayload(input)
	case ArtifactKindTable:
		return validateEmitArtifactTablePayload(input)
	case ArtifactKindBarChart:
		return validateEmitArtifactBarChartPayload(input)
	case ArtifactKindFile:
		return validateEmitArtifactFilePayload(input)
	default:
		return newArtifactToolFailureError(
			artifactToolFailureInvalidBranch,
			fmt.Sprintf("unsupported artifact kind %s", input.Kind),
			true,
			[]agent.DynamicToolFieldError{{Field: "kind", Message: "Choose one of markdown, table, bar_chart, or file."}},
			nil,
		)
	}
}

func validateEmitArtifactMarkdownPayload(input emitArtifactInput) error {
	if input.Markdown == nil {
		return missingEmitArtifactFieldsError(input.Kind, []string{"markdown"})
	}
	if err := validateRequiredEmitArtifactToolText("markdown", "markdown artifact markdown", *input.Markdown); err != nil {
		return err
	}
	if len([]byte(*input.Markdown)) > MaxMarkdownArtifactBytes {
		return newArtifactToolFailureError(
			artifactToolFailurePayloadLimitExceeded,
			fmt.Sprintf("markdown artifact exceeds %d bytes", MaxMarkdownArtifactBytes),
			true,
			[]agent.DynamicToolFieldError{{Field: "markdown", Message: fmt.Sprintf("Keep markdown at or below %d bytes.", MaxMarkdownArtifactBytes)}},
			nil,
		)
	}
	return nil
}

func validateEmitArtifactTablePayload(input emitArtifactInput) error {
	columns, rows, err := requireEmitArtifactTablePayload(input)
	if err != nil {
		return err
	}
	if err := validateEmitArtifactTableSize(columns, rows); err != nil {
		return err
	}
	if err := validateEmitArtifactTableColumns(columns); err != nil {
		return err
	}
	return validateEmitArtifactTableRows(rows, len(columns))
}

func requireEmitArtifactTablePayload(input emitArtifactInput) ([]ArtifactTableColumn, [][]string, error) {
	if input.Columns != nil && input.Rows != nil {
		return *input.Columns, *input.Rows, nil
	}
	missing := []string{}
	if input.Columns == nil {
		missing = append(missing, "columns")
	}
	if input.Rows == nil {
		missing = append(missing, "rows")
	}
	return nil, nil, missingEmitArtifactFieldsError(input.Kind, missing)
}

func validateEmitArtifactTableSize(columns []ArtifactTableColumn, rows [][]string) error {
	if len(columns) == 0 {
		return newArtifactToolFailureError(
			artifactToolFailureMissingRequiredFields,
			"table artifact requires at least one column",
			true,
			[]agent.DynamicToolFieldError{{Field: "columns", Message: "Provide at least one table column."}},
			nil,
		)
	}
	if len(columns) > MaxTableArtifactColumns {
		return newArtifactToolFailureError(
			artifactToolFailurePayloadLimitExceeded,
			fmt.Sprintf("table artifact has %d columns, cap is %d", len(columns), MaxTableArtifactColumns),
			true,
			[]agent.DynamicToolFieldError{{Field: "columns", Message: fmt.Sprintf("Provide no more than %d columns.", MaxTableArtifactColumns)}},
			nil,
		)
	}
	if len(rows) > MaxTableArtifactRows {
		return newArtifactToolFailureError(
			artifactToolFailurePayloadLimitExceeded,
			fmt.Sprintf("table artifact has %d rows, cap is %d", len(rows), MaxTableArtifactRows),
			true,
			[]agent.DynamicToolFieldError{{Field: "rows", Message: fmt.Sprintf("Provide no more than %d rows.", MaxTableArtifactRows)}},
			nil,
		)
	}
	return nil
}

func validateEmitArtifactTableColumns(columns []ArtifactTableColumn) error {
	seen := map[string]bool{}
	for index, column := range columns {
		keyField := fmt.Sprintf("columns[%d].key", index)
		if err := validateRequiredEmitArtifactToolText(keyField, fmt.Sprintf("table artifact column[%d].key", index), column.Key); err != nil {
			return err
		}
		labelField := fmt.Sprintf("columns[%d].label", index)
		if err := validateRequiredEmitArtifactToolText(labelField, fmt.Sprintf("table artifact column[%d].label", index), column.Label); err != nil {
			return err
		}
		if seen[column.Key] {
			return newArtifactToolFailureError(
				artifactToolFailureInvalidField,
				"table artifact column keys must be unique",
				true,
				[]agent.DynamicToolFieldError{{Field: keyField, Message: "Use a unique column key."}},
				nil,
			)
		}
		seen[column.Key] = true
	}
	return nil
}

func validateEmitArtifactTableRows(rows [][]string, columnCount int) error {
	for index, row := range rows {
		if len(row) != columnCount {
			return newArtifactToolFailureError(
				artifactToolFailureRowWidthMismatch,
				fmt.Sprintf("table artifact row[%d] has %d cells, want %d", index, len(row), columnCount),
				true,
				[]agent.DynamicToolFieldError{{
					Field:   fmt.Sprintf("rows[%d]", index),
					Message: fmt.Sprintf("Provide exactly %d cells to match the table columns.", columnCount),
				}},
				nil,
			)
		}
	}
	return nil
}

func validateEmitArtifactBarChartPayload(input emitArtifactInput) error {
	if input.Items == nil {
		return missingEmitArtifactFieldsError(input.Kind, []string{"items"})
	}
	items := *input.Items
	if len(items) == 0 {
		return newArtifactToolFailureError(
			artifactToolFailureMissingRequiredFields,
			"bar chart artifact requires at least one item",
			true,
			[]agent.DynamicToolFieldError{{Field: "items", Message: "Provide at least one bar chart item."}},
			nil,
		)
	}
	if len(items) > MaxBarChartArtifactItems {
		return newArtifactToolFailureError(
			artifactToolFailurePayloadLimitExceeded,
			fmt.Sprintf("bar chart artifact has %d items, cap is %d", len(items), MaxBarChartArtifactItems),
			true,
			[]agent.DynamicToolFieldError{{Field: "items", Message: fmt.Sprintf("Provide no more than %d items.", MaxBarChartArtifactItems)}},
			nil,
		)
	}
	for index, item := range items {
		if err := validateEmitArtifactBarChartItem(index, item); err != nil {
			return err
		}
	}
	return nil
}

func validateEmitArtifactBarChartItem(index int, item BarChartArtifactItem) error {
	labelField := fmt.Sprintf("items[%d].label", index)
	if err := validateRequiredEmitArtifactToolText(labelField, fmt.Sprintf("bar chart artifact item[%d].label", index), item.Label); err != nil {
		return err
	}
	if math.IsNaN(item.Value) || math.IsInf(item.Value, 0) {
		return newArtifactToolFailureError(
			artifactToolFailureInvalidField,
			fmt.Sprintf("bar chart artifact item[%d].value must be finite", index),
			true,
			[]agent.DynamicToolFieldError{{Field: fmt.Sprintf("items[%d].value", index), Message: "Provide a finite non-negative number."}},
			nil,
		)
	}
	if item.Value < 0 {
		return newArtifactToolFailureError(
			artifactToolFailureInvalidField,
			fmt.Sprintf("bar chart artifact item[%d].value must be non-negative", index),
			true,
			[]agent.DynamicToolFieldError{{Field: fmt.Sprintf("items[%d].value", index), Message: "Provide a non-negative number."}},
			nil,
		)
	}
	if item.Unit != nil {
		field := fmt.Sprintf("items[%d].unit", index)
		return validateOptionalEmitArtifactToolText(field, fmt.Sprintf("bar chart artifact item[%d].unit", index), item.Unit)
	}
	return nil
}

func validateEmitArtifactFilePayload(input emitArtifactInput) error {
	if input.Path == nil {
		return missingEmitArtifactFieldsError(input.Kind, []string{"path"})
	}
	if err := validateRequiredEmitArtifactToolText("path", "file artifact path", *input.Path); err != nil {
		return err
	}
	if input.Description != nil {
		return validateOptionalEmitArtifactToolText("description", "file artifact description", input.Description)
	}
	return nil
}

func validateRequiredEmitArtifactToolText(field string, label string, value string) error {
	if strings.TrimSpace(value) == "" {
		return newArtifactToolFailureError(
			artifactToolFailureMissingRequiredFields,
			fmt.Sprintf("%s is required", label),
			true,
			[]agent.DynamicToolFieldError{{Field: field, Message: fmt.Sprintf("%s is required.", label)}},
			nil,
		)
	}
	if strings.TrimSpace(value) != value {
		return newArtifactToolFailureError(
			artifactToolFailureInvalidField,
			fmt.Sprintf("%s must not have surrounding whitespace", label),
			true,
			[]agent.DynamicToolFieldError{{Field: field, Message: "Remove surrounding whitespace."}},
			nil,
		)
	}
	return nil
}

func validateOptionalEmitArtifactToolText(field string, label string, value *string) error {
	if value == nil {
		return nil
	}
	if strings.TrimSpace(*value) != *value {
		return newArtifactToolFailureError(
			artifactToolFailureInvalidField,
			fmt.Sprintf("%s must not have surrounding whitespace", label),
			true,
			[]agent.DynamicToolFieldError{{Field: field, Message: "Remove surrounding whitespace."}},
			nil,
		)
	}
	return nil
}

func missingEmitArtifactFieldsError(kind ArtifactKind, fields []string) error {
	fieldErrors := make([]agent.DynamicToolFieldError, 0, len(fields))
	for _, field := range fields {
		fieldErrors = append(fieldErrors, agent.DynamicToolFieldError{
			Field:   field,
			Message: missingEmitArtifactFieldMessage(kind, field),
		})
	}
	return newArtifactToolFailureError(
		artifactToolFailureMissingRequiredFields,
		missingEmitArtifactFieldsMessage(kind, fields),
		true,
		fieldErrors,
		nil,
	)
}

func missingEmitArtifactFieldMessage(kind ArtifactKind, field string) string {
	if field == "kind" {
		return "artifact kind is required."
	}
	if field == "title" {
		return "artifact title is required."
	}
	if kind == "" {
		return fmt.Sprintf("emit_artifact arguments require %s.", field)
	}
	return fmt.Sprintf("%s artifact requires %s.", kind, field)
}

func missingEmitArtifactFieldsMessage(kind ArtifactKind, fields []string) string {
	if len(fields) == 1 {
		field := fields[0]
		if field == "kind" {
			return "artifact kind is required"
		}
		if field == "title" {
			return "artifact title is required"
		}
		if kind == "" {
			return fmt.Sprintf("emit_artifact arguments require %s", field)
		}
		return fmt.Sprintf("%s artifact requires %s", kind, field)
	}
	if kind == "" {
		return fmt.Sprintf("emit_artifact arguments require %s", strings.Join(fields, ", "))
	}
	return fmt.Sprintf("%s artifact requires %s", kind, strings.Join(fields, ", "))
}
