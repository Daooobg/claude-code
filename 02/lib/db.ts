import { Database, type SQLQueryBindings } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = process.env.DB_PATH ?? "data/app.db";

const globalForDb = globalThis as unknown as { db?: Database };

function createDb(): Database {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const database = new Database(DB_PATH, { create: true });

  database.run("PRAGMA journal_mode = WAL;");
  database.run("PRAGMA foreign_keys = ON;");
  database.run("PRAGMA busy_timeout = 5000;");

  return database;
}

export const db: Database = globalForDb.db ?? createDb();
if (process.env.NODE_ENV !== "production") globalForDb.db = db;

export function getDb(): Database {
  return db;
}

type Params = SQLQueryBindings[];

export function query<T>(sql: string, params: Params = []): T[] {
  return db.query<T, Params>(sql).all(...params);
}

export function get<T>(sql: string, params: Params = []): T | undefined {
  return db.query<T, Params>(sql).get(...params) ?? undefined;
}

export function run(sql: string, params: Params = []) {
  return db.query(sql).run(...params);
}
