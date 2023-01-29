import * as Tabs from "@radix-ui/react-tabs";
import { PaneContainer } from "components/AppContainer/Main/PaneContainer/PaneContainer";
import { useActiveSection } from "models/activeSection";
import { usePanes } from "models/panes";
import {
  SECTION_CONFIG_TAB,
  UI_CONFIG_TAB,
  useUIEditor,
} from "models/uiEditor";
import React from "react";
import { FiEdit3 } from "react-icons/fi";
import { UI_EDITOR } from "utils/constants";
import { SectionConfig } from "./SectionConfig/SectionConfig";
import { UIConfig } from "./UIConfig/UIConfig";

const paneProps = {
  right: true,
  paneName: UI_EDITOR,
};

export function UiEditor() {
  const sectionId = useActiveSection((x) => x.id);
  const vis = usePanes((x) => x.vis[paneProps.paneName]);
  const tab = useUIEditor((x) => x.tab);
  const setTab = useUIEditor((x) => x.setTab);

  return (
    <PaneContainer paneProps={paneProps} paneTitle="Edit">
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
        </Tabs.List>
        <TabContent
          value={SECTION_CONFIG_TAB}
          className={`${!sectionId && "h-full"}`}
        >
          {sectionId ? (
            <SectionConfig sectionId={sectionId} />
          ) : (
            <Placeholder />
          )}
        </TabContent>
        <TabContent value={UI_CONFIG_TAB}>
          {sectionId ? <UIConfig sectionId={sectionId} /> : <Placeholder />}
        </TabContent>
      </Tabs.Root>
    </PaneContainer>
  );
}

function TabItem({ name, value }) {
  // border-b-2 isn't working for some reason. using border-bottom instead.
  // tab-index isn't working? can't tab to inactive tab
  return (
    <Tabs.Trigger
      className="my-4 cursor-pointer select-none font-heading text-xl uppercase [border-bottom:3px_solid_transparent] focus-visible:ring-2 [&[data-state='active']]:border-gray-500 [&[data-state='active']]:font-bold"
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

const Placeholder = React.forwardRef((props, ref) => {
  return (
    <div className="grid min-h-[60vh]" ref={ref}>
      <div className="flex flex-col items-center gap-4 place-self-center">
        <FiEdit3 className="h-20 w-20 text-gray-300 " />
        <h4 className="text-lg font-bold tracking-widest text-gray-300">
          Select A Card to Edit
        </h4>
      </div>
    </div>
  );
});
