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
import { useLocalStorage, useProjectState } from "state/definitions";
import { useUIEditorTab } from "state/hooks/uiTypes";
import { useHasViewModeTabs } from "state/hooks/viewModes";
import {
  APP_CHROME_Z_INDEX_CLASS_NAME,
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
import { UIConfig } from "./UIConfig/UIConfig";

export function UiEditor() {
  const uiEditorRef = useRef<HTMLDivElement>(null);
  useTabScope({
    scopeId: "ui-editor",
    order: 30,
    rootRef: uiEditorRef,
  });
  const hasViewModeTabs = useHasViewModeTabs();
  const sectionIds = useProjectState(
    (x) => x.projectConfig.activeIds,
    _.isEqual,
  );
  const { selectedTabName, requiredTabs, sectionType } = useUIEditorTab(
    sectionIds[0] ?? null,
  );
  const { vis, width } = useLocalStorage(
    (x) => ({ vis: x.uiEditorVis, width: x.uiEditorWidth }),
    shallow,
  );
  // const infoTabTooltip = renderMarkdown ? "Markdown Editor" : "Text Editor";
  // const inputTitle =
  // selectedTabName === UIEditorTabNameEnum.InfoConfig ? infoTabTooltip : null;

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
        className={`fixed right-0 ${APP_CHROME_Z_INDEX_CLASS_NAME} flex w-10 flex-col items-center gap-1 border-l border-setta-200/75 bg-setta-50 py-2 dark:border-setta-850 dark:bg-setta-900`}
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
        {sectionIds.length === 1 && sectionIds[0] && vis && selectedTabName ? (
          <TabsVisible
            sectionId={sectionIds[0]}
            selectedTabName={selectedTabName}
            // inputTitle={inputTitle}
          />
        ) : (
          <Placeholder />
        )}
      </PaneContainer>
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
      <h2 className="mb-1 cursor-pointer select-none text-xs font-bold uppercase tracking-tight text-setta-300 dark:text-setta-500">
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

function Placeholder() {
  return (
    <aside className="mx-auto grid h-full min-h-0 w-[calc(100%_-_1rem)]">
      <div className="flex flex-col items-center gap-4 place-self-center">
        <FiEdit3 className="h-20 w-20 text-setta-300 dark:text-setta-700 " />
        <h4 className="text-center text-lg font-bold tracking-widest text-setta-300 dark:text-setta-600">
          Select A Section to Edit
        </h4>
      </div>
    </aside>
  );
}
