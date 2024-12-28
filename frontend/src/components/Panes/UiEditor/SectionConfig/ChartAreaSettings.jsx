import C from "constants/constants.json";
import { JustListOfArtifacts } from "./ListOfArtifacts";

export function ChartAreaSettings({ sectionId }) {
  return (
    <JustListOfArtifacts sectionId={sectionId} sectionTypeName={C.CHART} />
  );
}
