import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let SQL = null;
let db = null;
let dbPath = null;
let saveTimer = null;

export function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

export function getDbPath() {
  return dbPath;
}

function scheduleSave() {
  if (!db || !dbPath) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      const tmp = `${dbPath}.tmp`;
      fs.writeFileSync(tmp, buffer);
      fs.renameSync(tmp, dbPath);
    } catch (err) {
      console.error('[db] Failed to persist SQLite file:', err.message);
    }
  }, 150);
}

/** Wrap prepare/run/exec so every write is persisted. */
function patchDb(database) {
  const originalRun = database.run.bind(database);
  database.run = (...args) => {
    const result = originalRun(...args);
    scheduleSave();
    return result;
  };
  const originalExec = database.exec.bind(database);
  database.exec = (...args) => {
    const result = originalExec(...args);
    scheduleSave();
    return result;
  };
  return database;
}

export function saveDatabaseNow() {
  if (!db || !dbPath) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

export function closeDatabase() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (db) {
    try {
      db.close();
    } catch {}
    db = null;
  }
  SQL = null;
  dbPath = null;
}

/**
 * @param {string} userDataPath - Electron app.getPath('userData') or fallback for browser/dev
 */
export async function initDatabase(userDataPath) {
  if (db) return db;

  const wasmPath = path.join(
    path.dirname(require.resolve('sql.js')),
    'sql-wasm.wasm'
  );

  SQL = await initSqlJs({
    locateFile: () => wasmPath,
  });

  const dataDir = userDataPath || path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  dbPath = path.join(dataDir, 'inventory.db');

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = patchDb(new SQL.Database(fileBuffer));
    console.log('[db] Opened existing database:', dbPath);
  } else {
    db = patchDb(new SQL.Database());
    console.log('[db] Created new database:', dbPath);
  }

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON;');

  const { runMigrations } = await import('./migrations/index.js');
  await runMigrations(db);

  const { seedDatabase } = await import('./seeds/index.js');
  await seedDatabase(db);

  saveDatabaseNow();
  return db;
}

/** Helper: run a SELECT and return array of objects */
export function queryAll(sql, params = []) {
  const stmt = getDb().prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

/** Helper: run a SELECT and return first row or null */
export function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows[0] || null;
}

/** Helper: run INSERT/UPDATE/DELETE */
export function execute(sql, params = []) {
  const database = getDb();
  database.run(sql, params);
  scheduleSave();
  return {
    changes: database.getRowsModified(),
  };
}

/** Generate a UUID v4 */
export function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function nowISO() {
  return new Date().toISOString();
}
