import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import {
  appendDrawAreaLayerItem,
  setChartAreaDataPath,
  setImageAreaImagePath,
} from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { queueTransformsForSave } from "state/actions/artifacts";
import { openDropzoneFilePickerModal } from "state/actions/modal";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  getSectionType,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import {
  useDrawAreaLayerItemTransform,
  useProjectState,
} from "state/definitions";
import { bumpLocalRevisions } from "state/utils/revisions";
import {
  ArtifactTypeEnum,
  NotificationTypeEnum,
  SectionTypeEnum,
  createDrawAreaLayerItem,
  createDrawAreaLayerItemTransform,
  createDrawAreaLayerItemTransformArtifact,
} from "utils/generatedTypes";

export function AddArtifactByFilepath({ sectionId }: { sectionId: string }) {
  async function onClick() {
    const sectionType = getSectionType(useProjectState.getState(), sectionId);
    openDropzoneFilePickerModal({
      title: "Add Artifact by Filepath",
      remainingSlots: 1,
      onPickPaths: (paths) => {
        const filepath = getFirstPickedPath(paths);
        if (!filepath) {
          return;
        }
        switch (sectionType) {
          case SectionTypeEnum.Image:
            setImageArtifactPath(sectionId, filepath);
            return;
          case SectionTypeEnum.Chart:
            setChartArtifactPath(sectionId, filepath);
            return;
          case SectionTypeEnum.Draw:
            appendDrawImageArtifact(sectionId, filepath);
            return;
          default:
            addTemporaryNotification(
              "Artifact import is only supported for draw, image, and chart sections.",
              NotificationTypeEnum.warning,
            );
        }
      },
    });
  }

  return <MenuItem onClick={onClick}>Add artifact by filepath</MenuItem>;
}

function getFirstPickedPath(paths: Array<string>): string | null {
  for (const path of paths) {
    const normalized = path.trim();
    if (normalized !== "") {
      return normalized;
    }
  }
  return null;
}

function setImageArtifactPath(sectionId: string, filepath: string) {
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      setCurrEffectiveSectionImplValue<"ImageSection">(state, sectionId, {
        imagePath: filepath,
      });
    },
    send: (frontendOpId) =>
      callOpenAPI(
        Promise.resolve(
          setImageAreaImagePath({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              sectionId,
              imagePath: filepath,
              frontendOpId,
            },
          } as Parameters<typeof setImageAreaImagePath>[0]),
        ),
      ),
  });
}

function setChartArtifactPath(sectionId: string, filepath: string) {
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      setCurrEffectiveSectionImplValue<"ChartSection">(state, sectionId, {
        dataPath: filepath,
      });
    },
    send: (frontendOpId) =>
      callOpenAPI(
        Promise.resolve(
          setChartAreaDataPath({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              sectionId,
              dataPath: filepath,
              frontendOpId,
            },
          } as Parameters<typeof setChartAreaDataPath>[0]),
        ),
      ),
  });
}

function appendDrawImageArtifact(sectionId: string, filepath: string) {
  const impl = getCurrEffectiveSectionImplOfType(
    useProjectState.getState(),
    sectionId,
    SectionTypeEnum.Draw,
  );
  const layerIdx = impl.activeLayerIdx;
  const layers = impl.layers;
  if (!Array.isArray(layers)) {
    addTemporaryNotification(
      "The active draw layer is unavailable.",
      NotificationTypeEnum.warning,
    );
    return;
  }
  const activeLayer = layers[layerIdx];
  if (!activeLayer) {
    addTemporaryNotification(
      "The active draw layer is unavailable.",
      NotificationTypeEnum.warning,
    );
    return;
  }

  const transformArtifact = createDrawAreaLayerItemTransformArtifact({
    value: createDrawAreaLayerItemTransform({}),
  });
  useDrawAreaLayerItemTransform.setState((state) => {
    const revisions = bumpLocalRevisions(
      {
        revisionById: state.revisionById,
        localRevisionById: state.localRevisionById,
      },
      [transformArtifact.id],
      sectionId,
    );
    return {
      x: { ...state.x, [transformArtifact.id]: transformArtifact },
      ...revisions,
    };
  });

  const newLayerItem = createDrawAreaLayerItem({
    type: ArtifactTypeEnum.Image,
    dataPath: filepath,
    transformId: transformArtifact.id,
  });

  useProjectState.setState((state) => {
    setCurrEffectiveSectionImplValue<"DrawSection">(state, sectionId, {
      layers: (currLayers) =>
        currLayers.map((layer, idx) =>
          idx !== layerIdx
            ? layer
            : {
                ...layer,
                elements: [...layer.elements, newLayerItem],
              },
        ),
    });
  });

  queueTransformsForSave([transformArtifact.id]);
  void callOpenAPI(
    Promise.resolve(
      appendDrawAreaLayerItem({
        body: {
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          layerIdx,
          element: newLayerItem,
        },
      } as Parameters<typeof appendDrawAreaLayerItem>[0]),
    ),
  );
}
