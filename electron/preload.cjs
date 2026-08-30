const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('restaurantDesktop', {
  isDesktopManager: true,
  printKitchenTicket: (htmlContent, printerName) => ipcRenderer.invoke('print-kitchen-ticket', { htmlContent, printerName }),
  playKdsAlert: () => ipcRenderer.invoke('play-kds-alert')
});
