import { Stack, FormControl } from "@chakra-ui/react";

import {
  useGetAllParamInfos,
  useSectionParamChildId,
  useSectionParamEnteredValue,
  useSectionParamUITypeId,
} from "../../../../../../utils/useCreateInfo";
import ParamSwitch from "./ParamSwitch/ParamSwitch";

export default function GroupContainer({ sectionId, sectionInfoId, objInfo }) {
  console.log("GroupContainer", objInfo);
  const paramInfos = useGetAllParamInfos(sectionInfoId, objInfo);
  const [enteredValue, setEnteredValue] =
    useSectionParamEnteredValue(sectionId);
  const childId = useSectionParamChildId(sectionId)[0];
  const uiTypeId = useSectionParamUITypeId(sectionId)[0];

  // const kwargNames = useStoreState(
  //   (state) => Object.keys(state.master.sections.getKwargs(sectionId)),
  //   arraysAreEqual
  // );

  // const [enteredKwargNames, setEnteredKwargNames] = useState(kwargNames);
  // const [numKwargs, setNumKwargs] = useState(kwargNames.length);
  // const paramNames = useStoreState(
  //   (state) => Object.keys(state.master.sections.getParameters(sectionId)),
  //   arraysAreEqual
  // );
  // const showKwargsButton = objName || paramNames.length > 0;

  // useEffect(() => {
  //   setEnteredKwargNames(kwargNames);
  //   setNumKwargs(kwargNames.length);
  // }, [sectionId, moduleName, objName]);

  // const updateEnteredKwargNames = (v, idx) => {
  //   const newState = [...enteredKwargNames];
  //   newState[idx] = v;
  //   setEnteredKwargNames(newState);
  // };

  // const deleteFromEnteredKwargNames = (idx) => {
  //   const newState = [...enteredKwargNames];
  //   newState.splice(idx, 1);
  //   setEnteredKwargNames(newState);
  //   setNumKwargs(Math.max(0, numKwargs - 1));
  // };

  // const addToEnteredKwargNames = () => {
  //   setEnteredKwargNames([...enteredKwargNames, ""]);
  //   setNumKwargs(numKwargs + 1);
  // };

  return (
    <Stack>
      {paramInfos.length > 0 && (
        <FormControl id="groupone">
          {paramInfos.map((e, idx) => (
            <ParamSwitch
              key={`${e.name}-${idx}`}
              sectionId={sectionId}
              paramInfo={e}
              enteredValue={enteredValue}
              setEnteredValue={setEnteredValue}
              childId={childId}
              uiTypeId={uiTypeId}
            />
          ))}
        </FormControl>
      )}

      {/* {showKwargsButton && (
        <HStack pt="1rem">
          <Heading as="h3" color="gray.600" size="sm" fontWeight="normal">
            {"KWARGS"}
          </Heading>
          <IconButton
            icon={<AddIcon w={2} />}
            size="xs"
            variant="outline"
            borderRadius="full"
            onClick={() => addToEnteredKwargNames()}
          />
        </HStack>
      )}

      {numKwargs > 0 && (
        <FormControl id="groupone">
          {[...Array(numKwargs)].map((e, idx) => (
            <ParamSwitch
              key={`KWARGS-${idx}`}
              sectionId={sectionId}
              metaUIType={"KWARGS"}
              stateIsUpToDate={kwargNames.includes(enteredKwargNames[idx])}
              enteredKwargName={enteredKwargNames[idx]}
              setEnteredKwargName={(v) => updateEnteredKwargNames(v, idx)}
              onClickDelete={() => deleteFromEnteredKwargNames(idx)}
              paramAndKwargNames={paramNames.concat(enteredKwargNames)}
            />
          ))}
        </FormControl>
      )} */}
    </Stack>
  );
}
