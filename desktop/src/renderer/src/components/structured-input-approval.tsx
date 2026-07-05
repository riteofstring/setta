import type { ApprovalAnswer, StructuredInputRequest } from "@generated/backend";
import { Check, ExternalLink, X } from "lucide-react";
import type { FormEvent } from "react";
import { useMemo } from "react";

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

  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={(event) => handleStructuredFormSubmit(event, schema.fields, submitApproval)}
    >
      <StructuredInputSchemaErrors errors={schema.errors} />
      {schema.errors.length === 0
        ? schema.fields.map((field) => <StructuredFormFieldInput field={field} key={field.id} />)
        : null}
      <div className="flex flex-wrap gap-2">
        <Button
          aria-label="Submit structured input"
          disabled={schema.errors.length > 0}
          type="submit"
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
    </form>
  );
}

function handleStructuredFormSubmit(
  event: FormEvent<HTMLFormElement>,
  fields: StructuredFormField[],
  submitApproval: SubmitStructuredApproval,
) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = structuredFormValuesFromFormData(fields, new FormData(form));
  if (!structuredFormComplete(fields, values)) {
    focusFirstIncompleteStructuredField(form, fields, values);
    return;
  }
  void submitApproval(true, structuredApprovalAnswers(fields, values), false);
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

function StructuredFormFieldInput({ field }: { field: StructuredFormField }) {
  return (
    <label className="block space-y-1.5">
      <span className="block font-medium">{field.title}</span>
      {field.description ? (
        <span className="block text-xs text-muted-foreground">{field.description}</span>
      ) : null}
      <StructuredFormFieldControl field={field} />
    </label>
  );
}

function StructuredFormFieldControl({ field }: { field: StructuredFormField }) {
  switch (field.type) {
    case "boolean":
      return (
        <input
          className="h-4 w-4 rounded border-status-warning bg-background accent-primary"
          data-testid={`structured-input-field-${field.id}`}
          defaultChecked={structuredValueAsBoolean(field.defaultValue)}
          name={field.id}
          type="checkbox"
          value="true"
        />
      );
    case "single_select":
      return (
        <select
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
          data-testid={`structured-input-field-${field.id}`}
          defaultValue={structuredValueAsString(field.defaultValue)}
          name={field.id}
          required={field.required}
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
      return <StructuredMultiSelectField field={field} />;
    case "integer":
    case "number":
      return (
        <input
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
          data-testid={`structured-input-field-${field.id}`}
          defaultValue={structuredValueAsString(field.defaultValue)}
          max={field.maximum}
          min={field.minimum}
          name={field.id}
          required={field.required}
          step={field.type === "integer" ? 1 : undefined}
          type="number"
        />
      );
    case "string":
      return (
        <input
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
          data-testid={`structured-input-field-${field.id}`}
          defaultValue={structuredValueAsString(field.defaultValue)}
          maxLength={field.maxLength}
          minLength={field.minLength}
          name={field.id}
          required={field.required}
          type={structuredTextInputType(field.format)}
        />
      );
    default:
      return assertNever(field.type);
  }
}

function StructuredMultiSelectField({ field }: { field: StructuredFormField }) {
  const selected = structuredValueAsStringArray(field.defaultValue);
  return (
    <div className="flex flex-wrap gap-2" data-testid={`structured-input-field-${field.id}`}>
      {field.options.map((option) => (
        <label
          className="inline-flex items-center gap-2 rounded border border-input bg-background px-2 py-1 text-foreground"
          key={option.value}
        >
          <input
            className="h-4 w-4 rounded border-status-warning bg-background accent-primary"
            defaultChecked={selected.includes(option.value)}
            name={field.id}
            type="checkbox"
            value={option.value}
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

function structuredFormValuesFromFormData(
  fields: StructuredFormField[],
  formData: FormData,
): StructuredFormValues {
  const valuesByField: StructuredFormValues = {};
  for (const field of fields) {
    valuesByField[field.id] = structuredFieldValueFromFormData(field, formData);
  }
  return valuesByField;
}

function structuredFieldValueFromFormData(
  field: StructuredFormField,
  formData: FormData,
): StructuredFormValue {
  switch (field.type) {
    case "boolean":
      return formData.has(field.id);
    case "integer":
    case "number":
    case "single_select":
    case "string":
      return stringFormValue(formData.get(field.id));
    case "multi_select":
      return formData.getAll(field.id).filter((value): value is string => {
        return typeof value === "string";
      });
    default:
      return assertNever(field.type);
  }
}

function stringFormValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

function focusFirstIncompleteStructuredField(
  form: HTMLFormElement,
  fields: StructuredFormField[],
  values: StructuredFormValues,
) {
  const field = fields.find((item) => {
    const value = values[item.id] ?? item.defaultValue;
    return item.required
      ? !structuredFieldComplete(item, value)
      : !structuredOptionalFieldValid(item, value);
  });
  if (field === undefined) {
    return;
  }
  focusStructuredField(form, field.id);
}

function focusStructuredField(form: HTMLFormElement, fieldId: string) {
  const control = Array.from(form.elements).find((element) => {
    return element instanceof HTMLElement && element.getAttribute("name") === fieldId;
  });
  if (control instanceof HTMLElement) {
    control.focus();
  }
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
