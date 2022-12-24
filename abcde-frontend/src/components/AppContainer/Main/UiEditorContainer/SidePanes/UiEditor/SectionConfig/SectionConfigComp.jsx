import * as Collapsible from "@radix-ui/react-collapsible";
import {
  getCollectionDetails,
  getCollectionsAndModules,
} from "dbRequests/sectionConfig";
import { useGroupedObjInfos } from "hooks/useImmutableInfo";
import { useGetSelectedCollectionsForSectionConfig } from "hooks/useSectionContents";
import { useState } from "react";
import StandardSearch from "utils/atoms/search/StandardSearch";
import { checkboxChangeFn } from "utils/utils";

export default function SectionConfigComp({ sectionId, onConfigChange }) {
  const [results, setResults] = useState({});
  const selectedCollections =
    useGetSelectedCollectionsForSectionConfig(sectionId);
  const allResults = { ...selectedCollections, ...results };

  async function onSubmit(searchTerm) {
    const x = await getCollectionsAndModules({ searchTerm });
    setResults(x);
  }

  async function onChange({ newValueFn, id }) {
    // collection needs to be retrieved from db
    await getCollectionDetails(id);
    onConfigChange({ newValueFn });
  }

  return (
    <div
      className="py-2 px-3 rounded-2xl bg-white shadow-inner border border-white grow mb-10 flex flex-col"
      data-testid={`SectionConfig ${sectionId}`}
    >
      <Search onSubmit={onSubmit} />
      <div className="flex flex-row mt-4 flex-grow h-[calc(100vh_-_26rem)] overflow-y-auto">
        <div className="flex flex-col pt-1">
          <ul className="flex flex-col flex-grow gap-3">
            {Object.values(allResults).map((x) => (
              <SearchItem
                id={x.id}
                name={x.name}
                description={x.description}
                details={x.children}
                checked={x.id in selectedCollections}
                onChange={onChange}
                key={`SearchItem-${x.id}`}
              />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Search({ onSubmit }) {
  const [text, setText] = useState("");
  function onChange(e) {
    setText(e.target.value);
  }
  function onClick() {
    onSubmit(text);
  }

  return <StandardSearch simpleSearch={true} onChange={onChange} />;
}

function SearchItem({ id, name, description, details, checked, onChange }) {
  function onCheckboxChange(e) {
    onChange({ newValueFn: checkboxChangeFn(e.target.checked, id), id });
  }

  return (
    <li className="px-5 py-4 border-r-4 border border-[rgba(0,_0,_0,_0)] hover:bg-white hover:shadow-sm hover:border-white transition edit-list-item">
      <div className="flex self-stretch [&:hover_*]:text-black">
        <input
          type="checkbox"
          className="w-4 h-4 mr-2 mt-1 checked:bg-blue-500 cursor-pointer rounded-md bg-gray-200 text-blue-600 border-gray-300 focus-visible:ring-blue-300 ring-offset-1 focus-visible:ring-2"
          checked={checked}
          onChange={onCheckboxChange}
        />
        <label>
          <ObjCollectionDetails details={details}>
            <div className="flex flex-col self-stretch">
              <h2 className="text-md font-bold text-gray-500">{name}</h2>
              <p className="text-sm mt-1">{description}</p>
            </div>
          </ObjCollectionDetails>
        </label>
      </div>
    </li>
  );
}

function ObjCollectionDetails({ children, details }) {
  const groupedDetails = useGroupedObjInfos(details);

  return (
    <Collapsible.Root>
      <Collapsible.Trigger>{children}</Collapsible.Trigger>
      <Collapsible.Content>
        <div className="p-[40px] text-white mt-2 bg-teal-500 rounded-md shadow-md">
          {Object.entries(groupedDetails).map(([k, v]) => (
            <div key={`ObjCollectionDetails-${k}`}>
              {k}
              <ObjListText objList={v} />
            </div>
          ))}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function ObjListText({ objList }) {
  return objList.map((x) => (
    <div key={`ObjListText-${x.id}`} style={{ textIndent: "20px" }}>
      {x.name}
    </div>
  ));
}
