import type { ApprovalAnswer, StructuredInputRequest } from "@generated/backend";
import { Check, ExternalLink, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "./ui/button";

type StructuredFormFieldType =
  | "boolean"
  | "integer"
  | "multi_select"
  | "number"
  | "single_select"
  | "string";

interface StructuredFormOption {
  label: string;
  value: string;
}

interface StructuredFormField {
  id: string;
  title: string;
  description: string;
  required: boolean;
  type: StructuredFormFieldType;
  defaultValue: StructuredFormValue;
  format: string;
  maximum?: number;
  maxLength?: number;
  minimum?: number;
  minLength?: number;
  options: StructuredFormOption[];
}

interface StructuredFormSchemaView {
  errors: string[];
  fields: StructuredFormField[];
}

type StructuredFormValue = boolean | string | string[];
type StructuredFormValues = Record<string, StructuredFormValue>;
type SubmitStructuredApproval = (
  approved: boolean,
  answers: ApprovalAnswer[],
  cancelled: boolean,
) => Promise<void>;

export function StructuredInputApproval({
  input,
  submitApproval,
}: {
  input: StructuredInputRequest;
  submitApproval: SubmitStructuredApproval;
}) {
  switch (input.mode) {
    case "form":
      return <StructuredInputFormApproval input={input} submitApproval={submitApproval} />;
    case "url":
      return <StructuredInputURLApproval input={input} submitApproval={submitApproval} />;
    default:
      return assertNever(input.mode);
  }
}

function StructuredInputFormApproval({
  input,
  submitApproval,
}: {
  input: StructuredInputRequest;
  submitApproval: SubmitStructuredApproval;
}) {
  const schema = useMemo(() => parseStructuredInputSchema(input.schema), [input.schema]);
  const [valuesByField, setValuesByField] = useState<StructuredFormValues>(() =>
    initialStructuredFormValues(schema.fields),
  );
  const complete =
    schema.errors.length === 0 && structuredFormComplete(schema.fields, valuesByField);

  return (
    <div className="mt-3 space-y-3">
      <StructuredInputSchemaErrors errors={schema.errors} />
      {schema.errors.length === 0
        ? schema.fields.map((field) => (
            <StructuredFormFieldInput
              field={field}
              key={field.id}
              setValue={(value) =>
                setValuesByField((current) => ({ ...current, [field.id]: value }))
              }
              value={valuesByField[field.id] ?? field.defaultValue}
            />
          ))
        : null}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!complete}
          onClick={() =>
            void submitApproval(
              true,
              structuredApprovalAnswers(schema.fields, valuesByField),
              false,
            )
          }
          type="button"
          variant="primary"
        >
          <Check className="h-4 w-4" />
          Submit
        </Button>
        <Button
          onClick={() => void submitApproval(false, [], false)}
          type="button"
          variant="secondary"
        >
          <X className="h-4 w-4" />
          Decline
        </Button>
        <Button
          onClick={() => void submitApproval(false, [], true)}
          type="button"
          variant="secondary"
        >
          <X className="h-4 w-4" />
          Cancel
        </Button>
      </div>
    </div>
  );
}

function StructuredInputURLApproval({
  input,
  submitApproval,
}: {
  input: StructuredInputRequest;
  submitApproval: SubmitStructuredApproval;
}) {
  return (
    <div className="mt-3 space-y-3">
      <div className="break-all rounded border border-status-warning/40 bg-background px-3 py-2 font-mono text-xs text-foreground">
        {input.url}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => void window.setta.app.openExternalUrl(input.url)}
          type="button"
          variant="secondary"
        >
          <ExternalLink className="h-4 w-4" />
          Open
        </Button>
        <Button
          onClick={() => void submitApproval(true, [], false)}
          type="button"
          variant="primary"
        >
          <Check className="h-4 w-4" />
          Accept
        </Button>
        <Button
          onClick={() => void submitApproval(false, [], false)}
          type="button"
          variant="secondary"
        >
          <X className="h-4 w-4" />
          Decline
        </Button>
        <Button
          onClick={() => void submitApproval(false, [], true)}
          type="button"
          variant="secondary"
        >
          <X className="h-4 w-4" />
          Cancel
        </Button>
      </div>
    </div>
  );
}

function StructuredInputSchemaErrors({ errors }: { errors: string[] }) {
  if (errors.length === 0) {
    return null;
  }
  return (
    <div className="space-y-1 font-medium text-status-critical">
      {errors.map((error) => (
        <div key={error}>{error}</div>
      ))}
    </div>
  );
}

function StructuredFormFieldInput({
  field,
  setValue,
  value,
}: {
  field: StructuredFormField;
  setValue: (value: StructuredFormValue) => void;
  value: StructuredFormValue;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block font-medium">{field.title}</span>
      {field.description ? (
        <span className="block text-xs text-muted-foreground">{field.description}</span>
      ) : null}
      <StructuredFormFieldControl field={field} setValue={setValue} value={value} />
    </label>
  );
}

function StructuredFormFieldControl({
  field,
  setValue,
  value,
}: {
  field: StructuredFormField;
  setValue: (value: StructuredFormValue) => void;
  value: StructuredFormValue;
}) {
  switch (field.type) {
    case "boolean":
      return (
        <input
          checked={structuredValueAsBoolean(value)}
          className="h-4 w-4 rounded border-status-warning bg-background accent-primary"
          data-testid={`structured-input-field-${field.id}`}
          onChange={(event) => setValue(event.target.checked)}
          type="checkbox"
        />
      );
    case "single_select":
      return (
        <select
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
          data-testid={`structured-input-field-${field.id}`}
          onChange={(event) => setValue(event.target.value)}
          value={structuredValueAsString(value)}
        >
          <option value="">Select</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    case "multi_select":
      return <StructuredMultiSelectField field={field} setValue={setValue} value={value} />;
    case "integer":
    case "number":
      return (
        <input
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
          data-testid={`structured-input-field-${field.id}`}
          max={field.maximum}
          min={field.minimum}
          onChange={(event) => setValue(event.target.value)}
          step={field.type === "integer" ? 1 : undefined}
          type="number"
          value={structuredValueAsString(value)}
        />
      );
    case "string":
      return (
        <input
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
          data-testid={`structured-input-field-${field.id}`}
          maxLength={field.maxLength}
          minLength={field.minLength}
          onChange={(event) => setValue(event.target.value)}
          type={structuredTextInputType(field.format)}
          value={structuredValueAsString(value)}
        />
      );
    default:
      return assertNever(field.type);
  }
}

function StructuredMultiSelectField({
  field,
  setValue,
  value,
}: {
  field: StructuredFormField;
  setValue: (value: StructuredFormValue) => void;
  value: StructuredFormValue;
}) {
  const selected = structuredValueAsStringArray(value);
  return (
    <div className="flex flex-wrap gap-2" data-testid={`structured-input-field-${field.id}`}>
      {field.options.map((option) => (
        <label
          className="inline-flex items-center gap-2 rounded border border-input bg-background px-2 py-1 text-foreground"
          key={option.value}
        >
          <input
            checked={selected.includes(option.value)}
            className="h-4 w-4 rounded border-status-warning bg-background accent-primary"
            onChange={() => setValue(toggledStructuredMultiValue(selected, option.value))}
            type="checkbox"
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

function parseStructuredInputSchema(schema: unknown): StructuredFormSchemaView {
  const record = recordOrNull(schema);
  if (record === null || record.type !== "object") {
    return { errors: ["Structured input schema must be an object."], fields: [] };
  }
  const properties = recordOrNull(record.properties);
  if (properties === null) {
    return { errors: ["Structured input schema is missing properties."], fields: [] };
  }

  const required = stringSet(record.required);
  const fields: StructuredFormField[] = [];
  const errors: string[] = [];
  for (const [id, rawField] of Object.entries(properties)) {
    const field = parseStructuredFormField(id, rawField, required.has(id));
    if (typeof field === "string") {
      errors.push(field);
    } else {
      fields.push(field);
    }
  }
  return { errors, fields };
}

function parseStructuredFormField(
  id: string,
  schema: unknown,
  required: boolean,
): StructuredFormField | string {
  const record = recordOrNull(schema);
  if (record === null) {
    return `Structured input field ${id} must be an object.`;
  }
  const base = structuredFieldBase(id, record, required);
  switch (record.type) {
    case "string":
      return parseStructuredStringField(record, base);
    case "number":
    case "integer":
      return parseStructuredNumberField(record, base, record.type);
    case "boolean":
      return parseStructuredBooleanField(record, base);
    case "array":
      return parseStructuredArrayField(id, record, base);
    default:
      return `Structured input field ${id} has unsupported type ${JSON.stringify(record.type)}.`;
  }
}

function parseStructuredStringField(
  schema: Record<string, unknown>,
  base: StructuredFormFieldBase,
): StructuredFormField {
  const options = singleSelectOptions(schema);
  if (options.length > 0) {
    return {
      ...base,
      defaultValue: defaultSingleSelectValue(schema.default, options),
      options,
      type: "single_select",
    };
  }
  return {
    ...base,
    defaultValue: stringValue(schema.default) ?? "",
    format: stringValue(schema.format) ?? "",
    maxLength: integerValue(schema.maxLength),
    minLength: integerValue(schema.minLength),
    options: [],
    type: "string",
  };
}

function parseStructuredNumberField(
  schema: Record<string, unknown>,
  base: StructuredFormFieldBase,
  type: "integer" | "number",
): StructuredFormField {
  return {
    ...base,
    defaultValue: defaultNumberValue(schema.default),
    maximum: numberValue(schema.maximum),
    minimum: numberValue(schema.minimum),
    options: [],
    type,
  };
}

function parseStructuredBooleanField(
  schema: Record<string, unknown>,
  base: StructuredFormFieldBase,
): StructuredFormField {
  return {
    ...base,
    defaultValue: booleanValue(schema.default) ?? false,
    options: [],
    type: "boolean",
  };
}

function parseStructuredArrayField(
  id: string,
  schema: Record<string, unknown>,
  base: StructuredFormFieldBase,
): StructuredFormField | string {
  const options = multiSelectOptions(schema);
  if (options.length === 0) {
    return `Structured input field ${id} has an unsupported array schema.`;
  }
  return {
    ...base,
    defaultValue: defaultMultiSelectValue(schema.default, options),
    options,
    type: "multi_select",
  };
}

type StructuredFormFieldBase = Omit<StructuredFormField, "defaultValue" | "options" | "type">;

function structuredFieldBase(
  id: string,
  schema: Record<string, unknown>,
  required: boolean,
): StructuredFormFieldBase {
  return {
    description: stringValue(schema.description) ?? "",
    format: "",
    id,
    required,
    title: stringValue(schema.title) ?? id,
  };
}

function initialStructuredFormValues(fields: StructuredFormField[]): StructuredFormValues {
  const values: StructuredFormValues = {};
  for (const field of fields) {
    values[field.id] = field.defaultValue;
  }
  return values;
}

function structuredFormComplete(fields: StructuredFormField[], values: StructuredFormValues) {
  return fields.every((field) => {
    const value = values[field.id] ?? field.defaultValue;
    if (field.required) {
      return structuredFieldComplete(field, value);
    }
    return structuredOptionalFieldValid(field, value);
  });
}

function structuredFieldComplete(field: StructuredFormField, value: StructuredFormValue) {
  switch (field.type) {
    case "boolean":
      return true;
    case "integer":
      return structuredIntegerValid(value);
    case "number":
      return structuredNumberValid(value);
    case "multi_select":
      return structuredValueAsStringArray(value).length > 0;
    case "single_select":
    case "string":
      return structuredValueAsString(value).trim() !== "";
    default:
      return assertNever(field.type);
  }
}

function structuredOptionalFieldValid(field: StructuredFormField, value: StructuredFormValue) {
  if (field.type !== "integer" && field.type !== "number") {
    return true;
  }
  if (structuredValueAsString(value).trim() === "") {
    return true;
  }
  return structuredFieldComplete(field, value);
}

function structuredIntegerValid(value: StructuredFormValue) {
  const text = structuredValueAsString(value).trim();
  return text !== "" && Number.isInteger(Number(text));
}

function structuredNumberValid(value: StructuredFormValue) {
  const text = structuredValueAsString(value).trim();
  return text !== "" && Number.isFinite(Number(text));
}

function structuredApprovalAnswers(
  fields: StructuredFormField[],
  values: StructuredFormValues,
): ApprovalAnswer[] {
  const answers: ApprovalAnswer[] = [];
  for (const field of fields) {
    const value = structuredSubmissionValue(field, values[field.id] ?? field.defaultValue);
    if (value === undefined) {
      continue;
    }
    answers.push({ answers: [], questionId: field.id, value });
  }
  return answers;
}

function structuredSubmissionValue(
  field: StructuredFormField,
  value: StructuredFormValue,
): unknown | undefined {
  switch (field.type) {
    case "boolean":
      return structuredValueAsBoolean(value);
    case "integer":
    case "number":
      return structuredNumericSubmissionValue(field, value);
    case "multi_select":
      return structuredArraySubmissionValue(field, value);
    case "single_select":
    case "string":
      return structuredStringSubmissionValue(field, value);
    default:
      return assertNever(field.type);
  }
}

function structuredNumericSubmissionValue(field: StructuredFormField, value: StructuredFormValue) {
  const text = structuredValueAsString(value);
  if (!field.required && text.trim() === "") {
    return undefined;
  }
  return Number(text);
}

function structuredArraySubmissionValue(field: StructuredFormField, value: StructuredFormValue) {
  const selected = structuredValueAsStringArray(value);
  if (!field.required && selected.length === 0) {
    return undefined;
  }
  return selected;
}

function structuredStringSubmissionValue(field: StructuredFormField, value: StructuredFormValue) {
  const text = structuredValueAsString(value);
  if (!field.required && text.trim() === "") {
    return undefined;
  }
  return text;
}

function singleSelectOptions(schema: Record<string, unknown>) {
  const oneOf = constOptions(schema.oneOf);
  if (oneOf.length > 0) {
    return oneOf;
  }
  return enumOptions(schema.enum, schema.enumNames);
}

function multiSelectOptions(schema: Record<string, unknown>) {
  const items = recordOrNull(schema.items);
  if (items === null) {
    return [];
  }
  const anyOf = constOptions(items.anyOf);
  if (anyOf.length > 0) {
    return anyOf;
  }
  return enumOptions(items.enum, undefined);
}

function constOptions(value: unknown): StructuredFormOption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const options: StructuredFormOption[] = [];
  for (const item of value) {
    const record = recordOrNull(item);
    if (record === null) {
      continue;
    }
    const optionValue = stringValue(record.const);
    if (optionValue === null) {
      continue;
    }
    options.push({ label: stringValue(record.title) ?? optionValue, value: optionValue });
  }
  return options;
}

function enumOptions(values: unknown, names: unknown): StructuredFormOption[] {
  const enumValues = stringArray(values);
  const enumNames = stringArray(names);
  return enumValues.map((value, index) => ({
    label: enumNames[index] ?? value,
    value,
  }));
}

function defaultSingleSelectValue(value: unknown, options: StructuredFormOption[]) {
  const text = stringValue(value);
  if (text === null) {
    return "";
  }
  return options.some((option) => option.value === text) ? text : "";
}

function defaultMultiSelectValue(value: unknown, options: StructuredFormOption[]) {
  const allowed = new Set(options.map((option) => option.value));
  return stringArray(value).filter((item) => allowed.has(item));
}

function defaultNumberValue(value: unknown) {
  const number = numberValue(value);
  return number === undefined ? "" : String(number);
}

function structuredValueAsString(value: StructuredFormValue) {
  return typeof value === "string" ? value : "";
}

function structuredValueAsBoolean(value: StructuredFormValue) {
  return typeof value === "boolean" ? value : false;
}

function structuredValueAsStringArray(value: StructuredFormValue) {
  return Array.isArray(value) ? value : [];
}

function toggledStructuredMultiValue(values: string[], option: string) {
  return values.includes(option) ? values.filter((value) => value !== option) : [...values, option];
}

function structuredTextInputType(format: string) {
  switch (format) {
    case "date":
      return "date";
    case "date-time":
      return "datetime-local";
    case "email":
      return "email";
    case "uri":
      return "url";
    default:
      return "text";
  }
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function integerValue(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function stringSet(value: unknown) {
  return new Set(stringArray(value));
}

function assertNever(value: never): never {
  throw new Error(`Unhandled generated value: ${JSON.stringify(value)}`);
}
