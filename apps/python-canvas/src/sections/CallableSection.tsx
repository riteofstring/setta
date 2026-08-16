import {
  PROVIDER_AVAILABILITY_AVAILABLE_V1,
  PROVIDER_AVAILABILITY_UNAVAILABLE_V1,
  PROVIDER_BASEDPYRIGHT_V1,
  PROVIDER_LIFECYCLE_STATE_FAILED_V1,
  PROVIDER_LIFECYCLE_STATE_NOT_STARTED_V1,
  PROVIDER_LIFECYCLE_STATE_PENDING_V1,
  PROVIDER_LIFECYCLE_STATE_READY_V1,
  type ProviderAvailabilityV1,
  type ProviderLifecycleStateV1,
  type ProviderV1,
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

export const CALLABLE_SECTION_ID = "python-canvas:callable" as const;
export const PARAMETER_ITEM_ROOT_ID = "python-canvas:callable:parameter-root";
const CALLABLE_EXPRESSION_CONTROL_ID = "callable-expression";
const PARAMETER_LIST_KEY = "python-canvas-callable-parameters";
// A row whose name has not been written yet still needs an accessible name for its
// value editor. Main leaves its blank kwarg unlabelled; a reader here should not.
const UNNAMED_PARAMETER_LABEL = "Unnamed parameter";

export type CallableSectionData = {
  callable: {
    authoredExpression: string;
    id: string;
    name: string;
  };
  // Keyed by canonical parameter ID, which is also the workspace item ID.
  parameterDiagnostics: Record<string, Array<WorkspaceItemDiagnostic>>;
  providerStatus: {
    provider: ProviderV1;
    status: ProviderAvailabilityV1;
    state: ProviderLifecycleStateV1;
  };
};

// The row shows what main's ordinary text parameter shows: its name, its value editor, and the
// real default behind an empty one. Passing style and the provider's type spelling stay in the
// canonical backend contract, where code generation and diagnostics own them. The item's own ID
// is the canonical parameter ID, so the row carries no second copy of it.
export type ParameterItemData = {
  authoredExpression: string;
  default: string | null;
  disabled: boolean;
  name: string;
  // Whether the backend says this record's name is the app's to write.
  nameEditable: boolean;
};

export function readCallableSectionData(value: unknown): CallableSectionData {
  if (!isRecord(value)) {
    throw new Error("Callable section data must be an object.");
  }
  requireExactFields(value, [
    "callable",
    "parameterDiagnostics",
    "providerStatus",
  ]);
  if (!isRecord(value.callable)) {
    throw new Error("Callable section data callable must be an object.");
  }
  requireExactFields(value.callable, ["authoredExpression", "id", "name"]);
  const callable = {
    authoredExpression: readString(
      value.callable.authoredExpression,
      "callable.authoredExpression",
    ),
    id: readStableId(value.callable.id, "callable.id"),
    name: readNonBlankString(value.callable.name, "callable.name"),
  };
  return {
    callable,
    parameterDiagnostics: readParameterDiagnostics(value.parameterDiagnostics),
    providerStatus: readProviderStatus(value.providerStatus),
  };
}

export function readParameterItemData(value: unknown): ParameterItemData {
  if (!isRecord(value)) {
    throw new Error("Callable parameter item data must be an object.");
  }
  requireExactFields(value, [
    "authoredExpression",
    "default",
    "disabled",
    "name",
    "nameEditable",
  ]);
  if (typeof value.disabled !== "boolean") {
    throw new Error("Callable parameter item disabled must be a boolean.");
  }
  if (typeof value.nameEditable !== "boolean") {
    throw new Error("Callable parameter item nameEditable must be a boolean.");
  }
  return {
    authoredExpression: readString(
      value.authoredExpression,
      "parameter.authoredExpression",
    ),
    default: readStringOrNull(value.default, "parameter.default"),
    disabled: value.disabled,
    // An authored record may be blank until someone names it, exactly as the
    // canonical contract allows.
    name: readString(value.name, "parameter.name"),
    nameEditable: value.nameEditable,
  };
}

function readParameterDiagnostics(
  value: unknown,
): CallableSectionData["parameterDiagnostics"] {
  if (!isRecord(value)) {
    throw new Error("Callable parameterDiagnostics must be an object.");
  }
  const diagnostics: CallableSectionData["parameterDiagnostics"] = {};
  for (const [parameterId, entries] of Object.entries(value)) {
    if (!Array.isArray(entries)) {
      throw new Error(
        `Callable parameterDiagnostics[${parameterId}] must be an array.`,
      );
    }
    diagnostics[readStableId(parameterId, "parameterDiagnostics key")] =
      entries.map((diagnostic, index) =>
        readWorkspaceDiagnostic(diagnostic, index),
      );
  }
  return diagnostics;
}

// The section's leading control, placed by the package above its Args toolbar. The compact field
// replaces the previous large label and the idle paragraph about what Basedpyright does after a
// commit; ordinary pending state is a small adornment plus an app-owned live region, and only
// genuine failures still claim a visible block.
//
// The field carries no placeholder. Like main's callable search it renders the canonical committed
// expression, which the shipped demo commits before its first response; a placeholder here painted
// `math.sqrt` as sample copy over an empty callable that no snapshot contained.
//
// Its keys are main's: Tab accepts an offered completion into the draft, one unmodified Enter
// commits the draft the field is showing even while the popup is open, and Escape — once the popup
// has taken its own first Escape — abandons the draft for the canonical expression.
export function CallableExpressionField() {
  const mutation = usePythonCanvasMutationContext();
  const pending = mutation.pendingDescription !== null;

  return (
    <div className="python-canvas-callable-field">
      <TextValueEditor
        ariaLabel="Callable expression"
        completionProvider={mutation.callableCompletionProvider}
        controlId={CALLABLE_EXPRESSION_CONTROL_ID}
        disabled={pending}
        endAdornment={
          pending ? (
            <span aria-hidden={true} className="python-canvas-pending-mark" />
          ) : null
        }
        language="python"
        onCommit={mutation.onCallableCommit}
        onEscape={mutation.onCallableRevert}
        onValueChange={mutation.onCallableDraftChange}
        presentation="section-field"
        sectionId={CALLABLE_SECTION_ID}
        singleLine
        value={mutation.callableDraft}
        wrapLines={false}
      />
      <p className="python-canvas-visually-hidden" role="status">
        {mutation.pendingDescription ?? ""}
      </p>
      {mutation.mutationError === null ? null : (
        <p className="python-canvas-mutation-error" role="alert">
          {mutation.mutationError}
        </p>
      )}
      {mutation.completionError === null ? null : (
        <p className="python-canvas-completion-error" role="alert">
          {mutation.completionError}
        </p>
      )}
    </div>
  );
}

// The list's membership is the workspace item tree's own order, because Add, Remove Last, Delete
// Selected, and drag reorder all change that tree before the canonical response confirms it. A
// name rule is a claim about the whole list, so the section resolves it once here and each row
// shows the message that is its own.
export function CallableSection({
  data,
  parameters,
}: {
  data: CallableSectionData;
  parameters: Array<{ data: ParameterItemData; id: string }>;
}) {
  const itemDiagnostics = parameterDiagnosticRegistry(data);
  const providerFailure = providerFailureMessage(data.providerStatus);
  const nameErrors = parameterNameErrors(parameters);

  return (
    <div className="python-canvas-callable-section">
      {providerFailure === null ? null : (
        <p className="python-canvas-provider-error" role="alert">
          {providerFailure}
        </p>
      )}
      <WorkspaceItemList
        itemDiagnostics={itemDiagnostics}
        listKey={PARAMETER_LIST_KEY}
        renderItem={(context) => (
          <ParameterItemRow
            context={context}
            nameError={nameErrors[context.item.id] ?? ""}
          />
        )}
        sectionId={CALLABLE_SECTION_ID}
        topLevelItemIds={parameters.map((parameter) => parameter.id)}
      />
    </div>
  );
}

// The filter is package-owned but these rows are application-opaque, so the app projects exactly
// the text the row shows. Main's own Args filter matches the visible parameter name alone.
export function parameterItemSearchableText(item: { data?: unknown }): string {
  return readParameterItemData(item.data).name;
}

// Main's ordinary text parameter: the display name, then the value editor. A provider-derived name
// belongs to the resolved signature, so that row keeps a static label; an app-authored name uses
// the package's own name editor. A placeholder here means exactly what it means in main — the
// value this parameter takes when the row is left empty — so a parameter without a default shows
// none.
//
// A name the store would refuse is reported on the row through the package's own error
// presentation, exactly where main's bubble reports it, and the typed name stays in the document
// while it is wrong.
function ParameterItemRow({
  context,
  nameError,
}: {
  context: ItemRowRenderContext;
  nameError: string;
}) {
  const mutation = usePythonCanvasMutationContext();
  const data = readParameterItemData(context.item.data);
  const disabled = data.disabled || mutation.pendingDescription !== null;
  const label = data.name === "" ? UNNAMED_PARAMETER_LABEL : data.name;
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
            mutation.onParameterNameChange(context.item.id, name)
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
        presentation="item-row"
        onValueChange={(value) =>
          mutation.onParameterExpressionChange(context.item.id, value)
        }
        placeholder={data.default ?? undefined}
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
  if (Object.keys(data.parameterDiagnostics).length === 0) {
    return undefined;
  }
  return data.parameterDiagnostics;
}

// Only a genuine provider failure claims a visible block. Not-started, pending, and ready are
// ordinary states; describing them turned the idle section into a paragraph of infrastructure
// text, and pending already reads through the editor's adornment and live region.
function providerFailureMessage(
  status: CallableSectionData["providerStatus"],
): string | null {
  if (status.state === PROVIDER_LIFECYCLE_STATE_FAILED_V1) {
    return "Basedpyright is unavailable. Try the change again when it is ready.";
  }
  return null;
}

function readProviderStatus(
  value: unknown,
): CallableSectionData["providerStatus"] {
  if (!isRecord(value)) {
    throw new Error("Callable provider status must be an object.");
  }
  requireExactFields(value, ["provider", "status", "state"]);
  if (value.provider !== PROVIDER_BASEDPYRIGHT_V1) {
    throw new Error("Callable provider status has an unsupported provider.");
  }
  const status = value.status;
  const state = value.state;
  if (
    (state === PROVIDER_LIFECYCLE_STATE_NOT_STARTED_V1 ||
      state === PROVIDER_LIFECYCLE_STATE_FAILED_V1) &&
    status === PROVIDER_AVAILABILITY_UNAVAILABLE_V1
  ) {
    return {
      provider: PROVIDER_BASEDPYRIGHT_V1,
      status: PROVIDER_AVAILABILITY_UNAVAILABLE_V1,
      state,
    };
  }
  if (
    (state === PROVIDER_LIFECYCLE_STATE_PENDING_V1 ||
      state === PROVIDER_LIFECYCLE_STATE_READY_V1) &&
    status === PROVIDER_AVAILABILITY_AVAILABLE_V1
  ) {
    return {
      provider: PROVIDER_BASEDPYRIGHT_V1,
      status: PROVIDER_AVAILABILITY_AVAILABLE_V1,
      state,
    };
  }
  throw new Error("Callable provider status has an unsupported state.");
}

function readWorkspaceDiagnostic(
  value: unknown,
  index: number,
): WorkspaceItemDiagnostic {
  if (!isRecord(value)) {
    throw new Error(
      `Callable parameter diagnostic ${String(index)} must be an object.`,
    );
  }
  requireExactFields(value, ["message", "severity"]);
  const severity = value.severity;
  if (severity !== "error" && severity !== "warning" && severity !== "info") {
    throw new Error(
      `Callable parameter diagnostic ${String(index)} has an unsupported severity.`,
    );
  }
  return {
    message: readNonBlankString(
      value.message,
      `parameterDiagnostics[${String(index)}].message`,
    ),
    severity,
  };
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

function readString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }
  return value;
}

function readStringOrNull(value: unknown, field: string): string | null {
  if (value === null) {
    return null;
  }
  return readString(value, field);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
