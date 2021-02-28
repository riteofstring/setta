const { app, BrowserWindow } = require("electron");
// Module with utilities for working with file and directory paths.
const path = require("path");
// Module with utilities for URL resolution and parsing.
const url = require("url");

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

// Deep linked url
let deeplinkingUrl;

// Force Single Instance Application
const gotTheLock = app.requestSingleInstanceLock();
if (gotTheLock) {
  app.on("second-instance", (e, argv) => {
    // Someone tried to run a second instance, we should focus our window.

    // Protocol handler for win32
    // argv: An array of the second instance’s (command line / deep linked) arguments
    if (process.platform == "win32") {
      // Keep only command line / deep linked arguments
      deeplinkingUrl = argv.slice(2);
    }
    logEverywhere("app.makeSingleInstance# " + deeplinkingUrl);

    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
} else {
  app.quit();
  return;
}

console.log("__dirname", __dirname);
function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      preload: __dirname + "/preload.js",
    },
  });

  // and load the index.html of the app.
  console.log("process.env.ELECTRON_IS_DEV", process.env.ELECTRON_IS_DEV);
  const startURL = process.env.ELECTRON_IS_DEV
    ? "http://localhost:4534"
    : url.format({
        pathname: path.join(__dirname, "../index.html"),
        protocol: "file:",
        slashes: true,
      });
  mainWindow.loadURL(startURL);

  // Open the DevTools.
  mainWindow.webContents.openDevTools();

  // Protocol handler for win32
  if (process.platform == "win32") {
    // Keep only command line / deep linked arguments
    deeplinkingUrl = process.argv.slice(1);
  }
  logEverywhere("createWindow# " + deeplinkingUrl);

  // Emitted when the window is closed.
  mainWindow.on("closed", function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", createWindow);

// Quit when all windows are closed.
app.on("window-all-closed", function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow();
  }
});

if (!app.isDefaultProtocolClient("abcde")) {
  // Define custom protocol handler. Deep linking works on packaged versions of the application!
  app.setAsDefaultProtocolClient("abcde");
}

app.on("will-finish-launching", function () {
  // Protocol handler for osx
  app.on("open-url", function (event, url) {
    event.preventDefault();
    deeplinkingUrl = url;
    logEverywhere("open-url# " + deeplinkingUrl);
  });
});

// Log both at dev console and at running node console instance
function logEverywhere(s) {
  console.log(s);
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.executeJavaScript(`console.log("${s}")`);
  }
}


const {newGeneratedCodeSocket} = require("./notifications")

newGeneratedCodeSocket.onmessage = function (event) {
  var data = JSON.parse(event.data);
  // do whatever required with received data ...
};


// const {
//   getCodeToken,
//   deleteCodeToken,
//   runProgram,
//   createUI,
// } = require("./runners");
// const { ipcMain } = require("electron");

// ipcMain.on("asynchronous-message", (event, payload) => {
//   let { arg, data } = payload;
//   if (arg === "getRequestType") {
//     if (requestType) {
//       event.reply(requestType, requestType);
//       requestType = null;
//     }
//   } else if (arg === "getCodeToken") {
//     deeplinkingUrl = getCodeToken(event, deeplinkingUrl, logEverywhere);
//   } else if (arg === "deleteCodeToken") {
//     deeplinkingUrl = deleteCodeToken(deeplinkingUrl, logEverywhere);
//   } else if (arg === "runProgram") {
//     runProgram(data);
//   } else if (arg === "createUI") {
//     createUI(deeplinkingUrl);
//   }
// });
