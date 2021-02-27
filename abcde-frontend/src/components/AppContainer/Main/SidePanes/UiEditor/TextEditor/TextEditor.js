import React, { useRef, useState } from "react";
import { Flex, Button } from "@chakra-ui/react";
import { ControlledEditor } from "@monaco-editor/react";
import { useStoreActions, useStoreState } from "easy-peasy";

export default function TextEditor() {
  const [isEditorReady, setIsEditorReady] = useState(false);
  const valueGetter = useRef();
  const enteredText = useStoreState((state) => state.devPage.enteredText);
  const setEnteredText = useStoreActions((actions) => actions.devPage.setEnteredText);
  const loadSections = useStoreActions(
    (actions) => actions.master.loadSections
  );

  const resetSections = useStoreActions(
    (actions) => actions.master.resetSections
  );
  const setFactories = useStoreActions((actions) => actions.factoriesInfo.setFactories);
  const setFuncs = useStoreActions((actions) => actions.funcsInfo.setFuncs);
  const createUI = useStoreActions((actions) => actions.devPage.createUI);
  const token = useStoreState((state) => state.auth.token);

  const handleEditorDidMount = (_valueGetter) => {
    setIsEditorReady(true);
    valueGetter.current = _valueGetter;
  };

  const handleCreateUI = async () => {
    const {uiAsJson, factories, funcs} = await createUI({ token });
    if (uiAsJson) {
      resetSections()
      loadSections(JSON.parse(uiAsJson))
      setFactories(JSON.parse(factories));
      setFuncs(JSON.parse(funcs))
    }
  };

  const onChange = (e, newValue) => {
    setEnteredText(newValue);
  };

  return (
    <>
      <Button onClick={handleCreateUI} disabled={!isEditorReady}>
        Create UI
      </Button>
      <ControlledEditor
        height="70vh"
        language="yaml"
        value={enteredText}
        editorDidMount={handleEditorDidMount}
        onChange={onChange}
      />
    </>
  );
}
