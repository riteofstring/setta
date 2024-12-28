import _ from "lodash";
import { useState } from "react";
import { FaRegSnowflake } from "react-icons/fa";
import { HiHome } from "react-icons/hi";
import { createNewVersionMaybeWithJSON } from "state/actions/newVersion";
import {
  onClickSetVariantId,
  onMouseLeaveSetPreviewVariantId,
  onMouseOverSetPreviewVariantId,
} from "state/actions/previewOnMouseOver";
import {
  setDefaultSectionVariant,
  toggleVariantFrozenState,
} from "state/actions/sectionInfos";
import { useSectionInfos } from "state/definitions";
import { useEditableOnSubmit } from "state/hooks/editableText";

export function VersionList({ sectionId }) {
  const [isEditing, setIsEditing] = useState(false);

  function onClickEditButton() {
    setIsEditing(!isEditing);
  }

  function onClickAddVersionButton() {
    createNewVersionMaybeWithJSON(sectionId);
  }

  return (
    <section className="section-grid-cols section-grid-rows section-grid-areas -mx-3 -my-4 grid flex-1 self-stretch">
      <ul className="section-full nodrag nowheel grid auto-rows-min grid-cols-subgrid gap-y-2 overflow-y-auto overflow-x-clip pt-6">
        <header className="absolute right-16 top-[15px] flex items-center gap-2">
          {/* <p className="text-xs text-setta-400 dark:text-setta-600">Name</p> */}
          {!isEditing && (
            <button
              className="flex cursor-pointer items-center justify-center gap-1 rounded-md  px-2 py-1 text-xs font-bold text-setta-400 hover:bg-setta-500/20 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-400"
              onClick={onClickAddVersionButton}
            >
              Add Version
            </button>
          )}
          <button
            className="flex cursor-pointer items-center justify-center gap-1 rounded-md  px-2 py-1 text-xs font-bold text-setta-400 hover:bg-setta-500/20 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-400"
            onClick={onClickEditButton}
          >
            <i className="gg-pen" />
            {isEditing ? "Done Editing" : "Edit"}
          </button>
        </header>

        <div
          className="contents"
          onMouseLeave={() => onMouseLeaveSetPreviewVariantId(sectionId)}
        >
          <EVItems sectionId={sectionId} isEditing={isEditing} />
        </div>
      </ul>
    </section>
  );
}

function EVItems({ sectionId, isEditing }) {
  const { currVariantId, variantIds } = useSectionInfos(
    (x) => ({
      currVariantId: x.x[sectionId].variantId,
      variantIds: x.x[sectionId].variantIds,
    }),
    _.isEqual,
  );

  if (isEditing) {
    return variantIds.map((e) => (
      <OneItemEditing
        key={e}
        sectionId={sectionId}
        id={e}
        isCurr={currVariantId === e}
        deletable={variantIds.length > 1}
      />
    ));
  }

  return variantIds.map((e) => (
    <OneItem
      key={e}
      sectionId={sectionId}
      id={e}
      isCurr={currVariantId === e}
    />
  ));
}

function OneItem({ sectionId, id, isCurr }) {
  const { name, isFrozen, isDefault } = useSectionInfos(
    (x) => ({
      name: x.variants[id].name,
      isFrozen: x.variants[id].isFrozen,
      isDefault: x.variants[id].isDefault,
    }),
    _.isEqual,
  );

  return (
    <li
      onMouseOver={() => onMouseOverSetPreviewVariantId(sectionId, id)}
      onClick={() => onClickSetVariantId(sectionId, id)}
      className="section-key-value group/versionitem -my-[0.125rem] flex h-min cursor-pointer items-center justify-between rounded-sm border-b border-transparent px-1 py-[0.125rem] text-xs hover:bg-setta-200/30 dark:hover:bg-setta-800/50"
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
      <div className="flex items-center gap-2">
        <button
          className={`cursor-pointer bg-transparent ${
            isDefault
              ? "text-green-500"
              : "text-transparent hover:!text-setta-400 group-hover/versionitem:text-setta-400/50"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            setDefaultSectionVariant(sectionId, id);
          }}
        >
          <HiHome />
        </button>
        <button
          className={`cursor-pointer bg-transparent ${
            isFrozen
              ? "text-blue-500"
              : "text-transparent hover:!text-blue-400 group-hover/versionitem:text-setta-400/50"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            toggleVariantFrozenState(id);
          }}
        >
          <FaRegSnowflake />
        </button>
      </div>
    </li>
  );
}

function OneItemEditing({ sectionId, id, isCurr, deletable }) {
  const name = useSectionInfos((x) => x.variants[id].name, _.isEqual);

  function onSetName(v) {
    useSectionInfos.setState((x) => {
      x.variants[id].name = v;
    });
  }

  function condition(v) {
    const state = useSectionInfos.getState();
    for (const variantId of state.x[sectionId].variantIds) {
      if (state.variants[variantId].name === v) {
        return false;
      }
    }
    return true;
  }

  const [inputValue, onChange, onBlur, onKeyDown] = useEditableOnSubmit(
    name,
    onSetName,
    condition,
  );

  return (
    <li className="section-key-value group/versionitem -my-[0.125rem] flex h-min cursor-pointer items-center justify-between border-b border-setta-200 px-1 py-[0.125rem] text-xs focus-within:!border-blue-500  hover:border-setta-500 dark:border-setta-700 dark:hover:border-setta-500 ">
      <input
        value={inputValue}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className="flex-1 truncate text-setta-500 focus:text-setta-900 focus:outline-none focus:ring-0 dark:text-setta-400 dark:focus:text-setta-200"
      />

      {deletable && (
        <button
          className={
            "cursor-pointer bg-transparent text-transparent hover:!text-red-500 active:!text-red-700 group-hover/versionitem:text-setta-400/50"
          }
          onClick={(e) => {
            e.stopPropagation();
            useSectionInfos.setState((state) => {
              const section = state.x[sectionId];
              section.variantIds = section.variantIds.filter((v) => v !== id);
              const { isDefault } = state.variants[id];

              if (isCurr) {
                section.variantId = section.variantIds[0];
              }
              if (isDefault) {
                state.variants[section.variantIds[0]].isDefault = true;
              }
            });
          }}
        >
          <i className="gg-trash" />
        </button>
      )}
    </li>
  );
}
