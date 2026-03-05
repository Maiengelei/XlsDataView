const { app, BrowserWindow, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const DEV_SERVER_URL = 'http://127.0.0.1:5173';

function resolveRendererEntry() {
  const candidates = [
    path.join(app.getAppPath(), 'dist', 'index.html'),
    path.join(process.resourcesPath, 'app.asar', 'dist', 'index.html'),
    path.join(process.resourcesPath, 'app', 'dist', 'index.html')
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function buildMissingEntryHtml() {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>Xls Data View - 启动失败</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; line-height: 1.6; }
      code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; }
    </style>
  </head>
  <body>
    <h2>应用启动失败：未找到前端构建产物</h2>
    <p>请确认打包前已执行 <code>npm run build</code>，并确保 <code>dist/index.html</code> 被包含进安装包。</p>
  </body>
</html>`;
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1080,
    minHeight: 720,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  if (!app.isPackaged) {
    win.loadURL(DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    const rendererEntry = resolveRendererEntry();

    if (rendererEntry) {
      win.loadFile(rendererEntry);
    } else {
      win.loadURL(`data:text/html,${encodeURIComponent(buildMissingEntryHtml())}`);
    }
  }

  win.webContents.on('did-fail-load', (_event, code, description, validatedURL) => {
    win.loadURL(
      `data:text/html,${encodeURIComponent(`<!doctype html><html><body style="font-family: Arial, sans-serif; padding: 24px;"><h2>页面加载失败</h2><p>code: ${code}</p><p>${description}</p><p>${validatedURL}</p></body></html>`)}`
    );
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
