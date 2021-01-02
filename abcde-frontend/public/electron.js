// from https://github.com/sarimabbas/minimal-cra-ts-electron-setup

const electron = require("electron");
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;

const path = require("path");
const isDev = require("electron-is-dev");
const appPath = app.getAppPath();
const backendPath = appPath + "\\..\\ABCDE\\ui_specifier";
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
    data = JSON.stringify(JSON.parse(fs.readFileSync("python_test_backup.json", "utf8")))
    // data = JSON.stringify(data);
    data = data.replace(/"/g, '\\"');

    child = nodePty.spawn("cmd.exe", [], {
      name: "xterm-color",
      cols: 80,
      rows: 30,
      cwd: backendPath,
      env: process.env,
    });

    child.on("data", function (data) {
      mainWindow.webContents.send("terminal.incomingData", data);
      console.log("Data sent");
    });
    ipcMain.on("terminal.keystroke", (event, key) => {
      console.log("terminal.keystroke");
      child.write(key);
    });

    child.write(`run_from_ui_selections.bat "${data}"\r\n`);
  } else if (arg == "create UI") {
    data = data.replace(/"/g, '\\"');
    data = data.replaceAll("\n", "\\n");
    child = child_process.spawn("create_ui.bat", [`"${data}"`], {
      encoding: "utf8",
      shell: true,
      cwd: backendPath,
    });
  } else if (arg == "get UI specs") {
    const uiSpecs = JSON.parse(
      fs.readFileSync("src\\data\\fromUI.json", "utf8")
    );
    console.log("loading fromUI.json");
    console.log(uiSpecs);
    event.reply("asynchronous-reply", uiSpecs);
  }

  if (["create UI"].includes(arg)) {
    child.stdout.on("data", function (data) {
      console.log(data.toString());
    });

    child.on("close", (code) => {
      event.reply("asynchronous-reply", code === 0 ? "success" : "fail");
    });

    child.stdout.on("end", () => {
      console.log("There will be no more data.");
    });

    child.stderr.on("data", function (data) {
      console.log(data.toString());
    });
  }
});
