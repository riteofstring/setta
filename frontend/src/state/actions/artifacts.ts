import { callOpenAPI, res200 } from "@setta/app-subsystem-frontend-sdk";
import _ from "lodash";
import { updateArtifacts as updateArtifactsApi } from "openapi/http";
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
import {
  ArtifactTypeEnum,
  BrushStrokeArtifact,
  ChartDataArtifact,
  DrawAreaLayerItemTransformArtifact,
  FileArtifact,
  ImageArtifact,
  NotificationTypeEnum,
} from "utils/generatedTypes";
type ArtifactByType =
  | ImageArtifact
  | BrushStrokeArtifact
  | DrawAreaLayerItemTransformArtifact
  | ChartDataArtifact
  | FileArtifact;
type UpdateArtifactsBody = NonNullable<
  Parameters<typeof updateArtifactsApi>[0]["body"]
>;
type UpdateArtifactsContent = {
  artifacts: UpdateArtifactsBody["artifacts"];
  updateType: "update" | "delete";
};
type StoreUpdate<T extends ArtifactByType> = {
  next: Record<string, T>;
  changedIds: Set<string>;
  deletedIds: Set<string>;
  commit: () => void;
};
type ArtifactStoreUpdates = {
  images: StoreUpdate<ImageArtifact>;
  brushStrokes: StoreUpdate<BrushStrokeArtifact>;
  transforms: StoreUpdate<DrawAreaLayerItemTransformArtifact>;
  chartData: StoreUpdate<ChartDataArtifact>;
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

function createArtifactStoreUpdates(): ArtifactStoreUpdates {
  return {
    images: createStoreUpdate(useImages.getState().x, useImages.setState),
    brushStrokes: createStoreUpdate(
      useBrushStrokes.getState().x,
      useBrushStrokes.setState,
    ),
    transforms: createStoreUpdate(
      useDrawAreaLayerItemTransform.getState().x,
      useDrawAreaLayerItemTransform.setState,
      { mode: "mutate" },
    ),
    chartData: createStoreUpdate(
      useChartData.getState().x,
      useChartData.setState,
    ),
  };
}

function applyArtifactStoreUpdate(
  storeUpdates: ArtifactStoreUpdates,
  artifact: ArtifactByType,
  updateType: UpdateArtifactsContent["updateType"],
) {
  switch (artifact.type) {
    case ArtifactTypeEnum.Image:
      applyUpdate(storeUpdates.images, artifact, updateType);
      return;
    case ArtifactTypeEnum.BrushStroke:
      applyUpdate(storeUpdates.brushStrokes, artifact, updateType);
      return;
    case ArtifactTypeEnum.DrawAreaLayerItemTransform:
      applyUpdate(storeUpdates.transforms, artifact, updateType);
      return;
    case ArtifactTypeEnum.ChartData:
      applyUpdate(storeUpdates.chartData, artifact, updateType);
      return;
    case ArtifactTypeEnum.File:
      return;
    default:
      artifact satisfies never;
  }
}

function commitArtifactStoreUpdates(storeUpdates: ArtifactStoreUpdates) {
  storeUpdates.images.commit();
  storeUpdates.brushStrokes.commit();
  storeUpdates.transforms.commit();
  storeUpdates.chartData.commit();
}

function removeDeletedDecodedImages(deletedIds: Iterable<string>) {
  const ids = Array.from(deletedIds);
  if (ids.length === 0) {
    return;
  }

  useDecodedImages.setState((state) => {
    const next = { ...state.x };
    for (const id of ids) {
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
      ids,
    );

    return {
      x: next,
      ...revisions,
    };
  });
}

export function updateArtifacts(artifactUpdate: UpdateArtifactsContent) {
  if (!artifactUpdate.artifacts || artifactUpdate.artifacts.length === 0) {
    return;
  }

  const storeUpdates = createArtifactStoreUpdates();
  for (const artifact of artifactUpdate.artifacts) {
    applyArtifactStoreUpdate(storeUpdates, artifact, artifactUpdate.updateType);
  }

  commitArtifactStoreUpdates(storeUpdates);
  if (artifactUpdate.updateType === "delete") {
    removeDeletedDecodedImages(storeUpdates.images.deletedIds);
  }
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
