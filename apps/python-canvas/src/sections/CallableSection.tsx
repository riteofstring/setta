import { useEffect, useId, useRef, useState } from "react";
import {
  PARAMETER_PASSING_STYLE_KEYWORD_ONLY_V2,
  PARAMETER_PASSING_STYLE_POSITIONAL_ONLY_V2,
  PARAMETER_PASSING_STYLE_POSITIONAL_OR_KEYWORD_V2,
  PARAMETER_PASSING_STYLE_VARIADIC_KEYWORD_V2,
  PARAMETER_PASSING_STYLE_VARIADIC_POSITIONAL_V2,
  PROVIDER_BASEDPYRIGHT_V2,
  type ParameterPassingStyleV2,
  type ProviderAvailabilityV2,
  type ProviderLifecycleStateV2,
} from "../backend/generatedContract";
import {
  ItemNameEditor,
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  TextValueEditor,
  WorkspaceItemLabel,
  WorkspaceItemList,
  type ItemRowRenderContext,
  type WorkspaceItemDiagnostic,
  type WorkspaceItemDiagnosticRegistry,
} from "@setta/workspace";

import { usePythonCanvasMutationContext } from "../app/PythonCanvasMutationContext";
import { parameterNameErrors } from "./parameterNames";

const PARAMETER_LIST_KEY = "python-canvas-callable-parameters";

const unnamedParameterLabel = "Unnamed parameter";

export type CallableSectionData = {
  callable: {
    authoredExpression: string;
    id: string;
    name: string;
  };
  callableDiagnosticMessage: string | null;
  parameterDiagnostics: Record<string, Array<WorkspaceItemDiagnostic>>;
  providerStatus: {
    provider: typeof PROVIDER_BASEDPYRIGHT_V2;
    status: ProviderAvailabilityV2;
    state: ProviderLifecycleStateV2;
  };
};

export type ParameterItemData = {
  authoredExpression: string;
  default: string | null;
  disabled: boolean;
  name: string;
  nameEditable: boolean;
  passingStyle: ParameterPassingStyleV2;
  providerOrdinal: number | null;
  typeAnnotation: string | null;
};

export function readCallableSectionData(value: unknown): CallableSectionData {
  const record = readRecord(value, "Callable section data");
  requireExactFields(record, [
    "callable",
    "callableDiagnosticMessage",
    "parameterDiagnostics",
    "providerStatus",
  ]);
  const callableRecord = readRecord(
    record.callable,
    "Callable section callable",
  );
  requireExactFields(callableRecord, ["authoredExpression", "id", "name"]);
  return {
    callable: {
      authoredExpression: readString(
        callableRecord.authoredExpression,
        "callable.authoredExpression",
      ),
      id: readStableId(callableRecord.id, "callable.id"),
      name: readNonBlankString(callableRecord.name, "callable.name"),
    },
    callableDiagnosticMessage: readNonBlankStringOrNull(
      record.callableDiagnosticMessage,
      "callableDiagnosticMessage",
    ),
    parameterDiagnostics: readParameterDiagnostics(record.parameterDiagnostics),
    providerStatus: readProviderStatus(record.providerStatus),
  };
}

export function readParameterItemData(value: unknown): ParameterItemData {
  const record = readRecord(value, "Callable parameter item data");
  requireExactFields(record, [
    "authoredExpression",
    "default",
    "disabled",
    "name",
    "nameEditable",
    "passingStyle",
    "providerOrdinal",
    "typeAnnotation",
  ]);
  if (typeof record.disabled !== "boolean") {
    throw new Error("Callable parameter item disabled must be a boolean.");
  }
  if (typeof record.nameEditable !== "boolean") {
    throw new Error("Callable parameter item nameEditable must be a boolean.");
  }
  const name = readString(record.name, "parameter.name");
  const nameEditable = record.nameEditable;
  const passingStyle = readParameterPassingStyle(record.passingStyle);
  const providerOrdinal = readNonNegativeIntegerOrNull(
    record.providerOrdinal,
    "parameter.providerOrdinal",
  );
  const typeAnnotation = readStringOrNull(
    record.typeAnnotation,
    "parameter.typeAnnotation",
  );
  const defaultValue = readStringOrNull(record.default, "parameter.default");
  if (
    nameEditable &&
    (passingStyle !== PARAMETER_PASSING_STYLE_POSITIONAL_OR_KEYWORD_V2 ||
      providerOrdinal !== null ||
      typeAnnotation !== null ||
      defaultValue !== null)
  ) {
    throw new Error("App-authored parameter metadata is incoherent.");
  }
  if (!nameEditable && (name === "" || providerOrdinal === null)) {
    throw new Error("Provider-derived parameter metadata is incoherent.");
  }
  return {
    authoredExpression: readString(
      record.authoredExpression,
      "parameter.authoredExpression",
    ),
    default: defaultValue,
    disabled: record.disabled,
    name,
    nameEditable,
    passingStyle,
    providerOrdinal,
    typeAnnotation,
  };
}

export function CallableExpressionField({
  data,
}: {
  data: CallableSectionData;
}) {
  const mutation = usePythonCanvasMutationContext();
  const callableId = data.callable.id;
  const completionError = mutation.callableCompletionError(callableId);
  const mutationError = mutation.callableMutationError(callableId);
  const diagnosticMessage = data.callableDiagnosticMessage;
  const expressionInputId = callableExpressionInputId(callableId);
  const completionListId = `${expressionInputId}-completions`;
  const completionRequest = useRef<AbortController | null>(null);
  const [completionOptions, setCompletionOptions] = useState<
    Array<{ label: string; value: string }>
  >([]);
  const draft = mutation.callableDraft(callableId);
  const completionErrorId =
    completionError === null
      ? undefined
      : callableCompletionErrorId(callableId);
  const diagnosticErrorId =
    diagnosticMessage === null
      ? undefined
      : callableDiagnosticErrorId(callableId);
  const mutationErrorId =
    mutationError === null ? undefined : callableMutationErrorId(callableId);
  const describedBy = [mutationErrorId, diagnosticErrorId, completionErrorId]
    .filter((id): id is string => id !== undefined)
    .join(" ");

  useEffect(
    () => () => {
      completionRequest.current?.abort();
    },
    [],
  );

  const requestCompletions = (input: HTMLInputElement, explicit: boolean) => {
    completionRequest.current?.abort();
    setCompletionOptions([]);
    const provider = mutation.callableCompletionProvider(callableId);
    const value = input.value;
    if (provider === undefined || value.trim() === "") {
      return;
    }
    const controller = new AbortController();
    completionRequest.current = controller;
    const cursorOffset = input.selectionStart ?? value.length;
    void provider({ cursorOffset, explicit, signal: controller.signal, value })
      .then((result) => {
        if (controller.signal.aborted || result === null) {
          return;
        }
        const to = result.to ?? result.from;
        if (
          result.from < 0 ||
          to < result.from ||
          to > value.length ||
          !Number.isSafeInteger(result.from) ||
          !Number.isSafeInteger(to)
        ) {
          return;
        }
        setCompletionOptions(
          result.options.map((option) => ({
            label: option.label,
            value: `${value.slice(0, result.from)}${option.insertText ?? option.label}${value.slice(to)}`,
          })),
        );
      })
      .catch(() => {
        // The application completion adapter classifies and reports failures.
      });
  };

  return (
    <form
      className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} python-canvas-callable-expression-controls`}
      data-tab-native="true"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.onCallableCommit(callableId, draft);
      }}
    >
      <label htmlFor={expressionInputId}>Callable expression</label>
      <input
        aria-describedby={describedBy === "" ? undefined : describedBy}
        aria-invalid={describedBy === "" ? undefined : true}
        disabled={mutation.callablePending(callableId)}
        id={expressionInputId}
        list={completionListId}
        name="callable-expression"
        onChange={(event) => {
          mutation.onCallableDraftChange(callableId, event.target.value);
          requestCompletions(event.currentTarget, false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            completionRequest.current?.abort();
            setCompletionOptions([]);
            mutation.onCallableRevert(callableId);
            return;
          }
          if (
            event.key === " " &&
            (event.ctrlKey || event.metaKey) &&
            !event.altKey
          ) {
            event.preventDefault();
            requestCompletions(event.currentTarget, true);
          }
        }}
        spellCheck={false}
        type="text"
        value={draft}
      />
      <datalist id={completionListId}>
        {completionOptions.map((option) => (
          <option
            key={`${option.label}:${option.value}`}
            label={option.label}
            value={option.value}
          />
        ))}
      </datalist>
      <button disabled={mutation.callablePending(callableId)} type="submit">
        Commit callable
      </button>
      {diagnosticMessage === null ? null : (
        <p
          className="python-canvas-callable-diagnostic-error"
          id={diagnosticErrorId}
          role="alert"
        >
          {diagnosticMessage}
        </p>
      )}
      {completionError === null ? null : (
        <p
          className="python-canvas-completion-error"
          id={completionErrorId}
          role="alert"
        >
          {completionError}
        </p>
      )}
    </form>
  );
}

export function CallableSection({
  data,
  parameters,
  sectionId,
}: {
  data: CallableSectionData;
  parameters: Array<{ data: ParameterItemData; id: string }>;
  sectionId: string;
}) {
  const mutation = usePythonCanvasMutationContext();
  const itemDiagnostics = parameterDiagnosticRegistry(data);
  const nameErrors = parameterNameErrors(parameters);

  return (
    <div
      aria-busy={mutation.callablePending(data.callable.id)}
      className="python-canvas-callable-section"
    >
      <CallableNameControl callable={data.callable} />
      <CallableMutationError callableId={data.callable.id} />
      <WorkspaceItemList
        itemDiagnostics={itemDiagnostics}
        listKey={`${PARAMETER_LIST_KEY}:${data.callable.id}`}
        renderItem={(context) => (
          <ParameterItemRow
            callableId={data.callable.id}
            context={context}
            nameError={nameErrors[context.item.id] ?? ""}
          />
        )}
        sectionId={sectionId}
        topLevelItemIds={parameters.map((parameter) => parameter.id)}
      />
    </div>
  );
}

export function parameterItemSearchableText(item: { data?: unknown }): string {
  return readParameterItemData(item.data).name;
}

function CallableNameControl({
  callable,
}: {
  callable: CallableSectionData["callable"];
}) {
  const mutation = usePythonCanvasMutationContext();
  const inputId = useId();
  const mutationError = mutation.callableMutationError(callable.id);
  const mutationErrorId =
    mutationError === null ? undefined : callableMutationErrorId(callable.id);
  const name = mutation.callableNameDraft(callable.id) ?? callable.name;

  return (
    <form
      className="python-canvas-callable-controls"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.onCallableRename(callable.id, name);
      }}
    >
      <label htmlFor={inputId}>Callable name</label>
      <input
        aria-describedby={mutationErrorId}
        aria-invalid={mutationError === null ? undefined : true}
        disabled={mutation.callablePending(callable.id)}
        id={inputId}
        name="callable-name"
        onChange={(event) =>
          mutation.onCallableNameDraftChange(callable.id, event.target.value)
        }
        required
        type="text"
        value={name}
      />
      <div className="python-canvas-callable-actions">
        <button disabled={mutation.callablePending(callable.id)} type="submit">
          Rename callable
        </button>
        <button
          aria-label={`Delete callable ${callable.name}`}
          disabled={mutation.callablePending(callable.id)}
          onClick={() => mutation.onCallableDelete(callable.id)}
          type="button"
        >
          Delete callable
        </button>
      </div>
    </form>
  );
}

function ParameterItemRow({
  callableId,
  context,
  nameError,
}: {
  callableId: string;
  context: ItemRowRenderContext;
  nameError: string;
}) {
  const mutation = usePythonCanvasMutationContext();
  const data = readParameterItemData(context.item.data);
  const disabled = data.disabled || mutation.callablePending(callableId);
  const label = data.name === "" ? unnamedParameterLabel : data.name;
  const providerMetadata = providerParameterMetadata(data);
  return (
    <>
      {data.nameEditable ? (
        <ItemNameEditor
          disabled={disabled}
          errorMessage={nameError}
          itemId={context.item.id}
          language="python"
          name={data.name}
          onNameChange={(name) =>
            mutation.onParameterNameChange(callableId, context.item.id, name)
          }
          sectionId={context.sectionId}
        />
      ) : (
        <WorkspaceItemLabel
          className="python-canvas-parameter-label"
          isGroup={false}
          title={providerMetadata ?? undefined}
        >
          <span className="python-canvas-parameter-name">{data.name}</span>
          {providerMetadata === null ? null : (
            <span className="python-canvas-parameter-metadata">
              {providerMetadata}
            </span>
          )}
        </WorkspaceItemLabel>
      )}
      <TextValueEditor
        ariaLabel={`${label} expression`}
        controlId={context.item.id}
        disabled={disabled}
        language="python"
        onValueChange={(value) =>
          mutation.onParameterExpressionChange(
            callableId,
            context.item.id,
            value,
          )
        }
        placeholder={data.default ?? undefined}
        presentation="item-row"
        sectionId={context.sectionId}
        singleLine
        value={data.authoredExpression}
        wrapLines={false}
      />
    </>
  );
}

function CallableMutationError({ callableId }: { callableId: string }) {
  const mutation = usePythonCanvasMutationContext();
  const message = mutation.callableMutationError(callableId);
  if (message === null) {
    return null;
  }
  return (
    <p
      className="python-canvas-callable-mutation-error"
      id={callableMutationErrorId(callableId)}
    >
      {message}
    </p>
  );
}

function callableMutationErrorId(callableId: string): string {
  return `python-canvas-callable-mutation-error-${encodeURIComponent(callableId)}`;
}

function callableExpressionInputId(callableId: string): string {
  return `python-canvas-callable-expression-${encodeURIComponent(callableId)}`;
}

function callableDiagnosticErrorId(callableId: string): string {
  return `python-canvas-callable-diagnostic-error-${encodeURIComponent(callableId)}`;
}

function callableCompletionErrorId(callableId: string): string {
  return `python-canvas-callable-completion-error-${encodeURIComponent(callableId)}`;
}

function parameterDiagnosticRegistry(
  data: CallableSectionData,
): WorkspaceItemDiagnosticRegistry | undefined {
  return Object.keys(data.parameterDiagnostics).length === 0
    ? undefined
    : data.parameterDiagnostics;
}

function providerParameterMetadata(data: ParameterItemData): string | null {
  if (data.nameEditable) {
    return null;
  }
  return [
    `Provider ordinal ${String(data.providerOrdinal)}`,
    `Passing style ${passingStyleLabel(data.passingStyle)}`,
    `Type ${data.typeAnnotation ?? "unannotated"}`,
    data.default === null ? null : `Default ${data.default}`,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
}

function readParameterDiagnostics(
  value: unknown,
): CallableSectionData["parameterDiagnostics"] {
  const record = readRecord(value, "Callable parameterDiagnostics");
  const diagnostics: CallableSectionData["parameterDiagnostics"] = {};
  for (const [parameterId, entries] of Object.entries(record)) {
    if (!Array.isArray(entries)) {
      throw new Error(
        `Callable parameterDiagnostics[${parameterId}] must be an array.`,
      );
    }
    diagnostics[readStableId(parameterId, "parameterDiagnostics key")] =
      entries.map((entry, index) => readWorkspaceDiagnostic(entry, index));
  }
  return diagnostics;
}

function readProviderStatus(
  value: unknown,
): CallableSectionData["providerStatus"] {
  const record = readRecord(value, "Callable provider status");
  requireExactFields(record, ["provider", "status", "state"]);
  if (record.provider !== PROVIDER_BASEDPYRIGHT_V2) {
    throw new Error("Callable provider status has an unsupported provider.");
  }
  const status = record.status;
  const state = record.state;
  if (
    (state === "not_started" || state === "failed") &&
    status === "unavailable"
  ) {
    return { provider: PROVIDER_BASEDPYRIGHT_V2, status, state };
  }
  if ((state === "pending" || state === "ready") && status === "available") {
    return { provider: PROVIDER_BASEDPYRIGHT_V2, status, state };
  }
  throw new Error("Callable provider status has an unsupported state.");
}

function readWorkspaceDiagnostic(
  value: unknown,
  index: number,
): WorkspaceItemDiagnostic {
  const record = readRecord(
    value,
    `Callable parameter diagnostic ${String(index)}`,
  );
  requireExactFields(record, ["message", "severity"]);
  if (
    record.severity !== "error" &&
    record.severity !== "warning" &&
    record.severity !== "info"
  ) {
    throw new Error(
      `Callable parameter diagnostic ${String(index)} has an unsupported severity.`,
    );
  }
  return {
    message: readNonBlankString(
      record.message,
      `parameterDiagnostics[${String(index)}].message`,
    ),
    severity: record.severity,
  };
}

function readRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireExactFields(
  value: Record<string, unknown>,
  fields: ReadonlyArray<string>,
): void {
  const keys = Object.keys(value);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !keys.includes(field))
  ) {
    throw new Error("Callable section data contains unexpected fields.");
  }
}

function readStableId(value: unknown, field: string): string {
  const id = readNonBlankString(value, field);
  if (id !== id.trim()) {
    throw new Error(`${field} must not include surrounding whitespace.`);
  }
  return id;
}

function readNonBlankString(value: unknown, field: string): string {
  const text = readString(value, field);
  if (text.trim() === "") {
    throw new Error(`${field} must not be empty.`);
  }
  return text;
}

function readNonBlankStringOrNull(
  value: unknown,
  field: string,
): string | null {
  return value === null ? null : readNonBlankString(value, field);
}

function readString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }
  return value;
}

function readStringOrNull(value: unknown, field: string): string | null {
  return value === null ? null : readString(value, field);
}

function readNonNegativeIntegerOrNull(
  value: unknown,
  field: string,
): number | null {
  if (value === null) {
    return null;
  }
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${field} must be a non-negative integer or null.`);
  }
  return value as number;
}

function readParameterPassingStyle(value: unknown): ParameterPassingStyleV2 {
  switch (value) {
    case PARAMETER_PASSING_STYLE_POSITIONAL_ONLY_V2:
    case PARAMETER_PASSING_STYLE_POSITIONAL_OR_KEYWORD_V2:
    case PARAMETER_PASSING_STYLE_KEYWORD_ONLY_V2:
    case PARAMETER_PASSING_STYLE_VARIADIC_POSITIONAL_V2:
    case PARAMETER_PASSING_STYLE_VARIADIC_KEYWORD_V2:
      return value;
    default:
      throw new Error("Callable parameter passingStyle is unsupported.");
  }
}

function passingStyleLabel(style: ParameterPassingStyleV2): string {
  return style.replaceAll("_", " ");
}
