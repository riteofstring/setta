import { useGetEVColNames } from "hooks/useEnteredValue";
import { useGetSectionInfo } from "hooks/useSectionInfo";
import { setSectionInfoAttr } from "thunks/sections/setters";
import { ResizableDescription } from "utils/Resizable/ResizableDescription";

export function VersionList({ sectionId }) {
  return (
    <ResizableDescription sectionId={sectionId}>
      <section className="version-section -my-4 flex-1 self-stretch pt-9 pb-8">
        <ul className="version-list nodrag nowheel overflow-y-auto overflow-x-clip pt-2">
          <Items sectionId={sectionId} />
        </ul>
      </section>
    </ResizableDescription>
  );
}

function Items({ sectionId }) {
  const currEVColId = useGetSectionInfo(sectionId, "evColId");
  const evColNames = useGetEVColNames(sectionId);
  function onMouseOver(id) {
    setSectionInfoAttr({ sectionId, attr: "evColId", value: id });
  }

  return evColNames.map((e) => (
    <OneItem
      key={e.id}
      id={e.id}
      name={e.name}
      isCurr={currEVColId === e.id}
      onMouseOver={onMouseOver}
    />
  ));
}

function OneItem({ id, name, isCurr, onMouseOver }) {
  return (
    <li
      onMouseOver={() => onMouseOver(id)}
      className="version-list-item -my-1 -mx-2 cursor-pointer auto-rows-auto justify-between rounded-xl px-2 py-1 text-xs hover:bg-runcoder-50/50 dark:hover:bg-runcoder-800/50"
    >
      <p
        className={`col-start-1 truncate ${
          isCurr
            ? "font-medium text-runcoder-800 dark:text-runcoder-100"
            : "text-runcoder-400 dark:text-runcoder-400"
        } `}
      >
        {name}
      </p>
      <p className="col-start-2 italic text-runcoder-400 dark:text-runcoder-500">
        01/04/2024
      </p>
    </li>
  );
}
