type FilterInputState = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

type FilterInputEditResult = {
  nextValue: string;
  nextSelection: number;
  didChange: boolean;
};

export function getFilterInputState(
  input: HTMLInputElement,
  resetInput: boolean,
): FilterInputState {
  if (resetInput) {
    return {
      value: "",
      selectionStart: 0,
      selectionEnd: 0,
    };
  }

  const { value } = input;
  return {
    value,
    selectionStart: input.selectionStart ?? value.length,
    selectionEnd: input.selectionEnd ?? value.length,
  };
}

export function getFilterEditingKey(key: string): string | null {
  if (key.length === 1 || key === "Backspace" || key === "Delete") {
    return key;
  }
  return null;
}

export function isMenuNavigationKey(key: string): boolean {
  return key === "ArrowDown" || key === "ArrowUp";
}

export function shouldEditableTargetHandleMenuKey(
  isEditableTarget: boolean,
  didNavigateList: boolean,
): boolean {
  return isEditableTarget && !didNavigateList;
}

export function getNextFilterInputState(
  state: FilterInputState,
  key: string,
): FilterInputEditResult {
  if (key === "Backspace") {
    return getBackspaceEditResult(state);
  }
  if (key === "Delete") {
    return getDeleteEditResult(state);
  }

  return {
    nextValue:
      state.value.slice(0, state.selectionStart) +
      key +
      state.value.slice(state.selectionEnd),
    nextSelection: state.selectionStart + key.length,
    didChange: true,
  };
}

export function shouldDispatchFilterInputEvent(
  resetInput: boolean,
  result: FilterInputEditResult,
): boolean {
  return resetInput || result.didChange;
}

function getBackspaceEditResult(
  state: FilterInputState,
): FilterInputEditResult {
  if (
    state.selectionStart === state.selectionEnd &&
    state.selectionStart === 0
  ) {
    return {
      nextValue: state.value,
      nextSelection: 0,
      didChange: false,
    };
  }

  const deleteFrom =
    state.selectionStart === state.selectionEnd
      ? state.selectionStart - 1
      : state.selectionStart;

  return {
    nextValue:
      state.value.slice(0, deleteFrom) + state.value.slice(state.selectionEnd),
    nextSelection: deleteFrom,
    didChange: true,
  };
}

function getDeleteEditResult(state: FilterInputState): FilterInputEditResult {
  if (
    state.selectionStart === state.selectionEnd &&
    state.selectionStart === state.value.length
  ) {
    return {
      nextValue: state.value,
      nextSelection: state.selectionStart,
      didChange: false,
    };
  }

  const deleteTo =
    state.selectionStart === state.selectionEnd
      ? state.selectionEnd + 1
      : state.selectionEnd;

  return {
    nextValue:
      state.value.slice(0, state.selectionStart) + state.value.slice(deleteTo),
    nextSelection: state.selectionStart,
    didChange: true,
  };
}
