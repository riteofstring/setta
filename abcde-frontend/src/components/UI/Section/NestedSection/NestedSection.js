import { Grid, Stack, theme } from "@chakra-ui/react";
import NestedControl from "./NestedControl/NestedControl";
import SectionContainer from "../SectionContainer/SectionContainer";

const borderLeft = theme.colors.gray;

export default function NestedSection() {
  return (
    <Stack
      direction="column"
      pl="1rem"
      ml=".5rem"
      boxShadow={`inset 0.25rem 0px 0px 0px ${borderLeft[50]}`}
    >
      <Grid gap={2}>
        <NestedControl />
        <SectionContainer />
        <SectionContainer />
      </Grid>
    </Stack>
  );
}
