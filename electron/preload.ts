import { contextBridge, ipcRenderer } from 'electron';

declare global {
  interface Window {
    electron: {
      isElectronEnvironment: boolean;
      openExternal: (url: string) => void;
    };
  }
}

contextBridge.exposeInMainWorld('electron', {
  isElectronEnvironment: true,
  openExternal: (url: string) => ipcRenderer.invoke('open-external-link', url),
});
