const { app, BrowserWindow, ipcMain, webContents, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { autoUpdater } = require('electron-updater');

// Deep link used for email confirmation from Supabase.
const AUTH_PROTOCOL = 'albedo-raidtalk';
let pendingAuthUrl = null;
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) app.quit();
function findAuthUrl(args) {
  return (args || []).find(value => typeof value === 'string' && value.startsWith(AUTH_PROTOCOL + '://')) || null;
}
function deliverAuthUrl(rawUrl) {
  if (!rawUrl || !rawUrl.startsWith(AUTH_PROTOCOL + '://')) return;
  pendingAuthUrl = rawUrl;
  if (win && !win.isDestroyed() && win.webContents.isLoading() === false) {
    win.webContents.send('auth:callback', rawUrl);
    pendingAuthUrl = null;
  } else if (win && !win.isDestroyed()) {
    win.webContents.once('did-finish-load', () => {
      if (pendingAuthUrl) {
        win.webContents.send('auth:callback', pendingAuthUrl);
        pendingAuthUrl = null;
      }
    });
  }
}
if (gotSingleInstanceLock) {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(AUTH_PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(AUTH_PROTOCOL);
  }
  app.on('second-instance', (_event, commandLine) => {
    deliverAuthUrl(findAuthUrl(commandLine));
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.on('open-url', (event, url) => {
    event.preventDefault();
    deliverAuthUrl(url);
  });
}


const START_URL = 'https://app.raidtalk.ru';
const TAB_COUNT = 20;
const MIN_INTERVAL_MS = 250;
let win;
let updateCheckInProgress = false;
const clickers = new Map();
const tabSettings = Array.from({length:TAB_COUNT}, () => ({x:500,y:400,interval:5000}));

function isRaidTalk(raw) {
  try { return new URL(raw).hostname === 'app.raidtalk.ru' && new URL(raw).protocol === 'https:'; }
  catch { return false; }
}
function settingsFile(){ return path.join(app.getPath('userData'),'tab-settings.json'); }
function loadSettings(){
  try {
    const data=JSON.parse(fs.readFileSync(settingsFile(),'utf8'));
    for(let i=0;i<TAB_COUNT;i++){
      const s=data[i]||{};
      tabSettings[i]={x:Number.isFinite(s.x)?s.x:500,y:Number.isFinite(s.y)?s.y:400,interval:Number.isFinite(s.interval)?s.interval:5000};
    }
  } catch {}
}
function saveSettings(){
  try { fs.mkdirSync(app.getPath('userData'),{recursive:true}); fs.writeFileSync(settingsFile(),JSON.stringify(tabSettings,null,2)); }
  catch(e){ console.error('Settings save failed',e); }
}
function sendToUI(channel,payload){
  if(win && !win.isDestroyed()) win.webContents.send(channel,payload);
}
function getWC(id){
  const wc=webContents.fromId(Number(id));
  if(!wc || wc.isDestroyed()) return null;
  return wc;
}
function stop(id){
  const timer=clickers.get(Number(id));
  if(timer) clearInterval(timer);
  clickers.delete(Number(id));
}
function clickAt(wc,x,y){
  if(!wc || wc.isDestroyed()) return;
  // A visible yellow flash is injected at the same page coordinates before the trusted native click.
  wc.executeJavaScript(`(()=>{let old=document.getElementById('__rt_click_flash');if(old)old.remove();const d=document.createElement('div');d.id='__rt_click_flash';d.style.cssText='position:fixed;z-index:2147483646;pointer-events:none;left:${Math.round(x)}px;top:${Math.round(y)}px;width:30px;height:30px;border:3px solid #ffd400;border-radius:50%;transform:translate(-50%,-50%);background:rgba(255,212,0,.22);box-shadow:0 0 14px 5px rgba(255,212,0,.75);animation:__rtFlash .42s ease-out forwards;';let st=document.getElementById('__rt_flash_style');if(!st){st=document.createElement('style');st.id='__rt_flash_style';st.textContent='@keyframes __rtFlash{0%{opacity:1;transform:translate(-50%,-50%) scale(.65)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.8)}}';document.documentElement.appendChild(st)}document.documentElement.appendChild(d);setTimeout(()=>d.remove(),450)})()`).catch(()=>{});
  // Do not focus a hidden guest tab or steal focus from the user's selected tab.
  // Route the native input directly to this guest WebContents.
  wc.sendInputEvent({type:'mouseMove',x,y});
  wc.sendInputEvent({type:'mouseDown',x,y,button:'left',clickCount:1});
  wc.sendInputEvent({type:'mouseUp',x,y,button:'left',clickCount:1});
}
// Prevent Chromium from throttling hidden guest pages when another tab is selected
// or the application window is minimized. The click timers themselves run in main.
app.on('web-contents-created', (_event, contents) => {
  try { contents.setBackgroundThrottling(false); } catch(e) {}
  contents.on('did-attach-webview', (_event, guestContents) => {
    try { guestContents.setBackgroundThrottling(false); } catch(e) {}
  });
});

function configureAutoUpdater(){
  // Updates are served from the dedicated GitHub Releases repository.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.on('checking-for-update',()=>sendToUI('updater:status',{state:'checking',message:'Проверяю обновления…'}));
  autoUpdater.on('update-available',info=>sendToUI('updater:status',{state:'available',version:info.version,message:`Найдена версия ${info.version}. Скачиваю…`}));
  autoUpdater.on('update-not-available',info=>sendToUI('updater:status',{state:'current',version:info.version,message:'Установлена последняя версия'}));
  autoUpdater.on('download-progress',p=>sendToUI('updater:status',{state:'downloading',percent:Math.round(p.percent),message:`Скачивание обновления: ${Math.round(p.percent)}%`}));
  autoUpdater.on('update-downloaded',info=>sendToUI('updater:status',{state:'downloaded',version:info.version,message:`Версия ${info.version} готова к установке`}));
  autoUpdater.on('error',err=>sendToUI('updater:status',{state:'error',message:`Ошибка обновления: ${err.message}`}));
}
function createWindow(){
  loadSettings();
  win = new BrowserWindow({
    width:1500,height:950,minWidth:1100,minHeight:720,
    backgroundColor:'#10131b',title:'RaidTalk AutoClicker',
    webPreferences:{
      preload:path.join(__dirname,'preload.js'),
      contextIsolation:true,nodeIntegration:false,sandbox:true,
      webviewTag:true,
      backgroundThrottling:false
    }
  });
  win.loadFile(path.join(__dirname,'index.html'));
  win.webContents.on('did-finish-load', () => {
    const launchUrl = findAuthUrl(process.argv);
    if (pendingAuthUrl || launchUrl) deliverAuthUrl(pendingAuthUrl || launchUrl);
  });
  win.on('closed',()=>{ for(const id of [...clickers.keys()]) stop(id); win=null; });
}
ipcMain.handle('open-external',async(_event,rawUrl)=>{
  try{
    const url=new URL(String(rawUrl));
    if(url.protocol!=='https:'||url.hostname!=='yookassa.ru'&&!url.hostname.endsWith('.yookassa.ru'))
      return {ok:false,error:'Разрешено открывать только страницы ЮKassa.'};
    await shell.openExternal(url.toString());
    return {ok:true};
  }catch(e){return {ok:false,error:e.message};}
});
ipcMain.handle('updater:check',async()=>{
  if(!app.isPackaged)return {ok:false,message:'Проверка обновлений доступна в установленной версии программы.'};
  if(updateCheckInProgress)return {ok:false,message:'Проверка уже выполняется.'};
  updateCheckInProgress=true;
  try{await autoUpdater.checkForUpdates();return {ok:true};}
  catch(e){sendToUI('updater:status',{state:'error',message:`Не удалось проверить обновления: ${e.message}`});return {ok:false,message:e.message};}
  finally{updateCheckInProgress=false;}
});
ipcMain.handle('updater:install',()=>{if(!app.isPackaged)return {ok:false};autoUpdater.quitAndInstall();return {ok:true};});
ipcMain.handle('backup:export',async()=>{
  const payload={format:'raidtalk-autoclicker-settings',version:1,exportedAt:new Date().toISOString(),tabs:tabSettings};
  const result=await dialog.showSaveDialog(win,{title:'Резервная копия настроек',defaultPath:'RaidTalk-AutoClicker-settings.json',filters:[{name:'JSON',extensions:['json']}]});
  if(result.canceled||!result.filePath)return {ok:false,canceled:true};
  try{fs.writeFileSync(result.filePath,JSON.stringify(payload,null,2),'utf8');return {ok:true,filePath:result.filePath};}
  catch(e){return {ok:false,error:e.message};}
});
ipcMain.handle('backup:import',async()=>{
  const result=await dialog.showOpenDialog(win,{title:'Восстановить настройки',properties:['openFile'],filters:[{name:'JSON',extensions:['json']}]});
  if(result.canceled||!result.filePaths?.[0])return {ok:false,canceled:true};
  try{
    const payload=JSON.parse(fs.readFileSync(result.filePaths[0],'utf8'));
    if(payload.format!=='raidtalk-autoclicker-settings'||payload.version!==1||!Array.isArray(payload.tabs)||payload.tabs.length!==TAB_COUNT)
      return {ok:false,error:'Файл не является резервной копией настроек RaidTalk AutoClicker.'};
    for(let i=0;i<TAB_COUNT;i++){
      const s=payload.tabs[i]||{};
      if(!Number.isFinite(s.x)||!Number.isFinite(s.y)||!Number.isFinite(s.interval))
        return {ok:false,error:'В резервной копии обнаружены некорректные настройки.'};
      tabSettings[i]={x:Math.max(0,Math.min(10000,Math.round(s.x))),y:Math.max(0,Math.min(10000,Math.round(s.y))),interval:Math.max(MIN_INTERVAL_MS,Math.min(3600000,Math.round(s.interval)))};
    }
    saveSettings();
    return {ok:true,settings:tabSettings};
  }catch(e){return {ok:false,error:e.message};}
});
ipcMain.handle('load-settings',()=>tabSettings);
ipcMain.handle('save-settings',(_e,index,settings)=>{
  const i=Number(index); if(!Number.isInteger(i)||i<0||i>=TAB_COUNT) return {ok:false};
  tabSettings[i]={
    x:Math.max(0,Math.min(10000,Math.round(Number(settings.x)||0))),
    y:Math.max(0,Math.min(10000,Math.round(Number(settings.y)||0))),
    interval:Math.max(MIN_INTERVAL_MS,Math.min(3600000,Math.round(Number(settings.interval)||5000)))
  };
  saveSettings(); return {ok:true};
});
ipcMain.handle('start-clicker',(_e,id,index)=>{
  const wc=getWC(id), i=Number(index);
  if(!wc || !Number.isInteger(i)||i<0||i>=TAB_COUNT) return {ok:false,error:'Вкладка ещё загружается.'};
  if(!isRaidTalk(wc.getURL())) return {ok:false,error:'Автокликер работает только на app.raidtalk.ru.'};
  stop(id);
  const s=tabSettings[i];
  const timer=setInterval(()=>{
    const current=getWC(id);
    if(!current || !isRaidTalk(current.getURL())) return stop(id);
    clickAt(current,s.x,s.y);
  },s.interval);
  clickers.set(Number(id),timer);
  sendToUI('clicker-state',{id:Number(id),running:true});
  return {ok:true};
});
ipcMain.handle('stop-clicker',(_e,id)=>{
  stop(id); sendToUI('clicker-state',{id:Number(id),running:false}); return {ok:true};
});
ipcMain.handle('test-click',(_e,id,index)=>{
  const wc=getWC(id), i=Number(index);
  if(!wc||!isRaidTalk(wc.getURL())) return {ok:false,error:'Откройте RaidTalk в выбранной вкладке.'};
  const s=tabSettings[i]; clickAt(wc,s.x,s.y); return {ok:true};
});
ipcMain.handle('start-all',(_e,items)=>{
  let started=0;
  for(const item of items||[]){
    const wc=getWC(item.id),i=Number(item.index);
    if(!wc||!isRaidTalk(wc.getURL())||!Number.isInteger(i)||i<0||i>=TAB_COUNT) continue;
    stop(item.id);
    const s=tabSettings[i];
    const timer=setInterval(()=>{
      const current=getWC(item.id);
      if(!current||!isRaidTalk(current.getURL())) return stop(item.id);
      clickAt(current,s.x,s.y);
    },s.interval);
    clickers.set(Number(item.id),timer);
    sendToUI('clicker-state',{id:Number(item.id),running:true}); started++;
  }
  return {ok:true,started};
});
ipcMain.handle('stop-all',()=>{
  for(const id of [...clickers.keys()]){stop(id);sendToUI('clicker-state',{id,running:false});}
  return {ok:true};
});
app.whenReady().then(()=>{if (!gotSingleInstanceLock) return; configureAutoUpdater();createWindow();if(app.isPackaged){setTimeout(()=>autoUpdater.checkForUpdates().catch(()=>{}),10000);setInterval(()=>autoUpdater.checkForUpdates().catch(()=>{}),6*60*60*1000);}});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.on('before-quit',()=>{for(const id of [...clickers.keys()])stop(id);});
