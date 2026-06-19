// By DranxX Creative
/**
 * SQLite wrapper — unified API for Bun (bun:sqlite) and Node.js (better-sqlite3).
 *
 * Exposes a sync `getDB(path)` that returns a db object with:
 *   db.exec(sql)           — run raw SQL
 *   db.query(sql).all()    — SELECT multiple rows
 *   db.query(sql).get(...) — SELECT single row
 *   db.query(sql).run(...) — INSERT/UPDATE/DELETE (returns { changes, lastInsertRowid })
 *   db.transaction(fn)     — run fn in transaction, returns callable
 */

import fs from 'fs';
import path from 'path';

const isBun = typeof Bun !== 'undefined';

let _Database;
if (isBun) {
  _Database = (await import('bun:sqlite')).Database;
} else {
  _Database = (await import('better-sqlite3')).default;
}

/**
 * Open/create a SQLite database with WAL mode. Auto-creates parent dir.
 */
export function getDB(dbPath) {
  if (!fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = isBun ? new _Database(dbPath, { create: true }) : new _Database(dbPath);

  // Pragma setup
  if (isBun) {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
    db.exec('PRAGMA busy_timeout = 5000');
  } else {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 5000');
  }

  // Normalize .query() — Bun has it natively, better-sqlite3 needs a wrapper
  if (!isBun) {
    const origPrepare = db.prepare.bind(db);
    db.query = (sql) => {
      const stmt = origPrepare(sql);
      return {
        all: (...a) => stmt.all(...a),
        get: (...a) => stmt.get(...a),
        run: (...a) => stmt.run(...a),
      };
    };
  }

  // Normalize .transaction() — better-sqlite3 returns callable, Bun executes immediately
  if (isBun) {
    const origTx = db.transaction.bind(db);
    db.transaction = (fn) => {
      // Wrap to match better-sqlite3's pattern: returns a callable
      return () => origTx(fn);
    };
  }

  return db;
}
