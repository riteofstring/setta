import _ from "lodash";
import { useState } from "react";
import { loadArtifacts } from "state/actions/artifacts";
import { useArtifacts, useSectionInfos } from "state/definitions";
import useDeepCompareEffect from "use-deep-compare-effect";
import { newDrawAreaLocalLayerState } from "utils/objs/artifact";

export function useArtifactData(sectionId) {
  const [isLoaded, setIsLoaded] = useState(false);
  const artifactIds = useSectionInfos(
    (x) => x.x[sectionId].artifactIds,
    _.isEqual,
  );
  const artifacts = useArtifacts((x) => _.pick(x.x, artifactIds), _.isEqual);

  useDeepCompareEffect(() => {
    if (artifactIds.length !== _.size(artifacts)) {
      setIsLoaded(false);
      loadArtifacts(artifactIds);
    } else {
      setIsLoaded(true);
    }
  }, [artifactIds, artifacts]);

  return { artifacts, isLoaded };
}

export function useDrawAreaLayers(sectionId) {
  const { artifacts, isLoaded } = useArtifactData(sectionId);
  const [layers, setLayers] = useState([]);

  useDeepCompareEffect(() => {
    processLoadedArtifacts(artifacts, isLoaded);
  }, [Object.keys(artifacts, isLoaded)]);
}

async function processLoadedArtifacts(artifacts, isLoaded, layers, setLayers) {
  if (!isLoaded) {
    return;
  }
  let firstBrushStrokeLayerId = null;
  for (const [artifactId, v] of Object.entries(artifacts)) {
    if (!(artifactId in layers.current)) {
      layers.current[artifactId] = newDrawAreaLocalLayerState({
        name: v.name,
        type: v.type,
      });
    }
    if (v.type === "img") {
      const base64String = `data:image/png;base64,${v.value}`;
      const storedImage = layers.current[artifactId].image;
      if (storedImage.src !== base64String) {
        storedImage.src = base64String;
        await storedImage.decode();
      }
    } else if (v.type === "brushStrokes") {
      layers.current[artifactId].strokes = _.cloneDeep(v.value);
      if (!firstBrushStrokeLayerId) {
        firstBrushStrokeLayerId = artifactId;
      }
    }
  }

  if (!firstBrushStrokeLayerId) {
    firstBrushStrokeLayerId = createNewId();
    layers.current[firstBrushStrokeLayerId] = newDrawAreaLocalLayerState({
      type: "brushStrokes",
    });
  }

  useSectionInfos.setState((x) => {
    const latestLayerSettings = x.x[sectionId].canvasSettings.layerSettings;
    for (const id of Object.keys(layers.current)) {
      if (!(id in latestLayerSettings)) {
        latestLayerSettings[id] = newLayerSettings();
      }
    }
    setCanvasSize({
      sectionId,
      canvasRef,
      tempCanvasRef,
      draftCanvasRef,
      layers,
      layerSettings: latestLayerSettings,
      artifactIdUsedToSetCanvasSize,
    });

    if (!activeLayerId) {
      x.x[sectionId].canvasSettings.activeLayerId = firstBrushStrokeLayerId;
    }
  });
}
