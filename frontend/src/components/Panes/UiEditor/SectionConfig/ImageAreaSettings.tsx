import { UITypeNameSchema } from "utils/generatedTypes";
import { JustListOfArtifacts } from "./ListOfArtifacts";

export function ImageAreaSettings({ sectionId }) {
  return (
    <JustListOfArtifacts
      sectionId={sectionId}
      sectionTypeName={UITypeNameSchema.enum.IMAGE}
    />
  );
}
