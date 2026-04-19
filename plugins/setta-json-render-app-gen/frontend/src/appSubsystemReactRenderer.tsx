import type { AppSubsystemFrontendHost } from "@setta/app-subsystem-frontend-sdk";
import type { ComponentType, ReactElement } from "react";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppSubsystemFrontendHostProvider } from "./appSubsystemFrontendHostContext";

type ReactAppSubsystemRendererOptions = {
  browserRouter?: boolean;
};

function renderComponent<Props>(
  target: HTMLElement,
  Component: ComponentType<Props>,
  props: Props,
  host: AppSubsystemFrontendHost,
  options: ReactAppSubsystemRendererOptions,
  roots: WeakMap<HTMLElement, Root>,
): void {
  let root = roots.get(target);
  if (!root) {
    root = createRoot(target);
    roots.set(target, root);
  }
  const component = createElement(Component, props);
  const wrappedComponent = createElement(
    AppSubsystemFrontendHostProvider,
    { host },
    component,
  );
  const element: ReactElement = options.browserRouter
    ? createElement(BrowserRouter, null, wrappedComponent)
    : wrappedComponent;
  root.render(element);
}

export function createReactAppSubsystemRenderer<Props>(
  Component: ComponentType<Props>,
  options: ReactAppSubsystemRendererOptions = {},
) {
  const roots = new WeakMap<HTMLElement, Root>();

  return {
    mount: (
      target: HTMLElement,
      props: Props,
      host: AppSubsystemFrontendHost,
    ) => {
      renderComponent(target, Component, props, host, options, roots);
    },
    update: (
      target: HTMLElement,
      props: Props,
      host: AppSubsystemFrontendHost,
    ) => {
      renderComponent(target, Component, props, host, options, roots);
    },
    unmount: (target: HTMLElement) => {
      const root = roots.get(target);
      if (!root) {
        return;
      }
      root.unmount();
      roots.delete(target);
    },
  };
}
