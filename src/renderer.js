const COUNT=20, START='https://app.raidtalk.ru';
const SB=window.ALBEDO_SUPABASE;
const SESSION_KEY='albedo-auth-session-v1';
const AUTH_REDIRECT='albedo-raidtalk://auth/callback';
let licenseSession=null;
let currentLicense=null;
function authMessage(message){
  const el=$('auth-message');if(!el)return;
  const raw=String(message||'');
  el.textContent=/email rate limit exceeded/i.test(raw)
    ? 'Не удалось отправить письмо. Попробуйте ещё раз через час.'
    : raw;
}
async function sbRequest(path,options={}){
  const response=await fetch(SB.url+path,{...options,headers:{
    apikey:SB.publishableKey,'Content-Type':'application/json',
    ...(options.headers||{})
  }});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.msg||data.message||data.error_description||data.error||'Ошибка запроса Supabase');
  return data;
}
function saveSession(session){licenseSession=session;localStorage.setItem(SESSION_KEY,JSON.stringify(session));}
async function refreshSession(){
  const raw=localStorage.getItem(SESSION_KEY);if(!raw)return null;
  try{
    const old=JSON.parse(raw);
    if(old.expires_at && old.expires_at*1000>Date.now()+60000)return old;
    if(!old.refresh_token)return null;
    const fresh=await sbRequest('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:old.refresh_token})});
    fresh.expires_at=Math.floor(Date.now()/1000)+(fresh.expires_in||3600);saveSession(fresh);return fresh;
  }catch(e){localStorage.removeItem(SESSION_KEY);return null;}
}
async function verifyLicense(session){
  const result=await fetch(SB.url+'/functions/v1/'+SB.licenseFunction,{
    method:'POST',
    headers:{apikey:SB.publishableKey,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},
    body:JSON.stringify({})
  });
  const data=await result.json().catch(()=>({}));
  if(!result.ok)throw new Error(data.error||data.message||'Не удалось проверить лицензию');
  return data;
}
function showLicenseFailure(data){
  document.body.classList.add('auth-locked');
  $('auth-intro').textContent='Аккаунт: '+(licenseSession?.user?.email||'');
  $('auth-message').textContent=data.message||'Лицензия не активна. Оформите подписку.';
  $('auth-login').style.display='none';$('auth-signup').style.display='none';
  $('auth-logout').style.display='block';
  $('auth-logout').onclick=()=>{localStorage.removeItem(SESSION_KEY);licenseSession=null;location.reload();};
}

function handleAuthCallback(rawUrl){
  try{
    const parsed=new URL(rawUrl);
    const params=new URLSearchParams(parsed.hash.replace(/^#/,'') || parsed.search.replace(/^\?/,''));
    const errorCode=params.get('error_code'),errorDescription=params.get('error_description');
    if(errorCode||params.get('error')){
      if(errorCode==='otp_expired')authMessage('Ссылка подтверждения устарела или уже использована. Нажмите «Отправить письмо повторно» и откройте самое новое письмо.');
      else authMessage('Не удалось подтвердить почту: '+(errorDescription||params.get('error')||'неизвестная ошибка').replace(/\+/g,' '));
      return;
    }
    const access_token=params.get('access_token'),refresh_token=params.get('refresh_token');
    if(!access_token){authMessage('Ссылка открыта, но Supabase не передал токен подтверждения. Запросите новое письмо.');return;}
    const session={access_token,refresh_token,token_type:params.get('token_type')||'bearer',expires_in:Number(params.get('expires_in')||3600),expires_at:Math.floor(Date.now()/1000)+Number(params.get('expires_in')||3600),user:null};
    saveSession(session);
    authMessage('Почта подтверждена! Проверяем лицензию…');
    finishLicenseLogin(session).catch(e=>authMessage('Почта подтверждена, но проверка лицензии не прошла: '+e.message));
  }catch(e){authMessage('Не удалось обработать ссылку подтверждения: '+e.message);}
}

async function initializeLicense(){
  $('auth-login').onclick=async()=>{
    const email=$('auth-email').value.trim(),password=$('auth-password').value;
    if(!email||!password){authMessage('Введите Email и пароль.');return;}
    try{
      authMessage('Выполняется вход…');
      const session=await sbRequest('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})});
      session.expires_at=Math.floor(Date.now()/1000)+(session.expires_in||3600);saveSession(session);
      await finishLicenseLogin(session);
    }catch(e){authMessage(e.message);}
  };
  $('auth-signup').onclick=async()=>{
    const email=$('auth-email').value.trim(),password=$('auth-password').value;
    if(!email||password.length<8){authMessage('Введите Email и пароль не короче 8 символов.');return;}
    try{
      authMessage('Создаём аккаунт…');
      const data=await sbRequest('/auth/v1/signup?redirect_to='+encodeURIComponent(AUTH_REDIRECT),{method:'POST',body:JSON.stringify({email,password})});
      if(data.access_token){
        data.expires_at=Math.floor(Date.now()/1000)+(data.expires_in||3600);saveSession(data);
        await finishLicenseLogin(data);
      }else authMessage('Аккаунт создан. Откройте письмо и нажмите «Подтвердить почту». Программа откроется автоматически. Если письмо не пришло, проверьте папку «Спам».');
    }catch(e){authMessage(e.message);}
  };
  $('auth-resend').onclick=async()=>{
    const email=$('auth-email').value.trim();
    if(!email){authMessage('Сначала укажите электронную почту.');return;}
    try{authMessage('Отправляем новое письмо…');await sbRequest('/auth/v1/resend?redirect_to='+encodeURIComponent(AUTH_REDIRECT),{method:'POST',body:JSON.stringify({type:'signup',email})});authMessage('Новое письмо отправлено. Используйте только последнее письмо.');}
    catch(e){authMessage('Не удалось отправить письмо: '+e.message);}
  };
  window.raidtalk.onAuthCallback(handleAuthCallback);
  const session=await refreshSession();
  if(session){try{await finishLicenseLogin(session);}catch(e){authMessage(e.message);}}
}
async function finishLicenseLogin(session){
  licenseSession=session;
  authMessage('Проверяем лицензию…');
  const license=await verifyLicense(session);
  currentLicense=license;
  if(!license.valid){showLicenseFailure(license);return;}
  document.body.classList.remove('auth-locked');
  $('auth-gate').style.display='none';
  $('status').textContent=license.status==='trial'
    ? 'ALBEDO: пробный период · осталось дней: '+(license.days_remaining??'—')
    : 'ALBEDO: подписка активна до '+new Date(license.expires_at).toLocaleDateString('ru-RU');
  await startApplication();
}

const $=id=>document.getElementById(id);

// Subscription and license window (display-only until payments are connected).
function openLicenseWindow(){
  const modal=$('license-modal');
  if(!modal)return;
  const status=$('license-status');
  if(!licenseSession){
    status.textContent='Войдите в аккаунт, чтобы посмотреть состояние лицензии.';
  }else if(currentLicense?.status==='trial'){
    status.textContent='Статус: пробный период · осталось дней: '+(currentLicense.days_remaining??'—');
  }else if(currentLicense?.valid){
    status.textContent='Статус: подписка активна'+(currentLicense.expires_at?' до '+new Date(currentLicense.expires_at).toLocaleDateString('ru-RU'):'');
  }else{
    status.textContent='Статус лицензии пока не подтверждён.';
  }
  modal.style.display='flex';
}
$('license-open-auth').onclick=openLicenseWindow;
$('license-open-app').onclick=openLicenseWindow;
$('license-close').onclick=()=>{$('license-modal').style.display='none';};
$('license-modal').addEventListener('click',e=>{if(e.target===$('license-modal'))$('license-modal').style.display='none';});
const PAYMENT_FUNCTION='create-payment';
function paymentMessage(message){
  const el=$('payment-message');
  if(el)el.textContent=message;
}
async function startSubscriptionPayment(planCode,button){
  if(!licenseSession?.access_token){
    paymentMessage('Сначала войдите в аккаунт.');
    return;
  }
  const oldText=button?.textContent;
  if(button){button.disabled=true;button.textContent='Создаём платёж…';}
  paymentMessage('Обращаемся к тестовой ЮKassa…');
  try{
    const response=await fetch(SB.url+'/functions/v1/'+PAYMENT_FUNCTION,{
      method:'POST',
      headers:{
        apikey:SB.publishableKey,
        Authorization:'Bearer '+licenseSession.access_token,
        'Content-Type':'application/json'
      },
      body:JSON.stringify({plan_code:planCode})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Не удалось создать платёж');
    if(!data.payment_url)throw new Error('ЮKassa не вернула ссылку на оплату');
    paymentMessage('Платёж создан. Открываю страницу оплаты в браузере…');
    const opened=await window.raidtalk.openExternal(data.payment_url);
    if(!opened?.ok)throw new Error(opened?.error||'Не удалось открыть браузер с оплатой.');
    paymentMessage('Страница оплаты открыта в браузере. Завершите покупку и вернитесь сюда для проверки лицензии.');
  }catch(error){
    paymentMessage('Ошибка оплаты: '+error.message);
  }finally{
    if(button){button.disabled=false;button.textContent=oldText;}
  }
}
document.querySelectorAll('.license-buy').forEach(button=>{
  button.addEventListener('click',()=>startSubscriptionPayment(button.dataset.plan,button));
});
$('license-refresh').onclick=async()=>{
  if(!licenseSession){paymentMessage('Сначала войдите в аккаунт.');return;}
  const button=$('license-refresh');button.disabled=true;
  paymentMessage('Проверяем статус лицензии…');
  try{
    const fresh=await refreshSession();
    if(!fresh)throw new Error('Сессия истекла. Войдите снова.');
    licenseSession=fresh;
    const license=await verifyLicense(fresh);
    currentLicense=license;
    $('license-status').textContent=license.status==='trial'
      ? 'Статус: пробный период · осталось дней: '+(license.days_remaining??'—')
      : license.valid
        ? 'Статус: подписка активна'+(license.expires_at?' до '+new Date(license.expires_at).toLocaleDateString('ru-RU'):'')
        : (license.message||'Лицензия пока не активна.');
    if(license.valid)paymentMessage('Лицензия обновлена.');
    else paymentMessage('Оплата ещё не подтверждена. Подождите немного и проверьте снова.');
  }catch(error){paymentMessage('Не удалось проверить лицензию: '+error.message);}
  finally{button.disabled=false;}
};


let selected=0, tabs=[], settings=[], readyCount=0;
let effectsDisabled = localStorage.getItem('raidtalk-effects-disabled') !== 'false';
let darkThemeEnabled = localStorage.getItem('raidtalk-dark-theme') !== 'false';
let autoRejoinEnabled = localStorage.getItem('raidtalk-auto-rejoin') !== 'false';
const recoveryPending = Array(COUNT).fill(false);
const recoveryLastAttempt = Array(COUNT).fill(0);
const EFFECTS_CSS = `
*, *::before, *::after {
  animation: none !important;
  animation-delay: 0s !important;
  animation-duration: 0s !important;
  transition: none !important;
  transition-duration: 0s !important;
  scroll-behavior: auto !important;
  box-shadow: none !important;
  text-shadow: none !important;
  filter: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  caret-color: auto !important;
}
html { scroll-behavior: auto !important; }
`;
const DARK_THEME_CSS = `
/* Максимально принудительная тёмная палитра для всех DOM-элементов */
:root, html, body {
  color-scheme: dark !important;
  background: #11151d !important;
  background-color: #11151d !important;
  color: #e7eaf0 !important;
}
html, body, body * , body *::before, body *::after {
  background-color: #191f2a !important;
  border-color: #343d4c !important;
  color: #e7eaf0 !important;
  box-shadow: none !important;
  text-shadow: none !important;
}
html, body { background-color: #11151d !important; }
body, #root, #app, #__next, #main, #content, main,
[role="main"], [class*="page"], [class*="layout"], [class*="background"] {
  background-color: #11151d !important;
}
/* Панели, карточки, строки, боковые и верхние полосы */
div, section, article, aside, nav, header, footer, main,
ul, ol, li, table, thead, tbody, tfoot, tr, td, th,
[class], [id], [role] {
  border-color: #343d4c !important;
}
button, [role="button"], input[type="button"], input[type="submit"] {
  background-color: #293447 !important;
  color: #f2f5fa !important;
  border: 1px solid #46536a !important;
}
input, textarea, select, option {
  background: #101620 !important;
  background-color: #101620 !important;
  color: #f0f3f8 !important;
  border: 1px solid #46536a !important;
  accent-color: #7da9e8 !important;
}
a, a * { color: #9fc4ff !important; }
[aria-selected="true"], [data-state="active"], .active, .selected,
[aria-current="page"] {
  background-color: #304665 !important;
  color: #ffffff !important;
}
/* Не перекрашиваем содержимое изображений и видео */
img, picture, video, canvas, iframe, embed, object {
  background-color: transparent !important;
}
svg, svg *, [class*="icon"], [class*="Icon"] {
  border-color: #465064 !important;
}
/* Скроллбары тоже тёмные */
* { scrollbar-color: #465064 #171c25 !important; scrollbar-width: thin !important; }
::-webkit-scrollbar { background: #171c25 !important; width: 11px !important; height: 11px !important; }
::-webkit-scrollbar-thumb { background: #465064 !important; border: 2px solid #171c25 !important; border-radius: 8px !important; }
::-webkit-scrollbar-corner { background: #171c25 !important; }
::selection { background: #385b86 !important; color: #ffffff !important; }
`;
const effectKeys = new Map();
const darkThemeKeys = new Map();
async function applyDarkTheme(view) {
  if (!darkThemeEnabled || !view || !view.getWebContentsId()) return;
  try {
    const id = view.getWebContentsId();
    const oldKey = darkThemeKeys.get(id);
    if (oldKey) { try { await view.removeInsertedCSS(oldKey); } catch(e) {} }
    const key = await view.insertCSS(DARK_THEME_CSS, {cssOrigin:'user'});
    darkThemeKeys.set(id, key);
  } catch(e) {}
}
async function removeDarkTheme(view) {
  const id = view.getWebContentsId();
  const key = darkThemeKeys.get(id);
  if (key) {
    try { await view.removeInsertedCSS(key); } catch(e) {}
    darkThemeKeys.delete(id);
  }
}
function updateDarkThemeButton() {
  $('darkTheme').textContent = darkThemeEnabled ? 'Тёмная тема: ВКЛ' : 'Тёмная тема: ВЫКЛ';
  $('darkTheme').classList.toggle('gold', darkThemeEnabled);
  $('darkTheme').classList.toggle('green', !darkThemeEnabled);
}
async function applyEffects(view) {
  if (!effectsDisabled || !view || !view.getWebContentsId()) return;
  try {
    const key = await view.insertCSS(EFFECTS_CSS, {cssOrigin:'user'});
    effectKeys.set(view.getWebContentsId(), key);
  } catch(e) {}
}
async function removeEffects(view) {
  const id = view.getWebContentsId();
  const key = effectKeys.get(id);
  if (key) {
    try { await view.removeInsertedCSS(key); } catch(e) {}
    effectKeys.delete(id);
  }
}
function updateEffectsButton() {
  $('effects').textContent = effectsDisabled ? 'Эффекты: ВЫКЛ' : 'Эффекты: ВКЛ';
  $('effects').classList.toggle('gold', effectsDisabled);
  $('effects').classList.toggle('green', !effectsDisabled);
}
const tabBar=$('tabs'), area=$('browser-area');

const RECOVERY_MONITOR_JS = `(()=>{
  if(window.__rtRecoveryMonitorInstalled)return true;
  window.__rtRecoveryMonitorInstalled=true;
  const emit=(kind)=>{
    const old=document.title;
    window.__rtRecoveryOldTitle=old;
    document.title='__RAIDTALK_RECOVERY__:'+kind;
  };
  window.addEventListener('offline',()=>emit('offline'));
  window.addEventListener('online',()=>emit('online'));
  return true;
})()`;

const GROUP_RECOVERY_JS = `(()=>{
  const norm=s=>(s||'').replace(/\\s+/g,' ').trim().toLowerCase();
  const body=norm(document.body?.innerText||'');
  if(/техническ(ие|их) работы|идут работы|сервис временно недоступен|временно недоступен|maintenance|service unavailable|temporarily unavailable|connection timed out/.test(body))
    return {state:'maintenance'};
  const visible=el=>{
    const r=el.getBoundingClientRect(), st=getComputedStyle(el);
    return r.width>0&&r.height>0&&st.visibility!=='hidden'&&st.display!=='none';
  };
  const clickables=el=>[el,...el.querySelectorAll('a,button,[role="button"],[tabindex]')].filter(x=>
    visible(x)&&(x.matches('a,button,[role="button"],[tabindex]')||x.onclick)
  );
  const nodes=[...document.querySelectorAll('a,button,div,span,h1,h2,h3,h4,p,li')].filter(visible);
  let groupNode=null, groupBox=null;
  for(const el of nodes){
    const t=norm(el.innerText||el.textContent);
    if(!t||t.length>500)continue;
    const hasName=t.includes('клуб raidtalk');
    const hasId=/(^|\\D)777(\\D|$)/.test(t);
    if(!(hasName&&(hasId||t==='клуб raidtalk')))continue;
    let p=el;
    for(let depth=0;depth<5&&p;depth++,p=p.parentElement){
      const pt=norm(p.innerText||p.textContent);
      if(pt.includes('клуб raidtalk')&&(/(^|\\D)777(\\D|$)/.test(pt)||pt.length<180)){
        groupNode=el;groupBox=p;break;
      }
    }
    if(groupBox)break;
  }
  if(!groupBox)return {state:'notfound'};
  const candidates=clickables(groupBox);
  const safe=/^(войти|открыть|перейти|продолжить|вернуться|enter|open|go to|resume)$/i;
  for(const el of candidates){
    const label=(el.getAttribute('aria-label')||el.getAttribute('title')||el.innerText||el.textContent||'').trim();
    if(safe.test(label)){
      el.click();
      return {state:'clicked'};
    }
  }
  if(groupNode && groupNode.closest('a')){
    const a=groupNode.closest('a');
    const label=norm(a.innerText||a.getAttribute('aria-label')||'');
    if(!/вступить|присоединиться|подать заявку|join|request/.test(label)){
      a.click();
      return {state:'clicked'};
    }
  }
  return {state:'found-no-enter'};
})()`;

function updateAutoRejoinButton(){
  const b=$('autoRejoin');
  b.textContent=autoRejoinEnabled?'Автовозврат: ВКЛ':'Автовозврат: ВЫКЛ';
  b.classList.toggle('gold',autoRejoinEnabled);
  b.classList.toggle('green',!autoRejoinEnabled);
}
function markRecovery(i, reason){
  if(!autoRejoinEnabled)return;
  recoveryPending[i]=true;
  recoveryLastAttempt[i]=0;
  $('status').textContent=`Вкладка ${i+1}: обнаружен сбой (${reason}), восстановление группы «Клуб RaidTalk» 777 ожидается`;
}
async function inspectAndRecover(i){
  const view=tabs[i]?.view;
  if(!view||view.isLoading())return;
  const url=view.getURL()||'';
  if(!url.startsWith('https://app.raidtalk.ru')){
    if(recoveryPending[i]&&navigator.onLine&&Date.now()-recoveryLastAttempt[i]>20000){
      recoveryLastAttempt[i]=Date.now();
      try{view.reload();}catch(e){}
    }
    return;
  }
  try{
    const result=await view.executeJavaScript(GROUP_RECOVERY_JS);
    if(result?.state==='maintenance'){
      recoveryPending[i]=true;
      $('status').textContent=`Вкладка ${i+1}: RaidTalk на техническом обслуживании, повторная проверка выполняется автоматически`;
      if(Date.now()-recoveryLastAttempt[i]>45000&&navigator.onLine){
        recoveryLastAttempt[i]=Date.now();
        try{view.reload();}catch(e){}
      }
    }else if(recoveryPending[i]&&result?.state==='clicked'){
      recoveryPending[i]=false;
      $('status').textContent=`Вкладка ${i+1}: выполнен переход обратно в «Клуб RaidTalk» 777`;
    }else if(recoveryPending[i]&&result?.state==='found-no-enter'){
      recoveryPending[i]=false;
      $('status').textContent=`Вкладка ${i+1}: группа найдена, но кнопки входа нет. Автовход не выполнялся — проверьте доступ к группе`;
    }else if(recoveryPending[i]&&result?.state==='notfound'){
      $('status').textContent=`Вкладка ${i+1}: ожидаю появления группы «Клуб RaidTalk» 777 в меню…`;
    }
  }catch(e){}
}


function setUpdaterButton(state){
  const b=$('checkUpdates');
  if(!b)return;
  b.classList.toggle('checking',state==='checking'||state==='downloading');
  b.classList.toggle('ready',state==='downloaded');
  if(state==='downloaded'){b.textContent='⬇ Установить обновление';b.disabled=false;b.onclick=async()=>{await window.raidtalk.installUpdate();};return;}
  if(state==='checking'||state==='downloading'){b.textContent=state==='checking'?'⟳ Проверяю…':'⬇ Скачивание…';b.disabled=true;return;}
  b.disabled=false;b.onclick=checkUpdates;b.textContent=state==='current'?'✓ Обновлений нет':'⟳ Проверить обновления';
}
async function checkUpdates(){
  setUpdaterButton('checking');
  $('status').textContent='Проверяю наличие новой версии…';
  const result=await window.raidtalk.checkForUpdates();
  if(!result.ok){$('status').textContent=result.message||'Проверка обновлений недоступна';setUpdaterButton('idle');}
}

function makeTabs(){
  for(let i=0;i<COUNT;i++){
    const btn=document.createElement('div');
    btn.className='tab'+(i===0?' active':'');
    btn.textContent=`Вкладка ${i+1}`;
    btn.addEventListener('click',()=>selectTab(i));
    tabBar.appendChild(btn);
    const view=document.createElement('webview');
    view.setAttribute('partition',`persist:raidtalk-profile-${i+1}`);
    view.setAttribute('src',START);
    view.setAttribute('allowpopups','false');
    if(i!==0)view.classList.add('hidden');
    view.addEventListener('dom-ready',()=>{
      readyCount++;
      view.setAttribute('data-ready','1');
      if (effectsDisabled) applyEffects(view);
      if (darkThemeEnabled) applyDarkTheme(view);
      if (autoRejoinEnabled) {
        view.executeJavaScript(RECOVERY_MONITOR_JS).catch(()=>{});
        setTimeout(()=>inspectAndRecover(i), 1800);
      }
      $('status').textContent=`Загружено профилей: ${readyCount}/${COUNT}`;
    });
    view.addEventListener('did-finish-load',()=>{
      if(autoRejoinEnabled)setTimeout(()=>inspectAndRecover(i),500);
    });
    view.addEventListener('did-fail-load',e=>{
      if(e.errorCode!==-3){
        $('status').textContent=`Ошибка загрузки вкладки ${i+1}: ${e.errorDescription}`;
        if(autoRejoinEnabled && (e.validatedURL||view.getURL()||'').includes('raidtalk.ru'))
          markRecovery(i,e.errorDescription||'ошибка сети');
      }
    });
    view.addEventListener('page-title-updated',e=>{
      const recovery=/^__RAIDTALK_RECOVERY__:(offline|online)$/.exec(e.title||'');
      if(recovery){
        const restore=`if(window.__rtRecoveryOldTitle!==undefined){document.title=window.__rtRecoveryOldTitle;delete window.__rtRecoveryOldTitle}`;
        view.executeJavaScript(restore).catch(()=>{});
        if(recovery[1]==='offline')markRecovery(i,'интернет отключён');
        else if(autoRejoinEnabled){
          markRecovery(i,'интернет восстановлен');
          setTimeout(()=>{try{if(!view.isLoading())view.reload();}catch(e){}},2500);
        }
        return;
      }
      const m=/^__RAIDTALK_POINT__:(\d+),(\d+)$/.exec(e.title||'');
      if(m){
        settings[i].x=Number(m[1]);settings[i].y=Number(m[2]);
        window.raidtalk.saveSettings(i,settings[i]);
        if(i===selected){$('x').value=settings[i].x;$('y').value=settings[i].y;}
        $('status').textContent=`Вкладка ${i+1}: точка выбрана X=${m[1]}, Y=${m[2]}`;
        view.executeJavaScript(`if(window.__rtPickRestoreTitle!==undefined){document.title=window.__rtPickRestoreTitle;delete window.__rtPickRestoreTitle}`).catch(()=>{});
      }
    });
    view.addEventListener('new-window',e=>{if(e.url&&e.url.startsWith('https://'))view.loadURL(e.url);});
    area.appendChild(view);
    tabs.push({button:btn,view,running:false});
  }
}
function selectTab(i){
  selected=i;
  tabs.forEach((t,n)=>{
    t.view.classList.toggle('hidden',n!==i);
    t.button.classList.toggle('active',n===i);
  });
  $('url').value=tabs[i].view.getURL()||START;
  $('x').value=settings[i].x;$('y').value=settings[i].y;$('interval').value=settings[i].interval;
  updateStatus();
}
function updateStatus(){
  const t=tabs[selected];
  $('status').textContent=t.running?'Автокликер работает':'Вкладка '+(selected+1)+' · '+(t.view.getURL()||START);
  tabs.forEach((t,i)=>{t.button.classList.toggle('running',t.running);t.button.textContent=`${i+1}${t.running?' ●':''}`;});
}
async function saveCurrent(){
  settings[selected]={x:Number($('x').value)||0,y:Number($('y').value)||0,interval:Math.max(250,Number($('interval').value)||5000)};
  await window.raidtalk.saveSettings(selected,settings[selected]);
}
function activeWC(){return tabs[selected].view.getWebContentsId();}
$('checkUpdates').onclick=checkUpdates;
window.raidtalk.onUpdaterStatus(s=>{
  $('status').textContent=s.message||'Состояние обновления изменилось';
  setUpdaterButton(s.state);
});
$('autoRejoin').onclick=()=>{
  autoRejoinEnabled=!autoRejoinEnabled;
  localStorage.setItem('raidtalk-auto-rejoin',String(autoRejoinEnabled));
  if(!autoRejoinEnabled)recoveryPending.fill(false);
  updateAutoRejoinButton();
  $('status').textContent=autoRejoinEnabled?'Автовозврат после временных сбоев включён':'Автовозврат отключён';
  if(autoRejoinEnabled)tabs.forEach((t,i)=>t.view.executeJavaScript(RECOVERY_MONITOR_JS).catch(()=>{}));
};
$('darkTheme').onclick=async()=>{
  darkThemeEnabled=!darkThemeEnabled;
  localStorage.setItem('raidtalk-dark-theme', String(darkThemeEnabled));
  updateDarkThemeButton();
  for(const t of tabs){
    if(darkThemeEnabled) await applyDarkTheme(t.view);
    else await removeDarkTheme(t.view);
  }
  $('status').textContent=darkThemeEnabled?'Тёмная тема страницы включена':'Тёмная тема страницы отключена';
};
$('effects').onclick=async()=>{
  effectsDisabled=!effectsDisabled;
  localStorage.setItem('raidtalk-effects-disabled', String(effectsDisabled));
  updateEffectsButton();
  for(const t of tabs){
    if(effectsDisabled) await applyEffects(t.view);
    else await removeEffects(t.view);
  }
  $('status').textContent=effectsDisabled?'Эффекты страницы отключены':'Эффекты страницы включены';
};
$('reloadCurrent').onclick=()=>{
  const view=tabs[selected]?.view;
  if(!view)return;
  try{
    view.reload();
    $('status').textContent=`Обновляется вкладка ${selected+1}…`;
  }catch(e){
    $('status').textContent='Не удалось обновить выбранную вкладку';
  }
};
$('reloadAll').onclick=()=>{
  let count=0;
  for(const t of tabs){
    try{t.view.reload();count++;}
    catch(e){}
  }
  $('status').textContent=`Отправлена команда обновления: ${count}/${COUNT} вкладок`;
};
$('open').onclick=()=>{
  let u=$('url').value.trim();
  if(!/^https:\/\//i.test(u))u='https://'+u;
  try{const parsed=new URL(u);if(parsed.protocol!=='https:'){throw Error('Only HTTPS allowed');}tabs[selected].view.loadURL(parsed.href);}
  catch(e){alert('Введите корректную HTTPS-ссылку.');}
};
$('save').onclick=async()=>{await saveCurrent();$('status').textContent='Настройки вкладки сохранены';};
$('backupExport').onclick=async()=>{
  for(let i=0;i<COUNT;i++)await window.raidtalk.saveSettings(i,settings[i]);
  const result=await window.raidtalk.exportSettings();
  if(result.ok)$('status').textContent='Резервная копия 20 вкладок сохранена';
  else if(!result.canceled)alert('Не удалось сохранить резервную копию: '+(result.error||'неизвестная ошибка'));
};
$('backupImport').onclick=async()=>{
  const result=await window.raidtalk.importSettings();
  if(result.ok){
    settings=result.settings;
    selectTab(selected);
    $('status').textContent='Настройки всех 20 вкладок восстановлены';
    alert('Настройки всех 20 вкладок восстановлены. Перезапустите программу, если хотите применить их к уже открытым сеансам.');
  }else if(!result.canceled)alert('Не удалось восстановить настройки: '+(result.error||'неизвестная ошибка'));
};
$('pick').onclick=async()=>{
  const view=tabs[selected].view;
  if(!view.getURL().startsWith('https://app.raidtalk.ru')){alert('Выбор точки доступен на app.raidtalk.ru');return;}
  const script=`(()=>{
    if(window.__rtPickCleanup)window.__rtPickCleanup();
    window.__rtPickRestoreTitle=document.title;
    const oldCursor=document.documentElement.style.cursor;
    const overlay=document.createElement('div');
    overlay.id='__rt_pick_overlay';
    overlay.style.cssText='position:fixed;inset:0;z-index:2147483647;pointer-events:none;cursor:crosshair;';
    const ring=document.createElement('div');
    ring.style.cssText='position:absolute;left:50%;top:50%;width:38px;height:38px;border:2px solid #ff3434;border-radius:50%;transform:translate(-50%,-50%);box-shadow:0 0 0 1px #fff,0 0 14px #ff3030;';
    const h=document.createElement('div');h.style.cssText='position:absolute;left:50%;top:50%;width:58px;height:1px;background:#ff3434;transform:translate(-50%,-50%)';
    const v=document.createElement('div');v.style.cssText='position:absolute;left:50%;top:50%;width:1px;height:58px;background:#ff3434;transform:translate(-50%,-50%)';
    ring.append(h,v);overlay.append(ring);document.documentElement.append(overlay);document.documentElement.style.cursor='crosshair';
    const move=e=>{ring.style.left=e.clientX+'px';ring.style.top=e.clientY+'px';};
    const pick=e=>{e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();const x=Math.round(e.clientX),y=Math.round(e.clientY);cleanup();document.title='__RAIDTALK_POINT__:'+x+','+y;};
    const cleanup=()=>{document.removeEventListener('mousemove',move,true);document.removeEventListener('click',pick,true);overlay.remove();document.documentElement.style.cursor=oldCursor;delete window.__rtPickCleanup;};
    window.__rtPickCleanup=cleanup;document.addEventListener('mousemove',move,true);document.addEventListener('click',pick,true);
    return true;
  })()`;
  try{await view.executeJavaScript(script);$('status').textContent='Прицел включён — щёлкните по нужной точке на странице';}
  catch(e){alert('Не удалось включить прицел: '+e.message);}
};
$('test').onclick=async()=>{await saveCurrent();const r=await window.raidtalk.testClick(activeWC(),selected);if(!r.ok)alert(r.error);};
$('start').onclick=async()=>{
  await saveCurrent();
  const r=await window.raidtalk.startClicker(activeWC(),selected);
  if(!r.ok)alert(r.error);else{tabs[selected].running=true;updateStatus();}
};
$('stop').onclick=async()=>{await window.raidtalk.stopClicker(activeWC());tabs[selected].running=false;updateStatus();};
$('startAll').onclick=async()=>{
  for(let i=0;i<COUNT;i++)await window.raidtalk.saveSettings(i,settings[i]);
  const items=tabs.map((t,i)=>({id:t.view.getWebContentsId(),index:i}));
  const r=await window.raidtalk.startAll(items);
  tabs.forEach((t,i)=>{t.running=Boolean(t.view.getURL().startsWith('https://app.raidtalk.ru'));});
  updateStatus();$('status').textContent=`Запущено автокликеров: ${r.started}/${COUNT}`;
};
$('stopAll').onclick=async()=>{await window.raidtalk.stopAll();tabs.forEach(t=>t.running=false);updateStatus();};
window.raidtalk.onClickerState(s=>{
  const t=tabs.find(t=>t.view.getWebContentsId()===s.id);
  if(t){t.running=s.running;updateStatus();}
});
let appStarted=false;
async function startApplication(){
  if(appStarted)return;
  appStarted=true;
  settings=await window.raidtalk.loadSettings();
  while(settings.length<COUNT)settings.push({x:500,y:400,interval:5000});
  makeTabs();selectTab(0);updateEffectsButton();updateDarkThemeButton();updateAutoRejoinButton();
  setInterval(()=>{
    if(!autoRejoinEnabled||!navigator.onLine)return;
    for(let i=0;i<COUNT;i++){
      if(recoveryPending[i]&&Date.now()-recoveryLastAttempt[i]>12000){
        recoveryLastAttempt[i]=Date.now();
        inspectAndRecover(i);
      }
    }
  },5000);
}
initializeLicense().catch(e=>authMessage('Ошибка авторизации: '+e.message));
