const { app, BrowserWindow } = require("electron");
const path = require("path");

// TODO Remove this before going prod
// Electron-reload
require("electron-reload")(__dirname);
// Electron-reload
let win;

function createWindow() {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    autoHideMenuBar: true,
    frame: true,
    webPreferences: {
      nodeIntegration: true,
      nodeIntegrationInWorker: true
    }
  });
  win.loadFile(path.join(__dirname, "/index.html"));
  win.on("closed", () => {
    win = null;
  });
}

app.on("ready", createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (win === null) {
    createWindow();
  }
});
