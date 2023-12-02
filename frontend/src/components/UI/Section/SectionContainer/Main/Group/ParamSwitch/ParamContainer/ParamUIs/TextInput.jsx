import { useCombobox } from "downshift";
import { useSizeOfResizableElement } from "hooks/useSizeOfResizableElement";
import {
  textFieldInitializeCode,
  useTextFieldCompletionWebsocketRoom,
} from "hooks/useWebsocket";
import { useSectionInfos } from "models/info/sectionInfos";
import { useEffect, useState } from "react";
import {
  ComboboxItems,
  ComboboxTextFieldList,
} from "utils/Combobox/ComboboxParts";
import { useComboboxStateReducer } from "utils/Combobox/ComboboxStateReducer";
import { flattenedItems } from "utils/Combobox/utils";
import { ContentEditable } from "utils/ContentEditable/ContentEditable";

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

  // const { styledText } = computeStyledText(value);

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
      className={`flex w-full flex-col items-stretch overflow-visible`}
      ref={sizeRef}
    >
      <ContentEditable
        html={value} // innerHTML of the editable div
        contentEditable="plaintext-only" // use true to disable editing
        className={classes}
        {...inputProps}
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

function computeStyledText(value) {
  const output = [];
  const regularOutput = [];
  const sectionState = useSectionInfos.getState().x;
  for (const v of value) {
    if (v.type === "ref") {
      const x = sectionState[v.value].name;
      output.push(`<span class="text-red-600 dark:text-red-400">${x}</span>`);
      regularOutput.push(x);
    } else {
      output.push(
        `<span class="text-runcoder-800 dark:text-runcoder-100">${v.value}</span>`
      );
      regularOutput.push(v.value);
    }
  }
  return { styledText: output.join(""), plainText: regularOutput.join("") };
}

function getNewVal(list, newString) {
  let currentIndex = 0;
  const sectionState = useSectionInfos.getState().x;
  const newVal = [];
  for (let i = 0; i < list.length; i++) {
    const curr = list[i];
    const element =
      curr.type === "ref" ? sectionState[curr.value].name : curr.value;
    const nextIndex = currentIndex + element.length;
    const segment = newString.substring(currentIndex, nextIndex);

    if (segment !== element) {
      newVal.push({ type: "raw", value: segment });
    } else {
      newVal.push(curr);
    }

    currentIndex = nextIndex;
  }

  console.log(newVal);

  return newVal;
}

function processResults(results) {
  const output = [];
  const sectionState = useSectionInfos.getState().x;
  for (const res of results) {
    const curr = res
      .map((r) => (r.type === "ref" ? sectionState[r.value].name : r.value))
      .join("");
    output.push({ listForm: res, name: curr });
  }
  return output;
}

function useTextFieldCombobox({ allItems, updateValue }) {
  const [valSelectedByArrow, setValSelectedByArrow] = useState([]);
  const stateReducer = useComboboxStateReducer({
    allItems,
    onArrowUpOrDown: getOnArrowUpOrDownFn(setValSelectedByArrow),
  });
  const singleListItems = flattenedItems(allItems);

  useEffect(() => {
    if (valSelectedByArrow.length > 0) {
      updateValue(valSelectedByArrow);
      setValSelectedByArrow([]);
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
            setValSelectedByArrow(item.listForm);
            return {};
          }
          idx += 1;
        }
      }
    }
    return {};
  };
}

// function getNewValue(value, cursorPos) {
//   const output = [];
//   let runningLength = 0;
//   for (const v of value) {
//     if (
//       runningLength <= cursorPos &&
//       cursorPos < runningLength + v.value.length
//     ) {
//       return i;
//     } else {
//       output.push(v);
//     }
//     runningLength += strings[i].length;
//   }
//   // If cursor is beyond the last string, return the index of the last string.
//   return strings.length - 1;
// }

// function getCursorPos(selection, evt) {
//   if (selection.rangeCount > 0) {
//     const range = selection.getRangeAt(0);
//     if (range.collapsed) {
//       // Compute cursor position...
//       const cursorRange = document.createRange();
//       cursorRange.selectNodeContents(evt.currentTarget);
//       cursorRange.setEnd(range.endContainer, range.endOffset);
//       return cursorRange.toString().length;
//     }
//   }
//   return null;
// }

// const handleChange = (evt) => {
//   // Check if the active element is the event target, which should be the contenteditable div
//   if (document.activeElement !== evt.currentTarget) {
//     return;
//   }
//   const selection = window.getSelection();
//   // Further check if the selection is contained within the event target, if needed
//   // This might be relevant if the editable content is complex and you have nested elements
//   if (!evt.currentTarget.contains(selection.anchorNode)) {
//     return;
//   }
//   const cursorPos = getCursorPos(selection, evt);
//   const index = getNearestStringIndex(value, cursorPos);
//   onChange(
//     index,
//     value[index].type,
//     `${value[index].value}${evt.currentTarget.innerText}`
//   );
// };

// useEffect(() => {
//   setStyledText(computeStyledText(value));
// }, [value]);
