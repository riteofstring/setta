import {
  activateAppSubsystemFrontendHostRuntime,
  deactivateAppSubsystemFrontendHostRuntime,
  type AppSubsystemFrontendHost,
} from "@setta/app-subsystem-frontend-sdk";
import type { ComponentType, ReactElement } from "react";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppSubsystemFrontendHostProvider } from "./appSubsystemFrontendHostContext";

type ReactAppSubsystemRendererOptions = {
  browserRouter?: boolean;
};

function renderComponent<Props extends object>(
  target: HTMLElement,
  Component: ComponentType<Props>,
  props: Props,
  host: AppSubsystemFrontendHost,
  options: ReactAppSubsystemRendererOptions,
  roots: WeakMap<HTMLElement, Root>,
  hosts: WeakMap<HTMLElement, AppSubsystemFrontendHost>,
): void {
  let root = roots.get(target);
  if (!root) {
    root = createRoot(target);
    roots.set(target, root);
  }
  const previousHost = hosts.get(target);
  if (previousHost && previousHost !== host) {
    deactivateAppSubsystemFrontendHostRuntime(previousHost);
  }
  if (previousHost !== host) {
    activateAppSubsystemFrontendHostRuntime(host);
    hosts.set(target, host);
  }
  const component = <Component {...props} />;
  const wrappedComponent = (
    <AppSubsystemFrontendHostProvider host={host}>
      {component}
    </AppSubsystemFrontendHostProvider>
  );
  const element: ReactElement = options.browserRouter
    ? createElement(BrowserRouter, null, wrappedComponent)
    : wrappedComponent;
  root.render(element);
}

export function createReactAppSubsystemRenderer<Props extends object>(
  Component: ComponentType<Props>,
  options: ReactAppSubsystemRendererOptions = {},
) {
  const roots = new WeakMap<HTMLElement, Root>();
  const hosts = new WeakMap<HTMLElement, AppSubsystemFrontendHost>();

  return {
    mount: (
      target: HTMLElement,
      props: Props,
      host: AppSubsystemFrontendHost,
    ) => {
      renderComponent(target, Component, props, host, options, roots, hosts);
    },
    update: (
      target: HTMLElement,
      props: Props,
      host: AppSubsystemFrontendHost,
    ) => {
      renderComponent(target, Component, props, host, options, roots, hosts);
    },
    unmount: (target: HTMLElement) => {
      const root = roots.get(target);
      const host = hosts.get(target);
      if (host) {
        deactivateAppSubsystemFrontendHostRuntime(host);
        hosts.delete(target);
      }
      if (!root) {
        return;
      }
      root.unmount();
      roots.delete(target);
    },
  };
}
