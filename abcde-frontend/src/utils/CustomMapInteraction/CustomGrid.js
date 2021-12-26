import { Grid } from "@chakra-ui/react";
import Measure from "react-measure";

export default function CustomGrid(props) {
  return (
    <Measure
      client
      onResize={(contentRect) => {
        props.setContentSize(contentRect.client);
      }}
    >
      {({ measureRef }) => (
        <Grid gap={2} ref={measureRef}>
          {props.children}
        </Grid>
      )}
    </Measure>
  );
}
