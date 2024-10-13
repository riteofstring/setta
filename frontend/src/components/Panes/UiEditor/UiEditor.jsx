import { PaneContainer } from "components/Utils/PaneContainer";
import { BsCardChecklist } from "react-icons/bs";
import { FaMarkdown } from "react-icons/fa";
import { FiEdit3 } from "react-icons/fi";
import { MdOutlineSettingsApplications } from "react-icons/md";
import { TbEdit, TbVersions } from "react-icons/tb";
import { useActiveSection } from "state/definitions";
import { localStorageFns } from "state/hooks/localStorage";
import {
  INFO_CONFIG_TAB,
  QUICKINFO_CONFIG_TAB,
  SECTION_CONFIG_TAB,
  SECTION_VARIANTS_TAB,
  UI_CONFIG_TAB,
  UI_EDITOR,
} from "utils/constants";
import { usePaneFns } from "../paneFns";
import { MarkdownEditor } from "./MarkdownEditor/MarkdownEditor";
import { QuickInfoConfig } from "./QuickInfoConfig/QuickInfoConfig";
import { SectionConfig } from "./SectionConfig/SectionConfig";
import { SectionVariants } from "./SectionVariants/SectionVariants";
import { UIConfig } from "./UIConfig/UIConfig";

export function UiEditor() {
  const sectionIds = useActiveSection((x) => x.ids);

  const [tab, setTab] = localStorageFns.uiEditorTab.hook();
  const { vis, width, setWidth, setTrueWidth, getOnTabClick } = usePaneFns({
    paneName: UI_EDITOR,
    tab,
    setTab,
  });

  return (
    <>
      <div className="absolute right-0 z-20 flex h-full w-12 flex-col items-center gap-1 bg-setta-900 py-2">
        <button
          className="flex h-10 w-10 cursor-pointer items-center justify-center text-2xl text-setta-400 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-500"
          onClick={getOnTabClick(SECTION_CONFIG_TAB)}
        >
          <MdOutlineSettingsApplications />
        </button>
        <button
          className="flex h-10 w-10 cursor-pointer items-center justify-center text-2xl text-setta-400 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-500"
          onClick={getOnTabClick(UI_CONFIG_TAB)}
        >
          <BsCardChecklist />
        </button>
        <button
          className="flex h-10 w-10 cursor-pointer items-center justify-center text-2xl text-setta-400 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-500"
          onClick={getOnTabClick(QUICKINFO_CONFIG_TAB)}
        >
          <TbEdit />
        </button>
        <button
          className="flex h-10 w-10 cursor-pointer items-center justify-center text-2xl text-setta-400 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-500"
          onClick={getOnTabClick(INFO_CONFIG_TAB)}
        >
          <FaMarkdown />
        </button>
        <button
          className="flex h-10 w-10 cursor-pointer items-center justify-center text-2xl text-setta-400 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-500"
          onClick={getOnTabClick(SECTION_VARIANTS_TAB)}
        >
          <TbVersions />
        </button>
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
    </>
  );
}

function TabsVisible({ sectionId, tab }) {
  return (
    <div className="flex h-full min-h-0 w-[calc(100%_-_2rem)] min-w-0 flex-1 flex-col overflow-hidden pl-2">
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
