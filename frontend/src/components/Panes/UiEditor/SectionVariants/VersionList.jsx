import C from "constants/constants.json";
import { useDndChildren } from "forks/dnd-kit/dndChildren";
import { FaRegSnowflake } from "react-icons/fa";
import { maybeRunGuiToYaml } from "state/actions/guiToYaml";
import { toggleParamSweepIsFrozen } from "state/actions/runGroups/paramSweep";
import {
  manualDndChildrenReset,
  setSectionInfoAttr,
} from "state/actions/sections/sectionInfos";
import { toggleVariantFrozenState } from "state/actions/sectionVariants";
import {
  useParamSweep,
  useSectionInfos,
  useSectionVariants,
} from "state/definitions";
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
    manualDndChildrenReset();
    maybeRunGuiToYaml(sectionId);
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
    const newChildren = useSectionVariants.getState().x[id].children;
    useDndChildren.getState().updateOneParent(sectionId, newChildren);
    maybeRunGuiToYaml(sectionId);
  }

  function onClick(id) {
    setSectionInfoAttr({ sectionId, attr: "variantId", value: id });
    manualDndChildrenReset();
    maybeRunGuiToYaml(sectionId);
  }

  function isFrozenHook(id) {
    return { hook: useSectionVariants, selector: (x) => x.x[id].isFrozen };
  }

  return sectionVariantNames.map((e) => (
    <OneItem
      key={e.id}
      id={e.id}
      name={e.name}
      isCurr={currVariantId === e.id}
      onMouseOver={onMouseOver}
      onClick={onClick}
      onFreezeClick={toggleVariantFrozenState}
      isFrozenHook={isFrozenHook}
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

  function isFrozenHook(id) {
    return { hook: useParamSweep, selector: (x) => x.x[id].isFrozen };
  }

  return paramSweepNames.map((e) => (
    <OneItem
      key={e.id}
      id={e.id}
      name={e.name}
      isCurr={currParamSweepId === e.id}
      onMouseOver={onMouseOver}
      onClick={onClick}
      onFreezeClick={toggleParamSweepIsFrozen}
      isFrozenHook={isFrozenHook}
    />
  ));
}

function OneItem({
  id,
  name,
  isCurr,
  onMouseOver,
  onClick,
  onFreezeClick,
  isFrozenHook,
}) {
  const { hook: useIsFrozen, selector: frozenSelector } = isFrozenHook(id);
  const isFrozen = useIsFrozen(frozenSelector);

  return (
    <li
      onMouseOver={() => onMouseOver(id)}
      onClick={() => onClick(id)}
      className="section-key-value group/versionitem -my-[0.125rem] flex h-min cursor-pointer items-center justify-between rounded-lg px-2 py-[0.125rem] text-xs hover:bg-setta-200/30 dark:hover:bg-setta-800/50"
    >
      <p
        className={`section-key truncate ${
          isCurr
            ? "font-medium text-setta-600 group-hover/versionitem:text-setta-800 dark:text-setta-300 group-hover/versionitem:dark:text-setta-100"
            : "text-setta-400 dark:text-setta-400"
        } `}
      >
        {name}
      </p>
      <button
        className={`cursor-pointer bg-transparent ${
          isFrozen
            ? "text-blue-500"
            : "text-transparent hover:!text-setta-400 group-hover/versionitem:text-setta-400/50"
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onFreezeClick(id);
        }}
      >
        <FaRegSnowflake />
      </button>
    </li>
  );
}

// when the freeze button is active we could use text-blue-500
