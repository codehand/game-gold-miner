import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const appUrl = process.env.SIM_APP_URL ?? 'http://127.0.0.1:5173/';
const preferredDevice = process.env.SIM_DEVICE ?? 'iPhone 16 Pro';
const vitePath = fileURLToPath(
  new URL('../node_modules/vite/bin/vite.js', import.meta.url),
);
const serveSimPath = fileURLToPath(
  new URL('../node_modules/.bin/serve-sim', import.meta.url),
);

function run(command, args) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

function selectDevice() {
  const output = run('xcrun', [
    'simctl',
    'list',
    'devices',
    'available',
    '--json',
  ]);
  const runtimes = Object.values(JSON.parse(output).devices);
  const devices = runtimes.flat().filter((device) => device.isAvailable);
  const selected = devices.find(
    (device) =>
      device.udid === preferredDevice || device.name === preferredDevice,
  ) ?? devices.find((device) => device.name.startsWith('iPhone'));

  if (!selected) {
    throw new Error(
      'No available iPhone Simulator was found. Install an iOS runtime in Xcode.',
    );
  }

  return selected;
}

async function waitForApp(url) {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Vite did not become ready at ${url}.`);
}

const device = selectDevice();

if (device.state !== 'Booted') {
  run('xcrun', ['simctl', 'boot', device.udid]);
}

execFileSync('open', ['-a', 'Simulator']);
run('xcrun', ['simctl', 'bootstatus', device.udid, '-b']);

const vite = spawn(
  process.execPath,
  [vitePath, '--host', '127.0.0.1', '--port', '5173', '--strictPort'],
  { stdio: 'inherit' },
);
let serveSim;

function stop() {
  if (serveSim && !serveSim.killed) serveSim.kill('SIGTERM');
  if (!vite.killed) vite.kill('SIGTERM');
}

process.once('SIGINT', stop);
process.once('SIGTERM', stop);

try {
  await waitForApp(appUrl);
  run('xcrun', ['simctl', 'openurl', device.udid, appUrl]);

  serveSim = spawn(
    serveSimPath,
    [
      device.udid,
      '--host',
      '127.0.0.1',
      '--panes',
      'devices,tools,devtools',
      '--fit',
    ],
    { stdio: 'inherit' },
  );

  vite.once('exit', () => {
    if (serveSim && !serveSim.killed) serveSim.kill('SIGTERM');
  });

  const exitCode = await new Promise((resolve) => {
    serveSim.once('exit', (code) => resolve(code ?? 0));
  });
  process.exitCode = exitCode;
} finally {
  stop();
}
