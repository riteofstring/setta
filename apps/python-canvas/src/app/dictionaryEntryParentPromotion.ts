import type { WorkspaceDocument, WorkspaceHost } from "@setta/workspace";

import type { ProjectSnapshotV2 } from "../backend/generatedContract";
import {
  dictionaryEntryParentPromotionRequired,
  promoteDictionaryEntryParents,
} from "./workspaceProjection";

type DictionaryEntryParentPromotionEnvironment = {
  currentSnapshot: () => ProjectSnapshotV2 | null;
  host: WorkspaceHost;
  isActive: () => boolean;
};

// Workspace subscriptions cannot commit synchronously. This bridge identifies
// a leaf-to-parent promotion in the emitted document, then applies the local
// typing update after that notification has returned.
export function createDictionaryEntryParentPromotionScheduler({
  currentSnapshot,
  host,
  isActive,
}: DictionaryEntryParentPromotionEnvironment) {
  let scheduled = false;

  return {
    required(
      document: WorkspaceDocument,
      snapshot: ProjectSnapshotV2,
    ): boolean {
      return snapshot.parameterDictionaries.some((dictionary) =>
        dictionaryEntryParentPromotionRequired(document, dictionary.id),
      );
    },
    schedule(): void {
      if (scheduled) {
        return;
      }
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        const snapshot = currentSnapshot();
        if (!isActive() || snapshot === null) {
          return;
        }
        for (const dictionary of snapshot.parameterDictionaries) {
          promoteDictionaryEntryParents(host, dictionary.id);
        }
      });
    },
  };
}
