import _ from "lodash";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  useBrushStrokes,
  useDrawAreaLayerItemTransform,
} from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_update_artifacts } from "utils/generatedEndpoints";
import {
  ArtifactTypeEnum,
  BrushStrokeArtifact,
  DrawAreaLayerItemTransformArtifact,
  SettaNotificationTypeEnum,
} from "utils/generatedTypes";

type SyncedArtifact = BrushStrokeArtifact | DrawAreaLayerItemTransformArtifact;

const SYNCED_ARTIFACT_TYPES = [
  ArtifactTypeEnum.BrushStroke,
  ArtifactTypeEnum.DrawAreaLayerItemTransform,
] as const;

type SyncedArtifactType = (typeof SYNCED_ARTIFACT_TYPES)[number];

const pendingArtifacts: Record<
  SyncedArtifactType,
  Map<string, SyncedArtifact>
> = {
  [ArtifactTypeEnum.BrushStroke]: new Map(),
  [ArtifactTypeEnum.DrawAreaLayerItemTransform]: new Map(),
};

const FLUSH_DEBOUNCE_MS = 1500;

let flushPromise: Promise<void> | null = null;

const scheduleFlush = _.debounce(() => {
  void flushPendingArtifacts();
}, FLUSH_DEBOUNCE_MS);

function cloneArtifact<T extends SyncedArtifact>(artifact: T): T {
  return _.cloneDeep(artifact);
}

function storePendingArtifact<T extends SyncedArtifactType>(
  type: T,
  artifact: Extract<SyncedArtifact, { type: T }>,
): void {
  pendingArtifacts[type].set(artifact.id, cloneArtifact(artifact));
}

function collectPendingArtifacts(): Array<SyncedArtifact> {
  const snapshot: Array<SyncedArtifact> = [];
  for (const type of SYNCED_ARTIFACT_TYPES) {
    for (const artifact of pendingArtifacts[type].values()) {
      snapshot.push(artifact);
    }
  }
  return snapshot;
}

function clearPendingArtifacts(artifacts: Array<SyncedArtifact>): void {
  for (const artifact of artifacts) {
    pendingArtifacts[artifact.type].delete(artifact.id);
  }
}

async function flushPendingArtifacts(force = false): Promise<void> {
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
    const res = await route_update_artifacts({
      artifacts: snapshot,
      conflictStrategy: null,
      uploadScope: "generic",
    });
    if (res200(res)) {
      clearPendingArtifacts(snapshot);
      if (res.data) {
        for (const result of res.data) {
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
  artifacts: Array<SyncedArtifact | undefined>,
  {
    immediate = false,
  }: {
    immediate?: boolean;
  } = {},
): void {
  let hasPendingArtifacts = false;
  for (const artifact of artifacts) {
    if (!artifact) {
      continue;
    }
    storePendingArtifact(artifact.type, artifact);
    hasPendingArtifacts = true;
  }

  if (!hasPendingArtifacts) {
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
): void {
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
): void {
  const transforms = transformIds.map(
    (id) => useDrawAreaLayerItemTransform.getState().x[id],
  );
  queueArtifacts(transforms, { immediate: options.immediate ?? false });
}

export async function flushQueuedArtifacts(): Promise<void> {
  await flushPendingArtifacts(true);
}

export function __resetArtifactSyncQueueForTests(): void {
  scheduleFlush.cancel();
  pendingArtifacts[ArtifactTypeEnum.BrushStroke].clear();
  pendingArtifacts[ArtifactTypeEnum.DrawAreaLayerItemTransform].clear();
  flushPromise = null;
}
