import * as Accordion from "@radix-ui/react-accordion";
import { PaneContainer } from "components/AppContainer/Main/PaneContainer/PaneContainer";
import { useGetOverviewListing } from "hooks/useGetOverviewListing";
import { useUpdateMapPosition } from "hooks/useUpdateMapPosition";
import { StandardSearch } from "utils/atoms/search/StandardSearch";
import { OVERVIEW } from "utils/constants";
import AccordionDemo from "./InfoView/InfoView";
import { SectionListItems } from "./SectionList/SectionListItems";

const paneProps = {
  right: false,
  paneName: OVERVIEW,
  initialWidth: 320,
};

export function Overview() {
  const [filteredList, setFilter] = useGetOverviewListing();

  const onResizeStop = useUpdateMapPosition();

  return (
    <PaneContainer
      paneProps={paneProps}
      paneTitle="Overview"
      onResizeStop={onResizeStop}
    >
      <div className="pb-4">
        <StandardSearch
          inputStyles="flex-grow outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-slate-300  focus-visible:border-blue-300 pl-7 py-1"
          leftElementStyles="pl-1"
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Overview Search"
        />
      </div>
      <div className="flex-grow overflow-y-auto">
        <SectionListItems listOfSectionIdsAndNames={filteredList} />
      </div>
      <AccordionDemo />
    </PaneContainer>
  );
}

function InfoView() {
  return (
    <Accordion.Root>
      <Accordion.Item>
        <Accordion.Header>
          <Accordion.Trigger>OPEN</Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Content>INFO</Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
}
