import C from "constants/constants.json";
import { useState } from "react";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { useSectionInfos } from "state/definitions";
import { useGetEVColNames } from "state/hooks/ev";
import {
  getForSectionId,
  useCurrParamSweepId,
  useForSectionId,
  useGetParamSweepNames,
} from "state/hooks/paramSweep";
import { useGetSectionInfo } from "state/hooks/sections";
import useDeepCompareEffect from "use-deep-compare-effect";
import { ResizableVersionsList } from "components/Utils/Resizable/ResizableVersionsList";

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
        className="section-grid -my-4 flex-1 self-stretch pb-8 pt-6"
        onMouseLeave={onMouseLeave}
      >
        <ul className="section-full nodrag nowheel grid auto-rows-min grid-cols-subgrid gap-y-2 overflow-y-auto overflow-x-clip pt-2">
          {sectionTypeName === C.PARAM_SWEEP ? (
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
      className="section-key-value -mx-2 -my-[0.125rem] grid h-min cursor-pointer auto-rows-min grid-cols-subgrid items-center justify-between rounded-xl px-2 py-[0.125rem] text-xs hover:bg-setta-50/50 dark:hover:bg-setta-800/50"
    >
      <p
        className={`section-key truncate ${
          isCurr
            ? "font-medium text-setta-800 dark:text-setta-100"
            : "text-setta-400 dark:text-setta-400"
        } `}
      >
        {name}
      </p>
      <p className="section-value italic text-setta-400 dark:text-setta-500">
        01/04/2024
      </p>
    </li>
  );
}
