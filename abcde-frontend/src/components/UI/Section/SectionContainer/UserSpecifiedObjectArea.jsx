import { useGetSectionInfo } from "hooks/useSectionInfo";
import { useCodeInfo } from "models/info/codeInfo";
import React, { useState } from "react";
import { StandardInput } from "utils/atoms/input/StandardInput";
import { ParamGroupContainer } from "./Main/Group/GroupContainer";
import { KwargsControls } from "./Main/KwargsControls/KwargsControls";

function _UserSpecifiedObjectArea({ sectionId }) {
  const selectedItem = useGetSectionInfo(sectionId, "selectedItem");

  return (
    <>
      <UserSpecifiedObjectName selectedItem={selectedItem} />

      <KwargsControls sectionId={sectionId} objInfoId={selectedItem} />
      <ParamGroupContainer sectionId={sectionId} objInfoId={selectedItem} />
    </>
  );
}

export const UserSpecifiedObjectArea = React.memo(_UserSpecifiedObjectArea);

function UserSpecifiedObjectName({ selectedItem }) {
  const [value, setValue] = useState("");
  function onBlur(v) {
    useCodeInfo.getState().setName({ id: selectedItem, name: v });
  }

  return (
    <StandardInput
      placeholder={""}
      twClasses="px-9"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={(e) => onBlur(e.target.value)}
    />
  );
}
