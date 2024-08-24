import * as Tabs from "@radix-ui/react-tabs";
import { PaneContainer } from "components/Utils/PaneContainer";
import { updateMapPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import { localStorageFns } from "state/hooks/localStorage";
import { OVERVIEW } from "utils/constants";
import { InfoViewBig } from "./InfoViewBig";
import { ProjectConfigs } from "./ProjectConfigs";
import { ProjectOverview } from "./ProjectOverview";

const paneProps = {
  right: false,
  paneName: OVERVIEW,
};

export function Overview() {
  const [vis] = localStorageFns[`${paneProps.paneName}Vis`].hook();

  return (
    <PaneContainer
      paneProps={paneProps}
      paneTitle="Overview"
      onResizeStop={updateMapPosition}
    >
      {vis && <TabsVisible />}
    </PaneContainer>
  );
}

function TabsVisible() {
  return (
    <Tabs.Root
      // className={`contents ${vis ? "visible" : "invisible"}`}
      defaultValue="tab1"
      // defaultValue={SECTION_CONFIG_TAB}
      // value={tab}
      // onValueChange={setTab}
      className="flex h-full min-h-0 w-[calc(100%_-_2rem)] min-w-0 flex-1 flex-col overflow-hidden pr-2"
    >
      <Tabs.List>
        <nav className="flex gap-4 overflow-x-auto">
          <TabItem name="Overview" value="tab1" />
          <TabItem name="Info" value="tab2" />
          <TabItem name="Configs" value="tab3" />
        </nav>
      </Tabs.List>
      <TabContent value="tab1">
        <ProjectOverview />
      </TabContent>
      <TabContent value="tab2">
        <InfoViewBig />
      </TabContent>
      <TabContent value="tab3">
        <ProjectConfigs />
      </TabContent>
    </Tabs.Root>
  );
}

function TabItem({ name, value }) {
  // border-b-2 isn't working for some reason. using border-bottom instead.
  // tab-index isn't working? can't tab to inactive tab
  return (
    <Tabs.Trigger
      className="tracking-tight[transition:font-weight_100ms_ease-in-out] my-4 cursor-pointer select-none text-sm uppercase [border-bottom:3px_solid_transparent] hover:text-blue-800 focus-visible:ring-2 dark:text-setta-500 dark:hover:text-blue-500 [&[data-state='active']]:border-setta-500 [&[data-state='active']]:font-black [&[data-state='active']]:text-setta-500 [&[data-state='active']]:dark:border-setta-300 [&[data-state='active']]:dark:text-setta-300"
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
    <Tabs.Content value={value} asChild className="overflow-x-auto">
      {children}
    </Tabs.Content>
  );
}
