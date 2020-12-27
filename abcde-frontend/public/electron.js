// from https://github.com/sarimabbas/minimal-cra-ts-electron-setup

const electron = require("electron");
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;

const path = require("path");
const isDev = require("electron-is-dev");

console.log("***electron.js isDev =", isDev);

let mainWindow;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 320,
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
const fs = require('fs');

ipcMain.on("asynchronous-message", (event, payload) => {
  const {arg, data} = payload;
  if (arg == "run program") {
    console.log("Saving json")
    fs.writeFileSync("python_test.json", JSON.stringify(data));
    console.log("Opening terminal");
    const child = child_process.spawn("start cmd.exe", ["/K", "ls"], {
      encoding: "utf8",
      shell: true,
      cwd: "D:\\Documents\\App Development\\ABCDE",
    });

    child.stdout.on("data", function (msg) {
      console.log(msg.toString());
    });

    child.on('close', (code) => {
      console.log(`child process exited with code ${code}`);
    });

    // event.reply('asynchronous-reply', 'pong')
  }
});

// ipcMain.on('synchronous-message', (event, arg) => {
//   console.log(arg) // prints "ping"
//   event.returnValue = 'pong'
// })
