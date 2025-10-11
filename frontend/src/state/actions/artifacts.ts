import _ from "lodash";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  useBrushStrokes,
  useChartData,
  useDrawAreaLayerItemTransform,
  useImages,
} from "state/definitions";
import { post, res200 } from "utils/endpointUtils";
import {
  ArtifactType,
  ArtifactTypeEnum,
  BrushStrokeArtifact,
  ChartDataArtifact,
  DrawAreaLayerItemTransformArtifact,
  ImageArtifact,
  SettaNotificationTypeEnum,
  UpdateArtifactMsgContent,
} from "utils/generatedTypes";

type ArtifactByType =
  | ImageArtifact
  | BrushStrokeArtifact
  | DrawAreaLayerItemTransformArtifact
  | ChartDataArtifact;

type ArtifactUpdateResult = {
  id: string;
  type: string;
  status: string;
  backupPath?: string | null;
  message?: string | null;
};

type UpdateArtifactsResponse = {
  results?: Array<ArtifactUpdateResult>;
};

type StoreUpdate<T extends ArtifactByType> = {
  next: Record<string, T>;
  changed: boolean;
  bumpRevision: () => void;
};

function cloneArtifact<T extends ArtifactByType>(artifact: T): T {
  return _.cloneDeep(artifact);
}

function createStoreUpdate<T extends ArtifactByType>(
  current: Record<string, T>,
  bump: () => void,
): StoreUpdate<T> {
  return {
    next: { ...current },
    changed: false,
    bumpRevision: bump,
  };
}

function applyUpdate<T extends ArtifactByType>(
  storeUpdate: StoreUpdate<T>,
  artifact: T,
  updateType: UpdateArtifactMsgContent["updateType"],
) {
  if (updateType === "delete") {
    if (artifact.id in storeUpdate.next) {
      delete storeUpdate.next[artifact.id];
      storeUpdate.changed = true;
    }
    return;
  }

  const existing = storeUpdate.next[artifact.id];
  if (!existing || !_.isEqual(existing.value, artifact.value)) {
    storeUpdate.next[artifact.id] = cloneArtifact(artifact);
    storeUpdate.changed = true;
  }
}

export function updateArtifacts(artifactUpdate: UpdateArtifactMsgContent) {
  if (!artifactUpdate.artifacts || artifactUpdate.artifacts.length === 0) {
    return;
  }

  const imagesUpdate = createStoreUpdate(useImages.getState().x, () =>
    useImages.setState((state) => ({
      x: imagesUpdate.next,
      remoteRevision: state.remoteRevision + 1,
    })),
  );

  const brushStrokeUpdate = createStoreUpdate(
    useBrushStrokes.getState().x,
    () =>
      useBrushStrokes.setState((state) => ({
        x: brushStrokeUpdate.next,
        remoteRevision: state.remoteRevision + 1,
      })),
  );

  const transformUpdate = createStoreUpdate(
    useDrawAreaLayerItemTransform.getState().x,
    () =>
      useDrawAreaLayerItemTransform.setState((state) => ({
        x: transformUpdate.next,
        remoteRevision: state.remoteRevision + 1,
      })),
  );

  const chartDataUpdate = createStoreUpdate(useChartData.getState().x, () =>
    useChartData.setState((state) => ({
      x: chartDataUpdate.next,
      remoteRevision: state.remoteRevision + 1,
    })),
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
      default:
        artifact satisfies never;
    }
  }

  if (imagesUpdate.changed) {
    imagesUpdate.bumpRevision();
  }
  if (brushStrokeUpdate.changed) {
    brushStrokeUpdate.bumpRevision();
  }
  if (transformUpdate.changed) {
    transformUpdate.bumpRevision();
  }
  if (chartDataUpdate.changed) {
    chartDataUpdate.bumpRevision();
  }
}

export function getNamePathTypeKey(artifact: {
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
  artifact: Extract<ArtifactByType, { type: T }>,
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
    const res = await post<UpdateArtifactsResponse>("/updateArtifacts", {
      artifacts: snapshot,
    });
    if (res200(res)) {
      clearPendingArtifacts(snapshot);
      if (res.data?.results) {
        for (const result of res.data.results) {
          if (result.status === "conflict" || result.status === "skipped") {
            const message =
              result.message || `Conflict detected while saving ${result.id}.`;
            addTemporaryNotification(
              message,
              SettaNotificationTypeEnum.warning,
            );
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
      artifact as Extract<ArtifactByType, { type: SyncedArtifactType }>,
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
  options: { immediate?: boolean; transformId?: string } = {},
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
  options: { immediate?: boolean } = {},
) {
  const transforms = transformIds.map(
    (id) => useDrawAreaLayerItemTransform.getState().x[id],
  );
  queueArtifacts(transforms, { immediate: options.immediate ?? false });
}

export async function flushQueuedArtifacts() {
  await flushPendingArtifacts(true);
}
