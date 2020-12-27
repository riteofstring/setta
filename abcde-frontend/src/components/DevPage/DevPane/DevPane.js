import React, { useRef, useState } from "react";
import { Flex, Button } from "@chakra-ui/react";
import { ControlledEditor } from "@monaco-editor/react";
import { useStoreActions, useStoreState } from "easy-peasy";
import { ipcRenderer } from "../../../utils/constants";

const DevPane = () => {
  const [isEditorReady, setIsEditorReady] = useState(false);
  const valueGetter = useRef();
  const uiSpecs = useStoreState((state) => state.devPage.uiSpecs);
  const setUISpecs = useStoreActions((actions) => actions.devPage.setUISpecs);
  const createUI = useStoreActions((actions) => actions.devPage.createUI);
  const setSpecsAreReady = useStoreActions(
    (actions) => actions.devPage.setSpecsAreReady
  );
  const setLoadSectionsIsDone = useStoreActions(
    (actions) => actions.master.setLoadSectionsIsDone
  );

  const handleEditorDidMount = (_valueGetter) => {
    setIsEditorReady(true);
    valueGetter.current = _valueGetter;
  };

  const handleCreateUI = () => {
    createUI();
    setLoadSectionsIsDone(false);
    ipcRenderer.once("asynchronous-reply", (event, arg) => {
      if (arg === "success") {
        console.log("success");
        setSpecsAreReady(true);
      }
    });
  };

  const onChange = (e, newValue) => {
    setUISpecs(newValue);
  };

  return (
    <>
      <Button onClick={handleCreateUI} disabled={!isEditorReady}>
        Create UI
      </Button>
      <Flex width="90vw">
        <ControlledEditor
          height="90vh"
          language="yaml"
          value={uiSpecs}
          editorDidMount={handleEditorDidMount}
          onChange={onChange}
        />
      </Flex>
    </>
  );
};

export default React.memo(DevPane);
