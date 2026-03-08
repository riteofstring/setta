import { HeaderIcon } from "components/Section/Header/HeaderIcon";
import { MdAccountTree } from "react-icons/md";
import { getSectionType } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import {
  ChatWindowModeEnum,
  SectionTypeEnum,
  type ChatWindowMode,
} from "utils/generatedTypes";

export function ProjectChatWindowIcon({
  mode,
  instanceId,
  sectionId = null,
  className,
  dataTestId,
}: {
  mode: ChatWindowMode;
  instanceId: string;
  sectionId?: string | null;
  className?: string;
  dataTestId?: string;
}) {
  const sectionTypeName = useProjectState((state) => {
    if (!sectionId || !state.sections[sectionId]) {
      return null;
    }
    return getSectionType(state, sectionId);
  });
  const resolvedMode =
    sectionTypeName !== null ? ChatWindowModeEnum.section_mode : mode;

  return (
    <span
      className={className}
      data-testid={dataTestId}
      data-chat-window-icon-mode={resolvedMode}
      data-chat-window-icon-section-type={sectionTypeName ?? undefined}
    >
      {sectionTypeName ? (
        <HeaderIcon
          sectionId={sectionId ?? instanceId}
          sectionTypeName={sectionTypeName}
          isInOtherProjectConfigs={false}
          isListElement={false}
        />
      ) : mode === ChatWindowModeEnum.git_graph_mode ? (
        <MdAccountTree className="block" size={14} />
      ) : (
        <HeaderIcon
          sectionId={instanceId}
          sectionTypeName={SectionTypeEnum.Chat}
          isInOtherProjectConfigs={false}
          isListElement={false}
        />
      )}
    </span>
  );
}
