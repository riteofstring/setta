import { setWorkspaceSectionSize, type WorkspaceHost } from "@setta/workspace";

import {
  closeTerminal,
  openTerminal,
  ProjectClientError,
  runTerminal,
} from "../backend/client";
import type { ProjectSnapshotV2 } from "../backend/generatedContract";
import {
  disposeGeneratedPythonTerminal,
  getGeneratedPythonTerminalDimensions,
} from "./generatedPythonTerminalClient";
import { GENERATED_PYTHON_SECTION_ID } from "./workspaceProjection";

const GENERATED_PYTHON_TERMINAL_DEFAULT_HEIGHT = 220;
const GENERATED_PYTHON_TERMINAL_MINIMUM_HEIGHT = 100;

export type GeneratedPythonTerminalState = Readonly<{
  creating: boolean;
  error: string | null;
  projectId: string | null;
  sessionKey: string | null;
  status: "absent" | "hidden" | "visible";
  terminalHeight: number;
}>;

export const initialGeneratedPythonTerminalState: GeneratedPythonTerminalState =
  {
    creating: false,
    error: null,
    projectId: null,
    sessionKey: null,
    status: "absent",
    terminalHeight: GENERATED_PYTHON_TERMINAL_DEFAULT_HEIGHT,
  };

export type GeneratedPythonTerminalActions = Readonly<{
  close: () => void;
  create: () => void;
  hide: () => void;
  reportStreamError: (message: string) => void;
  resize: (nextHeight: number) => void;
  run: () => void;
  show: () => void;
}>;

export type GeneratedPythonTerminalRuntime = GeneratedPythonTerminalActions & {
  dispose: () => void;
};

type RunAfterTargetFlush = (
  operation: (snapshot: ProjectSnapshotV2) => Promise<void>,
) => Promise<void>;

export function createGeneratedPythonTerminalRuntime({
  currentSnapshot,
  host,
  isActive,
  runAfterTargetFlush,
  updateState,
}: {
  currentSnapshot: () => ProjectSnapshotV2 | null;
  host: WorkspaceHost;
  isActive: () => boolean;
  runAfterTargetFlush: RunAfterTargetFlush;
  updateState: (state: GeneratedPythonTerminalState) => void;
}): GeneratedPythonTerminalRuntime {
  let state = initialGeneratedPythonTerminalState;
  let creatingPromise: Promise<void> | null = null;
  let nextSessionNumber = 0;

  const publish = (next: GeneratedPythonTerminalState) => {
    state = next;
    if (isActive()) {
      updateState(next);
    }
  };
  const update = (changes: Partial<GeneratedPythonTerminalState>) => {
    publish({ ...state, ...changes });
  };
  const adjustOwnerHeight = (delta: number): boolean => {
    if (delta === 0) {
      return true;
    }
    const section = host.getSnapshot().sections[GENERATED_PYTHON_SECTION_ID];
    if (!section || typeof section.size.height !== "number") {
      return false;
    }
    setWorkspaceSectionSize(host, GENERATED_PYTHON_SECTION_ID, {
      height: section.size.height + delta,
    });
    return true;
  };
  const makeSessionKey = (projectId: string) => {
    nextSessionNumber += 1;
    return `${projectId}:generated-python:${String(nextSessionNumber)}`;
  };
  const reportError = (action: string, error: unknown) => {
    if (!isActive()) {
      return;
    }
    update({ error: terminalErrorMessage(action, error) });
  };

  function create() {
    if (state.status === "visible") {
      return;
    }
    if (state.status === "hidden") {
      show();
      return;
    }
    if (state.creating) {
      return;
    }
    const snapshot = currentSnapshot();
    if (snapshot === null) {
      return;
    }
    update({ creating: true, error: null });
    const dimensions = getGeneratedPythonTerminalDimensions(null);
    const request = openTerminal({
      columns: dimensions.columns,
      projectId: snapshot.project.id,
      rows: dimensions.rows,
    })
      .then(() => {
        if (!isActive()) {
          return;
        }
        if (!adjustOwnerHeight(state.terminalHeight)) {
          update({
            creating: false,
            error: "Unable to show the terminal in this section.",
          });
          return;
        }
        update({
          creating: false,
          error: null,
          projectId: snapshot.project.id,
          sessionKey: makeSessionKey(snapshot.project.id),
          status: "visible",
        });
      })
      .catch((error: unknown) => {
        if (isActive()) {
          update({ creating: false });
          reportError("create the terminal", error);
        }
      })
      .finally(() => {
        creatingPromise = null;
      });
    creatingPromise = request;
    void request;
  }

  function show() {
    if (state.status !== "hidden") {
      return;
    }
    if (!adjustOwnerHeight(state.terminalHeight)) {
      update({ error: "Unable to show the terminal in this section." });
      return;
    }
    update({ error: null, status: "visible" });
  }

  function hide() {
    if (state.status !== "visible") {
      return;
    }
    if (!adjustOwnerHeight(-state.terminalHeight)) {
      update({ error: "Unable to hide the terminal in this section." });
      return;
    }
    update({ error: null, status: "hidden" });
  }

  function resize(nextHeight: number) {
    if (state.status !== "visible") {
      return;
    }
    const terminalHeight = Math.max(
      GENERATED_PYTHON_TERMINAL_MINIMUM_HEIGHT,
      Math.round(nextHeight),
    );
    const delta = terminalHeight - state.terminalHeight;
    if (!adjustOwnerHeight(delta)) {
      update({ error: "Unable to resize the terminal in this section." });
      return;
    }
    update({ error: null, terminalHeight });
  }

  function run() {
    void runAfterTargetFlush(async (snapshot) => {
      // Run remains visually enabled. When Create already owns the one shell request, join it
      // before asking the run route to reuse that shell rather than adding a second pane/height.
      await creatingPromise;
      const sessionKey =
        state.sessionKey ?? makeSessionKey(snapshot.project.id);
      const dimensions = getGeneratedPythonTerminalDimensions(state.sessionKey);
      try {
        await runTerminal({
          columns: dimensions.columns,
          expectedRevision: snapshot.project.revision,
          projectId: snapshot.project.id,
          rows: dimensions.rows,
        });
        if (!isActive()) {
          return;
        }
        // Main does not reveal or focus an existing hidden terminal on Run. A missing runtime
        // terminal is the only case that grows the card and makes its pane visible.
        if (state.status === "absent") {
          if (!adjustOwnerHeight(state.terminalHeight)) {
            update({ error: "Unable to show the terminal in this section." });
            return;
          }
          update({
            error: null,
            projectId: snapshot.project.id,
            sessionKey,
            status: "visible",
          });
          return;
        }
        update({ error: null });
      } catch (error) {
        reportError("run Generated Python", error);
      }
    });
  }

  function close() {
    if (state.status === "absent" || state.creating) {
      return;
    }
    const snapshot = currentSnapshot();
    if (snapshot === null) {
      return;
    }
    const sessionKey = state.sessionKey;
    update({ creating: true, error: null });
    void closeTerminal({ projectId: snapshot.project.id })
      .then(() => {
        if (!isActive()) {
          return;
        }
        disposeGeneratedPythonTerminal(sessionKey);
        if (state.status === "visible") {
          adjustOwnerHeight(-state.terminalHeight);
        }
        update({
          creating: false,
          error: null,
          projectId: null,
          sessionKey: null,
          status: "absent",
        });
      })
      .catch((error: unknown) => {
        if (isActive()) {
          update({ creating: false });
          reportError("close the terminal", error);
        }
      });
  }

  function reportStreamError(message: string) {
    if (isActive()) {
      update({ error: message });
    }
  }

  function dispose() {
    disposeGeneratedPythonTerminal(state.sessionKey);
  }

  return { close, create, dispose, hide, reportStreamError, resize, run, show };
}

function terminalErrorMessage(action: string, error: unknown): string {
  if (error instanceof ProjectClientError) {
    return error.message;
  }
  return `Unable to ${action}. Try again.`;
}
