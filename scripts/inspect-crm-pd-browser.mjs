const tabs = await (await fetch('http://127.0.0.1:9224/json')).json();
const page = tabs.find((tab) => tab.type === 'page' && tab.url.includes('127.0.0.1.nip.io:5000'));
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
socket.send(JSON.stringify({
  id: 1,
  method: 'Runtime.evaluate',
  params: {
    expression: `({url: location.href, text: document.body.innerText.slice(0, 1600), buttons: [...document.querySelectorAll('button')].map(el => el.textContent.trim()).filter(Boolean), dialogs: [...document.querySelectorAll('[role="dialog"]')].map(el => el.textContent.trim())})`,
    returnByValue: true,
  },
}));
const message = await new Promise((resolve) => { socket.onmessage = (event) => resolve(JSON.parse(event.data)); });
console.log(JSON.stringify(message.result.result.value, null, 2));
socket.close();
