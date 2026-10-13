// Inspeção somente-leitura da página já aberta no Chrome/CDP autenticado.
const tabs = await (await fetch('http://127.0.0.1:9224/json')).json();
const page = tabs.find(tab => tab.type === 'page' && tab.url.includes(':5000'));
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
const timer = setTimeout(() => { socket.close(); process.exitCode = 1; }, 10000);
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id === 2) inspect();
  if (message.id === 1) {
    console.log(JSON.stringify(message.result, null, 2));
    clearTimeout(timer);
    socket.close();
  }
});
function inspect() { socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { returnByValue: true, expression: `(() => {
  const selectors = ['#unified-navbar','.kt-brand','.kuryos-brand-mark','.kt-brand-logo','.kt-sidebar-foot','#kt-theme-toggle','.kuryos-sidebar-nav','.kt-nav-cap','.kt-nav-link','.kuryos-command-search'];
  const elements = selectors.map(selector => { const element = document.querySelector(selector); if (!element) return {selector, missing:true}; const style = getComputedStyle(element); const rect = element.getBoundingClientRect(); return {selector,display:style.display,visibility:style.visibility,color:style.color,background:style.backgroundColor,borderRadius:style.borderRadius,rect:{left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,width:rect.width,height:rect.height}, aria:element.getAttribute('aria-expanded')}; });
  return { path:location.pathname,bodyClass:document.body.className,active:document.activeElement.className,dimensions:{width:innerWidth,height:innerHeight},reactText:document.getElementById('root')?.innerText.slice(0,500),resources:performance.getEntriesByType('resource').filter(entry => entry.name.includes('/static/js/')).map(entry => ({name:entry.name,duration:entry.duration,bytes:entry.transferSize})).slice(-12),elements };
})()` }})); }
if (process.argv.includes('--desktop')) socket.send(JSON.stringify({ id: 2, method: 'Emulation.setDeviceMetricsOverride', params: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false } }));
else inspect();
