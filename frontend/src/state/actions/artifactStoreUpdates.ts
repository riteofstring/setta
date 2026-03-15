import _ from "lodash";
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
  UpdateArtifactMsgContent,
} from "utils/generatedTypes";

type ArtifactByType =
  | ImageArtifact
  | BrushStrokeArtifact
  | DrawAreaLayerItemTransformArtifact
  | ChartDataArtifact
  | FileArtifact;

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
  options: { mode?: "replace" | "mutate" } = {},
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
  updateType: UpdateArtifactMsgContent["updateType"],
): void {
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

export function updateArtifacts(
  artifactUpdate: UpdateArtifactMsgContent,
): void {
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
