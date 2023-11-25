import { useSizeOfResizableElement } from "hooks/useSizeOfResizableElement";
import {
  textFieldInitializeCode,
  useTextFieldCompletionWebsocketRoom,
} from "hooks/useWebsocket";
import { useSectionInfos } from "models/info/sectionInfos";
import { useEffect } from "react";
import { ComboboxItems, ComboboxTextFieldList } from "utils/Combobox/Combobox";
import { useTotalCombobox } from "utils/Combobox/useTotalCombobox";
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

  // const [text, setText] = useState("");

  console.log("value", value);
  const { styledText } = computeStyledText(value);

  const [results, send] = useTextFieldCompletionWebsocketRoom(
    sectionId,
    paramInfoId
  );
  const allItems = [{ group: "search results", items: results }];

  function onClick() {
    textFieldInitializeCode(sectionId, paramInfoId);
  }

  function handleChange(e) {
    // Check if the active element is the event target, which should be the contenteditable div
    if (document.activeElement !== e.currentTarget) {
      return;
    }
    const x = e.currentTarget.innerText.trim();
    onChange(0, value[0].type, x);
    send(x);
  }

  const itemToString = (x) => (x ? x.name : "");

  const {
    isOpen: isReallyOpen,
    filteredItems,
    getMenuProps,
    getInputProps,
    highlightedIndex,
    getItemProps,
  } = useTotalCombobox({
    allItems,
    matchSorterProps: { keys: ["name"] },
    initialSelection: null,
    itemToString,
  });

  const {
    sizeRef,
    size: { width },
  } = useSizeOfResizableElement({ delay: 200 });

  const inputProps = getInputProps({ onClick, onChange: handleChange });

  useEffect(() => {
    onChange(0, value[0].type, inputProps.value);
  }, [inputProps.value]);

  return (
    <div
      className={`flex w-full flex-col items-stretch overflow-visible`}
      ref={sizeRef}
    >
      <ContentEditable
        html={styledText} // innerHTML of the editable div
        contentEditable="plaintext-only" // use true to disable editing
        className={classes}
        {...inputProps}
      />
      <ComboboxTextFieldList
        isOpen={isReallyOpen}
        getMenuProps={getMenuProps}
        width={width}
      >
        <ComboboxItems
          filteredItems={filteredItems}
          getItemProps={getItemProps}
          highlightedIndex={highlightedIndex}
          itemToString={itemToString}
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
  return { styledText: output.join(""), text: regularOutput.join("") };
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
