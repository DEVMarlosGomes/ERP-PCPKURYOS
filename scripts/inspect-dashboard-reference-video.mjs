import { mkdir, writeFile } from 'node:fs/promises';

const debugPort = process.argv[2] || '9224';
const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
const page = tabs.find((tab) => tab.type === 'page' && tab.url.includes('snapinsta-1791461547957.mp4'));
if (!page) throw new Error('Aba do vídeo de referência não encontrada.');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let sequence = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const request = pending.get(message.id);
  pending.delete(message.id);
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function value(expression, awaitPromise = false) {
  const result = await call('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}

await call('Runtime.enable');
await call('Page.enable');
await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await value(`new Promise((resolve) => {
  const video = document.querySelector('video');
  if (video.readyState >= 1) return resolve();
  video.addEventListener('loadedmetadata', resolve, { once: true });
})`, true);
const metadata = await value(`(() => {
  const video = document.querySelector('video');
  video.controls = false;
  document.documentElement.style.background = '#050505';
  document.body.style.cssText = 'margin:0;background:#050505;overflow:hidden;display:grid;place-items:center;width:100vw;height:100vh';
  video.style.cssText = 'display:block;width:100vw;height:100vh;object-fit:contain;background:#050505';
  return { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
})()`);

await mkdir('scripts/artifacts/dashboard-reference', { recursive: true });
const times = [0, .2, .4, .6, .8, .98].map((ratio) => Math.max(0, metadata.duration * ratio));
for (let index = 0; index < times.length; index += 1) {
  await value(`new Promise((resolve) => {
    const video = document.querySelector('video');
    const done = () => requestAnimationFrame(() => requestAnimationFrame(resolve));
    video.addEventListener('seeked', done, { once: true });
    video.currentTime = ${times[index]};
  })`, true);
  const screenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(`scripts/artifacts/dashboard-reference/frame-${index + 1}.png`, Buffer.from(screenshot.data, 'base64'));
}
await call('Emulation.clearDeviceMetricsOverride');
socket.close();
console.log(JSON.stringify({ ...metadata, times }, null, 2));
