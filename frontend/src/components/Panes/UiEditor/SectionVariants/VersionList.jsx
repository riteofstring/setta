import { FaRegSnowflake } from "react-icons/fa";
import {
  onClickSetVariantId,
  onMouseLeaveSetPreviewVariantId,
  onMouseOverSetPreviewVariantId,
} from "state/actions/previewOnMouseOver";
import { toggleVariantFrozenState } from "state/actions/sectionInfos";
import { useSectionInfos } from "state/definitions";
import { useGetSectionVariantNames } from "state/hooks/sectionVariants";

export function VersionList({ sectionId }) {
  return (
    <section
      className="section-grid-cols section-grid-rows section-grid-areas -mx-3 -my-4 grid flex-1 self-stretch"
      onMouseLeave={() => onMouseLeaveSetPreviewVariantId(sectionId)}
    >
      <ul className="section-full nodrag nowheel grid auto-rows-min grid-cols-subgrid gap-y-2 overflow-y-auto overflow-x-clip pt-2">
        <header className="section-key-value flex items-center justify-between">
          <p className="text-xs text-setta-400 dark:text-setta-600">Name</p>
          <button className="cursor-pointer rounded-md px-2 py-1 text-xs font-bold text-setta-400 hover:bg-setta-500/20 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-400">
            Edit
          </button>
        </header>

        <EVItems sectionId={sectionId} />
      </ul>
    </section>
  );
}

function EVItems({ sectionId }) {
  const currVariantId = useSectionInfos((x) => x.x[sectionId].variantId);
  const sectionVariantNames = useGetSectionVariantNames(sectionId);

  return sectionVariantNames.map((e) => (
    <OneItem
      key={e.id}
      id={e.id}
      name={e.name}
      isCurr={currVariantId === e.id}
      onMouseOver={(id) => onMouseOverSetPreviewVariantId(sectionId, id)}
      onClick={(id) => onClickSetVariantId(sectionId, id)}
      onFreezeClick={toggleVariantFrozenState}
    />
  ));
}

function OneItem({ id, name, isCurr, onMouseOver, onClick, onFreezeClick }) {
  const isFrozen = useSectionInfos((x) => x.variants[id].isFrozen);

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
