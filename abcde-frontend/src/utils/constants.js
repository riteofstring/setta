export const USING_ELECTRON = process.env.REACT_APP_USING_ELECTRON
// export const USING_ELECTRON = null

export let ipcRenderer = null;
if (USING_ELECTRON) {
  ipcRenderer = window.require("electron").ipcRenderer;
}

export const BACKEND = "http://localhost:8000/";