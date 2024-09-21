import C from "constants/constants.json";
import { useDndChildren } from "forks/dnd-kit/dndChildren";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { getSectionIdToChildren } from "state/actions/sectionVariants";
import { useSectionInfos, useSectionVariants } from "state/definitions";
import {
  getForSectionId,
  useCurrParamSweepId,
  useForSectionId,
  useGetParamSweepNames,
} from "state/hooks/paramSweep";
import { useGetSectionVariantNames } from "state/hooks/sectionVariants";
import { useSectionTypeName } from "state/hooks/uiTypes";

export function VersionList({ sectionId }) {
  const sectionTypeName = useSectionTypeName(sectionId);

  function onMouseLeave() {
    setSectionInfoAttr({ sectionId, attr: "previewVariantId", value: null });
    setSectionInfoAttr({
      sectionId: getForSectionId(useSectionInfos.getState().x, sectionId),
      attr: "previewParamSweepId",
      value: null,
    });
  }

  return (
    <section
      className="section-grid-cols section-grid-rows section-grid-areas -mx-3 -my-4 grid flex-1 self-stretch"
      onMouseLeave={onMouseLeave}
    >
      <ul className="section-full nodrag nowheel grid auto-rows-min grid-cols-subgrid gap-y-2 overflow-y-auto overflow-x-clip pt-2">
        <p className="section-key text-xs text-setta-400 dark:text-setta-600">
          Name
        </p>
        <p className="section-value ml-auto text-xs text-setta-400 dark:text-setta-600">
          Date
        </p>
        {sectionTypeName === C.PARAM_SWEEP ? (
          <ParamSweepItems sectionId={sectionId} />
        ) : (
          <EVItems sectionId={sectionId} />
        )}
      </ul>
    </section>
  );
}

function EVItems({ sectionId }) {
  const currVariantId = useSectionInfos((x) => x.x[sectionId].variantId);
  const sectionVariantNames = useGetSectionVariantNames(sectionId);

  function onMouseOver(id) {
    setSectionInfoAttr({ sectionId, attr: "previewVariantId", value: id });
  }

  function onClick(id) {
    setSectionInfoAttr({ sectionId, attr: "variantId", value: id });
    useDndChildren
      .getState()
      .update(getSectionIdToChildren(useSectionVariants.getState().x));
  }

  return sectionVariantNames.map((e) => (
    <OneItem
      key={e.id}
      id={e.id}
      name={e.name}
      isCurr={currVariantId === e.id}
      onMouseOver={onMouseOver}
      onClick={onClick}
    />
  ));
}

function ParamSweepItems({ sectionId }) {
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
      <p className="section-value ml-auto italic text-setta-400 dark:text-setta-500">
        01/04/2024
      </p>
    </li>
  );
}
