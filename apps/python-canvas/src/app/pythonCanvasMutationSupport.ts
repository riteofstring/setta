import type { ProjectSnapshotV2 } from "../backend/generatedContract";
import { readGeneratedPythonTarget } from "./workspaceProjection";
import type {
  AppController,
  SectionStructureMutation,
} from "./pythonCanvasAppSupport";
import type { PythonCanvasMutationEnvironment } from "./pythonCanvasMutations";

export function nextCreatedSectionName(
  snapshot: ProjectSnapshotV2,
  preferredName: string,
): string {
  const existing = new Set(
    [
      ...snapshot.callables.map((callable) => callable.name),
      ...snapshot.parameterDictionaries.map((dictionary) => dictionary.name),
      ...snapshot.lists.map((list) => list.name),
    ].map((name) => name.trim().toLocaleLowerCase()),
  );
  if (!existing.has(preferredName.toLocaleLowerCase())) {
    return preferredName;
  }
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${preferredName} ${String(suffix)}`;
    if (!existing.has(candidate.toLocaleLowerCase())) {
      return candidate;
    }
  }
}

export function dispatchSectionStructureMutation(
  controller: AppController | null,
  mutation: SectionStructureMutation,
): void {
  if (controller === null) {
    return;
  }
  if (mutation.kind === "delete") {
    sectionDeleteHandler(controller, mutation.sectionKind)(mutation.sectionId);
    return;
  }
  sectionRenameHandler(controller, mutation.sectionKind)(
    mutation.sectionId,
    mutation.name,
  );
}

export function requireCurrentSnapshot(
  environment: PythonCanvasMutationEnvironment,
): ProjectSnapshotV2 | null {
  return environment.isActive() ? environment.currentSnapshot() : null;
}

export function readEditablePythonTarget(
  environment: PythonCanvasMutationEnvironment,
) {
  try {
    return readGeneratedPythonTarget(environment.host);
  } catch {
    environment.restoreCanonicalProject();
    environment.updateAnnouncement({
      kind: "error",
      message: "The generated Python boundary cannot be edited.",
    });
    return null;
  }
}

export function cancelTimer(
  timers: Map<string, ReturnType<typeof setTimeout>>,
  id: string,
): void {
  const timer = timers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    timers.delete(id);
  }
}

export function cancelTimers(
  timers: Map<string, ReturnType<typeof setTimeout>>,
): void {
  for (const timer of timers.values()) {
    clearTimeout(timer);
  }
  timers.clear();
}

function sectionDeleteHandler(
  controller: AppController,
  sectionKind: SectionStructureMutation["sectionKind"],
) {
  return {
    callable: controller.deleteCallable,
    dictionary: controller.deleteDictionary,
    list: controller.deleteList,
  }[sectionKind];
}

function sectionRenameHandler(
  controller: AppController,
  sectionKind: SectionStructureMutation["sectionKind"],
) {
  return {
    callable: controller.renameCallable,
    dictionary: controller.renameDictionary,
    list: controller.renameList,
  }[sectionKind];
}
