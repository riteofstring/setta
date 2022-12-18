import * as Tabs from "@radix-ui/react-tabs";
import PaneContainer from "components/AppContainer/Main/PaneContainer/PaneContainer";
import { usePanes } from "models/panes";
import {
  SECTION_CONFIG_TAB,
  UI_CONFIG_TAB,
  useUIEditor,
} from "models/uiEditor";
import { UI_EDITOR } from "utils/constants";
import SectionConfig from "./SectionConfig/SectionConfig";
import UIConfig from "./UIConfig/UIConfig";

const paneProps = {
  right: true,
  paneName: UI_EDITOR,
};

export default function UiEditor() {
  const vis = usePanes((x) => x.vis[paneProps.paneName]);
  const tab = useUIEditor((x) => x.tab);
  const setTab = useUIEditor((x) => x.setTab);

  return (
    <PaneContainer paneProps={paneProps} paneTitle="Edit">
      <Tabs.Root
        className={vis ? "visible" : "invisible"}
        defaultValue={SECTION_CONFIG_TAB}
        value={tab}
        onValueChange={setTab}
      >
        <Tabs.List className="flex gap-4">
          <TabItem name="Card" value={SECTION_CONFIG_TAB} />
          <TabItem name="Parameters" value={UI_CONFIG_TAB} />
        </Tabs.List>
        <TabContent value={SECTION_CONFIG_TAB}>
          <SectionConfig />
        </TabContent>
        <TabContent value={UI_CONFIG_TAB}>
          <UIConfig />
        </TabContent>
      </Tabs.Root>
    </PaneContainer>
  );
}

function TabItem({ name, value }) {
  // border-b-2 isn't working for some reason. using border-bottom instead.
  return (
    <Tabs.Trigger
      className="[border-bottom:3px_solid_transparent] cursor-pointer my-4 text-xl uppercase font-heading [&[data-state='active']]:border-gray-500 [&[data-state='active']]:font-bold"
      value={value}
      data-testid={`UiEditor ${name} Button`}
    >
      {name}
    </Tabs.Trigger>
  );
}

function TabContent(props) {
  const { children, value } = props;
  return (
    <Tabs.Content
      className="flex-grow grid h-[inherit] overflow-y-auto"
      value={value}
    >
      {children}
    </Tabs.Content>
  );
}
