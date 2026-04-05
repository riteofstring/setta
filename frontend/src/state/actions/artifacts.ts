import _ from "lodash";
import { updateArtifacts as updateArtifactsApi } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  RevisionedArtifacts,
  useBrushStrokes,
  useChartData,
  useDecodedImages,
  useDrawAreaLayerItemTransform,
  useImages,
} from "state/definitions";
import {
  bumpRemoteRevisions,
  removeRevisionEntries,
} from "state/utils/revisions";
import { res200 } from "utils/endpointUtils";
import {
  ArtifactType,
  ArtifactTypeEnum,
  BrushStrokeArtifact,
  ChartDataArtifact,
  DrawAreaLayerItemTransformArtifact,
  FileArtifact,
  ImageArtifact,
  NotificationTypeEnum,
  UpdateArtifactsRequest,
} from "utils/generatedTypes";
type ArtifactByType =
  | ImageArtifact
  | BrushStrokeArtifact
  | DrawAreaLayerItemTransformArtifact
  | ChartDataArtifact
  | FileArtifact;
type UpdateArtifactsContent = {
  artifacts: UpdateArtifactsRequest["artifacts"];
  updateType: "update" | "delete";
};
type StoreUpdate<T extends ArtifactByType> = {
  next: Record<string, T>;
  changedIds: Set<string>;
  deletedIds: Set<string>;
  commit: () => void;
};
function cloneArtifact<T extends ArtifactByType>(artifact: T): T {
  return _.cloneDeep(artifact);
}
function createStoreUpdate<T extends ArtifactByType>(
  current: Record<string, T>,
  setState: (
    updater: (
      state: RevisionedArtifacts<Record<string, T>>,
    ) => void | RevisionedArtifacts<Record<string, T>>,
  ) => void,
  options: {
    mode?: "replace" | "mutate";
  } = {},
): StoreUpdate<T> {
  const { mode = "replace" } = options;
  const storeUpdate: StoreUpdate<T> = {
    next: { ...current },
    changedIds: new Set<string>(),
    deletedIds: new Set<string>(),
    commit: () => {
      if (
        storeUpdate.changedIds.size === 0 &&
        storeUpdate.deletedIds.size === 0
      ) {
        return;
      }
      const changedIds = Array.from(storeUpdate.changedIds);
      const deletedIds = Array.from(storeUpdate.deletedIds);
      setState((state) => {
        const afterRemoval = removeRevisionEntries(
          {
            revisionById: state.revisionById,
            localRevisionById: state.localRevisionById,
          },
          deletedIds,
        );
        const afterBump = bumpRemoteRevisions(afterRemoval, changedIds);
        if (mode === "mutate") {
          state.x = storeUpdate.next;
          state.revisionById = afterBump.revisionById;
          state.localRevisionById = afterBump.localRevisionById;
          return;
        }
        return {
          x: storeUpdate.next,
          revisionById: afterBump.revisionById,
          localRevisionById: afterBump.localRevisionById,
        };
      });
    },
  };
  return storeUpdate;
}
function applyUpdate<T extends ArtifactByType>(
  storeUpdate: StoreUpdate<T>,
  artifact: T,
  updateType: UpdateArtifactsContent["updateType"],
) {
  if (updateType === "delete") {
    if (artifact.id in storeUpdate.next) {
      delete storeUpdate.next[artifact.id];
      storeUpdate.deletedIds.add(artifact.id);
    }
    return;
  }
  const existing = storeUpdate.next[artifact.id];
  if (!existing || !_.isEqual(existing, artifact)) {
    storeUpdate.next[artifact.id] = cloneArtifact(artifact);
    storeUpdate.changedIds.add(artifact.id);
  }
}
export function updateArtifacts(artifactUpdate: UpdateArtifactsContent) {
  if (!artifactUpdate.artifacts || artifactUpdate.artifacts.length === 0) {
    return;
  }
  const imagesUpdate = createStoreUpdate(
    useImages.getState().x,
    useImages.setState,
  );
  const brushStrokeUpdate = createStoreUpdate(
    useBrushStrokes.getState().x,
    useBrushStrokes.setState,
  );
  const transformUpdate = createStoreUpdate(
    useDrawAreaLayerItemTransform.getState().x,
    useDrawAreaLayerItemTransform.setState,
    { mode: "mutate" },
  );
  const chartDataUpdate = createStoreUpdate(
    useChartData.getState().x,
    useChartData.setState,
  );
  for (const artifact of artifactUpdate.artifacts) {
    switch (artifact.type) {
      case ArtifactTypeEnum.Image:
        applyUpdate(imagesUpdate, artifact, artifactUpdate.updateType);
        break;
      case ArtifactTypeEnum.BrushStroke:
        applyUpdate(brushStrokeUpdate, artifact, artifactUpdate.updateType);
        break;
      case ArtifactTypeEnum.DrawAreaLayerItemTransform:
        applyUpdate(transformUpdate, artifact, artifactUpdate.updateType);
        break;
      case ArtifactTypeEnum.ChartData:
        applyUpdate(chartDataUpdate, artifact, artifactUpdate.updateType);
        break;
      case ArtifactTypeEnum.File:
        break;
      default:
        artifact satisfies never;
    }
  }
  imagesUpdate.commit();
  brushStrokeUpdate.commit();
  transformUpdate.commit();
  chartDataUpdate.commit();
  if (
    artifactUpdate.updateType === "delete" &&
    imagesUpdate.deletedIds.size > 0
  ) {
    const deletedIds = Array.from(imagesUpdate.deletedIds);
    useDecodedImages.setState((state) => {
      const next = { ...state.x };
      for (const id of deletedIds) {
        const existing = next[id];
        if (!existing) {
          continue;
        }
        const existingUrl = existing.dataset.objectUrl;
        if (existingUrl) {
          URL.revokeObjectURL(existingUrl);
        }
        delete next[id];
      }
      const revisions = removeRevisionEntries(
        {
          revisionById: state.revisionById,
          localRevisionById: state.localRevisionById,
        },
        deletedIds,
      );
      return {
        x: next,
        ...revisions,
      };
    });
  }
}
function getNamePathTypeKey(artifact: {
  name?: string;
  path?: string;
  type: string | ArtifactType;
}) {
  return JSON.stringify([
    artifact.name ?? "",
    artifact.path ?? "",
    artifact.type,
  ]);
}
const SYNCED_ARTIFACT_TYPES = [
  ArtifactTypeEnum.BrushStroke,
  ArtifactTypeEnum.DrawAreaLayerItemTransform,
] as const;
type SyncedArtifactType = (typeof SYNCED_ARTIFACT_TYPES)[number];
const pendingArtifacts: Record<
  SyncedArtifactType,
  Map<string, ArtifactByType>
> = {
  [ArtifactTypeEnum.BrushStroke]: new Map(),
  [ArtifactTypeEnum.DrawAreaLayerItemTransform]: new Map(),
};
const FLUSH_DEBOUNCE_MS = 1500;
let flushPromise: Promise<void> | null = null;
const scheduleFlush = _.debounce(() => {
  void flushPendingArtifacts();
}, FLUSH_DEBOUNCE_MS);
function storePendingArtifact<T extends SyncedArtifactType>(
  type: T,
  artifact: Extract<
    ArtifactByType,
    {
      type: T;
    }
  >,
) {
  pendingArtifacts[type].set(artifact.id, cloneArtifact(artifact));
}
function collectPendingArtifacts() {
  const snapshot: Array<ArtifactByType> = [];
  for (const type of SYNCED_ARTIFACT_TYPES) {
    for (const artifact of pendingArtifacts[type].values()) {
      snapshot.push(artifact);
    }
  }
  return snapshot;
}
function clearPendingArtifacts(artifacts: Array<ArtifactByType>) {
  for (const artifact of artifacts) {
    const type = artifact.type as SyncedArtifactType;
    pendingArtifacts[type].delete(artifact.id);
  }
}
async function flushPendingArtifacts(force = false) {
  if (flushPromise) {
    if (!force) {
      return flushPromise;
    }
    await flushPromise;
  }
  const snapshot = collectPendingArtifacts();
  if (snapshot.length === 0) {
    return;
  }
  flushPromise = (async () => {
    const res = await callOpenAPI(
      updateArtifactsApi({
        body: {
          artifacts: snapshot,
          conflictStrategy: null,
          uploadScope: "generic",
        },
      } as Parameters<typeof updateArtifactsApi>[0]),
    );
    if (res200(res)) {
      clearPendingArtifacts(snapshot);
      if (res.data) {
        for (const result of res.data) {
          if (result.status === "conflict" || result.status === "skipped") {
            const message =
              result.message || `Conflict detected while saving ${result.id}.`;
            addTemporaryNotification(message, NotificationTypeEnum.warning);
          }
        }
      }
    } else {
      console.error("Failed to sync artifacts", res.status);
      scheduleFlush();
    }
  })();
  try {
    await flushPromise;
  } finally {
    flushPromise = null;
  }
}
function queueArtifacts(
  artifacts: Array<ArtifactByType | undefined>,
  {
    immediate = false,
  }: {
    immediate?: boolean;
  } = {},
) {
  const validArtifacts: Array<ArtifactByType> = [];
  for (const artifact of artifacts) {
    if (!artifact) {
      continue;
    }
    if (!SYNCED_ARTIFACT_TYPES.includes(artifact.type as SyncedArtifactType)) {
      continue;
    }
    storePendingArtifact(
      artifact.type as SyncedArtifactType,
      artifact as Extract<
        ArtifactByType,
        {
          type: SyncedArtifactType;
        }
      >,
    );
    validArtifacts.push(artifact);
  }
  if (validArtifacts.length === 0) {
    return;
  }
  if (immediate) {
    void flushPendingArtifacts(true);
  } else {
    scheduleFlush();
  }
}
export function queueBrushStrokeForSave(
  strokeId: string,
  options: {
    immediate?: boolean;
    transformId?: string;
  } = {},
) {
  const stroke = useBrushStrokes.getState().x[strokeId];
  const transform = options.transformId
    ? useDrawAreaLayerItemTransform.getState().x[options.transformId]
    : undefined;
  queueArtifacts([stroke, transform], {
    immediate: options.immediate ?? false,
  });
}
export function queueTransformsForSave(
  transformIds: Array<string>,
  options: {
    immediate?: boolean;
  } = {},
) {
  const transforms = transformIds.map(
    (id) => useDrawAreaLayerItemTransform.getState().x[id],
  );
  queueArtifacts(transforms, { immediate: options.immediate ?? false });
}
export async function flushQueuedArtifacts() {
  await flushPendingArtifacts(true);
}
