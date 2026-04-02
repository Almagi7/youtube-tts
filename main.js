const { app, BrowserWindow } = require("electron");
const path = require("path");

// 👇 arrancar tu servidor automáticamente
require("./server");

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600
  });

  win.loadFile(path.join(__dirname, "public", "index.html"));
}

app.whenReady().then(createWindow);