import {
  activateWorkspaceSavedView,
  commitWorkspaceDocument,
  createWorkspaceHost,
  registerWorkspaceCommands,
  registerWorkspaceToolbarContributions,
  setWorkspaceCapabilities,
  setWorkspaceColorMode,
  type WorkspaceHost,
} from "@setta/workspace";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  BenchClientError,
  cancelRun,
  connectSnapshotEvents,
  fetchSnapshot,
  importCandidate,
  launchProject,
  putReview,
  replaceProject,
  rerun,
} from "../backend/client";
import type {
  ApplicationSnapshotV1,
  ProjectDraftV1,
  ProjectV1,
} from "../backend/generatedContract";
import { PlayIcon } from "../sections/SectionIcons";
import { type BenchActions, projectDraft } from "./benchContext";
import { registerBenchSectionKinds } from "./benchSectionKinds";
import { BenchView } from "./BenchView";
import {
  BENCH_BUILD_VIEW_ID,
  BENCH_RUNS_VIEW_ID,
  projectDraftFromWorkspace,
  projectDraftSignature,
  projectWorkspaceDocument,
} from "./projectProjection";

type ActionImplementation = BenchActions;

function errorMessage(error: unknown): string {
  if (error instanceof BenchClientError || error instanceof Error) {
    return error.message;
  }
  return "Setta Bench encountered an unexpected error.";
}

function launchDisabledReason(
  snapshot: ApplicationSnapshotV1 | null,
  pendingAction: string | null,
): string | null {
  if (pendingAction !== null) return "Another Bench action is in progress.";
  if (snapshot === null) return "The Bench project is still loading.";
  if (!snapshot.validation.ready) {
    return (
      snapshot.validation.issues[0]?.message ??
      "Resolve the project validation issues before launching."
    );
  }
  return null;
}

export function BenchController() {
  const [host, setHost] = useState<WorkspaceHost | null>(null);
  const [snapshot, setSnapshot] = useState<ApplicationSnapshotV1 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const implementationRef = useRef<ActionImplementation | null>(null);
  const snapshotRef = useRef<ApplicationSnapshotV1 | null>(null);
  const pendingActionRef = useRef<string | null>(null);
  const actions = useMemo<BenchActions>(
    () => ({
      cancelRun: (runId) =>
        implementationRef.current?.cancelRun(runId) ?? Promise.resolve(false),
      importCandidate: (directory) =>
        implementationRef.current?.importCandidate(directory) ??
        Promise.resolve(false),
      launch: () =>
        implementationRef.current?.launch() ?? Promise.resolve(false),
      replaceProject: (transform) =>
        implementationRef.current?.replaceProject(transform) ??
        Promise.resolve(false),
      rerun: (runId) =>
        implementationRef.current?.rerun(runId) ?? Promise.resolve(false),
      saveReview: (input) =>
        implementationRef.current?.saveReview(input) ?? Promise.resolve(false),
    }),
    [],
  );

  useEffect(() => {
    const workspaceHost = createWorkspaceHost();
    registerBenchSectionKinds(workspaceHost);
    setWorkspaceColorMode(workspaceHost, "system");
    setWorkspaceCapabilities(workspaceHost, {
      canEditLayout: true,
      canEditStructure: false,
    });
    let active = true;
    let loaded = false;
    let projecting = false;
    let disconnectEvents: (() => void) | null = null;
    let unsubscribeWorkspace: (() => void) | null = null;

    const setPending = (value: string | null) => {
      pendingActionRef.current = value;
      if (active) setPendingAction(value);
    };

    const acceptProject = (project: ProjectV1) => {
      const current = snapshotRef.current;
      if (
        current === null ||
        project.id !== current.project.id ||
        project.revision < current.project.revision
      ) {
        return;
      }
      acceptSnapshot({ ...current, project });
    };

    const acceptSnapshot = (next: ApplicationSnapshotV1) => {
      if (!active) return;
      const current = snapshotRef.current;
      if (
        current !== null &&
        (next.project.id !== current.project.id ||
          next.project.revision < current.project.revision)
      ) {
        setError("Setta Bench rejected an older or unrelated snapshot.");
        return;
      }
      const document = projectWorkspaceDocument(
        next.project,
        loaded ? workspaceHost.getSnapshot() : undefined,
      );
      projecting = true;
      try {
        if (loaded) {
          commitWorkspaceDocument(workspaceHost, document);
        } else {
          workspaceHost.loadDocument(document);
          loaded = true;
          setHost(workspaceHost);
        }
      } finally {
        projecting = false;
      }
      snapshotRef.current = next;
      setSnapshot(next);
      setError(null);
    };

    const runAction = async (
      name: string,
      action: () => Promise<void>,
    ): Promise<boolean> => {
      if (!active || pendingActionRef.current !== null) return false;
      setPending(name);
      try {
        await action();
        if (active) setError(null);
        return true;
      } catch (caught) {
        if (active) setError(errorMessage(caught));
        return false;
      } finally {
        if (active) setPending(null);
      }
    };

    implementationRef.current = {
      cancelRun: (runId) => runAction("cancel", () => cancelRun(runId)),
      importCandidate: (bundleDirectory) =>
        runAction("import", async () => {
          const current = snapshotRef.current;
          if (current === null) throw new Error("Bench is still loading.");
          acceptProject(
            await importCandidate(current.project, bundleDirectory),
          );
        }),
      launch: () =>
        runAction("launch", async () => {
          const current = snapshotRef.current;
          if (current === null) throw new Error("Bench is still loading.");
          const disabled = launchDisabledReason(current, null);
          if (disabled !== null) throw new Error(disabled);
          await launchProject(current.project);
          activateWorkspaceSavedView(workspaceHost, BENCH_RUNS_VIEW_ID);
        }),
      replaceProject: (transform) =>
        runAction("save", async () => {
          const current = snapshotRef.current;
          if (current === null) throw new Error("Bench is still loading.");
          const draft = transform(current.project);
          acceptProject(await replaceProject(current.project, draft));
        }),
      rerun: (runId) =>
        runAction("rerun", async () => {
          await rerun(runId);
          activateWorkspaceSavedView(workspaceHost, BENCH_RUNS_VIEW_ID);
        }),
      saveReview: (input) => runAction("review", () => putReview(input)),
    };

    registerWorkspaceCommands(workspaceHost, [
      {
        getDisabledReason: () =>
          launchDisabledReason(snapshotRef.current, pendingActionRef.current),
        getStatusMessage: () => {
          const current = snapshotRef.current;
          return current === null
            ? "Bench project loading"
            : `Run ${String(current.validation.caseCount)} cases × ${String(current.project.candidates.length)} candidates = ${String(current.validation.executionCount)} executions`;
        },
        icon: PlayIcon,
        id: "bench.launch",
        label: "Run all candidates",
        run: () => void implementationRef.current?.launch(),
        scope: "pane",
        surfaces: ["toolbar", "palette"],
      },
    ]);
    registerWorkspaceToolbarContributions(workspaceHost, [
      {
        commandId: "bench.launch",
        description: "Run every candidate across the current case manifest",
        icon: PlayIcon,
        kind: "command",
        placement: "before-viewport",
      },
    ]);

    void fetchSnapshot()
      .then((initial) => {
        if (!active) return;
        acceptSnapshot(initial);
        unsubscribeWorkspace = workspaceHost.subscribe((document) => {
          if (projecting || pendingActionRef.current !== null) return;
          if (document.savedViews?.activeViewId !== BENCH_BUILD_VIEW_ID) return;
          const current = snapshotRef.current;
          if (current === null) return;
          let draft: ProjectDraftV1;
          try {
            draft = projectDraftFromWorkspace(current.project, document);
          } catch (caught) {
            setError(errorMessage(caught));
            return;
          }
          if (
            projectDraftSignature(draft) ===
            projectDraftSignature(projectDraft(current.project))
          ) {
            return;
          }
          void implementationRef.current?.replaceProject(() => draft);
        });
        disconnectEvents = connectSnapshotEvents({
          onInvalid: (caught) => {
            if (active) setError(errorMessage(caught));
          },
          onSnapshot: acceptSnapshot,
        });
      })
      .catch((caught) => {
        if (active) setError(errorMessage(caught));
      });

    return () => {
      active = false;
      implementationRef.current = null;
      disconnectEvents?.();
      unsubscribeWorkspace?.();
      workspaceHost.dispose();
    };
  }, []);

  return (
    <BenchView
      actions={actions}
      error={error}
      host={host}
      pendingAction={pendingAction}
      snapshot={snapshot}
    />
  );
}
