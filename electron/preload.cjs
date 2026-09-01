const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('restaurantDesktop', {
  isDesktopManager: true,
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printKitchenTicket: (htmlContent, printerName) => ipcRenderer.invoke('print-kitchen-ticket', { htmlContent, printerName }),
  playKdsAlert: () => ipcRenderer.invoke('play-kds-alert'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  toggleFullscreen: () => ipcRenderer.invoke('window-toggle-fullscreen'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  close: () => ipcRenderer.invoke('window-close')
});
