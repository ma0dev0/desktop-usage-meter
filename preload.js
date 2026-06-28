// レンダラ(メーター窓)へ安全に API を公開する。

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  onUpdate: cb => ipcRenderer.on('update', (e, data) => cb(data)),
  getState: () => ipcRenderer.invoke('getState'),
  refresh: () => ipcRenderer.invoke('refresh'),
  openLogin: id => ipcRenderer.send('openLogin', id),
  hide: () => ipcRenderer.send('hideMeter'),
  resizeMeter: height => ipcRenderer.send('resizeMeter', height),
  setTheme: theme => ipcRenderer.send('setTheme', theme),
  setWeeklyPaceMode: mode => ipcRenderer.send('setWeeklyPaceMode', mode)
});
