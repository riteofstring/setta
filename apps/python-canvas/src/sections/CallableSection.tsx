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

export const PARAMETER_ITEM_ROOT_ID = "python-canvas:callable:parameter-root";
export const PARAMETER_ITEM_ID = "python-canvas:callable:parameter";
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

export function CallableSection({ data }: { data: CallableSectionData }) {
  const mutation = usePythonCanvasMutationContext();
  const itemDiagnostics = parameterDiagnosticRegistry(data);
  const pending = mutation.pendingDescription !== null;

  return (
    <div className="python-canvas-callable-section">
      <div className="python-canvas-callable-editor">
        <p className="python-canvas-field-label">Callable expression</p>
        <TextValueEditor
          ariaLabel="Callable expression"
          completionProvider={mutation.callableCompletionProvider}
          disabled={pending}
          itemId="python-canvas:callable:expression"
          language="python"
          onCommit={mutation.onCallableCommit}
          onValueChange={mutation.onCallableDraftChange}
          placeholder="math.sqrt"
          sectionId="python-canvas:callable"
          singleLine
          value={mutation.callableDraft}
          wrapLines={false}
        />
      </div>
      <p className="python-canvas-provider-status" role="status">
        {mutation.pendingDescription ??
          providerStatusMessage(data.providerStatus)}
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
      <WorkspaceItemList
        itemDiagnostics={itemDiagnostics}
        listKey={PARAMETER_LIST_KEY}
        renderItem={(context) => <ParameterItemRow context={context} />}
        sectionId="python-canvas:callable"
        topLevelItemIds={[PARAMETER_ITEM_ID]}
        visibleItemIds={data.hasParameter ? [PARAMETER_ITEM_ID] : []}
      />
    </div>
  );
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
        disabled={data.disabled || mutation.pendingDescription !== null}
        itemId={context.item.id}
        language="python"
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

function providerStatusMessage(
  status: CallableSectionData["providerStatus"],
): string {
  if (status.state === PROVIDER_LIFECYCLE_STATE_READY_V1) {
    return "Basedpyright is ready.";
  }
  if (status.state === PROVIDER_LIFECYCLE_STATE_PENDING_V1) {
    return "Basedpyright is checking generated Python.";
  }
  if (status.state === PROVIDER_LIFECYCLE_STATE_FAILED_V1) {
    return "Basedpyright is unavailable. Try the change again when it is ready.";
  }
  return "Basedpyright will check the callable after you commit it.";
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
