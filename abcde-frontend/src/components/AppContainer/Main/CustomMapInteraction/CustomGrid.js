import { Grid } from "@chakra-ui/react";
import sizeMe from "react-sizeme";

function CustomGrid(props) {
  return <Grid {...props}>{props.children}</Grid>;
}

export default sizeMe({ monitorHeight: true })(CustomGrid)
