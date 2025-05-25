import { C } from "utils/c";
import { JustListOfArtifacts } from "./ListOfArtifacts";

export function ChatAreaSettings({ sectionId }) {
  return <JustListOfArtifacts sectionId={sectionId} sectionTypeName={C.CHAT} />;
}
