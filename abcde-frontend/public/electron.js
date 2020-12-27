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
  if (arg == "run program") {
    // let data = JSON.stringify(
    //   JSON.parse(fs.readFileSync("python_test_backup.json", "utf8"))
    // );
    data = JSON.stringify(data)
    data = data.replace(/"/g, '\\"')
    const child = child_process.spawn("python_test.bat", [`"${data}"`], {
      encoding: "utf8",
      shell: true,
      cwd: "D:\\Documents\\App Development\\ABCDE\\ui_specifier",
    });

    child.stdout.on("data", function (data) {
      console.log(data.toString());
    });

    child.on("close", (code) => {
      console.log(`child process exited with code ${code}`);
    });

    child.stdout.on("end", () => {
      console.log("There will be no more data.");
    });

    child.stderr.on("data", function (data) {
      console.log(data.toString());
    });

    // child.stdin.setEncoding = 'utf-8';
    // child.stdin.write('Hello\r\n');

    // event.reply('asynchronous-reply', 'pong')
  }
});

// ipcMain.on('synchronous-message', (event, arg) => {
//   console.log(arg) // prints "ping"
//   event.returnValue = 'pong'
// })
