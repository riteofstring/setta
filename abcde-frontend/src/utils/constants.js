export const USING_ELECTRON = process.env.REACT_APP_USING_ELECTRON

export let ipcRenderer = null;
if (USING_ELECTRON) {
  ipcRenderer = window.require("electron").ipcRenderer;
}