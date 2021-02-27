import React, { useRef, useState } from "react";
import { Button } from "@chakra-ui/react";
import Editor from "@monaco-editor/react";
import { useStoreActions, useStoreState } from "easy-peasy";

export default function TextEditor() {
  const [isEditorReady, setIsEditorReady] = useState(false);
  const valueGetter = useRef();
  const uiSpecs = useStoreState((state) => state.devPage.uiSpecs);
  const setUISpecs = useStoreActions((actions) => actions.devPage.setUISpecs);
  const createUI = useStoreActions((actions) => actions.devPage.createUI);
  const setLoadSectionsIsDone = useStoreActions(
    (actions) => actions.master.setLoadSectionsIsDone
  );
  const setSpecsAreReady = useStoreActions(
    (actions) => actions.devPage.setSpecsAreReady
  );
  const token = useStoreState((state) => state.auth.token);

  const handleEditorDidMount = (_valueGetter) => {
    setIsEditorReady(true);
    valueGetter.current = _valueGetter;
  };

  const handleCreateUI = async () => {
    const result = await createUI({ token });
    if (result) {
      setLoadSectionsIsDone(false);
      setSpecsAreReady(true);
    }
  };

  const onChange = (e, newValue) => {
    setUISpecs(newValue);
  };

  return (
    <>
      <Button onClick={handleCreateUI} disabled={!isEditorReady}>
        Create UI
      </Button>
      <Editor
        height="70vh"
        language="yaml"
        value={uiSpecs}
        onMount={handleEditorDidMount}
        onChange={onChange}
        automaticLayout={true}
      />
    </>
  );
}
