import { useCombobox } from "downshift";
import { useSizeOfResizableElement } from "hooks/useSizeOfResizableElement";
import {
  textFieldInitializeCode,
  useTextFieldCompletionWebsocketRoom,
} from "hooks/useWebsocket";
import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";
import { useEffect, useRef, useState } from "react";
import { goToSection } from "thunks/goToSection";
import { variableClick } from "thunks/keyActivations";
import { getParamInfos } from "thunks/sections/sectionContents";
import {
  ComboboxItems,
  ComboboxTextFieldList,
} from "utils/Combobox/ComboboxParts";
import { useComboboxStateReducer } from "utils/Combobox/ComboboxStateReducer";
import { flattenedItems } from "utils/Combobox/utils";
import { SINGLETON_SECTIONS } from "utils/constants";

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
  classes,
  variants,
  area = "card-value",
}) {
  const [results, send] = useTextFieldCompletionWebsocketRoom(
    sectionId,
    paramInfoId,
  );

  const [isFocused, setIsFocused] = useState(false);

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
  };

  const allItems = [{ group: "search results", items: results }];

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
  } = useTextFieldCombobox({ allItems, value, updateValue });

  function onClick(e) {
    if (variableClick(e)) {
      ctrlClick(e);
    } else {
      textFieldInitializeCode(sectionId, paramInfoId);
    }
  }

  const {
    sizeRef: inputRef,
    size: { width },
  } = useSizeOfResizableElement({ delay: 200 });
  const preRef = useRef(null);

  // Exclude downshift's value because we don't need it.
  const inputProps = getInputProps({
    onChange: (e) => updateValue(e.target.value, true),
    onFocus: handleFocus,
    onBlur: handleBlur,
    onClick,
    ref: inputRef,
  });

  function syncScroll() {
    if (preRef.current && inputRef.current) {
      preRef.current.scrollTop = inputRef.current.scrollTop;
      preRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  }

  const defaultClasses = `nodrag ${area} font-code z-[1] row-span-1 h-[calc(1.25rem-2px)] min-w-0 cursor-auto border-x-0 border-b border-t-0 border-solid border-runcoder-300 p-0 font-mono text-xs font-normal leading-normal text-transparent caret-black outline-none placeholder:text-runcoder-300/25 focus:text-clip focus-visible:border-blue-400 dark:border-runcoder-600 dark:caret-white dark:focus-visible:border-blue-400`;
  const defaultVariants = `${area} card-value-display mt-[1px] h-5 min-w-0 overflow-hidden text-xs font-normal leading-normal dark:text-runcoder-300`;

  return (
    <>
      <input
        className={classes ? classes : defaultClasses}
        spellCheck={false}
        onScroll={syncScroll}
        placeholder={defaultVal}
        {...inputProps}
      />
      <pre
        ref={preRef}
        className={`${
          isFocused ? "" : "truncate"
        } ${variants ? variants : defaultVariants}`}
      >
        <code>
          <StyledText value={value} />
        </code>
      </pre>
      <div className="card-value-combobox relative">
        <ComboboxTextFieldList
          isOpen={isOpen}
          getMenuProps={getMenuProps}
          width={width}
          variants=""
        >
          <ComboboxItems
            filteredItems={allItems}
            getItemProps={getItemProps}
            highlightedIndex={highlightedIndex}
          />
        </ComboboxTextFieldList>
      </div>
    </>
  );
}

function ctrlClick(e) {
  e.stopPropagation(); //prevent SectionContainerCore onClick from triggering
  const { clientX, clientY } = e;

  // Simulate click on the underlying element
  const simulatedEvent = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX,
    clientY,
    ctrlKey: true,
    relatedTarget: e.target,
  });

  e.target.style.pointerEvents = "none";
  const elementBelow = document.elementFromPoint(clientX, clientY);
  e.target.style.pointerEvents = "";
  elementBelow.dispatchEvent(simulatedEvent);
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function StyledText({ value }) {
  const names = [];
  const colorMap = {};
  for (const s of Object.values(useSectionInfos.getState().x)) {
    if (SINGLETON_SECTIONS.globalVariables === s.id) {
      names.push(
        ...getParamInfos(s.id).map((x) => {
          const curr = escapeRegExp(x.name);
          colorMap[curr] = "green";
          return curr;
        }),
      );
    } else {
      const curr = escapeRegExp(s.name);
      colorMap[curr] = "red";
      names.push(curr);
    }
  }

  const pattern = new RegExp(`\\b(${names.join("|")})\\b`, "g");

  // Split text into segments
  const segments = value.split(pattern);
  return segments.map((segment, index) => {
    const color = colorMap[segment];
    return (
      <span
        key={index}
        style={{ color }}
        onClick={getOnTextInputVariableClick(color, segment)}
      >
        {segment}
      </span>
    );
  });
}

function getOnTextInputVariableClick(color, variable) {
  if (color) {
    return (e) => {
      const section =
        color === "green"
          ? useSectionInfos.getState().x[SINGLETON_SECTIONS.globalVariables]
          : _.find(useSectionInfos.getState().x, (s) => s.name === variable);
      const id = section?.id;
      if (id) {
        e.stopPropagation(); //prevent SectionContainerCore onClick from triggering
        e.relatedTarget.blur(); //blur the input field we just clicked on
        goToSection(id);
      }
    };
  }
  return undefined;
}

function useTextFieldCombobox({ allItems, value, updateValue }) {
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
    inputValue: value,
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
