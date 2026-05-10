import { useEffect, useRef } from "react";
import type {
  AppSubsystemFrontendHost,
  AppSubsystemRenderer,
} from "./appSubsystem";

export const EMPTY_APP_SUBSYSTEM_RENDERER_PROPS = Object.freeze({}) as Readonly<
  Record<string, never>
>;

type AppSubsystemRendererHostProps<TProps> = {
  renderer: AppSubsystemRenderer<TProps>;
  props: TProps;
  host: AppSubsystemFrontendHost;
  className?: string;
  testId?: string;
};

export function AppSubsystemRendererHost<TProps>({
  renderer,
  props,
  host,
  className,
  testId,
}: AppSubsystemRendererHostProps<TProps>) {
  const mountRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  const previousPropsRef = useRef<TProps | null>(null);

  useEffect(() => {
    const mountElement = mountRef.current;
    if (!mountElement) {
      return;
    }
    renderer.mount(mountElement, props, host);
    mountedRef.current = true;
    previousPropsRef.current = null;
    return () => {
      mountedRef.current = false;
      previousPropsRef.current = null;
      renderer.unmount?.(mountElement);
    };
  }, [host, renderer]);

  useEffect(() => {
    const mountElement = mountRef.current;
    if (!mountElement || !mountedRef.current) {
      return;
    }
    const previousProps = previousPropsRef.current;
    previousPropsRef.current = props;
    if (previousProps === null) {
      return;
    }
    if (renderer.update) {
      renderer.update(mountElement, props, host);
      return;
    }
    renderer.unmount?.(mountElement);
    renderer.mount(mountElement, props, host);
  }, [host, props, renderer]);

  return <div ref={mountRef} className={className} data-testid={testId} />;
}
