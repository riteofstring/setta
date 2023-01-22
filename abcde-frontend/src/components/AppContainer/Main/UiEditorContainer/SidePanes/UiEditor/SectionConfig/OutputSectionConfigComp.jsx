import * as Collapsible from "@radix-ui/react-collapsible";
import { useOutputNames } from "hooks/useOutputNames";

export function OutputSectionConfigComp({ sectionId }) {
  const outputGroups = useOutputNames();

  return Object.entries(outputGroups).map(([groupId, groupDetails]) => (
    <SearchItem details={groupDetails} key={`OutputSearchItem-${groupId}`} />
  ));
}

function SearchItem({ details }) {
  return (
    <li className="border border-solid border-transparent px-3 py-2 hover:bg-white hover:shadow-md rounded-lg transition edit-list-item flex [&:hover_*]:text-black select-none">
      <input
        type="checkbox"
        className="w-4 h-4 mr-2 mt-1 flex-shrink-0 checked:bg-blue-500 cursor-pointer rounded-md bg-gray-200 text-blue-600 border-gray-300 focus-visible:ring-blue-300 ring-offset-1 focus-visible:ring-2"
      />
      <label className="w-full">
        <OutputDetails outputNames={details.children}>
          <div className="flex flex-col self-stretch cursor-pointer">
            <h2 className="text-md font-bold text-gray-500">{details.name}</h2>
          </div>
        </OutputDetails>
      </label>
    </li>
  );
}

function OutputDetails({ children, outputNames }) {
  return (
    <Collapsible.Root>
      <Collapsible.Trigger asChild>{children}</Collapsible.Trigger>
      <Collapsible.Content>
        <div className="py-3 px-5 mt-2 bg-gray-200 rounded-md select-text">
          {outputNames.map((k) => (
            <div key={`OutputDetails-${k}`}>
              <h3 className="font-bold text-sm">{k}</h3>
            </div>
          ))}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
