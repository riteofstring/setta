// from https://github.com/sarimabbas/minimal-cra-ts-electron-setup

const electron = require("electron");
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;

const path = require("path");
const isDev = require("electron-is-dev");

console.log("***electron.js isDev =", isDev);
console.log("process.env.npm_lifecycle_event", process.env.npm_lifecycle_event)

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
    // let data = JSON.stringify(
    //   JSON.parse(fs.readFileSync("python_test_backup.json", "utf8"))
    // );
    data = JSON.stringify(data)
    data = data.replace(/"/g, '\\"')
    child = child_process.spawn("run_from_ui_selections.bat", [`"${data}"`], {
      encoding: "utf8",
      shell: true,
      cwd: "D:\\Documents\\App Development\\ABCDE\\ui_specifier",
    });
  }
  else if (arg == "create UI") {
    data = data.replace(/"/g, '\\"')
    data = data.replaceAll('\n', '\\n')
    child = child_process.spawn("create_ui.bat", [`"${data}"`], {
      encoding: "utf8",
      shell: true,
      cwd: "D:\\Documents\\App Development\\ABCDE\\ui_specifier",
    });
  }
  else if (arg == "get UI specs"){
    const uiSpecs = JSON.parse(fs.readFileSync("src\\data\\fromUI.json", "utf8"))
    console.log("loading fromUI.json")
    console.log(uiSpecs)
    event.reply('asynchronous-reply', uiSpecs)
  }

  if (["run program", "create UI"].includes(arg)) {
    child.stdout.on("data", function (data) {
      console.log(data.toString());
    });

    child.on("close", (code) => {
      event.reply('asynchronous-reply', code === 0 ? 'success' : 'fail')
    });

    child.stdout.on("end", () => {
      console.log("There will be no more data.");
    });

    child.stderr.on("data", function (data) {
      console.log(data.toString());
    });
  }



});

// ipcMain.on('synchronous-message', (event, arg) => {
//   console.log(arg) // prints "ping"
//   event.returnValue = 'pong'
// })
