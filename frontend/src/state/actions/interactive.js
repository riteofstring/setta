import { base64ToImageObj } from "components/Section/Layouts/DrawArea/base64Conversion";
import C from "constants/constants.json";
import { dbFormateCode } from "requests/interactive";
import {
  useArtifacts,
  useInteractiveDependencies,
  useSectionInfos,
} from "state/definitions";
import { getNamePathTypeKey } from "./artifacts";
import { getSectionVariant } from "./sectionInfos";

export async function formatCode() {
  const res = await dbFormateCode();
  if (res.status === 200) {
    useSectionInfos.setState((state) => {
      for (const [sectionId, code] of Object.entries(res.data)) {
        if (code !== null) {
          getSectionVariant(sectionId, state).code = code;
        }
      }
    });
  }
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
    if (a.type === C.ARTIFACT_TYPE_IMG) {
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
