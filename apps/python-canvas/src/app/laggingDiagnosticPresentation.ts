import { type WorkspaceSection } from "@setta/workspace";

import {
  PROVIDER_LIFECYCLE_STATE_FAILED_V2,
  type ProjectSnapshotV2,
} from "../backend/generatedContract";
import {
  readCallableSectionData,
  type CallableSectionData,
} from "../sections/CallableSection";
import {
  readParameterDictionarySectionData,
  type ParameterDictionarySectionData,
} from "../sections/ParamDictSection";

type DiagnosticPresentationTarget = Readonly<{
  id: string;
  kind: "callable" | "dictionary";
}>;

export function retainLaggingDiagnosticPresentation(
  previous: WorkspaceSection,
  next: WorkspaceSection,
  snapshot: ProjectSnapshotV2,
  target: DiagnosticPresentationTarget | null,
): WorkspaceSection {
  if (
    target === null ||
    snapshot.diagnosticsRevision >= snapshot.project.revision ||
    snapshot.providerStatus.state === PROVIDER_LIFECYCLE_STATE_FAILED_V2
  ) {
    return next;
  }
  const itemTree = next.itemTree;
  const itemIds = new Set(
    itemTree === undefined
      ? []
      : Object.keys(itemTree.items).filter(
          (itemId) => itemId !== itemTree.rootId,
        ),
  );
  if (target.kind === "callable") {
    const previousData = readCallableSectionData(previous.data);
    if (previousData.callable.id !== target.id) {
      return next;
    }
    const nextData = readCallableSectionData(next.data);
    return {
      ...next,
      data: {
        ...nextData,
        callableDiagnosticMessage: previousData.callableDiagnosticMessage,
        parameterDiagnostics: Object.fromEntries(
          Object.entries(previousData.parameterDiagnostics).filter(([itemId]) =>
            itemIds.has(itemId),
          ),
        ),
      } satisfies CallableSectionData,
    };
  }
  const previousData = readParameterDictionarySectionData(previous.data);
  if (previousData.dictionary.id !== target.id) {
    return next;
  }
  const nextData = readParameterDictionarySectionData(next.data);
  return {
    ...next,
    data: {
      ...nextData,
      entryDiagnostics: Object.fromEntries(
        Object.entries(previousData.entryDiagnostics).filter(([itemId]) =>
          itemIds.has(itemId),
        ),
      ),
    } satisfies ParameterDictionarySectionData,
  };
}
