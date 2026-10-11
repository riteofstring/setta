import type { WorkspaceDocument, WorkspaceHost } from "@riteofstring/setta";

import type { ProjectSnapshotV2 } from "../api/generatedContract";
import {
  dictionaryEntryParentPromotionRequired,
  promoteDictionaryEntryParents,
} from "./workspaceProjection";

type DictionaryEntryParentPromotionEnvironment = {
  currentSnapshot: () => ProjectSnapshotV2 | null;
  host: WorkspaceHost;
  isActive: () => boolean;
};

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
