import {
  PARAMETER_PASSING_STYLE_KEYWORD_ONLY_V1,
  PARAMETER_PASSING_STYLE_POSITIONAL_ONLY_V1,
  PARAMETER_PASSING_STYLE_POSITIONAL_OR_KEYWORD_V1,
  PARAMETER_PASSING_STYLE_VARIADIC_KEYWORD_V1,
  PARAMETER_PASSING_STYLE_VARIADIC_POSITIONAL_V1,
  PROVIDER_AVAILABILITY_AVAILABLE_V1,
  PROVIDER_AVAILABILITY_UNAVAILABLE_V1,
  PROVIDER_BASEDPYRIGHT_V1,
  PROVIDER_LIFECYCLE_STATE_FAILED_V1,
  PROVIDER_LIFECYCLE_STATE_NOT_STARTED_V1,
  PROVIDER_LIFECYCLE_STATE_PENDING_V1,
  PROVIDER_LIFECYCLE_STATE_READY_V1,
  type ParameterPassingStyleV1,
  type ProviderAvailabilityV1,
  type ProviderLifecycleStateV1,
  type ProviderV1,
} from "../backend/generatedContract";
import {
  TextValueEditor,
  WorkspaceItemLabel,
  WorkspaceItemList,
  type ItemRowRenderContext,
  type WorkspaceItemDiagnostic,
  type WorkspaceItemDiagnosticRegistry,
} from "@setta/workspace";

import { usePythonCanvasMutationContext } from "../app/PythonCanvasMutationContext";

export const CALLABLE_SECTION_ID = "python-canvas:callable" as const;
export const PARAMETER_ITEM_ROOT_ID = "python-canvas:callable:parameter-root";
export const PARAMETER_ITEM_ID = "python-canvas:callable:parameter";
const CALLABLE_EXPRESSION_CONTROL_ID = "callable-expression";
const PARAMETER_LIST_KEY = "python-canvas-callable-parameters";

export type CallableSectionData = {
  callable: {
    authoredExpression: string;
    id: string;
    name: string;
  };
  hasParameter: boolean;
  parameterDiagnostics: Array<WorkspaceItemDiagnostic>;
  providerStatus: {
    provider: ProviderV1;
    status: ProviderAvailabilityV1;
    state: ProviderLifecycleStateV1;
  };
};

export type ParameterItemData =
  | { kind: "empty" }
  | {
      authoredExpression: string;
      default: string | null;
      disabled: boolean;
      kind: "parameter";
      name: string;
      parameterId: string;
      passingStyle: ParameterPassingStyleV1;
      typeAnnotation: string;
    };

export function readCallableSectionData(value: unknown): CallableSectionData {
  if (!isRecord(value)) {
    throw new Error("Callable section data must be an object.");
  }
  requireExactFields(value, [
    "callable",
    "hasParameter",
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
  if (typeof value.hasParameter !== "boolean") {
    throw new Error("Callable section data hasParameter must be a boolean.");
  }
  if (!Array.isArray(value.parameterDiagnostics)) {
    throw new Error("Callable section parameterDiagnostics must be an array.");
  }
  const parameterDiagnostics = value.parameterDiagnostics.map(
    (diagnostic, index) => readWorkspaceDiagnostic(diagnostic, index),
  );
  return {
    callable,
    hasParameter: value.hasParameter,
    parameterDiagnostics,
    providerStatus: readProviderStatus(value.providerStatus),
  };
}

export function readParameterItemData(value: unknown): ParameterItemData {
  if (!isRecord(value)) {
    throw new Error("Callable parameter item data must be an object.");
  }
  const kind = value.kind;
  if (kind === "empty") {
    requireExactFields(value, ["kind"]);
    return { kind: "empty" };
  }
  if (kind !== "parameter") {
    throw new Error("Callable parameter item data has an unknown kind.");
  }
  requireExactFields(value, [
    "authoredExpression",
    "default",
    "disabled",
    "kind",
    "name",
    "parameterId",
    "passingStyle",
    "typeAnnotation",
  ]);
  if (typeof value.disabled !== "boolean") {
    throw new Error("Callable parameter item disabled must be a boolean.");
  }
  return {
    authoredExpression: readString(
      value.authoredExpression,
      "parameter.authoredExpression",
    ),
    default: readStringOrNull(value.default, "parameter.default"),
    disabled: value.disabled,
    kind: "parameter",
    name: readNonBlankString(value.name, "parameter.name"),
    parameterId: readStableId(value.parameterId, "parameter.parameterId"),
    passingStyle: readPassingStyle(value.passingStyle),
    typeAnnotation: readString(
      value.typeAnnotation,
      "parameter.typeAnnotation",
    ),
  };
}

// The section's leading control, placed by the package above its Args toolbar. The compact field
// replaces the previous large label and the idle paragraph about what Basedpyright does after a
// commit; ordinary pending state is a small adornment plus an app-owned live region, and only
// genuine failures still claim a visible block.
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
        onValueChange={mutation.onCallableDraftChange}
        placeholder="math.sqrt"
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

export function CallableSection({ data }: { data: CallableSectionData }) {
  const itemDiagnostics = parameterDiagnosticRegistry(data);
  const providerFailure = providerFailureMessage(data.providerStatus);

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
        renderItem={(context) => <ParameterItemRow context={context} />}
        sectionId={CALLABLE_SECTION_ID}
        topLevelItemIds={[PARAMETER_ITEM_ID]}
        visibleItemIds={data.hasParameter ? [PARAMETER_ITEM_ID] : []}
      />
    </div>
  );
}

// The retained filter is package-owned but these rows are application-opaque, so the app projects
// exactly the text the row shows.
export function parameterItemSearchableText(item: {
  data?: unknown;
}): string {
  const data = readParameterItemData(item.data);
  if (data.kind === "empty") {
    return "";
  }
  return `${data.name} ${parameterMetadata(data)}`;
}

function ParameterItemRow({ context }: { context: ItemRowRenderContext }) {
  const mutation = usePythonCanvasMutationContext();
  const data = readParameterItemData(context.item.data);
  if (data.kind === "empty") {
    return null;
  }
  const metadata = parameterMetadata(data);
  return (
    <>
      <WorkspaceItemLabel
        className="python-canvas-parameter-label"
        isGroup={false}
      >
        <span>{data.name}</span>
        <span className="python-canvas-parameter-metadata">{metadata}</span>
      </WorkspaceItemLabel>
      <TextValueEditor
        ariaLabel={`${data.name} expression`}
        controlId={context.item.id}
        disabled={data.disabled || mutation.pendingDescription !== null}
        language="python"
        presentation="item-row"
        onValueChange={(value) =>
          mutation.onParameterExpressionChange(data.parameterId, value)
        }
        placeholder="Python expression"
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
  if (!data.hasParameter || data.parameterDiagnostics.length === 0) {
    return undefined;
  }
  return { [PARAMETER_ITEM_ID]: data.parameterDiagnostics };
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

function parameterMetadata(
  data: Exclude<ParameterItemData, { kind: "empty" }>,
): string {
  const parts = [passingStyleLabel(data.passingStyle)];
  if (data.typeAnnotation !== "") {
    parts.push(data.typeAnnotation);
  }
  if (data.default !== null) {
    parts.push(`default ${data.default}`);
  }
  return parts.join(" · ");
}

function passingStyleLabel(style: ParameterPassingStyleV1): string {
  switch (style) {
    case PARAMETER_PASSING_STYLE_POSITIONAL_ONLY_V1:
      return "positional only";
    case PARAMETER_PASSING_STYLE_POSITIONAL_OR_KEYWORD_V1:
      return "positional or keyword";
    case PARAMETER_PASSING_STYLE_KEYWORD_ONLY_V1:
      return "keyword only";
    case PARAMETER_PASSING_STYLE_VARIADIC_POSITIONAL_V1:
      return "variadic positional";
    case PARAMETER_PASSING_STYLE_VARIADIC_KEYWORD_V1:
      return "variadic keyword";
  }
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

function readPassingStyle(value: unknown): ParameterPassingStyleV1 {
  switch (value) {
    case PARAMETER_PASSING_STYLE_POSITIONAL_ONLY_V1:
    case PARAMETER_PASSING_STYLE_POSITIONAL_OR_KEYWORD_V1:
    case PARAMETER_PASSING_STYLE_KEYWORD_ONLY_V1:
    case PARAMETER_PASSING_STYLE_VARIADIC_POSITIONAL_V1:
    case PARAMETER_PASSING_STYLE_VARIADIC_KEYWORD_V1:
      return value;
    default:
      throw new Error(
        "Callable parameter item has an unsupported passing style.",
      );
  }
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
