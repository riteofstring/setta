import React, { useRef, useState, useEffect } from "react";
import { Button } from "@chakra-ui/react";
import Editor from "@monaco-editor/react";
import { useStoreActions, useStoreState } from "easy-peasy";
import { resetState } from "../../../../../../store/store";
import { IoIosRocket } from "react-icons/io";

export default function TextEditor({ idx }) {
  const [isEditorReady, setIsEditorReady] = useState(false);
  const valueGetter = useRef();
  const enteredText = useStoreState(
    (state) => state.yamlEntry.enteredText[idx]
  );
  const setEnteredText = useStoreActions(
    (actions) => actions.yamlEntry.setEnteredText
  );
  const loadSections = useStoreActions(
    (actions) => actions.master.loadSections
  );
  const setFactories = useStoreActions(
    (actions) => actions.factoriesInfo.setFactories
  );
  const setFuncs = useStoreActions((actions) => actions.funcsInfo.setFuncs);
  const createUI = useStoreActions((actions) => actions.yamlEntry.createUI);
  const saveDraftUI = useStoreActions((actions) => actions.uiInfo.saveDraftUI);
  const token = useStoreState((state) => state.auth.token);
  const uiInfoFromCLI = useStoreState((state) => state.cliSocket.uiInfo);
  const factoriesFromCLI = useStoreState((state) => state.cliSocket.factories);
  const funcsFromCLI = useStoreState((state) => state.cliSocket.funcs);

  const handleEditorDidMount = (_valueGetter) => {
    setIsEditorReady(true);
    valueGetter.current = _valueGetter;
  };

  const handleCreateUI = async () => {
    createUI();
  };

  useEffect(() => {
    if (uiInfoFromCLI) {
      resetState("master");
      loadSections(uiInfoFromCLI);
      setFactories(factoriesFromCLI);
      setFuncs(funcsFromCLI);
      saveDraftUI({ token });
    }
  }, [uiInfoFromCLI, factoriesFromCLI, funcsFromCLI]);

  const onChange = (newValue, e) => {
    setEnteredText({ idx, text: newValue });
  };

  return (
    <>
      <Button
        leftIcon={<IoIosRocket />}
        onClick={handleCreateUI}
        disabled={!isEditorReady}
        variant="solid"
      >
        Create UI
      </Button>
      <Editor
        language="yaml"
        value={enteredText}
        onMount={handleEditorDidMount}
        onChange={onChange}
        automaticLayout={true}
        height={"calc(100% - 2.5rem)"}
      />
    </>
  );
}
