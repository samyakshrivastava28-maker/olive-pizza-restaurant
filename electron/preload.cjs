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
  close: () => ipcRenderer.invoke('window-close'),
  showNativeNotification: (opts) => ipcRenderer.invoke('show-native-notification', opts)
});

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  showNativeNotification: (opts) => ipcRenderer.invoke('show-native-notification', opts)
});
