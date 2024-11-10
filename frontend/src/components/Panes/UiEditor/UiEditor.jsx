import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { PaneContainer } from "components/Utils/PaneContainer";
import { BsCardChecklist } from "react-icons/bs";
import { FaMarkdown } from "react-icons/fa";
import { FiEdit3 } from "react-icons/fi";
import { MdOutlineSettingsApplications } from "react-icons/md";
import { TbEdit, TbVersions } from "react-icons/tb";
import { useActiveSection } from "state/definitions";
import { useUIEditorTab } from "state/hooks/uiTypes";
import {
  INFO_CONFIG_TAB,
  QUICKINFO_CONFIG_TAB,
  SECTION_CONFIG_TAB,
  SECTION_VARIANTS_TAB,
  tabNameToPretty,
  UI_CONFIG_TAB,
  UI_EDITOR,
} from "utils/constants";
import { uiEditorPaneOnKeyDown } from "utils/tabbingLogic";
import { TabButton, usePaneFns } from "../paneFns";
import { MarkdownEditor } from "./MarkdownEditor/MarkdownEditor";
import { QuickInfoConfig } from "./QuickInfoConfig/QuickInfoConfig";
import { SectionConfig } from "./SectionConfig/SectionConfig";
import { SectionVariants } from "./SectionVariants/SectionVariants";
import { UIConfig } from "./UIConfig/UIConfig";

export function UiEditor() {
  const sectionIds = useActiveSection((x) => x.ids);
  const [tab, setTab, requiredTabs] = useUIEditorTab(sectionIds[0]);
  const { vis, width, setWidth, setTrueWidth, getOnTabClick } = usePaneFns({
    paneName: UI_EDITOR,
    tab,
    setTab,
  });
  const commonProps = {
    vis,
    tab,
    getOnTabClick,
    className:
      "flex h-10 w-10 cursor-pointer items-center justify-center text-2xl focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-blue-500",
    requiredTabs,
  };

  return (
    <div
      id="UiEditorPane"
      className="contents"
      onKeyDown={uiEditorPaneOnKeyDown}
    >
      <div className="absolute right-0 z-[19] flex h-full w-[50px] flex-col items-center gap-1 border-l border-setta-200/75 bg-setta-50 py-3 dark:border-setta-850 dark:bg-setta-900">
        <TabButton
          tabName={SECTION_CONFIG_TAB}
          {...commonProps}
          {...getFloatingBoxHandlers("Section Config")}
        >
          <MdOutlineSettingsApplications />
        </TabButton>
        <TabButton
          tabName={UI_CONFIG_TAB}
          {...commonProps}
          {...getFloatingBoxHandlers("Parameter UI Config")}
        >
          <BsCardChecklist />
        </TabButton>
        <TabButton
          tabName={QUICKINFO_CONFIG_TAB}
          {...commonProps}
          {...getFloatingBoxHandlers("Parameter Info Editing")}
        >
          <TbEdit />
        </TabButton>
        <TabButton
          tabName={INFO_CONFIG_TAB}
          {...commonProps}
          {...getFloatingBoxHandlers("Markdown Editor")}
        >
          <FaMarkdown />
        </TabButton>
        <TabButton
          tabName={SECTION_VARIANTS_TAB}
          {...commonProps}
          {...getFloatingBoxHandlers("Section Variants")}
        >
          <TbVersions />
        </TabButton>
      </div>
      <PaneContainer
        right={true}
        minimumWidth={425}
        vis={vis}
        width={width}
        setWidth={setWidth}
        setTrueWidth={setTrueWidth}
      >
        {sectionIds.length === 1 && vis ? (
          <TabsVisible sectionId={sectionIds[0]} tab={tab} />
        ) : (
          <Placeholder />
        )}
      </PaneContainer>
    </div>
  );
}

function TabsVisible({ sectionId, tab }) {
  const title = tabNameToPretty.get(tab);
  console.log("title", tab);
  return (
    <div className="flex h-full min-h-0 w-[calc(100%_-_3rem)] min-w-0 flex-1 flex-col overflow-hidden pr-1.5">
      <h2 className="mb-1 cursor-pointer select-none text-xs font-bold uppercase tracking-tight text-setta-300 dark:text-setta-500">
        {title}
      </h2>
      <TabContent sectionId={sectionId} tab={tab} />
    </div>
  );
}

function TabContent({ sectionId, tab }) {
  switch (tab) {
    case SECTION_CONFIG_TAB:
      return <SectionConfig sectionId={sectionId} />;
    case UI_CONFIG_TAB:
      return <UIConfig sectionId={sectionId} />;
    case QUICKINFO_CONFIG_TAB:
      return <QuickInfoConfig sectionId={sectionId} />;
    case INFO_CONFIG_TAB:
      return <MarkdownEditor sectionId={sectionId} />;
    case SECTION_VARIANTS_TAB:
      return <SectionVariants sectionId={sectionId} />;
  }
}

function Placeholder() {
  return (
    <aside className="grid h-full min-h-0 w-[calc(100%_-_2rem)]">
      <div className="flex flex-col items-center gap-4 place-self-center">
        <FiEdit3 className="h-20 w-20 text-setta-300 dark:text-setta-700 " />
        <h4 className="text-center text-lg font-bold tracking-widest text-setta-300 dark:text-setta-600">
          Select A Card to Edit
        </h4>
      </div>
    </aside>
  );
}
