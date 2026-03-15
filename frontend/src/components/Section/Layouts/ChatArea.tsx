import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { SectionTypeEnum } from "utils/generatedTypes";
import {
  type ChatSectionChatId,
  type ChatSectionChatIdUpdate,
} from "./chatAreaManagedHistory";
import { ManagedChatAreaSurface } from "./chatAreaManagedSurface";
import { ScriptableChatAreaSurface } from "./chatAreaScriptableSurface";

export function ChatArea({
  sectionId,
  surfaceId,
  controlledChatId,
  setControlledChatId,
}: {
  sectionId: string;
  surfaceId?: string;
  controlledChatId?: ChatSectionChatId;
  setControlledChatId?: (next: ChatSectionChatIdUpdate) => void;
}) {
  const managed = useProjectState((state) => {
    return getCurrEffectiveSectionImplOfType(
      state,
      sectionId,
      SectionTypeEnum.Chat,
    ).managed;
  });

  if (managed) {
    return (
      <ManagedChatAreaSurface
        sectionId={sectionId}
        surfaceId={surfaceId}
        controlledChatId={controlledChatId}
        setControlledChatId={setControlledChatId}
      />
    );
  }

  return <ScriptableChatAreaSurface sectionId={sectionId} />;
}
