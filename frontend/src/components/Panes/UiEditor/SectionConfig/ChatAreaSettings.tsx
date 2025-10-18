import { JustListOfArtifacts } from "./ListOfArtifacts";

export function ChatAreaSettings({ sectionId }) {
  return (
    <JustListOfArtifacts
      sectionId={sectionId}
      sectionTypeName={UITypeNameEnum.CHAT}
    />
  );
}
