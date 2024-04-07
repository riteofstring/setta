import { dbTypeCheckRequest } from "dbRequests/sections";
import _ from "lodash";
import { useNotification } from "models/notification";
import { useTypeErrors } from "models/typeErrors";

export async function requestTypeCheck() {
  // useNotification.getState().setMessage("Checking types...");
  // const res = await dbTypeCheckRequest();
  // if (res.status === 200) {
  //   const errors = res.data;
  //   useTypeErrors.setState(errors, true);
  //   useNotification
  //     .getState()
  //     .setMessage(_.size(errors) > 0 ? "Found type errors" : "All good!");
  // }
}

export const debouncedRequestTypeCheck = _.debounce(
  () => requestTypeCheck(),
  1000,
);
