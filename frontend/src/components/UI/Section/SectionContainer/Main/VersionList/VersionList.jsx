import { useGetEVColNames } from "hooks/useEnteredValue";
import { useGetParamSweepNames } from "hooks/useParamSweepInfo";
import { useGetSectionInfo } from "hooks/useSectionInfo";
import { setSectionInfoAttr } from "thunks/sections/setters";
import { ResizableDescription } from "utils/Resizable/ResizableDescription";
import { PARAM_SWEEP } from "z_utils/constants";

export function VersionList({ sectionId, sectionTypeName }) {
  return (
    <ResizableDescription sectionId={sectionId}>
      <section className="version-section -my-4 flex-1 self-stretch pb-8 pt-9">
        <ul className="version-list nodrag nowheel overflow-y-auto overflow-x-clip pt-2">
          {sectionTypeName === PARAM_SWEEP ? (
            <ParamSweepItems sectionId={sectionId} />
          ) : (
            <EVItems sectionId={sectionId} />
          )}
        </ul>
      </section>
    </ResizableDescription>
  );
}

function EVItems({ sectionId }) {
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

function ParamSweepItems({ sectionId }) {
  const currParamSweepId = useGetSectionInfo(sectionId, "paramSweepId");
  const paramSweepNames = useGetParamSweepNames(sectionId);
  function onMouseOver(id) {
    setSectionInfoAttr({ sectionId, attr: "paramSweepId", value: id });
  }

  return paramSweepNames.map((e) => (
    <OneItem
      key={e.id}
      id={e.id}
      name={e.name}
      isCurr={currParamSweepId === e.id}
      onMouseOver={onMouseOver}
    />
  ));
}

function OneItem({ id, name, isCurr, onMouseOver }) {
  return (
    <li
      onMouseOver={() => onMouseOver(id)}
      className="version-list-item -mx-2 -my-1 cursor-pointer auto-rows-auto justify-between rounded-xl px-2 py-1 text-xs hover:bg-runcoder-50/50 dark:hover:bg-runcoder-800/50"
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
