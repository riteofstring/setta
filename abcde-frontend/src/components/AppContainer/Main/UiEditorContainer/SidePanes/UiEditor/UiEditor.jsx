import * as Tabs from "@radix-ui/react-tabs";
import { PaneContainer } from "components/AppContainer/Main/PaneContainer/PaneContainer";
import { useActiveSection } from "models/activeSection";
import { usePanes } from "models/panes";
import {
  SECTION_CONFIG_TAB,
  UI_CONFIG_TAB,
  useUIEditor,
} from "models/uiEditor";
import { FiEdit3 } from "react-icons/fi";
import { UI_EDITOR } from "utils/constants";
import { MarkdownEditor } from "./MarkdownEditor/MarkdownEditor";
import { SectionConfig } from "./SectionConfig/SectionConfig";
import { UIConfig } from "./UIConfig/UIConfig";

const paneProps = {
  right: true,
  paneName: UI_EDITOR,
  initialWidth: 500,
};

export function UiEditor() {
  const sectionId = useActiveSection((x) => x.id);
  const vis = usePanes((x) => x.vis[paneProps.paneName]);
  const tab = useUIEditor((x) => x.tab);
  const setTab = useUIEditor((x) => x.setTab);

  return (
    <PaneContainer paneProps={paneProps} paneTitle="Edit">
      {sectionId ? (
        <Tabs.Root
          className={`flex flex-grow flex-col overflow-y-hidden ${
            vis ? "visible" : "invisible"
          }`}
          defaultValue={SECTION_CONFIG_TAB}
          value={tab}
          onValueChange={setTab}
        >
          <Tabs.List className="flex gap-4">
            <TabItem name="Card" value={SECTION_CONFIG_TAB} />
            <TabItem name="Parameters" value={UI_CONFIG_TAB} />
            <TabItem name="Info" />
          </Tabs.List>
          <SectionConfigTab sectionId={sectionId} />
          <UIConfigTab sectionId={sectionId} />
          <InfoTab sectionId={sectionId} />
        </Tabs.Root>
      ) : (
        <Placeholder />
      )}
    </PaneContainer>
  );
}

function TabItem({ name, value }) {
  // border-b-2 isn't working for some reason. using border-bottom instead.
  // tab-index isn't working? can't tab to inactive tab
  return (
    <Tabs.Trigger
      className="my-4 cursor-pointer select-none font-heading text-xl uppercase [border-bottom:3px_solid_transparent] focus-visible:ring-2 [&[data-state='active']]:border-slate-500 [&[data-state='active']]:font-bold"
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
    <div className="flex grid min-h-[60vh] flex-grow flex-col">
      <div className="flex flex-col items-center gap-4 place-self-center">
        <FiEdit3 className="h-20 w-20 text-slate-300 " />
        <h4 className="text-lg font-bold tracking-widest text-slate-300">
          Select A Card to Edit
        </h4>
      </div>
    </div>
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
    <TabContent>
      <MarkdownEditor sectionId={sectionId} />
    </TabContent>
  );
}
