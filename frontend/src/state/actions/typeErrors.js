import _ from "lodash";
import { useTypeErrors } from "state/definitions";
import { setNotificationMessage } from "./notification";

export function processTypeErrors(content) {
  if (useTypeErrors.getState().userRequested) {
    setNotificationMessage(
      _.size(content) === 0
        ? "No type errors"
        : `Found ${_.size(content)} type errors`,
    );
  }
  useTypeErrors.getState().reset();
  useTypeErrors.setState({ errors: content });
}
