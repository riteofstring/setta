import React, { useRef, useState } from "react";
import { Button } from "@chakra-ui/react";
import Editor from "@monaco-editor/react";
import { useStoreActions, useStoreState } from "easy-peasy";

export default function TextEditor() {
  const [isEditorReady, setIsEditorReady] = useState(false);
  const valueGetter = useRef();
  const enteredText = useStoreState((state) => state.yamlEntry.enteredText);
  const setEnteredText = useStoreActions(
    (actions) => actions.yamlEntry.setEnteredText
  );
  const loadSections = useStoreActions(
    (actions) => actions.master.loadSections
  );

  const resetSections = useStoreActions(
    (actions) => actions.master.resetSections
  );
  const resetGlobalCurr = useStoreActions(
    (actions) => actions.globalCurr.resetGlobalCurr
  );
  const setFactories = useStoreActions(
    (actions) => actions.factoriesInfo.setFactories
  );
  const setFuncs = useStoreActions((actions) => actions.funcsInfo.setFuncs);
  const createUI = useStoreActions((actions) => actions.yamlEntry.createUI);
  const saveDraftUI = useStoreActions((actions) => actions.uiInfo.saveDraftUI);
  const token = useStoreState((state) => state.auth.token);

  const handleEditorDidMount = (_valueGetter) => {
    setIsEditorReady(true);
    valueGetter.current = _valueGetter;
  };

  const handleCreateUI = async () => {
    await createUI({ token })
    // const { uiAsJson, factories, funcs } = await createUI({ token });
    // if (uiAsJson) {
    //   resetGlobalCurr();
    //   resetSections();
    //   loadSections({isJson: true, data: JSON.parse(uiAsJson)});
    //   setFactories(JSON.parse(factories));
    //   setFuncs(JSON.parse(funcs));
    //   saveDraftUI({ token });
    // }
  };

  const onChange = (newValue, e) => {
    setEnteredText(newValue);
  };

  return (
    <>
      <Button onClick={handleCreateUI} disabled={!isEditorReady}>
        Create UI
      </Button>
      <Editor
        height="70vh"
        language="yaml"
        value={enteredText}
        onMount={handleEditorDidMount}
        onChange={onChange}
        automaticLayout={true}
      />
    </>
  );
}
