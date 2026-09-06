import { useEffect, useMemo, useRef, useState } from "react";
import {
  commitWorkspaceDocument,
  createWorkspaceHost,
  setWorkspaceColorMode,
  type WorkspaceDocument,
  type WorkspaceSectionData,
  type WorkspaceHost,
} from "@setta/workspace";

import {
  RealtimeClientError,
  applyProject,
  connectProjectEvents,
  connectRuntime,
  fetchProject,
  uploadContent,
} from "../backend/client";
import type {
  ContentReference,
  Project,
  RuntimeCommand,
  RuntimeEvent,
} from "../backend/generatedContract";
import {
  projectWorkspaceDocument,
  replaceSectionDataOperation,
  workspaceDocumentOperations,
  type ProjectOperation,
} from "./projectProjection";
import {
  applyRuntimeEnvelope,
  beginRuntimeReplacement,
  initialRuntimeViewState,
  setRuntimeConnection,
  type RuntimeViewState,
} from "./runtimeState";
import {
  createRealtimeSectionKinds,
  registerRealtimeSectionKinds,
  type RealtimeSectionKindCatalog,
} from "./realtimeSectionKinds";
import type { RealtimeActions } from "./runtimeContext";
import { RealtimeView } from "./RealtimeView";

type EnqueueMutation = (
  build: (project: Project) => ProjectOperation[],
) => Promise<boolean>;

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

export function RealtimeController() {
  const [host, setHost] = useState<WorkspaceHost | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [runtime, setRuntime] = useState<RuntimeViewState>(
    initialRuntimeViewState,
  );
  const [error, setError] = useState<string | null>(null);
  const projectRef = useRef<Project | null>(null);
  const runtimeRef = useRef<RuntimeViewState>(initialRuntimeViewState);
  const runtimeTransportRef = useRef<RuntimeTransport | null>(null);
  const enqueueRef = useRef<EnqueueMutation | null>(null);
  const catalogRef = useRef<RealtimeSectionKindCatalog | null>(null);
  if (catalogRef.current === null) {
    catalogRef.current = createRealtimeSectionKinds();
  }

  const actions = useMemo<RealtimeActions>(
    () => ({
      cancel: (identity) =>
        runtimeTransportRef.current?.send({ identity, type: "cancel" }) ??
        false,
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
        const sessionId = runtimeRef.current.sessionId;
        if (sessionId === null) {
          return false;
        }
        return (
          runtimeTransportRef.current?.send({
            event,
            payload,
            sectionId,
            sessionId,
            type: "event",
          }) ?? false
        );
      },
      reportError: setError,
      uploadContent: (content: Blob): Promise<ContentReference> =>
        uploadContent(content, newStagingId()),
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
    let disconnectProjectEvents: (() => void) | null = null;
    let retryTimer: number | null = null;
    let runtimeGeneration = 0;

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

    const acceptProject = (
      nextProject: Project,
      clearError = true,
    ): boolean => {
      const current = projectRef.current;
      if (current !== null) {
        if (nextProject.id !== current.id) {
          setError("Realtime rejected a snapshot for another project.");
          return false;
        }
        if (nextProject.revision < current.revision) {
          return false;
        }
      }
      projecting = true;
      try {
        commitWorkspaceDocument(
          workspaceHost,
          projectWorkspaceDocument(nextProject),
        );
        projectRef.current = nextProject;
        setProject(nextProject);
        if (clearError) {
          setError(null);
        }
        return true;
      } finally {
        projecting = false;
      }
    };

    const recoverConflict = async () => {
      const latest = await fetchProject();
      if (active) {
        acceptProject(latest);
      }
    };

    const handleMutationFailure = async (caught: unknown, current: Project) => {
      if (!active) {
        return;
      }
      if (!isRevisionConflict(caught)) {
        acceptProject(current, false);
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

    const enqueue: EnqueueMutation = (build) => {
      let resolveResult: (result: boolean) => void = () => {};
      const result = new Promise<boolean>((resolve) => {
        resolveResult = resolve;
      });
      const run = async () => {
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
          resolveResult(active && acceptProject(nextProject));
        } catch (caught) {
          await handleMutationFailure(caught, current);
          resolveResult(false);
        }
      };
      mutationChain = mutationChain.then(run, run);
      return result;
    };
    enqueueRef.current = enqueue;

    const unsubscribeWorkspace = workspaceHost.subscribe(
      (document: WorkspaceDocument) => {
        const current = projectRef.current;
        if (!projecting && current !== null) {
          const operations = workspaceDocumentOperations(current, document);
          void enqueue(() => operations);
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
        if (!active || !acceptProject(initialProject)) {
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
              acceptProject(nextProject);
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
      enqueueRef.current = null;
      disconnectProjectEvents?.();
      runtimeTransportRef.current?.close();
      runtimeTransportRef.current = null;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
      unsubscribeWorkspace();
      workspaceHost.dispose();
      projectRef.current = null;
    };
  }, []);

  return (
    <RealtimeView
      actions={actions}
      catalog={catalogRef.current}
      error={error}
      host={host}
      project={project}
      runtime={runtime}
    />
  );
}
