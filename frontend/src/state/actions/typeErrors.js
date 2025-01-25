import _ from "lodash";
import { useProjectConfig, useTypeErrors } from "state/definitions";
import { setNotificationMessage } from "./notification";

export function processTypeErrors(content) {
  const { projectConfigId, sectionId, typeErrors } = content;
  if (projectConfigId !== useProjectConfig.getState().id) {
    return;
  }

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
