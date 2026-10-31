// tools/screenshot.js
//
// Captures full-page screenshots of the running dashboard with headless Chrome.
// Uses the Chrome DevTools Protocol directly, so no extra npm packages are needed.
//
// Usage (dashboard must already be running on http://localhost:3000):
//   node tools/screenshot.js                       -> docs/screenshots/01-dashboard.png
//   node tools/screenshot.js --out ../docs/screenshots/02-fall-alert.png
//   DASHBOARD_URL=http://localhost:3000 node tools/screenshot.js

const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const URL_TO_OPEN = process.env.DASHBOARD_URL || 'http://localhost:3000';
const WAIT_MS = Number(process.env.SCREENSHOT_WAIT_MS || 12000);
const PORT = Number(process.env.CHROME_DEBUG_PORT || 9222);

const outArgIndex = process.argv.indexOf('--out');
const OUT_FILE = path.resolve(
  outArgIndex > -1 && process.argv[outArgIndex + 1]
    ? process.argv[outArgIndex + 1]
    : path.join(__dirname, '..', '..', 'docs', 'screenshots', '01-dashboard.png')
);

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const chromePath = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!chromePath) {
  console.error('Chrome or Edge not found. Install one or set the path in this file.');
  process.exit(1);
}

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'traxion-shot-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpJson(options) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          resolve(body);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function waitForChrome() {
  for (let i = 0; i < 60; i++) {
    try {
      return await httpJson({ host: '127.0.0.1', port: PORT, path: '/json/version', method: 'GET' });
    } catch (err) {
      await sleep(250);
    }
  }
  throw new Error('Chrome did not expose the debugging port in time');
}

async function main() {
  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--force-device-scale-factor=1',
      '--window-size=1400,2000',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  try {
    await waitForChrome();

    // Open the dashboard in a fresh tab (newer Chrome versions require PUT)
    const tab = await httpJson({
      host: '127.0.0.1',
      port: PORT,
      path: `/json/new?${encodeURIComponent(URL_TO_OPEN)}`,
      method: 'PUT',
    });

    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    let nextId = 1;
    const pending = new Map();

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg.result);
        pending.delete(msg.id);
      }
    });

    const send = (method, params = {}) =>
      new Promise((resolve) => {
        const id = nextId++;
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });

    await new Promise((resolve) => ws.on('open', resolve));
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1400,
      height: 2000,
      deviceScaleFactor: 1,
      mobile: false,
    });

    console.log(`[shot] waiting ${WAIT_MS} ms for live data...`);
    await sleep(WAIT_MS);

    const metrics = await send('Page.getLayoutMetrics');
    const size = metrics.cssContentSize || metrics.contentSize;

    // Trim the empty space below the page content
    const measured = await send('Runtime.evaluate', {
      expression: 'document.body.scrollHeight',
      returnByValue: true,
    });
    const height = measured.result && measured.result.value ? measured.result.value : size.height;

    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: {
        x: 0,
        y: 0,
        width: Math.ceil(size.width),
        height: Math.ceil(height),
        scale: 1,
      },
    });

    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, Buffer.from(shot.data, 'base64'));
    console.log(`[shot] saved ${OUT_FILE}`);

    ws.close();
  } finally {
    chrome.kill();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (err) {
      // ignore cleanup errors on Windows
    }
  }
}

main().catch((err) => {
  console.error('[shot] failed:', err.message);
  process.exit(1);
});
