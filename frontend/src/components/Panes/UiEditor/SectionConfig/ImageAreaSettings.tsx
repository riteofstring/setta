import { JustListOfArtifacts } from "./ListOfArtifacts";

export function ImageAreaSettings({ sectionId }) {
  return (
    <JustListOfArtifacts
      sectionId={sectionId}
      sectionTypeName={UITypeNameEnum.IMAGE}
    />
  );
}
