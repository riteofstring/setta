import { useEffect, useId, useState } from "react";
import {
  PROVIDER_AVAILABILITY_AVAILABLE_V2,
  PROVIDER_BASEDPYRIGHT_V2,
  PROVIDER_LIFECYCLE_STATE_FAILED_V2,
  type ProviderAvailabilityV2,
  type ProviderLifecycleStateV2,
} from "../backend/generatedContract";
import {
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
  disabled: boolean;
  name: string;
  nameEditable: boolean;
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
  ]);
  if (typeof record.disabled !== "boolean") {
    throw new Error("Callable parameter item disabled must be a boolean.");
  }
  if (typeof record.nameEditable !== "boolean") {
    throw new Error("Callable parameter item nameEditable must be a boolean.");
  }
  return {
    authoredExpression: readString(
      record.authoredExpression,
      "parameter.authoredExpression",
    ),
    default: readStringOrNull(record.default, "parameter.default"),
    disabled: record.disabled,
    name: readString(record.name, "parameter.name"),
    nameEditable: record.nameEditable,
  };
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

  return (
    <div className="python-canvas-callable-field">
      <TextValueEditor
        ariaLabel={`Callable expression for ${data.callable.name}`}
        completionProvider={mutation.callableCompletionProvider(callableId)}
        controlId={`callable-expression:${callableId}`}
        diagnosticMessage={data.callableDiagnosticMessage ?? undefined}
        disabled={mutation.pending}
        language="python"
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
      {completionError === null ? null : (
        <p className="python-canvas-completion-error" role="alert">
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
  const itemDiagnostics = parameterDiagnosticRegistry(data);
  const providerFailure = providerFailureMessage(data.providerStatus);
  const nameErrors = parameterNameErrors(parameters);

  return (
    <div className="python-canvas-callable-section">
      <CallableNameControl callable={data.callable} />
      {providerFailure === null ? null : (
        <p className="python-canvas-provider-error" role="alert">
          {providerFailure}
        </p>
      )}
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
  const mutationErrorId =
    mutation.mutationError === null
      ? undefined
      : "python-canvas-mutation-error";
  const [name, setName] = useState(callable.name);

  useEffect(() => {
    setName(callable.name);
  }, [callable.name]);

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
        id={inputId}
        name="callable-name"
        onChange={(event) => setName(event.target.value)}
        required
        type="text"
        value={name}
      />
      <div className="python-canvas-callable-actions">
        <button disabled={mutation.pending} type="submit">
          Rename callable
        </button>
        <button
          aria-label={`Delete callable ${callable.name}`}
          disabled={mutation.pending}
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
  const disabled = data.disabled || mutation.pending;
  const label = data.name === "" ? unnamedParameterLabel : data.name;
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

function providerFailureMessage(
  status: CallableSectionData["providerStatus"],
): string | null {
  if (
    status.status !== PROVIDER_AVAILABILITY_AVAILABLE_V2 ||
    status.state === PROVIDER_LIFECYCLE_STATE_FAILED_V2
  ) {
    return "Basedpyright is unavailable. Try the change again when it is ready.";
  }
  return null;
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
