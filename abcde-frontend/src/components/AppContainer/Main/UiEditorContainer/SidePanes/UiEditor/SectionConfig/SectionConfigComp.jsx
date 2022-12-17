import * as Collapsible from "@radix-ui/react-collapsible";
import { useGroupedObjInfos } from "hooks/useImmutableInfo";
import _ from "lodash";
import { checkboxChangeFn } from "utils/utils";

export default function SectionConfigComp({
  savedConfig,
  onChange,
  allCollections,
  results,
}) {
  const selectedCollections = _.pickBy(allCollections, (x) =>
    isSelected(x.id, savedConfig)
  );
  const allResults = { ...selectedCollections, ...results };

  return (
    <div className="flex flex-row mt-4 flex-grow h-[calc(100vh_-_26rem)] overflow-y-auto">
      <div className="flex flex-col pt-1">
        <ul className="flex flex-col flex-grow gap-3">
          {_.values(allResults).map((x) => (
            <SearchItem
              id={x.id}
              name={x.name}
              description={x.description}
              details={x.children}
              checked={isSelected(x.id, savedConfig)}
              onChange={onChange}
              key={`SearchItem-${x.id}`}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

function SearchItem({ id, name, description, details, checked, onChange }) {
  function onCheckboxChange(e) {
    onChange({ newValueFn: checkboxChangeFn(e.target.checked, id), id });
  }

  return (
    <li className="px-5 py-4 border-r-4 cursor-pointer border border-[rgba(0,_0,_0,_0)] hover:bg-white hover:shadow-sm hover:border-white transition edit-list-item">
      <div className="flex flex-row self-stretch [&:hover_*]:text-black">
        <input
          type="checkbox"
          className="h-4 w-4 border-2 rounded-full items-start mt-1 mr-2"
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

function isSelected(id, savedConfig) {
  return savedConfig?.collections.includes(id);
}
