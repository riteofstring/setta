import { Text } from "@chakra-ui/react";
import { useStoreState } from "easy-peasy";

export function ProjectName() {
  const name = useStoreState((x) => x.project.name);
  const configName = useStoreState((x) => x.projectConfig.name);
  return (
    <Text as="span" color="#00B5D8">
      {`${name} / ${configName}`}
    </Text>
  );
}
