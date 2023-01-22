import * as Collapsible from "@radix-ui/react-collapsible";
import { useOutputNames } from "hooks/useOutputNames";
import { SectionConfigSearch } from "./SectionConfigComp";

export function OutputsSearch({ sectionId }) {
  const outputGroups = useOutputNames();

  return (
    <SectionConfigSearch
      sectionId={sectionId}
      onSelectionChange={() => {}}
      onSearch={() => {}}
      alreadySelected={{}}
      results={outputGroups}
      DetailsComponent={OutputDetails}
    />
  );
}

function OutputDetails({ children, details }) {
  return (
    <Collapsible.Root>
      <Collapsible.Trigger asChild>{children}</Collapsible.Trigger>
      <Collapsible.Content>
        <div className="py-3 px-5 mt-2 bg-gray-200 rounded-md select-text">
          {details.map((k) => (
            <div key={`OutputDetails-${k}`}>
              <h3 className="font-bold text-sm">{k}</h3>
            </div>
          ))}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
