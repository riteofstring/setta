import { base64ToImageObj } from "components/Section/Layouts/DrawArea/base64Conversion";
import { useArtifacts, useInteractiveDependencies } from "state/definitions";
import { ArtifactTypeEnum } from "utils/generatedTypes";
import { getNamePathTypeKey } from "./artifacts";

export async function formatCode() {
  // TODO: send request to backend to format code
}

export async function updateInteractiveArtifacts(artifacts) {
  console.log("updateInteractiveArtifacts", artifacts);
  if (artifacts.length === 0) {
    return;
  }
  const newArtifacts = {};
  const artifactState = useArtifacts.getState();
  for (const a of artifacts) {
    if (!("path" in a)) a.path = "";
    if (a.type === ArtifactTypeEnum.IMG) {
      a.value = await base64ToImageObj(a.value);
      a.modifiedByInfo = {
        modifiedBy: "interactive",
        timestamp: Date.now().toString(),
      };
    }

    newArtifacts[
      a.id ?? artifactState.namePathTypeToId[getNamePathTypeKey(a)]
    ] = a;
  }

  useArtifacts.setState((state) => {
    return { x: { ...state.x, ...newArtifacts } };
  });

  console.log("useArtifacts.getState().x", useArtifacts.getState().x);
}

export function updateInteractiveDependencies(dependencies) {
  useInteractiveDependencies.setState({
    dependencies: new Set(dependencies.map((d) => JSON.stringify(d))),
  });
}
