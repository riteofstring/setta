// from https://github.com/sarimabbas/minimal-cra-ts-electron-setup

const electron = require("electron");
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;

const path = require("path");
const isDev = require("electron-is-dev");
const appPath = app.getAppPath();
const usersPath = "D:\\Downloads";
const nodePty = require("node-pty");

console.log("***electron.js isDev =", isDev);

let mainWindow;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    webPreferences: {
      nodeIntegration: false,
      preload: __dirname + "/preload.js",
    },
  });
  const appUrl = isDev
    ? "http://localhost:3000"
    : `file://${path.join(__dirname, "../build/index.html")}`;
  mainWindow.loadURL(appUrl);
  mainWindow.on("closed", () => (mainWindow = null));
};
app.on("ready", function () {
  createWindow();
  mainWindow.webContents.openDevTools();
});
app.on("window-all-closed", () => {
  // Follow OS convention on whether to quit app when
  // all windows are closed.
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("activate", () => {
  // If the app is still open, but no windows are open,
  // create one when the app comes into focus.
  if (mainWindow === null) {
    createWindow();
  }
});

const { ipcMain } = require("electron");
const child_process = require("child_process");
const fs = require("fs");

ipcMain.on("asynchronous-message", (event, payload) => {
  let { arg, data } = payload;
  let child = null;
  if (arg == "run program") {
    fs.writeFileSync(usersPath+"\\abcde_temp.py", data)
    let bat_file = "activate abcde_env && python -u abcde_temp.py"
    fs.writeFileSync(usersPath+"\\run_abcde_temp.bat", bat_file)

    child = nodePty.spawn("cmd.exe", [], {
      name: "xterm-color",
      cols: 80,
      rows: 30,
      cwd: usersPath,
      env: process.env,
    });

    child.on("data", function (data) {
      mainWindow.webContents.send("terminal.incomingData", data);
    });
    ipcMain.on("terminal.keystroke", (event, key) => {
      console.log("terminal.keystroke");
      child.write(key);
    });

    child.write("run_abcde_temp.bat\r\nrm abcde_temp.py\r\nrm run_abcde_temp.bat\r\n");
  }
});
