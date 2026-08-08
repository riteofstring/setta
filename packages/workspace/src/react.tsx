import {
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";

import {
  createEmptyWorkspaceDocument,
  resolveWorkspaceCapabilities,
  validateWorkspaceDocument,
  type WorkspaceCapabilityOverrides,
  type WorkspaceController,
  type WorkspaceDocument,
  type WorkspaceDocumentChange,
  type WorkspaceJsonValue,
} from "./core.js";
import { createWorkspaceController } from "./internal/workspace-controller.js";

export type WorkspaceDocumentChangeHandler<TSectionData = WorkspaceJsonValue> = (
  document: WorkspaceDocument<TSectionData>,
  change: WorkspaceDocumentChange,
) => void;

type SharedWorkspaceProps<TSectionData> = Omit<
  HTMLAttributes<HTMLElement>,
  "aria-label" | "children"
> & {
  ariaLabel?: string;
  capabilities?: WorkspaceCapabilityOverrides;
  children?: ReactNode;
  controllerRef?: Ref<WorkspaceController<TSectionData>>;
  emptyState?: ReactNode;
  readOnly?: boolean;
};

type ControlledWorkspaceProps<TSectionData> = {
  defaultDocument?: never;
  document: WorkspaceDocument<TSectionData>;
  onDocumentChange: WorkspaceDocumentChangeHandler<TSectionData>;
};

type UncontrolledWorkspaceProps<TSectionData> = {
  defaultDocument?: WorkspaceDocument<TSectionData>;
  document?: never;
  onDocumentChange?: WorkspaceDocumentChangeHandler<TSectionData>;
};

export type WorkspaceProps<TSectionData = WorkspaceJsonValue> = SharedWorkspaceProps<TSectionData> &
  (ControlledWorkspaceProps<TSectionData> | UncontrolledWorkspaceProps<TSectionData>);

type WorkspaceMode<TSectionData> =
  | Readonly<{ document: WorkspaceDocument<TSectionData>; type: "controlled" }>
  | Readonly<{ document: WorkspaceDocument<TSectionData>; type: "uncontrolled" }>;

function resolveMode<TSectionData>(
  document: WorkspaceDocument<TSectionData> | undefined,
  defaultDocument: WorkspaceDocument<TSectionData> | undefined,
  onDocumentChange: WorkspaceDocumentChangeHandler<TSectionData> | undefined,
): WorkspaceMode<TSectionData> {
  if (document && defaultDocument) {
    throw new TypeError("Workspace cannot receive both document and defaultDocument.");
  }
  if (document) {
    if (typeof onDocumentChange !== "function") {
      throw new TypeError("A controlled Workspace requires onDocumentChange.");
    }
    return { document, type: "controlled" };
  }
  return {
    document:
      defaultDocument ?? (createEmptyWorkspaceDocument() as WorkspaceDocument<TSectionData>),
    type: "uncontrolled",
  };
}

function assertStableMode(initialMode: WorkspaceMode<unknown>["type"], currentMode: string): void {
  if (initialMode !== currentMode) {
    throw new TypeError("Workspace cannot switch between controlled and uncontrolled usage.");
  }
}

export function Workspace<TSectionData = WorkspaceJsonValue>(props: WorkspaceProps<TSectionData>) {
  const {
    ariaLabel = "Workspace",
    capabilities: capabilityOverrides,
    children,
    className,
    controllerRef,
    defaultDocument,
    document: controlledDocument,
    emptyState = "No sections yet.",
    onDocumentChange,
    readOnly = false,
    ...sectionProps
  } = props;
  const mode = resolveMode(controlledDocument, defaultDocument, onDocumentChange);
  const initialModeRef = useRef(mode.type);
  assertStableMode(initialModeRef.current, mode.type);
  const [uncontrolledDocument, setUncontrolledDocument] = useState(mode.document);
  const document = mode.type === "controlled" ? mode.document : uncontrolledDocument;
  const validatedDocument = useMemo(() => {
    validateWorkspaceDocument(document);
    return document;
  }, [document]);
  const capabilities = useMemo(
    () => resolveWorkspaceCapabilities(capabilityOverrides, readOnly),
    [capabilityOverrides, readOnly],
  );
  const documentRef = useRef(validatedDocument);
  const capabilitiesRef = useRef(capabilities);
  const controlledRef = useRef(mode.type === "controlled");
  const onDocumentChangeRef = useRef(onDocumentChange);
  documentRef.current = validatedDocument;
  capabilitiesRef.current = capabilities;
  controlledRef.current = mode.type === "controlled";
  onDocumentChangeRef.current = onDocumentChange;

  const internalControllerRef = useRef<WorkspaceController<TSectionData> | null>(null);
  if (!internalControllerRef.current) {
    internalControllerRef.current = createWorkspaceController({
      commit: (nextDocument, change) => {
        if (!controlledRef.current) {
          documentRef.current = nextDocument;
          setUncontrolledDocument(nextDocument);
        }
        onDocumentChangeRef.current?.(nextDocument, change);
      },
      getCapabilities: () => capabilitiesRef.current,
      getDocument: () => documentRef.current,
    });
  }
  const controller = internalControllerRef.current;
  useImperativeHandle(controllerRef, () => controller, [controller]);

  const resolvedClassName = ["setta-workspace", className].filter(Boolean).join(" ");
  const hasNoSections = validatedDocument.rootSections.length === 0;

  return (
    <section
      {...sectionProps}
      aria-label={ariaLabel}
      className={resolvedClassName}
      data-read-only={readOnly ? "true" : "false"}
      data-setta-workspace=""
      data-workspace-mode={mode.type}
    >
      {children ?? (hasNoSections ? <p className="setta-workspace__empty">{emptyState}</p> : null)}
    </section>
  );
}
