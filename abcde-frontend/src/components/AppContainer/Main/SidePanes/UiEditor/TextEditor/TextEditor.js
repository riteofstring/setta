import { Button } from "@chakra-ui/react";
import Editor from "@monaco-editor/react";
import { useStoreActions, useStoreState } from "easy-peasy";
import React, { useRef, useState, useEffect } from "react";
import { IoIosRocket } from "react-icons/io";

import { resetState } from "../../../../../../store/store";
import styles from "./TextEditor.module.css";

export default function TextEditor({ idx, dimensions }) {
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
        mb="1rem"
      >
        Create UI
      </Button>
      <Editor
        language="yaml"
        value={enteredText}
        onMount={handleEditorDidMount}
        onChange={onChange}
        options={{ automaticLayout: true }}
        className={styles.container}
        wrapperClassName={styles.wrapper}
        height={dimensions.height}
        width={dimensions.width}
      />
    </>
  );
}
