import { useGetEVColNames } from "hooks/useEnteredValue";
import {
  getForSectionId,
  useCurrParamSweepId,
  useForSectionId,
  useGetParamSweepNames,
} from "hooks/useParamSweepInfo";
import { useGetSectionInfo } from "hooks/useSectionInfo";
import { useSectionInfos } from "models/info/sectionInfos";
import { useState } from "react";
import { setSectionInfoAttr } from "thunks/sections/setters";
import useDeepCompareEffect from "use-deep-compare-effect";
import { ResizableVersionsList } from "utils/Resizable/ResizableVersionsList";
import { PARAM_SWEEP } from "z_utils/constants";

export function VersionList({ sectionId, sectionTypeName }) {
  function onMouseLeave() {
    setSectionInfoAttr({ sectionId, attr: "previewEVColId", value: null });
    setSectionInfoAttr({
      sectionId: getForSectionId(useSectionInfos.getState().x, sectionId),
      attr: "previewParamSweepId",
      value: null,
    });
  }

  const [numListings, setNumListings] = useState();

  return (
    <ResizableVersionsList sectionId={sectionId} numListings={numListings}>
      <section
        className="version-section -my-4 flex-1 self-stretch pb-8 pt-6"
        onMouseLeave={onMouseLeave}
      >
        <ul className="version-list nodrag nowheel overflow-y-auto overflow-x-clip pt-2">
          {sectionTypeName === PARAM_SWEEP ? (
            <ParamSweepItems
              sectionId={sectionId}
              setNumListings={setNumListings}
            />
          ) : (
            <EVItems sectionId={sectionId} setNumListings={setNumListings} />
          )}
        </ul>
      </section>
    </ResizableVersionsList>
  );
}

function EVItems({ sectionId, setNumListings }) {
  const currEVColId = useGetSectionInfo(sectionId, "evColId");
  const evColNames = useGetEVColNames(sectionId);

  function onMouseOver(id) {
    setSectionInfoAttr({ sectionId, attr: "previewEVColId", value: id });
  }

  function onClick(id) {
    setSectionInfoAttr({ sectionId, attr: "evColId", value: id });
  }

  useDeepCompareEffect(() => {
    setNumListings(evColNames.length);
  }, [evColNames]);

  return evColNames.map((e) => (
    <OneItem
      key={e.id}
      id={e.id}
      name={e.name}
      isCurr={currEVColId === e.id}
      onMouseOver={onMouseOver}
      onClick={onClick}
    />
  ));
}

function ParamSweepItems({ sectionId, setNumListings }) {
  const forSectionId = useForSectionId(sectionId);
  const currParamSweepId = useCurrParamSweepId(sectionId);
  const paramSweepNames = useGetParamSweepNames(forSectionId);
  function onMouseOver(id) {
    setSectionInfoAttr({
      sectionId: forSectionId,
      attr: "previewParamSweepId",
      value: id,
    });
  }

  function onClick(id) {
    setSectionInfoAttr({
      sectionId: forSectionId,
      attr: "paramSweepId",
      value: id,
    });
  }

  useDeepCompareEffect(() => {
    setNumListings(paramSweepNames.length);
  }, [paramSweepNames]);

  return paramSweepNames.map((e) => (
    <OneItem
      key={e.id}
      id={e.id}
      name={e.name}
      isCurr={currParamSweepId === e.id}
      onMouseOver={onMouseOver}
      onClick={onClick}
    />
  ));
}

function OneItem({ id, name, isCurr, onMouseOver, onClick }) {
  return (
    <li
      onMouseOver={() => onMouseOver(id)}
      onClick={() => onClick(id)}
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
