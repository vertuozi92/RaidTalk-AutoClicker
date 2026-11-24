const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('raidtalk', {
  loadSettings:()=>ipcRenderer.invoke('load-settings'),
  exportSettings:()=>ipcRenderer.invoke('backup:export'),
  importSettings:()=>ipcRenderer.invoke('backup:import'),
  saveSettings:(i,s)=>ipcRenderer.invoke('save-settings',i,s),
  startClicker:(id,i)=>ipcRenderer.invoke('start-clicker',id,i),
  stopClicker:id=>ipcRenderer.invoke('stop-clicker',id),
  testClick:(id,i)=>ipcRenderer.invoke('test-click',id,i),
  startAll:items=>ipcRenderer.invoke('start-all',items),
  stopAll:()=>ipcRenderer.invoke('stop-all'),
  onClickerState:cb=>ipcRenderer.on('clicker-state',(_e,s)=>cb(s)),
  onPointPicked:cb=>ipcRenderer.on('point-picked',(_e,s)=>cb(s)),
  checkForUpdates:()=>ipcRenderer.invoke('updater:check'),
  installUpdate:()=>ipcRenderer.invoke('updater:install'),
  onUpdaterStatus:cb=>ipcRenderer.on('updater:status',(_e,s)=>cb(s)),
  onAuthCallback:cb=>ipcRenderer.on('auth:callback',(_e,url)=>cb(url))
});
