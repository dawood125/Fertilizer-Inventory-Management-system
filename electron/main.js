import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron';
import path from 'path';
import { writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { startServer } from '../server/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

let mainWindow = null;
let apiPort = 3847;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    title: 'Inventory Manager',
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    await mainWindow.loadURL('http://127.0.0.1:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    // Auto-start on Windows login (packaged installs only)
    if (!isDev) {
      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: false,
      });
    }

    const userDataPath = app.getPath('userData');
    try {
      const { port } = await startServer({ userDataPath, port: apiPort });
      apiPort = port;
    } catch (err) {
      // Dev mode may already run Express separately
      if (err && (err.code === 'EADDRINUSE' || String(err.message || '').includes('EADDRINUSE'))) {
        console.log('[electron] API already running on', apiPort);
      } else {
        throw err;
      }
    }

    ipcMain.handle('get-api-port', () => apiPort);
    ipcMain.handle('get-user-data-path', () => userDataPath);
    ipcMain.handle('save-pdf', async (_event, fileName, options) => {
      const win = BrowserWindow.getFocusedWindow() || mainWindow;
      if (!win) return { ok: false, error: 'No window' };
      const suggested = String(fileName || 'document.pdf').replace(/[<>:"/\\|?*]+/g, '-');
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: 'Save PDF',
        defaultPath: suggested.endsWith('.pdf') ? suggested : `${suggested}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (canceled || !filePath) return { ok: false, cancelled: true };
      try {
        // Support half-A4 portrait for invoices (148.5mm x 210mm -> A5)
        const isHalfPage = options?.halfPage === true;
        const pdfOptions = {
          printBackground: true,
          landscape: false,
          margins: { marginType: 'none', top: 0, bottom: 0, left: 0, right: 0 },
          marginsType: 1, // 0 = default, 1 = none, 2 = minimum
          pageSize: isHalfPage ? 'A5' : 'A4',
        };
        const data = await win.webContents.printToPDF(pdfOptions);
        await writeFile(filePath, data);
        return { ok: true, filePath };
      } catch (err) {
        console.error('[electron] printToPDF error:', err);
        return { ok: false, error: String(err?.message || err) };
      }
    });

    // Silent print — sends directly to the default printer without dialog
    ipcMain.handle('silent-print', async (_event, options) => {
      const win = BrowserWindow.getFocusedWindow() || mainWindow;
      if (!win) return { ok: false, error: 'No window' };
      try {
        const isHalfPage = options?.halfPage === true;
        const printOptions = {
          silent: options?.silent !== false,
          printBackground: true,
          color: false, // ink-saver gray receipt — grayscale
          landscape: false,
          pageSize: isHalfPage ? 'A5' : 'A4',
          margins: { marginType: 'none', top: 0, bottom: 0, left: 0, right: 0 },
          marginsType: 1,
          duplexMode: options?.duplexMode || 'longEdge',
        };

        await new Promise((resolve, reject) => {
          win.webContents.print(
            printOptions,
            (success, failureReason) => {
              if (success) resolve();
              else reject(new Error(failureReason || 'Print failed'));
            }
          );
        });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String(err?.message || err) };
      }
    });

    await createWindow();
  } catch (err) {
    console.error('[electron] Startup failed:', err);
    app.quit();
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
