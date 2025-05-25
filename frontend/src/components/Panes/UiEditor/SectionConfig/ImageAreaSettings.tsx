import { C } from "utils/c";
import { JustListOfArtifacts } from "./ListOfArtifacts";

export function ImageAreaSettings({ sectionId }) {
  return (
    <JustListOfArtifacts sectionId={sectionId} sectionTypeName={C.IMAGE} />
  );
}
