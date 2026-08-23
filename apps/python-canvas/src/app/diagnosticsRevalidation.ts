import {
  PROVIDER_LIFECYCLE_STATE_FAILED_V2,
  type ProjectSnapshotV2,
} from "../backend/generatedContract";

const diagnosticsRevalidationIntervalMs = 100;

type DiagnosticsRevalidationEnvironment = Readonly<{
  acceptSnapshot: (snapshot: ProjectSnapshotV2) => void;
  currentSnapshot: () => ProjectSnapshotV2 | null;
  fetchSnapshot: (options: {
    signal?: AbortSignal;
  }) => Promise<ProjectSnapshotV2>;
  hasPendingWorkspaceStructure: (snapshot: ProjectSnapshotV2) => boolean;
  isActive: () => boolean;
}>;

export function createDiagnosticsRevalidator(
  environment: DiagnosticsRevalidationEnvironment,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let request: { controller: AbortController; revision: number } | null = null;

  function revalidate(candidate: ProjectSnapshotV2) {
    cancelTimer();
    if (!requiresDiagnosticsRevalidation(candidate)) {
      cancelRequest();
      return;
    }
    if (request !== null) {
      if (request.revision === candidate.project.revision) {
        return;
      }
      const previous = request;
      request = null;
      previous.controller.abort();
    }
    timer = setTimeout(requestDiagnostics, diagnosticsRevalidationIntervalMs);
  }

  function requestDiagnostics() {
    timer = null;
    const current = environment.currentSnapshot();
    if (
      !environment.isActive() ||
      current === null ||
      !requiresDiagnosticsRevalidation(current)
    ) {
      return;
    }
    const controller = new AbortController();
    const pending = { controller, revision: current.project.revision };
    request = pending;
    void environment
      .fetchSnapshot({ signal: controller.signal })
      .then((nextSnapshot) => {
        if (!environment.isActive() || request !== pending) {
          return;
        }
        request = null;
        const latest = environment.currentSnapshot();
        if (
          latest === null ||
          isOlderDiagnosticsSnapshot(nextSnapshot, latest)
        ) {
          if (latest !== null) {
            revalidate(latest);
          }
          return;
        }
        if (environment.hasPendingWorkspaceStructure(latest)) {
          revalidate(latest);
          return;
        }
        environment.acceptSnapshot(nextSnapshot);
      })
      .catch(() => {
        if (
          !environment.isActive() ||
          request !== pending ||
          controller.signal.aborted
        ) {
          return;
        }
        request = null;
        const latest = environment.currentSnapshot();
        if (latest !== null) {
          revalidate(latest);
        }
      });
  }

  function dispose() {
    cancelTimer();
    cancelRequest();
  }

  return { dispose, revalidate };

  function cancelTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function cancelRequest() {
    const pending = request;
    request = null;
    pending?.controller.abort();
  }
}

function requiresDiagnosticsRevalidation(snapshot: ProjectSnapshotV2) {
  return (
    snapshot.diagnosticsRevision < snapshot.project.revision &&
    snapshot.providerStatus.state !== PROVIDER_LIFECYCLE_STATE_FAILED_V2
  );
}

function isOlderDiagnosticsSnapshot(
  candidate: ProjectSnapshotV2,
  current: ProjectSnapshotV2,
) {
  return (
    candidate.project.revision < current.project.revision ||
    (candidate.project.revision === current.project.revision &&
      candidate.diagnosticsRevision < current.diagnosticsRevision)
  );
}
