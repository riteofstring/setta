import type { ReactElement } from "react";

type MockParamInputRenderMode =
  | "button-role-div"
  | "combobox-input"
  | "explicit-button-role-target"
  | "explicit-switch-role-target"
  | "explicit-activation-target"
  | "mousedown-activation"
  | "native-color-input"
  | "plain-button"
  | "pointer-activation"
  | "switch-role-button"
  | "textarea"
  | "text-input"
  | "time-input";

type MockParamInputProps = {
  focusActiveSectionOnTextInput?: boolean;
  maybeErrorMessage?: string;
  paramInfoId: string;
  sectionId: string;
  tooltipParentDivId?: string | null;
};

type MockHandler = () => void;

type MockParamInputRendererMocks = {
  paramInputActivationClick: MockHandler;
  paramInputActivationMouseDown: MockHandler;
  paramInputActivationPointerDown: MockHandler;
  paramInputActivationPointerUp: MockHandler;
  paramInputProps: (props: MockParamInputProps) => void;
  paramInputRenderMode: { current: MockParamInputRenderMode };
};

type MockParamInputRenderer = (props: MockParamInputProps) => ReactElement;

export function createMockParamInput(mocks: MockParamInputRendererMocks) {
  const renderPlainButton: MockParamInputRenderer = (props) => (
    <button
      type="button"
      data-gpu-flow-interactive="true"
      data-testid="param-input"
      data-tooltip-parent={props.tooltipParentDivId ?? ""}
      onClick={mocks.paramInputActivationClick}
    />
  );

  const renderers = {
    "button-role-div": (props) => (
      <div
        role="button"
        data-gpu-flow-interactive="true"
        data-testid="param-input"
        data-tooltip-parent={props.tooltipParentDivId ?? ""}
        onClick={mocks.paramInputActivationClick}
        tabIndex={0}
      />
    ),
    "combobox-input": (props) => (
      <input
        type="text"
        role="combobox"
        data-gpu-flow-interactive="true"
        data-testid="param-input"
        data-tooltip-parent={props.tooltipParentDivId ?? ""}
        onClick={mocks.paramInputActivationClick}
        readOnly
      />
    ),
    "explicit-activation-target": () => (
      <>
        <span data-testid="param-input-pointer-miss" />
        <div data-gpu-flow-interactive="true" data-testid="param-input-wrapper">
          <button
            type="button"
            data-gpu-flow-activation-target="true"
            data-testid="param-input"
            onClick={mocks.paramInputActivationClick}
          />
        </div>
      </>
    ),
    "explicit-button-role-target": () => (
      <div data-gpu-flow-interactive="true" data-testid="param-input-wrapper">
        <button
          type="button"
          role="button"
          data-gpu-flow-activation-target="true"
          data-testid="param-input"
          onClick={mocks.paramInputActivationClick}
        />
      </div>
    ),
    "explicit-switch-role-target": () => (
      <div data-gpu-flow-interactive="true" data-testid="param-input-wrapper">
        <button
          type="button"
          role="switch"
          data-gpu-flow-activation-target="true"
          data-testid="param-input"
          onClick={mocks.paramInputActivationClick}
        />
      </div>
    ),
    "mousedown-activation": (props) => (
      <div
        data-gpu-flow-activation="mousedown"
        data-gpu-flow-interactive="true"
        data-testid="param-input"
        data-tooltip-parent={props.tooltipParentDivId ?? ""}
        onMouseDown={mocks.paramInputActivationMouseDown}
        tabIndex={0}
      />
    ),
    "native-color-input": (props) => (
      <input
        type="color"
        data-gpu-flow-interactive="true"
        data-testid="param-input"
        data-tooltip-parent={props.tooltipParentDivId ?? ""}
        onClick={mocks.paramInputActivationClick}
      />
    ),
    "plain-button": renderPlainButton,
    "pointer-activation": (props) => (
      <button
        type="button"
        data-gpu-flow-activation="pointer"
        data-gpu-flow-interactive="true"
        data-testid="param-input"
        data-tooltip-parent={props.tooltipParentDivId ?? ""}
        onPointerDown={mocks.paramInputActivationPointerDown}
        onPointerUp={mocks.paramInputActivationPointerUp}
      />
    ),
    "switch-role-button": (props) => (
      <button
        type="button"
        role="switch"
        data-gpu-flow-interactive="true"
        data-testid="param-input"
        data-tooltip-parent={props.tooltipParentDivId ?? ""}
        onClick={mocks.paramInputActivationClick}
      />
    ),
    textarea: (props) => (
      <textarea
        data-gpu-flow-interactive="true"
        data-testid="param-input"
        data-tooltip-parent={props.tooltipParentDivId ?? ""}
        onClick={mocks.paramInputActivationClick}
      />
    ),
    "text-input": (props) => (
      <input
        type="text"
        data-gpu-flow-interactive="true"
        data-testid="param-input"
        data-tooltip-parent={props.tooltipParentDivId ?? ""}
        onClick={mocks.paramInputActivationClick}
      />
    ),
    "time-input": (props) => (
      <input
        type="time"
        data-gpu-flow-interactive="true"
        data-testid="param-input"
        data-tooltip-parent={props.tooltipParentDivId ?? ""}
        onClick={mocks.paramInputActivationClick}
      />
    ),
  } satisfies Record<MockParamInputRenderMode, MockParamInputRenderer>;

  return (props: MockParamInputProps) => {
    mocks.paramInputProps(props);
    return renderers[mocks.paramInputRenderMode.current](props);
  };
}
