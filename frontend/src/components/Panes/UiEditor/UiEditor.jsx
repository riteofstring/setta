import * as Tabs from "@radix-ui/react-tabs";
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
import { usePaneFns } from "../paneFns";
import { MarkdownEditor } from "./MarkdownEditor/MarkdownEditor";
import { QuickInfoConfig } from "./QuickInfoConfig/QuickInfoConfig";
import { SectionConfig } from "./SectionConfig/SectionConfig";
import { SectionVariants } from "./SectionVariants/SectionVariants";
import { UIConfig } from "./UIConfig/UIConfig";
import { localStorageFns } from "state/hooks/localStorage";

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
          // onClick={getOnTabClick(SECTION_CONFIG_TAB)}
        >
          <MdOutlineSettingsApplications />
        </button>
        <button
          className="flex h-10 w-10 cursor-pointer items-center justify-center text-2xl text-setta-400 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-500"
          // onClick={getOnTabClick()}
        >
          <BsCardChecklist />
        </button>
        <button
          className="flex h-10 w-10 cursor-pointer items-center justify-center text-2xl text-setta-400 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-500"
          // onClick={onClick}
        >
          <TbEdit />
        </button>
        <button
          className="flex h-10 w-10 cursor-pointer items-center justify-center text-2xl text-setta-400 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-500"
          // onClick={onClick}
        >
          <FaMarkdown />
        </button>
        <button
          className="flex h-10 w-10 cursor-pointer items-center justify-center text-2xl text-setta-400 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-500"
          // onClick={onClick}
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
          <TabsVisible sectionId={sectionIds[0]} />
        ) : (
          <Placeholder />
        )}
      </PaneContainer>
    </>
  );
}

function TabsVisible({ sectionId }) {
  // const [tab, setTab, requiredTabs] = useUIEditorTab(sectionId);

  return (
    <Tabs.Root
      className="flex h-full min-h-0 w-[calc(100%_-_2rem)] min-w-0 flex-1 flex-col overflow-hidden pl-2"
      defaultValue={SECTION_CONFIG_TAB}
      value={tab}
      onValueChange={setTab}
    >
      <Tabs.List asChild>
        <nav className="flex gap-4 overflow-x-auto">
          {requiredTabs.map((x) => (
            <TabItem name={tabNameToPretty.get(x)} value={x} key={x} />
          ))}
        </nav>
      </Tabs.List>
      {requiredTabs.map((x) => (
        <TabContentSelector sectionId={sectionId} tabName={x} key={x} />
      ))}
    </Tabs.Root>
  );
}

function TabItem({ name, value }) {
  // border-b-2 isn't working for some reason. using border-bottom instead.
  // tab-index isn't working? can't tab to inactive tab
  return (
    <Tabs.Trigger
      className="mb-8 cursor-pointer select-none text-sm uppercase tracking-tight [border-bottom:3px_solid_transparent] [transition:font-weight_100ms_ease-in-out] hover:text-blue-800 focus-visible:ring-2 dark:text-setta-500 dark:hover:text-blue-500 [&[data-state='active']]:border-setta-500 [&[data-state='active']]:font-black [&[data-state='active']]:text-setta-500 [&[data-state='active']]:dark:border-setta-300 [&[data-state='active']]:dark:text-setta-300"
      value={value}
      tab-index="0"
    >
      {name}
    </Tabs.Trigger>
  );
}

function TabContent(props) {
  const { children, value } = props;
  return (
    <Tabs.Content value={value} asChild>
      {children}
    </Tabs.Content>
  );
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

function SectionConfigTab({ sectionId }) {
  return (
    <TabContent value={SECTION_CONFIG_TAB}>
      <SectionConfig sectionId={sectionId} />
    </TabContent>
  );
}

function UIConfigTab({ sectionId }) {
  return (
    <TabContent value={UI_CONFIG_TAB}>
      <UIConfig sectionId={sectionId} />
    </TabContent>
  );
}

function QuickInfoConfigTab({ sectionId }) {
  return (
    <TabContent value={QUICKINFO_CONFIG_TAB}>
      <QuickInfoConfig sectionId={sectionId} />
    </TabContent>
  );
}

function InfoTab({ sectionId }) {
  return (
    <TabContent value={INFO_CONFIG_TAB}>
      <MarkdownEditor sectionId={sectionId} />
    </TabContent>
  );
}

// function DBSourcesTab({ sectionId }) {
//   return (
//     <TabContent value={DB_SOURCES_TAB}>
//       <DBSources sectionId={sectionId} />
//     </TabContent>
//   );
// }

function SectionVariantsTab({ sectionId }) {
  return (
    <TabContent value={SECTION_VARIANTS_TAB}>
      <SectionVariants sectionId={sectionId} />
    </TabContent>
  );
}

function TabContentSelector({ sectionId, tabName }) {
  if (tabName === SECTION_CONFIG_TAB) {
    return <SectionConfigTab sectionId={sectionId} />;
  } else if (tabName === UI_CONFIG_TAB) {
    return <UIConfigTab sectionId={sectionId} />;
  } else if (tabName === INFO_CONFIG_TAB) {
    return <InfoTab sectionId={sectionId} />;
  } else if (tabName === SECTION_VARIANTS_TAB) {
    return <SectionVariantsTab sectionId={sectionId} />;
  } else if (tabName === QUICKINFO_CONFIG_TAB) {
    return <QuickInfoConfigTab sectionId={sectionId} />;
  }
}
