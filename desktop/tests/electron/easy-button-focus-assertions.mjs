export function assertAcceptedSteeringFocusEvents(events, requestText, revisedText) {
  const runUpdates = events
    .filter((event) => event.type === "easyrun.run.updated")
    .map((event) => event.runUpdated?.run)
    .filter((run) => run?.requestText === requestText);
  const updatingIndex = runUpdates.findIndex(
    (run) =>
      run.currentFocus.status === "updating" &&
      run.currentFocus.revision === 0 &&
      run.currentFocus.text === requestText,
  );
  const revisedIndex = runUpdates.findIndex(
    (run, index) =>
      index > updatingIndex &&
      run.currentFocus.status === "current" &&
      run.currentFocus.revision === 1 &&
      run.currentFocus.text === revisedText,
  );
  const highlightEvents = events.filter((event) => event.type === "easyrun.highlight.created");
  if (updatingIndex < 0 || revisedIndex < 0 || highlightEvents.length !== 0) {
    throw new Error(
      `easy-button accepted steering focus events were wrong: ${JSON.stringify(events)}`,
    );
  }
}

export function assertRevisedCurrentFocus(state, text) {
  const focus = state.currentFocus;
  if (
    focus?.revision !== 1 ||
    focus.status !== "current" ||
    focus.text !== text ||
    focus.updatedAt === ""
  ) {
    throw new Error(
      `easy-button snapshot did not carry revised current focus: ${JSON.stringify(state)}`,
    );
  }
}
