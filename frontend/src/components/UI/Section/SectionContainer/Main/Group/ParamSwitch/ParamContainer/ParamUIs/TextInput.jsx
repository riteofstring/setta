import { useCombobox } from "downshift";
import { useGoToSection } from "hooks/useGetSectionPosition";
import { useSizeOfResizableElement } from "hooks/useSizeOfResizableElement";
import {
  textFieldInitializeCode,
  useTextFieldCompletionWebsocketRoom,
} from "hooks/useWebsocket";
import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";
import { useEffect, useState } from "react";
import { getSectionType } from "thunks/sections/getters";
import { getParamInfos } from "thunks/sections/sectionContents";
import {
  ComboboxItems,
  ComboboxTextFieldList,
} from "utils/Combobox/ComboboxParts";
import { useComboboxStateReducer } from "utils/Combobox/ComboboxStateReducer";
import { flattenedItems } from "utils/Combobox/utils";
import { ContentEditable } from "utils/ContentEditable/ContentEditable";
import { GLOBAL_VARIABLES } from "z_utils/constants";

export function TextInputConfig() {
  return null;
}

export function TextInput({
  sectionId,
  paramInfoId,
  value,
  defaultVal,
  onChange,
  isDisabled,
  className,
}) {
  const classes =
    "nodrag outline-none border-0 border-b cursor-auto border-runcoder-300 dark:border-runcoder-600 border-solid text-xs dark:text-runcoder-300 font-code pb-1 focus-visible:border-blue-400";

  const goToSection = useGoToSection();

  window.onTextInputVariableClick = function (e, variableType, variable) {
    if (e.ctrlKey) {
      const section = _.find(useSectionInfos.getState().x, (s) =>
        variableType === "global"
          ? getSectionType(s.id).type === GLOBAL_VARIABLES
          : s.name === variable
      );
      const id = section?.id;
      if (id) {
        e.stopPropagation(); //prevent SectionContainerCore onClick from triggering
        e.srcElement.parentElement.blur(); //don't leave cursor behind
        goToSection(id);
      }
    }
  };

  const styledText = getStyledText(value);

  const [results, send] = useTextFieldCompletionWebsocketRoom(
    sectionId,
    paramInfoId
  );

  const allItems = [{ group: "search results", items: results }];

  function handleChange(e) {
    // Check if the active element is the event target, which should be the contenteditable div
    if (document.activeElement !== e.currentTarget) {
      return;
    }
    const x = e.currentTarget.innerText;
    updateValue(x, true);
  }

  function updateValue(newVal, requestCompletions = false) {
    if (value === newVal) {
      return;
    }
    onChange(newVal);
    if (requestCompletions) {
      send(newVal);
    }
  }

  const {
    isOpen,
    getMenuProps,
    getInputProps,
    highlightedIndex,
    getItemProps,
  } = useTextFieldCombobox({ allItems, updateValue });

  function onClick() {
    textFieldInitializeCode(sectionId, paramInfoId);
  }

  // Exclude downshift's value because we don't need it.
  const { value: dsValue, ...inputProps } = getInputProps({
    onChange: handleChange,
    onClick,
  });

  const {
    sizeRef,
    size: { width },
  } = useSizeOfResizableElement({ delay: 200 });

  return (
    <div
      className={`flex w-full flex-col items-stretch overflow-visible font-mono`}
      ref={sizeRef}
    >
      <ContentEditable
        html={styledText} // innerHTML of the editable div
        contentEditable="plaintext-only" // use true to disable editing
        className={classes}
        {...inputProps}
        spellCheck="false"
        placeholder={defaultVal}
      />
      <ComboboxTextFieldList
        isOpen={isOpen}
        getMenuProps={getMenuProps}
        width={width}
      >
        <ComboboxItems
          filteredItems={allItems}
          getItemProps={getItemProps}
          highlightedIndex={highlightedIndex}
        />
      </ComboboxTextFieldList>
    </div>
  );
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findVariableOccurrences(code, variables) {
  // Escape special characters and create a regex pattern with word boundaries
  const escapedVariables = variables.map(escapeRegExp).filter((v) => v);

  // Check if there are no variables to match
  if (escapedVariables.length === 0) {
    return [];
  }

  const pattern = new RegExp(`\\b(${escapedVariables.join("|")})\\b`, "g");

  const occurrences = [];
  let match;

  // Use matchAll to find all occurrences
  while ((match = pattern.exec(code)) !== null) {
    occurrences.push({
      variable: match[1],
      start: match.index,
      end: match.index + match[1].length,
    });
  }

  return occurrences;
}

function colorCodeVariables(code, sectionVarOccurrences, globalVarOccurrences) {
  // Tagging each occurrence with its type and merging them
  const taggedOccurrences = [
    ...sectionVarOccurrences.map((occ) => ({ ...occ, type: "section" })),
    ...globalVarOccurrences.map((occ) => ({ ...occ, type: "global" })),
  ];

  // Sorting the merged occurrences by start index
  taggedOccurrences.sort((a, b) => a.start - b.start);

  let lastIndex = 0;
  let result = "";

  taggedOccurrences.forEach(({ variable, start, end, type }) => {
    result += code.substring(lastIndex, start);
    const color = type === "section" ? "red" : "green";
    result += `<span style="color: ${color};" onclick="onTextInputVariableClick(event, '${type}', '${variable}')">${variable}</span>`;
    lastIndex = end;
  });

  result += code.substring(lastIndex);

  return result;
}

// TODO make more efficient
function getStyledText(value) {
  const sectionNames = [];
  const globalVarNames = [];
  for (const s of Object.values(useSectionInfos.getState().x)) {
    if (getSectionType(s.id).type === GLOBAL_VARIABLES) {
      globalVarNames.push(...getParamInfos(s.id).map((x) => x.name));
    } else {
      sectionNames.push(s.name);
    }
  }
  const sectionVarOccurrences = findVariableOccurrences(value, sectionNames);
  const globalVarOccurrences = findVariableOccurrences(value, globalVarNames);
  return colorCodeVariables(value, sectionVarOccurrences, globalVarOccurrences);
}

function useTextFieldCombobox({ allItems, updateValue }) {
  const [valSelectedByArrow, setValSelectedByArrow] = useState("");
  const stateReducer = useComboboxStateReducer({
    allItems,
    onArrowUpOrDown: getOnArrowUpOrDownFn(setValSelectedByArrow),
  });
  const singleListItems = flattenedItems(allItems);

  useEffect(() => {
    if (valSelectedByArrow !== "") {
      updateValue(valSelectedByArrow);
      setValSelectedByArrow("");
    }
  }, [valSelectedByArrow]);

  const {
    isOpen,
    getMenuProps,
    getInputProps,
    highlightedIndex,
    getItemProps,
  } = useCombobox({
    stateReducer,
    items: singleListItems,
  });

  const isReallyOpen = isOpen && singleListItems.length > 0;

  return {
    isOpen: isReallyOpen,
    getMenuProps,
    getInputProps,
    highlightedIndex,
    getItemProps,
  };
}

function getOnArrowUpOrDownFn(setValSelectedByArrow) {
  return (latestItems, highlightedIndex) => {
    if (highlightedIndex >= 0) {
      let idx = 0;
      for (const group of latestItems) {
        for (const item of group.items) {
          if (idx === highlightedIndex) {
            setValSelectedByArrow(item);
            return {};
          }
          idx += 1;
        }
      }
    }
    return {};
  };
}
