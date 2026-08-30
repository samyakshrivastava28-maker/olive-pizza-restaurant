const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Olive Pizza — Restaurant & Kitchen Management System',
    backgroundColor: '#020617',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5176');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// IPC: Native Kitchen Order Ticket (KOT) Silent Thermal Print
ipcMain.handle('print-kitchen-ticket', async (event, { htmlContent, printerName }) => {
  if (!mainWindow) return { success: false, error: 'Window not initialized' };

  const printWin = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } });
  await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));

  return new Promise((resolve) => {
    printWin.webContents.print(
      {
        silent: true,
        printBackground: true,
        deviceName: printerName || ''
      },
      (success, failureReason) => {
        printWin.close();
        if (!success) {
          resolve({ success: false, error: failureReason });
        } else {
          resolve({ success: true });
        }
      }
    );
  });
});

// IPC: KDS Kitchen Alert Chime
ipcMain.handle('play-kds-alert', async () => {
  console.log('[KDS Alert] New Kitchen Order incoming...');
  return { success: true };
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
