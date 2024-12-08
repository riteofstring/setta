import { Editable } from "components/Utils/Editable";
import _ from "lodash";
import { useState } from "react";
import { FaRegSnowflake, FaRegStar } from "react-icons/fa";
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

  return (
    <section
      className="section-grid-cols section-grid-rows section-grid-areas -mx-3 -my-4 grid flex-1 self-stretch"
      onMouseLeave={() => onMouseLeaveSetPreviewVariantId(sectionId)}
    >
      <ul className="section-full nodrag nowheel grid auto-rows-min grid-cols-subgrid gap-y-2 overflow-y-auto overflow-x-clip pt-2">
        <header className="section-key-value flex items-center justify-between">
          <p className="text-xs text-setta-400 dark:text-setta-600">Name</p>
          <button
            className="cursor-pointer rounded-md px-2 py-1 text-xs font-bold text-setta-400 hover:bg-setta-500/20 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-400"
            onClick={onClickEditButton}
          >
            {isEditing ? "Done Editing" : "Edit"}
          </button>
        </header>

        <EVItems sectionId={sectionId} isEditing={isEditing} />
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
      <div className="flex items-center gap-2">
        <button
          className={`cursor-pointer bg-transparent ${
            isDefault
              ? "text-blue-500"
              : "text-transparent hover:!text-setta-400 group-hover/versionitem:text-setta-400/50"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            setDefaultSectionVariant(sectionId, id);
          }}
        >
          <FaRegStar />
        </button>
        <button
          className={`cursor-pointer bg-transparent ${
            isFrozen
              ? "text-blue-500"
              : "text-transparent hover:!text-setta-400 group-hover/versionitem:text-setta-400/50"
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

function OneItemEditing({ sectionId, id, isCurr }) {
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

  const [inputValue, setInputValue, onBlur, onCancel] = useEditableOnSubmit(
    name,
    onSetName,
    condition,
  );

  return (
    <li className="section-key-value group/versionitem -my-[0.125rem] flex h-min cursor-pointer items-center justify-between rounded-lg px-2 py-[0.125rem] text-xs hover:bg-setta-200/30 dark:hover:bg-setta-800/50">
      <Editable
        value={inputValue}
        onChange={setInputValue}
        onBlur={onBlur}
        onCancel={onCancel}
        titleProps={{
          editing:
            "section-key truncate text-setta-400 dark:text-setta-400 flex-1",
          notEditing: "section-key truncate text-setta-400 dark:text-setta-400",
        }}
      />
      <button
        className={
          "cursor-pointer bg-transparent text-transparent hover:!text-setta-400 group-hover/versionitem:text-setta-400/50"
        }
        onClick={(e) => {
          e.stopPropagation();
          useSectionInfos.setState((state) => {
            state.x[sectionId].variantIds = state.x[
              sectionId
            ].variantIds.filter((v) => v !== id);
            delete state.variants[id];
          });
        }}
      >
        <i className="gg-trash" />
      </button>
    </li>
  );
}
