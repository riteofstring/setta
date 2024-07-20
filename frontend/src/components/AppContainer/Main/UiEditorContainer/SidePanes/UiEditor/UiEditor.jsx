import * as Tabs from "@radix-ui/react-tabs";
import { PaneContainer } from "components/AppContainer/Main/PaneContainer/PaneContainer";
import { localStorageFns } from "state/hooks/localStorageHooks";
import { useRequiredUIEditorTabs } from "state/hooks/useUITypes";
import { useActiveSection } from "state/definitions/activeSection";
import {
  DB_SOURCES_TAB,
  INFO_CONFIG_TAB,
  SECTION_CONFIG_TAB,
  tabNameToPretty,
  UI_CONFIG_TAB,
  useUIEditor,
} from "state/definitions/uiEditor";
import { FiEdit3 } from "react-icons/fi";
import { UI_EDITOR } from "utils/constants";
import { DBSources } from "./DBSources/DBSources";
import { MarkdownEditor } from "./MarkdownEditor/MarkdownEditor";
import { SectionConfig } from "./SectionConfig/SectionConfig";
import { UIConfig } from "./UIConfig/UIConfig";

const paneProps = {
  right: true,
  paneName: UI_EDITOR,
};

export function UiEditor() {
  const sectionIds = useActiveSection((x) => x.ids);
  const [vis] = localStorageFns[`${paneProps.paneName}Vis`].hook();

  return (
    <PaneContainer paneProps={paneProps} paneTitle="Edit" minimumWidth={425}>
      {sectionIds.length === 1 && vis ? (
        <TabsVisible sectionId={sectionIds[0]} />
      ) : (
        <Placeholder />
      )}
    </PaneContainer>
  );
}

function TabsVisible({ sectionId }) {
  const rawTab = useUIEditor((x) => x.tab);
  const setTab = useUIEditor((x) => x.setTab);
  const requiredTabs = useRequiredUIEditorTabs(sectionId);
  // when sectionId changes, the requiredTabs might not include the previously active tab
  const tab = requiredTabs.includes(rawTab) ? rawTab : requiredTabs[0];

  return (
    <Tabs.Root
      className="contents"
      defaultValue={SECTION_CONFIG_TAB}
      value={tab}
      onValueChange={setTab}
    >
      <Tabs.List asChild>
        <nav className="flex gap-4">
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
      className="my-4 cursor-pointer select-none font-heading text-lg uppercase tracking-tight [border-bottom:3px_solid_transparent] [transition:font-weight_100ms_ease-in-out]  hover:text-blue-800 focus-visible:ring-2 dark:text-setta-400 dark:hover:text-blue-500 [&[data-state='active']]:border-setta-500 [&[data-state='active']]:font-bold"
      value={value}
      data-testid={`UiEditor ${name} Button`}
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
    <aside className="grid min-h-[60vh] flex-grow flex-col">
      <div className="flex flex-col items-center gap-4 place-self-center">
        <FiEdit3 className="h-20 w-20 text-setta-300 dark:text-setta-700 " />
        <h4 className="text-lg font-bold tracking-widest text-setta-300 dark:text-setta-600">
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

function InfoTab({ sectionId }) {
  return (
    <TabContent value={INFO_CONFIG_TAB}>
      <MarkdownEditor sectionId={sectionId} />
    </TabContent>
  );
}

function DBSourcesTab({ sectionId }) {
  return (
    <TabContent value={DB_SOURCES_TAB}>
      <DBSources sectionId={sectionId} />
    </TabContent>
  );
}

// function RuntimeTab({ sectionId }) {
//   return (
//     <TabContent value={RUNTIME_CONFIG_TAB}>
//       <RunTimeOptions sectionId={sectionId} />
//     </TabContent>
//   );
// }

function TabContentSelector({ sectionId, tabName }) {
  if (tabName === SECTION_CONFIG_TAB) {
    return <SectionConfigTab sectionId={sectionId} />;
  } else if (tabName === UI_CONFIG_TAB) {
    return <UIConfigTab sectionId={sectionId} />;
  } else if (tabName === INFO_CONFIG_TAB) {
    return <InfoTab sectionId={sectionId} />;
  } else if (tabName === DB_SOURCES_TAB) {
    return <DBSourcesTab sectionId={sectionId} />;
  }
  // else if (tabName === RUNTIME_CONFIG_TAB) {
  //   return <RuntimeTab sectionId={sectionId} />;
  // }
}
