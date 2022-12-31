import * as Collapsible from "@radix-ui/react-collapsible";
import {
  getCollectionDetails,
  getCollectionsAndModules,
} from "dbRequests/sectionConfig";
import { useGroupedObjInfos } from "hooks/useImmutableInfo";
import { useGetSelectedCollectionsForSectionConfig } from "hooks/useSectionContents";
import { useState } from "react";
import { StandardSearch } from "utils/atoms/search/StandardSearch";
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

  // shadow-inner bg-white  border border-white py-2 px-3

  return (
    <div
      className="rounded-2xl flex-grow flex flex-col [&>form]:flex-grow-0"
      data-testid={`SectionConfig ${sectionId}`}
    >
      <Search onSubmit={onSubmit} />
      <ul className="flex flex-col flex-grow gap-4 pt-4">
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
  );
}

function Search({ onSubmit }) {
  const [text, setText] = useState("");
  function onChange(e) {
    setText(e.target.value);
  }
  function onFormSubmit(e) {
    e.preventDefault();
    onSubmit(text);
  }

  const inputStyles =
    "flex-grow text-sm outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-gray-300  focus-visible:border-blue-300 pl-7 py-1 ";

  return (
    <StandardSearch
      inputStyles={inputStyles}
      onChange={onChange}
      onFormSubmit={onFormSubmit}
    />
  );
}

function SearchItem({ id, name, description, details, checked, onChange }) {
  function onCheckboxChange(e) {
    onChange({ newValueFn: checkboxChangeFn(e.target.checked, id), id });
  }

  return (
    <li className="border border-solid border-transparent px-3 py-2 hover:bg-white hover:shadow-md rounded-lg transition edit-list-item flex [&:hover_*]:text-black select-none">
      <input
        type="checkbox"
        className="w-4 h-4 mr-2 mt-1 flex-shrink-0 checked:bg-blue-500 cursor-pointer rounded-md bg-gray-200 text-blue-600 border-gray-300 focus-visible:ring-blue-300 ring-offset-1 focus-visible:ring-2"
        checked={checked}
        onChange={onCheckboxChange}
      />
      <label className="w-full">
        <ObjCollectionDetails details={details}>
          <div className="flex flex-col self-stretch cursor-pointer">
            <h2 className="text-md font-bold text-gray-500">{name}</h2>
            <p className="text-sm mt-1">{description}</p>
          </div>
        </ObjCollectionDetails>
      </label>
    </li>
  );
}

function ObjCollectionDetails({ children, details }) {
  const groupedDetails = useGroupedObjInfos(details);

  return (
    <Collapsible.Root>
      <Collapsible.Trigger asChild>{children}</Collapsible.Trigger>
      <Collapsible.Content>
        <div className="py-3 px-5 mt-2 bg-gray-200 rounded-md select-text">
          {Object.entries(groupedDetails).map(([k, v]) => (
            <div key={`ObjCollectionDetails-${k}`}>
              <h3 className="font-bold text-sm">{k}</h3>
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
