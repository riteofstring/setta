import { useGetSectionConfig } from "hooks/useSectionConfig";
import React, { useState } from "react";
import { StandardInput } from "utils/atoms/input/StandardInput";
import { ParamGroupContainer } from "./Main/Group/GroupContainer";
import { KwargsControls } from "./Main/KwargsControls/KwargsControls";

function _UserSpecifiedObjectArea({ sectionId }) {
  const selectedItem = useGetSectionConfig(sectionId, "selectedItem");

  return (
    <>
      <div className="px-6">
        <UserSpecifiedObjectName />
      </div>

      <KwargsControls sectionId={sectionId} objInfoId={selectedItem} />
      <ParamGroupContainer sectionId={sectionId} objInfoId={selectedItem} />
    </>
  );
}

export const UserSpecifiedObjectArea = React.memo(_UserSpecifiedObjectArea);

function UserSpecifiedObjectName() {
  const [value, setValue] = useState("");

  return (
    <StandardInput
      placeholder={""}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={(e) => onBlur(e.target.value)}
    />
  );
}
