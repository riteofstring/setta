import { Tabs } from "@chakra-ui/react";
import { useStoreActions } from "easy-peasy";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { mod, rangeArray } from "utils/utils";

import TabsContainer from "./TabsContainer";
import UiEditorPages from "./UiEditorPages";

export default function YamlEditorFunc({ dimensions }) {
  const setEnteredText = useStoreActions(
    (actions) => actions.yamlEntry.setEnteredText
  );
  const deleteEnteredText = useStoreActions(
    (actions) => actions.yamlEntry.deleteEnteredText
  );
  const [numTabs, setNumTabs] = useState(1);
  const [currTabIdx, setCurrTabIdx] = useState(0);
  const tabNumArray = rangeArray(0, numTabs);

  const onDrop = useCallback(
    (acceptedFiles) => {
      acceptedFiles.forEach((file, idx) => {
        const reader = new FileReader();
        reader.onload = () => {
          // Do whatever you want with the file contents
          const text = reader.result;
          const newIdx = numTabs + idx;
          setEnteredText({ idx: newIdx, text });
        };
        reader.readAsText(file);
      });
      setNumTabs(numTabs + acceptedFiles.length);
      setCurrTabIdx(numTabs);
    },
    [numTabs]
  );
  const { getRootProps } = useDropzone({ onDrop });

  function onAddClick() {
    setNumTabs(numTabs + 1);
    setCurrTabIdx(numTabs);
  }

  function onRemoveClick(idx) {
    deleteEnteredText(idx);
    setNumTabs(numTabs - 1);
    if (idx <= currTabIdx) {
      setCurrTabIdx(Math.max(0, currTabIdx - 1));
    }
  }

  function onGoToNext() {
    setCurrTabIdx(mod(currTabIdx + 1, numTabs));
  }
  function onGoToPrev() {
    setCurrTabIdx(mod(currTabIdx - 1, numTabs));
  }

  return (
    <Tabs
      variant="unstyled"
      className="lkjlkj"
      display="flex"
      flexDir="column"
      index={currTabIdx}
      onChange={(index) => setCurrTabIdx(index)}
      {...getRootProps()}
    >
      <UiEditorPages tabNumArray={tabNumArray} dimensions={dimensions} />
      <TabsContainer
        tabNumArray={tabNumArray}
        currTabIdx={currTabIdx}
        onAddClick={onAddClick}
        onRemoveClick={onRemoveClick}
        onGoToNext={onGoToNext}
        onGoToPrev={onGoToPrev}
      />
    </Tabs>
  );
}
