import { Heading, Input } from "@chakra-ui/react";
import { useStoreState, useStoreActions } from "easy-peasy";
import { useState } from "react";

export default function SectionsPerGroup() {
  const sectionsPerGroup = useStoreState(
    (x) => x.userSettings.sectionsPerGroup
  );
  const setSectionsPerGroup = useStoreActions(
    (x) => x.userSettings.setSectionsPerGroup
  );
  const [value, setValue] = useState(sectionsPerGroup);

  function onChange(e) {
    setValue(e.target.value);
  }

  function onBlur(e) {
    const eInt = parseInt(e.target.value);
    if (Number.isInteger(eInt)) {
      setSectionsPerGroup(eInt);
    } else {
      setValue(sectionsPerGroup);
    }
  }

  return (
    <>
      <Heading as="h2" size="md" color="gray.500" pb=".5rem">
        Sections Per Group
      </Heading>
      <Input
        placeholder="Sections Per Group"
        value={value}
        onChange={onChange}
        onBlur={onBlur}
      ></Input>
    </>
  );
}
