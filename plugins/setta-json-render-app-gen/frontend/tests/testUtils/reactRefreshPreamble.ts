declare global {
  var __vite_plugin_react_preamble_installed__: boolean | undefined;
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
  var $RefreshReg$: ((type: unknown, id: string) => void) | undefined;
  var $RefreshSig$: (() => (type: unknown) => unknown) | undefined;
}

globalThis.__vite_plugin_react_preamble_installed__ = true;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.$RefreshReg$ = () => undefined;
globalThis.$RefreshSig$ = () => (type) => type;

export {};
