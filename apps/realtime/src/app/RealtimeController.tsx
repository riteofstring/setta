import { useEffect, useMemo, useRef, useState } from "react";
import {
  commitWorkspaceDocument,
  createWorkspaceHost,
  setWorkspaceColorMode,
  WORKSPACE_CODE_SECTION_KIND,
  type WorkspaceDocument,
  type WorkspaceHost,
  type WorkspaceSection,
  type WorkspaceSectionData,
} from "@setta/workspace";

import {
  RealtimeClientError,
  applyProject,
  applyRuntimeSource as applyRuntimeSourceRequest,
  connectProjectEvents,
  connectRuntime,
  fetchProject,
  fetchRuntimeSource,
  reloadRuntime,
  uploadContent,
} from "../api/client";
import type {
  ApplyRuntimeSourceResult,
  Binding,
  ContentReference,
  Project,
  RuntimeCommand,
  RuntimeSourceDocument,
  Section,
} from "../api/generatedContract";
import {
  projectWorkspaceDocument,
  replaceSectionDataOperation,
  workspaceDocumentOperations,
  type ProjectOperation,
} from "./projectProjection";
import {
  connectRealtimeGraphOperations,
  deleteRealtimeGraphOperations,
  realtimeAutomaticStartupSource,
  reconnectRealtimeGraphOperations,
  setRealtimeBindingOperations,
} from "./realtimeGraph";
import {
  applyRuntimeEnvelope,
  beginRuntimeReplacement,
  initialRuntimeViewState,
  runtimeCanInvoke,
  setRuntimeConnection,
  type RuntimeViewState,
} from "./runtimeState";
import {
  createRealtimeSectionKinds,
  registerRealtimeSectionKinds,
  type RealtimeSectionKindCatalog,
} from "./realtimeSectionKinds";
import {
  initialRuntimeSourceViewState,
  type RealtimeActions,
  type RealtimeBindingEdit,
  type RuntimeSourceViewState,
} from "./runtimeContext";
import { RuntimeInitializationCoordinator } from "./runtimeInitialization";
import { RealtimeView } from "./RealtimeView";

type EnqueueMutation = (
  build: (project: Project) => ProjectOperation[],
  origin?: "application" | "workspace",
) => Promise<boolean>;

type WorkspaceProjection = {
  preserveSourceDraft: boolean;
  project: Project;
  sourceDocument: RuntimeSourceDocument | null;
};

type RuntimeTransport = {
  close: () => void;
  send: (command: RuntimeCommand) => boolean;
};

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Realtime encountered an unexpected error.";
}

function isRevisionConflict(error: unknown): boolean {
  return error instanceof RealtimeClientError && error.status === 409;
}

function newStagingId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `drawing-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

function newDomainId(prefix: string): string {
  const suffix =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function createHandlerOperations(
  project: Project,
  handler: string,
  bindingId: string,
  sectionId: string,
): ProjectOperation[] {
  const right = Object.entries(project.layout.topLevelSections).reduce(
    (maximum, [id, layout]) => {
      const section = project.sections[id];
      const width =
        layout.width ??
        (typeof section?.width === "number" ? section.width : 300);
      return Math.max(maximum, layout.x + width);
    },
    0,
  );
  const zIndex = Object.values(project.layout.topLevelSections).reduce(
    (maximum, layout) => Math.max(maximum, layout.zIndex),
    0,
  );
  const binding: Binding = {
    arguments: { input: null },
    handler,
    id: bindingId,
    outputs: { result: {} },
    scheduling: {
      concurrencyGroup: bindingId,
      concurrencyLimit: 1,
      debounceMilliseconds: 0,
      mode: "latest",
    },
    trigger: { kind: "disconnected" },
  };
  const section: Section = {
    children: [],
    data: { bindingId },
    height: 190,
    id: sectionId,
    isHorizontalOrientation: false,
    kind: "handler",
    name: handler,
    overflowMode: false,
    positionAndSizeLocked: false,
    styleColor: null,
    tagColor: null,
    width: 300,
  };
  return [
    { binding, op: "setBinding" },
    {
      layout: {
        height: 190,
        width: 300,
        x: right + 40,
        y: 24,
        zIndex: zIndex + 1,
      },
      op: "upsertSection",
      section,
    },
  ];
}

function editedArguments(
  binding: Binding,
  edit: RealtimeBindingEdit,
): Binding["arguments"] {
  const next = {
    ...(edit.arguments === undefined ? binding.arguments : edit.arguments),
  };
  if (binding.trigger.kind === "join") {
    for (const inputName of Object.keys(binding.trigger.inputs)) {
      delete next[inputName];
    }
  }
  return next;
}

function editedOutputs(
  binding: Binding,
  edit: RealtimeBindingEdit,
): Binding["outputs"] {
  return edit.outputNames === undefined
    ? binding.outputs
    : Object.fromEntries(
        edit.outputNames.map((name) => [name, binding.outputs[name] ?? {}]),
      );
}

function editedMaterialization(
  project: Project,
  binding: Binding,
  edit: RealtimeBindingEdit,
): Binding["materialization"] {
  if (edit.materialization === undefined) {
    return binding.materialization;
  }
  if (edit.materialization === null) {
    return undefined;
  }
  const next = {
    ...(binding.materialization ?? {
      retention: "session" as const,
      startup: "manual" as const,
    }),
    ...edit.materialization,
  };
  return realtimeAutomaticStartupSource(project, binding.id) !== null ||
    next.startup === "manual"
    ? next
    : { ...next, startup: "manual" };
}

function updateBindingOperations(
  project: Project,
  bindingId: string,
  edit: RealtimeBindingEdit,
): ProjectOperation[] {
  const binding = project.bindings.find(
    (candidate) => candidate.id === bindingId,
  );
  if (binding === undefined) {
    return [];
  }
  const materialization = editedMaterialization(project, binding, edit);
  const next: Binding = {
    ...binding,
    arguments: editedArguments(binding, edit),
    handler: edit.handler ?? binding.handler,
    outputs: editedOutputs(binding, edit),
    scheduling: { ...binding.scheduling, ...edit.scheduling },
  };
  if (materialization === undefined) {
    delete next.materialization;
  } else {
    next.materialization = materialization;
  }
  return setRealtimeBindingOperations(project, next);
}

function runtimeSourceSectionId(project: Project): string | null {
  return (
    Object.values(project.sections).find((section) => section.kind === "code")
      ?.id ?? null
  );
}

function sourceMatchesProject(
  source: RuntimeSourceDocument,
  project: Project,
): boolean {
  return (
    source.projectId === project.id &&
    source.entrypoint === project.runtime.entrypoint
  );
}

function sourceFailureMessage(prefix: string, caught: unknown): string {
  return `${prefix}: ${errorMessage(caught)}`;
}

function sourceRequestIsCurrent(
  active: boolean,
  generation: number,
  currentGeneration: number,
): boolean {
  return active && generation === currentGeneration;
}

function sourceStatus(
  document: RuntimeSourceDocument | null,
): RuntimeSourceViewState["status"] {
  return document === null ? "unavailable" : "ready";
}

function workspaceSectionAllowsSourceApply(
  section: WorkspaceSection | undefined,
): boolean {
  return (
    section?.kind === WORKSPACE_CODE_SECTION_KIND &&
    !section.positionAndSizeLocked &&
    (section.data as { mode?: unknown }).mode === "editable"
  );
}

function sourceStateAllowsApply(
  project: Project,
  source: RuntimeSourceViewState,
  document: RuntimeSourceDocument,
  sectionId: string,
  nextSource: string,
): boolean {
  return (
    source.status === "ready" &&
    runtimeSourceSectionId(project) === sectionId &&
    (source.activationRejected || nextSource !== document.source)
  );
}

function appliedSourceState(
  result: ApplyRuntimeSourceResult,
): RuntimeSourceViewState {
  if (result.activation.state === "rejected") {
    return {
      activationRejected: true,
      document: result.source,
      notice: {
        kind: "error",
        message: `Runtime source was saved, but activation was rejected: ${result.activation.error.message}`,
      },
      status: "ready",
    };
  }
  return {
    activationRejected: false,
    document: result.source,
    notice: {
      kind: "success",
      message: "Runtime source was saved and activated.",
    },
    status: "ready",
  };
}

function sourceResultMatchesCurrentProject(
  active: boolean,
  project: Project | null,
  result: ApplyRuntimeSourceResult,
  sectionId: string,
): boolean {
  return (
    active &&
    project !== null &&
    sourceMatchesProject(result.source, project) &&
    runtimeSourceSectionId(project) === sectionId
  );
}

export function RealtimeController() {
  const [host, setHost] = useState<WorkspaceHost | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [runtime, setRuntime] = useState<RuntimeViewState>(
    initialRuntimeViewState,
  );
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<RuntimeSourceViewState>(
    initialRuntimeSourceViewState,
  );
  const projectRef = useRef<Project | null>(null);
  const runtimeRef = useRef<RuntimeViewState>(initialRuntimeViewState);
  const sourceRef = useRef<RuntimeSourceViewState>(
    initialRuntimeSourceViewState,
  );
  const runtimeTransportRef = useRef<RuntimeTransport | null>(null);
  const initializationRef = useRef<RuntimeInitializationCoordinator | null>(
    null,
  );
  const enqueueRef = useRef<EnqueueMutation | null>(null);
  const applyRuntimeSourceRef = useRef<
    ((sectionId: string, source: string) => Promise<boolean>) | null
  >(null);
  const catalogRef = useRef<RealtimeSectionKindCatalog | null>(null);
  if (initializationRef.current === null) {
    initializationRef.current = new RuntimeInitializationCoordinator({
      getProject: () => projectRef.current,
      getRuntime: () => runtimeRef.current,
      send: (event) => runtimeTransportRef.current?.send(event) ?? false,
    });
  }
  if (catalogRef.current === null) {
    catalogRef.current = createRealtimeSectionKinds((sectionId, data) => {
      void applyRuntimeSourceRef.current?.(sectionId, data.code);
    });
  }

  const actions = useMemo<RealtimeActions>(
    () => ({
      applyRuntimeSource: (sectionId, nextSource) =>
        applyRuntimeSourceRef.current?.(sectionId, nextSource) ??
        Promise.resolve(false),
      cancel: (identity) =>
        runtimeTransportRef.current?.send({ identity, type: "cancel" }) ??
        false,
      connectGraph: (connection) =>
        enqueueRef.current?.((current) =>
          connectRealtimeGraphOperations(current, connection),
        ) ?? Promise.resolve(false),
      commitSectionData: async (
        sectionId: string,
        data: WorkspaceSectionData,
      ) => {
        const enqueue = enqueueRef.current;
        return enqueue === null
          ? false
          : enqueue((current) => [
              replaceSectionDataOperation(current, sectionId, data),
            ]);
      },
      emit: (sectionId, event, payload) => {
        const currentRuntime = runtimeRef.current;
        const sessionId = currentRuntime.sessionId;
        if (!runtimeCanInvoke(currentRuntime) || sessionId === null) {
          return false;
        }
        return (
          runtimeTransportRef.current?.send({
            cause: "interaction",
            event,
            payload,
            sectionId,
            sessionId,
            type: "event",
          }) ?? false
        );
      },
      createHandler: (handler) => {
        const bindingId = newDomainId("binding");
        const sectionId = newDomainId("handler");
        return (
          enqueueRef.current?.((current) =>
            createHandlerOperations(current, handler, bindingId, sectionId),
          ) ?? Promise.resolve(false)
        );
      },
      deleteGraphEdges: (edgeIds) =>
        enqueueRef.current?.((current) =>
          deleteRealtimeGraphOperations(current, edgeIds),
        ) ?? Promise.resolve(false),
      initialize: (sectionId, event, createPayload) =>
        initializationRef.current?.initialize(
          sectionId,
          event,
          createPayload,
        ) ?? Promise.resolve(false),
      reload: async () => {
        setError(null);
        try {
          await reloadRuntime();
          return true;
        } catch (caught) {
          setError(errorMessage(caught));
          return false;
        }
      },
      reconnectGraph: (reconnect) =>
        enqueueRef.current?.((current) =>
          reconnectRealtimeGraphOperations(current, reconnect),
        ) ?? Promise.resolve(false),
      reportError: setError,
      uploadContent: (content: Blob): Promise<ContentReference> =>
        uploadContent(content, newStagingId()),
      updateBinding: (bindingId, edit) =>
        enqueueRef.current?.((current) =>
          updateBindingOperations(current, bindingId, edit),
        ) ?? Promise.resolve(false),
    }),
    [],
  );

  useEffect(() => {
    const workspaceHost = createWorkspaceHost();
    registerRealtimeSectionKinds(workspaceHost, catalogRef.current!);
    setWorkspaceColorMode(workspaceHost, "system");
    let active = true;
    let projecting = false;
    let mutationChain = Promise.resolve();
    let pendingWorkspaceMutations = 0;
    let deferredWorkspaceProjection: WorkspaceProjection | null = null;
    let disconnectProjectEvents: (() => void) | null = null;
    let retryTimer: number | null = null;
    let runtimeGeneration = 0;
    let sourceGeneration = 0;

    const replaceSource = (next: RuntimeSourceViewState) => {
      if (!active) {
        return;
      }
      sourceRef.current = next;
      setSource(next);
    };

    const updateRuntime = (
      transform: (current: RuntimeViewState) => RuntimeViewState,
    ) => {
      if (!active) {
        return;
      }
      setRuntime((current) => {
        const next = transform(current);
        runtimeRef.current = next;
        return next;
      });
    };

    const projectCanAdvance = (nextProject: Project): boolean => {
      const current = projectRef.current;
      if (current === null) {
        return true;
      }
      if (nextProject.id !== current.id) {
        setError("Realtime rejected a snapshot for another project.");
        return false;
      }
      return nextProject.revision >= current.revision;
    };

    const commitWorkspaceProjection = (projection: WorkspaceProjection) => {
      const document = projectWorkspaceDocument(
        projection.project,
        workspaceHost.getSnapshot(),
        projection.sourceDocument,
        projection.preserveSourceDraft,
      );
      projecting = true;
      try {
        commitWorkspaceDocument(workspaceHost, document);
      } finally {
        projecting = false;
      }
    };

    const publishWorkspaceProjection = (projection: WorkspaceProjection) => {
      if (pendingWorkspaceMutations > 0) {
        deferredWorkspaceProjection = projection;
        return;
      }
      deferredWorkspaceProjection = null;
      commitWorkspaceProjection(projection);
    };

    const completeWorkspaceMutation = () => {
      pendingWorkspaceMutations -= 1;
      if (
        pendingWorkspaceMutations !== 0 ||
        deferredWorkspaceProjection === null ||
        !active
      ) {
        return;
      }
      const projection = deferredWorkspaceProjection;
      deferredWorkspaceProjection = null;
      commitWorkspaceProjection(projection);
    };

    const acceptProject = (
      nextProject: Project,
      sourceDocument: RuntimeSourceDocument | null,
      preserveSourceDraft: boolean,
      clearError = true,
    ): boolean => {
      if (!projectCanAdvance(nextProject)) {
        return false;
      }
      const sourceSectionId = runtimeSourceSectionId(nextProject);
      if (
        sourceSectionId !== null &&
        (sourceDocument === null ||
          !sourceMatchesProject(sourceDocument, nextProject))
      ) {
        setError("Realtime rejected source for another project entrypoint.");
        return false;
      }
      publishWorkspaceProjection({
        preserveSourceDraft,
        project: nextProject,
        sourceDocument,
      });
      projectRef.current = nextProject;
      setProject(nextProject);
      if (sourceSectionId === null) {
        ++sourceGeneration;
        replaceSource(initialRuntimeSourceViewState);
      } else if (sourceRef.current.document !== sourceDocument) {
        replaceSource({
          activationRejected: false,
          document: sourceDocument,
          notice: null,
          status: "ready",
        });
      }
      if (clearError) {
        setError(null);
      }
      return true;
    };

    const resolveProjectSource = async (
      nextProject: Project,
    ): Promise<{
      document: RuntimeSourceDocument | null;
      preserveDraft: boolean;
    } | null> => {
      if (runtimeSourceSectionId(nextProject) === null) {
        ++sourceGeneration;
        return { document: null, preserveDraft: false };
      }
      const current = sourceRef.current.document;
      if (current !== null && sourceMatchesProject(current, nextProject)) {
        return { document: current, preserveDraft: true };
      }
      const previous = sourceRef.current;
      const generation = ++sourceGeneration;
      replaceSource({
        activationRejected: false,
        document: previous.document,
        notice: null,
        status: "loading",
      });
      try {
        const document = await fetchRuntimeSource();
        if (!sourceRequestIsCurrent(active, generation, sourceGeneration)) {
          return null;
        }
        if (!sourceMatchesProject(document, nextProject)) {
          throw new Error(
            "Realtime received source for another project entrypoint.",
          );
        }
        return { document, preserveDraft: false };
      } catch (caught) {
        if (sourceRequestIsCurrent(active, generation, sourceGeneration)) {
          replaceSource({
            ...previous,
            notice: {
              kind: "error",
              message: sourceFailureMessage(
                "Runtime source could not be loaded",
                caught,
              ),
            },
            status: sourceStatus(previous.document),
          });
        }
        throw caught;
      }
    };

    const acceptPublishedProject = async (
      nextProject: Project,
      clearError = true,
    ): Promise<boolean> => {
      if (!projectCanAdvance(nextProject)) {
        return false;
      }
      if (projectRef.current?.revision === nextProject.revision) {
        return true;
      }
      const resolved = await resolveProjectSource(nextProject);
      return (
        resolved !== null &&
        active &&
        acceptProject(
          nextProject,
          resolved.document,
          resolved.preserveDraft,
          clearError,
        )
      );
    };

    const recoverConflict = async () => {
      const latest = await fetchProject();
      if (active) {
        await acceptPublishedProject(latest);
      }
    };

    const handleMutationFailure = async (caught: unknown, current: Project) => {
      if (!active) {
        return;
      }
      if (!isRevisionConflict(caught)) {
        acceptProject(current, sourceRef.current.document, true, false);
        setError(errorMessage(caught));
        return;
      }
      try {
        await recoverConflict();
        if (active) {
          setError(
            "The project changed before this edit was applied. Realtime reloaded the latest project.",
          );
        }
      } catch (recoveryError) {
        if (active) {
          setError(errorMessage(recoveryError));
        }
      }
    };

    const enqueue: EnqueueMutation = (build, origin = "application") => {
      const workspaceMutation = origin === "workspace";
      if (workspaceMutation) {
        pendingWorkspaceMutations += 1;
      }
      let resolveResult: (result: boolean) => void = () => {};
      const result = new Promise<boolean>((resolve) => {
        resolveResult = resolve;
      });
      const run = async () => {
        try {
          if (!active || projectRef.current === null) {
            resolveResult(false);
            return;
          }
          const current = projectRef.current;
          try {
            const operations = build(current);
            if (operations.length === 0) {
              resolveResult(true);
              return;
            }
            const nextProject = await applyProject(current, operations);
            resolveResult(
              active && (await acceptPublishedProject(nextProject)),
            );
          } catch (caught) {
            await handleMutationFailure(caught, current);
            resolveResult(false);
          }
        } finally {
          if (workspaceMutation) {
            completeWorkspaceMutation();
          }
        }
      };
      mutationChain = mutationChain.then(run, run);
      return result;
    };
    enqueueRef.current = enqueue;

    const recoverSourceConflict = async (
      requestProject: Project,
      baseline: RuntimeSourceViewState,
    ) => {
      try {
        const latest = await fetchRuntimeSource();
        const currentProject = projectRef.current;
        if (
          !active ||
          currentProject === null ||
          currentProject.id !== requestProject.id ||
          currentProject.runtime.entrypoint !==
            requestProject.runtime.entrypoint ||
          !sourceMatchesProject(latest, currentProject)
        ) {
          return;
        }
        replaceSource({
          activationRejected: false,
          document: latest,
          notice: {
            kind: "error",
            message:
              "Runtime source changed on disk. Review your draft and apply again.",
          },
          status: "ready",
        });
      } catch (caught) {
        replaceSource({
          ...baseline,
          notice: {
            kind: "error",
            message: sourceFailureMessage(
              "Runtime source conflict recovery failed",
              caught,
            ),
          },
          status: sourceStatus(baseline.document),
        });
      }
    };

    type SourceApplication = {
      baseline: RuntimeSourceViewState;
      document: RuntimeSourceDocument;
      project: Project;
    };

    const prepareSourceApplication = (
      sectionId: string,
      nextSource: string,
    ): SourceApplication | null => {
      const project = projectRef.current;
      const baseline = sourceRef.current;
      const document = baseline.document;
      if (project === null || document === null) {
        return null;
      }
      if (
        !sourceStateAllowsApply(
          project,
          baseline,
          document,
          sectionId,
          nextSource,
        ) ||
        !workspaceSectionAllowsSourceApply(
          workspaceHost.getSnapshot().sections[sectionId],
        )
      ) {
        return null;
      }
      return { baseline, document, project };
    };

    const acceptAppliedSource = (
      sectionId: string,
      result: ApplyRuntimeSourceResult,
    ): boolean => {
      if (
        !sourceResultMatchesCurrentProject(
          active,
          projectRef.current,
          result,
          sectionId,
        )
      ) {
        return false;
      }
      replaceSource(appliedSourceState(result));
      return true;
    };

    const handleSourceApplyFailure = async (
      caught: unknown,
      application: SourceApplication,
    ): Promise<boolean> => {
      if (!active) {
        return false;
      }
      if (isRevisionConflict(caught)) {
        await recoverSourceConflict(application.project, application.baseline);
        return false;
      }
      replaceSource({
        ...application.baseline,
        notice: {
          kind: "error",
          message: sourceFailureMessage(
            "Runtime source could not be applied",
            caught,
          ),
        },
        status: "ready",
      });
      return false;
    };

    const applyRuntimeSource = async (
      sectionId: string,
      nextSource: string,
    ): Promise<boolean> => {
      const application = prepareSourceApplication(sectionId, nextSource);
      if (application === null) {
        return false;
      }
      replaceSource({
        ...application.baseline,
        notice: null,
        status: "applying",
      });
      try {
        const result = await applyRuntimeSourceRequest({
          entrypoint: application.document.entrypoint,
          expectedVersion: application.document.version,
          projectId: application.document.projectId,
          source: nextSource,
        });
        return acceptAppliedSource(sectionId, result);
      } catch (caught) {
        return handleSourceApplyFailure(caught, application);
      }
    };
    applyRuntimeSourceRef.current = applyRuntimeSource;

    const unsubscribeWorkspace = workspaceHost.subscribe(
      (document: WorkspaceDocument) => {
        const current = projectRef.current;
        if (!projecting && current !== null) {
          const operations = workspaceDocumentOperations(current, document);
          if (operations.length > 0) {
            void enqueue(() => operations, "workspace");
          }
        }
      },
    );

    const openRuntime = () => {
      if (!active) {
        return;
      }
      const generation = ++runtimeGeneration;
      let invalid = false;
      updateRuntime(beginRuntimeReplacement);
      const transport = connectRuntime({
        onClose: () => {
          if (!active || generation !== runtimeGeneration) {
            return;
          }
          runtimeTransportRef.current = null;
          if (invalid) {
            return;
          }
          updateRuntime((current) =>
            setRuntimeConnection(current, "disconnected"),
          );
          retryTimer = window.setTimeout(openRuntime, 500);
        },
        onEnvelope: (envelope) => {
          const currentProject = projectRef.current;
          if (currentProject !== null && generation === runtimeGeneration) {
            updateRuntime((current) =>
              applyRuntimeEnvelope(current, envelope, currentProject),
            );
          }
        },
        onInvalid: (caught) => {
          if (generation !== runtimeGeneration) {
            return;
          }
          invalid = true;
          setError(errorMessage(caught));
          updateRuntime((current) => setRuntimeConnection(current, "invalid"));
        },
        onOpen: () => {
          if (generation === runtimeGeneration) {
            updateRuntime((current) =>
              setRuntimeConnection(current, "connected"),
            );
          }
        },
      });
      runtimeTransportRef.current = transport;
    };

    const start = async () => {
      try {
        const initialProject = await fetchProject();
        if (!active || !(await acceptPublishedProject(initialProject))) {
          return;
        }
        setHost(workspaceHost);
        disconnectProjectEvents = connectProjectEvents({
          onInvalid: (caught) => {
            if (active) {
              setError(errorMessage(caught));
            }
          },
          onProject: (nextProject) => {
            if (active) {
              void acceptPublishedProject(nextProject).catch((caught) => {
                if (active) {
                  setError(errorMessage(caught));
                }
              });
            }
          },
        });
        openRuntime();
      } catch (caught) {
        if (active) {
          setError(errorMessage(caught));
        }
      }
    };
    void start();

    return () => {
      active = false;
      ++runtimeGeneration;
      ++sourceGeneration;
      enqueueRef.current = null;
      applyRuntimeSourceRef.current = null;
      disconnectProjectEvents?.();
      runtimeTransportRef.current?.close();
      runtimeTransportRef.current = null;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
      unsubscribeWorkspace();
      workspaceHost.dispose();
      projectRef.current = null;
      sourceRef.current = initialRuntimeSourceViewState;
      deferredWorkspaceProjection = null;
    };
  }, []);

  return (
    <RealtimeView
      actions={actions}
      error={error}
      host={host}
      project={project}
      runtime={runtime}
      source={source}
    />
  );
}
