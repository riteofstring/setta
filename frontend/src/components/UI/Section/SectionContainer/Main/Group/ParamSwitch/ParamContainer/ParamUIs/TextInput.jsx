import { useSectionInfos } from "models/info/sectionInfos";
import { ContentEditable } from "utils/ContentEditable/ContentEditable";

export function TextInputConfig() {
  return null;
}

export function TextInput({
  value,
  defaultVal,
  onChange,
  isDisabled,
  className,
}) {
  const classes =
    "nodrag outline-none border-0 border-b cursor-auto border-slate-400 border-solid text-sm dark:text-slate-300 font-code pb-1 focus-visible:border-blue-400";

  const { styledText, text } = computeStyledText(value);

  return (
    <ContentEditable
      html={styledText} // innerHTML of the editable div
      contentEditable="plaintext-only" // use true to disable editing
      // onChange={handleChange} // handle innerHTML change
      className={classes}
    />
  );
}

function computeStyledText(value) {
  const output = [];
  const regularOutput = [];
  const sectionState = useSectionInfos.getState().x;
  for (const v of value) {
    if (v.type === "ref") {
      const x = sectionState[v.value].name;
      output.push(`<span style="color: red;">${x}</span>`);
      regularOutput.push(x);
    } else {
      output.push(`<span style="color: black;">${v.value}</span>`);
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
