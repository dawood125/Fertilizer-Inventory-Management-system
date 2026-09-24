/**
 * Build Windows installer to a short temp path (avoids EPERM on long/spaced project paths),
 * then copy artifacts into ./dist-electron.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outTemp = path.join(os.tmpdir(), 'ims-electron-out');
const outFinal = path.join(root, 'dist-electron');

fs.rmSync(outTemp, { recursive: true, force: true });
fs.mkdirSync(outFinal, { recursive: true });

const env = { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' };
const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  [
    'electron-builder',
    '--config',
    'electron-builder.json',
    `--config.directories.output=${outTemp.replace(/\\/g, '/')}`,
  ],
  { cwd: root, env, stdio: 'inherit', shell: true }
);

if (result.status !== 0) {
  process.exit(result.status || 1);
}

for (const name of fs.readdirSync(outTemp)) {
  if (!name.endsWith('.exe') && !name.endsWith('.blockmap') && !name.endsWith('.yml')) continue;
  fs.copyFileSync(path.join(outTemp, name), path.join(outFinal, name));
  console.log(`[electron-build] Copied ${name} → dist-electron/`);
}

console.log('[electron-build] Done. Installer is in dist-electron/');
