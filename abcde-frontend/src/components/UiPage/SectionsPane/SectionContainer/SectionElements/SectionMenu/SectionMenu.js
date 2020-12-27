import React from "react";
import { Stack, Divider, useRadioGroup } from "@chakra-ui/react";
import MenuObjs from "./MenuObjs/MenuObjs";

const SectionMenu = ({ sectionId, theSection }) => {
  const { moduleInfos } = theSection;
  const { getRootProps } = useRadioGroup({
    name: sectionId,
    defaultValue: "resnet101",
  });
  const group = getRootProps();

  return (
    <Stack {...group} maxHeight="20rem" overflowY="auto">
      {sectionId}
      <Divider />
      {Object.keys(moduleInfos).map((e, idx) => (
        <MenuObjs
          currModuleInfo={moduleInfos[e]}
          sectionId={sectionId}
          key={`mo-${e}-${idx}`}
        />
      ))}
    </Stack>
  );
};

export default React.memo(SectionMenu);
