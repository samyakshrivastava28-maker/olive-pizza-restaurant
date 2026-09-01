const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Olive Pizza — Restaurant & Kitchen Management System',
    backgroundColor: '#020617',
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, 'resources', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false // Required for cross-origin Firebase auth popups on file:// protocol
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle popups: allow Google OAuth / Firebase auth popups inside Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const isAuthUrl = 
      url.includes('accounts.google.com') ||
      url.includes('firebaseapp.com') ||
      url.includes('google.com/o/oauth2') ||
      url.includes('apis.google.com');

    if (isAuthUrl) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 680,
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
          }
        }
      };
    }

    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // F12 or Ctrl+Shift+I for DevTools inspection
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Restaurant Desktop] Failed to load (${errorCode}: ${errorDescription}) at ${validatedURL}`);
  });

  const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5176');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// ─── HARDWARE & KDS IPC HANDLERS ────────────────────────────────────────────

// 1. Get System Printers List
ipcMain.handle('get-printers', async () => {
  if (!mainWindow) return [];
  try {
    const printers = await mainWindow.webContents.getPrintersAsync();
    return printers.map(p => ({
      name: p.name,
      displayName: p.displayName || p.name,
      description: p.description || '',
      status: p.status,
      isDefault: p.isDefault
    }));
  } catch (err) {
    console.error('[Restaurant IPC] Error fetching printers:', err);
    return [];
  }
});

// 2. Native Kitchen Order Ticket (KOT) Silent Thermal Print
ipcMain.handle('print-kitchen-ticket', async (event, { htmlContent, printerName }) => {
  if (!mainWindow) return { success: false, error: 'Window not initialized' };
  if (!htmlContent || typeof htmlContent !== 'string') {
    return { success: false, error: 'Invalid KOT receipt content' };
  }

  let printWin = null;
  try {
    printWin = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));

    return await new Promise((resolve) => {
      printWin.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName: printerName || ''
        },
        (success, failureReason) => {
          if (printWin && !printWin.isDestroyed()) {
            printWin.close();
          }
          if (!success) {
            console.warn('[Restaurant IPC] KOT Print failed:', failureReason);
            resolve({ success: false, error: failureReason });
          } else {
            console.log('[Restaurant IPC] Silent KOT print completed successfully');
            resolve({ success: true });
          }
        }
      );
    });
  } catch (err) {
    if (printWin && !printWin.isDestroyed()) printWin.close();
    console.error('[Restaurant IPC] KOT Print exception:', err);
    return { success: false, error: err?.message || 'Print execution failed' };
  }
});

// 3. IPC: KDS Kitchen Alert Chime
ipcMain.handle('play-kds-alert', async () => {
  console.log('[KDS Alert] New Kitchen Order incoming notification...');
  return { success: true };
});

// 4. App Info & Window Controls
ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('window-toggle-fullscreen', () => {
  if (mainWindow) {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
    return mainWindow.isFullScreen();
  }
  return false;
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

ipcMain.handle('window-close', () => {
  if (mainWindow) mainWindow.close();
});

// ─── APP LIFECYCLE ──────────────────────────────────────────────────────────
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
