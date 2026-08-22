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
  ItemDndContext,
  ItemNameEditor,
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
    "name",
    "nameEditable",
    "passingStyle",
    "providerOrdinal",
    "typeAnnotation",
  ]);
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
  validateParameterMetadata({
    defaultValue,
    name,
    nameEditable,
    passingStyle,
    providerOrdinal,
    typeAnnotation,
  });
  return {
    authoredExpression: readString(
      record.authoredExpression,
      "parameter.authoredExpression",
    ),
    default: defaultValue,
    name,
    nameEditable,
    passingStyle,
    providerOrdinal,
    typeAnnotation,
  };
}

function validateParameterMetadata({
  defaultValue,
  name,
  nameEditable,
  passingStyle,
  providerOrdinal,
  typeAnnotation,
}: {
  defaultValue: string | null;
  name: string;
  nameEditable: boolean;
  passingStyle: ParameterPassingStyleV2;
  providerOrdinal: number | null;
  typeAnnotation: string | null;
}) {
  if (nameEditable) {
    validateAppAuthoredParameterMetadata({
      defaultValue,
      passingStyle,
      providerOrdinal,
      typeAnnotation,
    });
    return;
  }
  if (name === "" || providerOrdinal === null) {
    throw new Error("Provider-derived parameter metadata is incoherent.");
  }
}

function validateAppAuthoredParameterMetadata({
  defaultValue,
  passingStyle,
  providerOrdinal,
  typeAnnotation,
}: {
  defaultValue: string | null;
  passingStyle: ParameterPassingStyleV2;
  providerOrdinal: number | null;
  typeAnnotation: string | null;
}) {
  if (
    passingStyle !== PARAMETER_PASSING_STYLE_POSITIONAL_OR_KEYWORD_V2 ||
    providerOrdinal !== null ||
    typeAnnotation !== null ||
    defaultValue !== null
  ) {
    throw new Error("App-authored parameter metadata is incoherent.");
  }
}

export function CallableExpressionField({
  data,
  sectionId,
}: {
  data: CallableSectionData;
  sectionId: string;
}) {
  const mutation = usePythonCanvasMutationContext();
  const callableId = data.callable.id;
  const completionError = mutation.callableCompletionError(callableId);
  const mutationError = mutation.callableMutationError(callableId);

  return (
    <div className="python-canvas-callable-field">
      <TextValueEditor
        ariaLabel="Callable expression"
        completionProvider={mutation.callableCompletionProvider(callableId)}
        controlId={`callable-expression:${callableId}`}
        diagnosticMessage={data.callableDiagnosticMessage ?? undefined}
        language="python"
        onAlternateCommit={(value) =>
          mutation.onCallableAlternateCommit(callableId, value)
        }
        onCommit={(value) => mutation.onCallableCommit(callableId, value)}
        onEscape={() => mutation.onCallableRevert(callableId)}
        onValueChange={(value) =>
          mutation.onCallableDraftChange(callableId, value)
        }
        presentation="section-field"
        sectionId={sectionId}
        singleLine
        value={mutation.callableDraft(callableId)}
        wrapLines={false}
      />
      {mutationError === null ? null : (
        <p
          className="python-canvas-announcer python-canvas-callable-mutation-error"
          role="alert"
        >
          {mutationError}
        </p>
      )}
      {completionError === null ? null : (
        <p
          className="python-canvas-announcer python-canvas-completion-error"
          role="alert"
        >
          {completionError}
        </p>
      )}
    </div>
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
  const parameterAuthoringPending = mutation.callablePending(data.callable.id);

  return (
    <div
      aria-busy={parameterAuthoringPending}
      className="python-canvas-callable-section"
    >
      {parameterAuthoringPending ? (
        <div
          aria-hidden="true"
          className="python-canvas-parameter-pending-overlay"
          data-python-canvas-parameter-pending="true"
        >
          <span className="python-canvas-parameter-spinner" />
        </div>
      ) : null}
      <div
        className="python-canvas-callable-parameter-authoring"
        inert={parameterAuthoringPending || undefined}
      >
        <ItemDndContext>
          <WorkspaceItemList
            itemDiagnostics={itemDiagnostics}
            listKey={`${PARAMETER_LIST_KEY}:${data.callable.id}`}
            renderItem={(context) => (
              <ParameterItemRow
                callableId={data.callable.id}
                context={context}
                disabled={parameterAuthoringPending}
                nameError={nameErrors[context.item.id] ?? ""}
              />
            )}
            sectionId={sectionId}
            topLevelItemIds={parameters.map((parameter) => parameter.id)}
          />
        </ItemDndContext>
      </div>
    </div>
  );
}

export function parameterItemSearchableText(item: { data?: unknown }): string {
  return readParameterItemData(item.data).name;
}

function ParameterItemRow({
  callableId,
  context,
  disabled,
  nameError,
}: {
  callableId: string;
  context: ItemRowRenderContext;
  disabled: boolean;
  nameError: string;
}) {
  const mutation = usePythonCanvasMutationContext();
  const data = readParameterItemData(context.item.data);
  const label = data.name === "" ? unnamedParameterLabel : data.name;
  return (
    <>
      {data.nameEditable ? (
        <ItemNameEditor
          errorMessage={nameError}
          disabled={disabled}
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
        >
          {data.name}
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

function parameterDiagnosticRegistry(
  data: CallableSectionData,
): WorkspaceItemDiagnosticRegistry | undefined {
  return Object.keys(data.parameterDiagnostics).length === 0
    ? undefined
    : data.parameterDiagnostics;
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
