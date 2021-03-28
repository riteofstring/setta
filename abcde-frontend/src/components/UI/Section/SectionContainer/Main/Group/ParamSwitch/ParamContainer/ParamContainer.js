import { HStack, Spacer, FormControl } from "@chakra-ui/react";
import ParamInput from "./ParamItems/ParamInput";
import { useState, useEffect } from "react";
import { useStoreState, useStoreActions } from "easy-peasy";
import { requiresNestedSection } from "../../../../../../../../utils/utils";

export default function ParamContainer(props) {
  const {
    sectionId,
    moduleName,
    objName,
    parameter: { name, defaultUIType },
  } = props;

  const currUIType = useStoreState(
    (state) => state.uiTypes.uiTypes[sectionId]?.[moduleName]?.[objName]?.[name]
  );

  const setNestedSectionIds = useStoreActions(
    (actions) => actions.nestedSectionIds.setNestedSectionIds
  );

  const permanentlyDeleteSection = useStoreActions(
    (actions) => actions.master.permanentlyDeleteSection
  );

  const addToVisibleSectionIdsThunk = useStoreActions(
    (actions) => actions.master.addToVisibleSectionIdsThunk
  );
  const nestedSectionId = useStoreState(
    (state) =>
      state.nestedSectionIds.nestedSectionIds[sectionId]?.[moduleName]?.[
        objName
      ]?.[name]
  );

  const [uiType, setUIType] = useState(defaultUIType);

  const wrapperSetNestedSectionId = (newNestedSectionId) => {
    setNestedSectionIds({
      sectionId,
      moduleName,
      objName,
      paramName: name,
      paramValue: newNestedSectionId,
    });
  };

  useEffect(() => {
    setUIType(currUIType ? currUIType : defaultUIType);
  }, [currUIType]);

  useEffect(() => {
    if (uiType) {
      let newNestedSectionId = null;
      if (nestedSectionId) {
        permanentlyDeleteSection({
          sectionId: nestedSectionId,
          parentId: sectionId,
        });
      }
      if (requiresNestedSection(uiType)) {
        newNestedSectionId = addToVisibleSectionIdsThunk({
          name,
          parentId: sectionId,
          moduleName,
          objName,
          isList: uiType === "LIST_NESTED_OBJECT",
          siblingId: null,
        });
      }
      wrapperSetNestedSectionId(newNestedSectionId);
    }
  }, [uiType]);

  return (
    !requiresNestedSection() && (
      <FormControl as="fieldset">
        <HStack
          px=".75rem"
          pb="0.5rem"
          pt="0.25rem"
          borderRadius=".5rem"
          _hover={{
            backgroundColor: "white",
          }}
        >
          {props.children}
          <Spacer />
          <ParamInput {...props} uiType={uiType} />
        </HStack>
      </FormControl>
    )
  );
}
