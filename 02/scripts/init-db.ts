// Creates the app-owned tables. Auth tables come from `bun run auth:migrate` (run that first).
import { getDb } from "@/lib/db";

const db = getDb();

db.transaction(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL,
      title        TEXT NOT NULL,
      content_json TEXT NOT NULL,
      is_public    INTEGER NOT NULL DEFAULT 0,
      public_slug  TEXT UNIQUE,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE
    )
  `);
  db.run("CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_notes_public_slug ON notes(public_slug)");
  db.run("CREATE INDEX IF NOT EXISTS idx_notes_is_public ON notes(is_public)");
})();

console.log("notes table ready");
