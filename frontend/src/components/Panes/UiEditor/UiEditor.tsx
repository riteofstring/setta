import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { PaneContainer } from "components/Utils/PaneContainer";
import _ from "lodash";
import { useRef } from "react";
import { BiHelpCircle } from "react-icons/bi";
import { BsCardChecklist } from "react-icons/bs";
import { FiEdit3 } from "react-icons/fi";
import { MdOutlineSettingsApplications } from "react-icons/md";
import { PiCursorTextFill } from "react-icons/pi";
import { TbEdit, TbVersions } from "react-icons/tb";
import { useSolelyActiveSectionUIId } from "state/activeSectionUI";
import { useLocalStorage, useProjectState } from "state/definitions";
import { useUIEditorTab } from "state/hooks/uiTypes";
import { useHasViewModeTabs } from "state/hooks/viewModes";
import {
  PaneNameEnum,
  UIEditorTabName,
  UIEditorTabNameEnum,
  UIEditorTabNamePrettified,
} from "utils/constants";
import { useTabScope } from "utils/focusManager";
import { shallow } from "zustand/shallow";
import {
  getOnUIEditorTabClick,
  getOnUIEditorTabClickNoSectionSelected,
  TabButton,
} from "../paneFns";
import { getPaneMinimumWidth } from "../paneLayout";
import { MarkdownEditorInPane } from "./MarkdownEditor/MarkdownEditor";
import { QuickInfoConfig } from "./QuickInfoConfig/QuickInfoConfig";
import { SectionConfig } from "./SectionConfig/SectionConfig";
import { VariantList } from "./SectionVariants/VariantList";
import { StateMachineEdgeInspector } from "./StateMachineEdgeInspector";
import { UIConfig } from "./UIConfig/UIConfig";

export function UiEditor() {
  const uiEditorRef = useRef<HTMLDivElement>(null);
  useTabScope({
    scopeId: "ui-editor",
    order: 30,
    rootRef: uiEditorRef,
  });
  const hasViewModeTabs = useHasViewModeTabs();
  const activeSectionId = useSolelyActiveSectionUIId();
  const selectedStateMachineEdgeIds = useProjectState(
    (state) => ({
      selectedStateMachineEdgeIds: state.projectConfig.stateMachineEdges
        .filter((edge) => edge.selected)
        .map((edge) => edge.id),
    }),
    _.isEqual,
  ).selectedStateMachineEdgeIds;
  const { selectedTabName, requiredTabs, sectionType } =
    useUIEditorTab(activeSectionId);
  const { vis, width } = useLocalStorage(
    (x) => ({ vis: x.uiEditorVis, width: x.uiEditorWidth }),
    shallow,
  );

  const commonProps = {
    vis,
    selectedTabName,
    onTabClick: sectionType
      ? getOnUIEditorTabClick(sectionType)
      : getOnUIEditorTabClickNoSectionSelected,
    className:
      "flex h-8 w-8 cursor-pointer items-center justify-center text-2xl focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-blue-500",
    requiredTabs,
  };

  return (
    <div
      id="UiEditorPane"
      className="contents"
      ref={uiEditorRef}
      data-tab-scope="ui-editor"
    >
      <div
        data-testid="ui-editor-icon-rail"
        className="fixed right-0 z-[19] flex w-10 flex-col items-center gap-1 border-l border-setta-200/75 bg-setta-50 py-2 dark:border-setta-850 dark:bg-setta-900"
        style={{
          top: "calc(var(--setta-titlebar-height) + 36px)",
          bottom: hasViewModeTabs ? "36px" : "0px",
        }}
      >
        <TabButton<UIEditorTabName>
          tabName={UIEditorTabNameEnum.SectionConfig}
          {...commonProps}
          data-testid="ui-editor-tab-section-config"
          {...getFloatingBoxHandlers({ content: "Section Config" })}
          icon={<MdOutlineSettingsApplications />}
        />
        <TabButton<UIEditorTabName>
          tabName={UIEditorTabNameEnum.UIConfig}
          {...commonProps}
          data-testid="ui-editor-tab-ui-config"
          {...getFloatingBoxHandlers({ content: "Parameter UI Config" })}
          icon={<BsCardChecklist />}
        />
        <TabButton<UIEditorTabName>
          tabName={UIEditorTabNameEnum.QuickInfoConfig}
          {...commonProps}
          data-testid="ui-editor-tab-quick-info-config"
          {...getFloatingBoxHandlers({ content: "Parameter Info Editing" })}
          icon={<TbEdit />}
        />
        <TabButton<UIEditorTabName>
          tabName={UIEditorTabNameEnum.InfoConfig}
          {...commonProps}
          data-testid="ui-editor-tab-info-config"
          {...getFloatingBoxHandlers({ content: "Info Editing" })}
          icon={<PiCursorTextFill />}
        />
        <TabButton<UIEditorTabName>
          tabName={UIEditorTabNameEnum.SectionVariantsConfig}
          {...commonProps}
          data-testid="ui-editor-tab-section-variants-config"
          {...getFloatingBoxHandlers({ content: "Section Variants" })}
          icon={<TbVersions />}
        />
        <a
          href="https://docs.setta.dev"
          target="_blank"
          className="focus-visible:ring-light-blue-500 absolute bottom-1 left-1/2 flex h-8 w-8 -translate-x-1/2 cursor-pointer items-center justify-center text-setta-400 hover:text-setta-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 dark:text-setta-600 dark:hover:text-setta-500"
          rel="noreferrer"
        >
          <BiHelpCircle />
        </a>
      </div>
      <PaneContainer
        paneName={PaneNameEnum.uiEditor}
        right={true}
        minimumWidth={getPaneMinimumWidth(PaneNameEnum.uiEditor)}
        vis={vis}
        width={width}
      >
        {activeSectionId && vis && selectedTabName ? (
          <TabsVisible
            sectionId={activeSectionId}
            selectedTabName={selectedTabName}
            // inputTitle={inputTitle}
          />
        ) : selectedStateMachineEdgeIds.length === 1 && vis ? (
          <WorkflowEdgeVisible edgeId={selectedStateMachineEdgeIds[0]} />
        ) : selectedStateMachineEdgeIds.length > 1 && vis ? (
          <Placeholder title="Select One Workflow Edge" />
        ) : (
          <Placeholder />
        )}
      </PaneContainer>
    </div>
  );
}

function WorkflowEdgeVisible({ edgeId }: { edgeId: string }) {
  return (
    <div
      data-testid="ui-editor-tab-content-shell"
      className="mx-auto flex h-full min-h-0 w-[calc(100%_-_1.5rem)] min-w-0 flex-1 flex-col overflow-hidden px-1.5"
    >
      <h2 className="mb-1 cursor-pointer select-none pl-4 text-xs font-bold uppercase tracking-tight text-setta-300 dark:text-setta-500">
        Workflow Edge
      </h2>
      <StateMachineEdgeInspector edgeId={edgeId} />
    </div>
  );
}

function TabsVisible({
  sectionId,
  selectedTabName,
  inputTitle,
}: {
  sectionId: string;
  selectedTabName: UIEditorTabName;
  inputTitle?: string;
}) {
  const title = inputTitle ?? UIEditorTabNamePrettified[selectedTabName];
  return (
    <div
      data-testid="ui-editor-tab-content-shell"
      className="mx-auto flex h-full min-h-0 w-[calc(100%_-_1.5rem)] min-w-0 flex-1 flex-col overflow-hidden px-1.5"
    >
      <h2 className="mb-1 cursor-pointer select-none pl-4 text-xs font-bold uppercase tracking-tight text-setta-300 dark:text-setta-500">
        {title}
      </h2>
      <TabContent sectionId={sectionId} selectedTabName={selectedTabName} />
    </div>
  );
}

function TabContent({
  sectionId,
  selectedTabName,
}: {
  sectionId: string;
  selectedTabName: UIEditorTabName;
}) {
  switch (selectedTabName) {
    case UIEditorTabNameEnum.SectionConfig:
      return <SectionConfig sectionId={sectionId} />;
    case UIEditorTabNameEnum.UIConfig:
      return <UIConfig sectionId={sectionId} />;
    case UIEditorTabNameEnum.QuickInfoConfig:
      return <QuickInfoConfig sectionId={sectionId} />;
    case UIEditorTabNameEnum.InfoConfig:
      return <MarkdownEditorInPane sectionId={sectionId} />;
    case UIEditorTabNameEnum.SectionVariantsConfig:
      return <VariantList sectionId={sectionId} />;
    default:
      return selectedTabName satisfies never;
  }
}

function Placeholder({
  title = "Select A Section to Edit",
}: {
  title?: string;
}) {
  return (
    <aside className="mx-auto grid h-full min-h-0 w-[calc(100%_-_1rem)]">
      <div className="flex flex-col items-center gap-4 place-self-center">
        <FiEdit3 className="h-20 w-20 text-setta-300 dark:text-setta-700 " />
        <h4 className="text-center text-lg font-bold tracking-widest text-setta-300 dark:text-setta-600">
          {title}
        </h4>
      </div>
    </aside>
  );
}
