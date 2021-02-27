import React, {useState} from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import { Button, Input } from "@chakra-ui/react";

const Save = () => {
  const [uiName, setUIName] = useState("")

  const saveUI = useStoreActions((actions) => actions.master.saveUI);
  const exportSelected = useStoreActions(
    (actions) => actions.master.exportSelected
  );
  const token = useStoreState((state) => state.auth.token);
  const runSaveUI = () => {
    const { selections, globalCurr } = exportSelected();
    saveUI({ token, uiName, selections, globalCurr });
  };

  return (
    <>
      <Button onClick={() => runSaveUI()}>Save</Button>
      <Input
        id="Save As"
        name="Save As"
        placeholder="Save As"
        w="300px"
        value={uiName}
        onChange={(e) => setUIName(e.target.value)}
        gridColumn="middle/right"
      />
    </>
  );
};

export default React.memo(Save);
