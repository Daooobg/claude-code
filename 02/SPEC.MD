# Technical Specification – Note Taking Web App

## 1. Overview

A web application where authenticated users can create, view, edit, delete, and publicly share rich-text notes. Notes are created with TipTap, stored as JSON in a SQLite database, and rendered in the browser with formatting.

### 1.1 Core Features

- User authentication (sign up, login, logout) via better-auth
- Authenticated note management (CRUD)
- Rich text editor using TipTap with:
  - Bold, Italic
  - Heading levels (H1–H3) + normal text
  - Inline code + code blocks
  - Bullet lists
  - Horizontal rules
- Public sharing of notes via a public URL (toggle on/off)

### 1.2 Tech Stack

- Next.js (App Router) + Bun runtime
- TypeScript
- TailwindCSS
- SQLite via Bun's SQLite client (`bun:sqlite`) with raw SQL
- better-auth for authentication

## 2. Architecture

### 2.1 High-Level Architecture

- **Frontend & Backend:** Next.js (App Router)
  - Server components for data fetching
  - Client components for TipTap editor and interactive UI
  - Route Handlers (`app/api/.../route.ts`) for JSON APIs
- **Runtime:** Bun (for dev & production)
- **Database:** Single SQLite file (e.g., `data/app.db`) accessed via Bun's SQLite client
- **Auth:** better-auth integrated into Next.js (middleware + server helpers), using the same SQLite database

### 2.2 Application Layers

#### Presentation Layer

- Next.js pages and components
- TailwindCSS for styling
- TipTap editor component

#### API Layer

- REST-like JSON endpoints for notes CRUD & sharing
- better-auth handler mounted at `app/api/auth/[...all]/route.ts`

#### Data Access Layer

- Raw SQL queries executed via Bun's SQLite client
- A small helper module for DB access

## 3. Functional Requirements

### 3.1 Authentication

Users can:

- Register (email + password, minimum validation)
- Log in / log out

Authentication state is accessible on the server (for SSR) and on the client (for protected UI).

Unauthenticated users:

- Can access public shared note URLs (read-only)
- Cannot access the dashboard or personal notes

### 3.2 Notes Management (Authenticated)

#### Create a New Note

- Default title: "Untitled note"
- Default empty TipTap document

#### View a List of Own Notes

- Show title, last updated at, shared status

#### View a Single Note

- Load editor with stored TipTap JSON document

#### Update Note

- Change title
- Change content (TipTap JSON)
- Auto-update `updated_at`

#### Delete Note

- Hard delete

### 3.3 Note Sharing

Users can toggle a note's "public sharing".

#### When Enabled

- Note gets a unique public slug (e.g. `abcdef1234`)
- Accessible via `/p/{slug}` for anonymous users

#### When Disabled

- Public URL returns 404 / "Note not found"

#### Public Page Rendering

- Reads note from DB by `public_slug`
- Shows title and content in read-only mode
- No editing or owner information necessary

## 4. Non-Functional Requirements

| Area | Requirement |
|------|-------------|
| **Performance** | Notes list & note view should load in under ~300 ms for typical DB sizes |
| **Security** | All note operations are scoped to the authenticated user's `user_id`; public notes are read-only with no leaked private data in API responses |
| **Reliability** | Graceful handling of DB errors |
| **Maintainability** | Type-safe APIs and DB types; modularized DB and auth helpers |
| **UX** | Simple, minimal UI with keyboard-friendly editor |

## 5. Data Model & Database Schema (SQLite)

### 5.1 Auth Tables (managed by better-auth)

better-auth requires four core tables: `user`, `session`, `account`, and `verification`. These tables are **owned by better-auth** — the app must not create or alter them by hand.

#### Setup

Pass the Bun SQLite database instance to better-auth so it uses the built-in Kysely adapter:

```typescript
// lib/auth.ts
import { betterAuth } from "better-auth";
import { Database } from "bun:sqlite";

export const auth = betterAuth({
  database: new Database("data/app.db"),
  emailAndPassword: {
    enabled: true,
  },
});
```

#### Migrations

Because we use the built-in Kysely adapter, the better-auth CLI can create and update the auth tables directly:

```bash
bunx auth@latest migrate    # create missing tables / add missing columns
bunx auth@latest generate   # alternatively, output the SQL to review and run manually
bunx auth@latest check schema  # verify the DB matches the expected schema
```

- Run `migrate` after installing better-auth and again whenever auth config or plugins change (plugins may add tables or columns).
- better-auth validates the schema on startup and logs missing tables/columns through its logger; requests to the auth endpoints fail if the schema does not match.
- If a programmatic migration is ever needed (no CLI available), use `getMigrations(auth.options)` from `better-auth/db/migration`.

#### Conventions

- **Table names:** default better-auth names (`user`, `session`, `account`, `verification`). Column names are camelCase. (They can be renamed via `modelName` / `fields` in the auth config, but we keep the defaults to avoid extra mapping.)
- **IDs:** `TEXT` string IDs generated by better-auth (default `generateId`).
- **Timestamps:** set by better-auth in the application layer, not by DB defaults. Stored as `date` (ISO strings in SQLite).
- **Booleans:** stored as `INTEGER` (`0` / `1`).
- **Extra user fields:** if needed later, add them via `user.additionalFields` in the auth config (not by altering the table manually), then re-run `migrate`.

The SQL below is **reference only** — it reflects what `auth generate` produces for SQLite.

#### `user`

```sql
CREATE TABLE "user" (
  "id"            TEXT    NOT NULL PRIMARY KEY,
  "name"          TEXT    NOT NULL,
  "email"         TEXT    NOT NULL UNIQUE,
  "emailVerified" INTEGER NOT NULL,
  "image"         TEXT,
  "createdAt"     DATE    NOT NULL,
  "updatedAt"     DATE    NOT NULL
);
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier for each user (primary key) |
| `name` | string | User's chosen display name |
| `email` | string | User's email address for communication and login (unique) |
| `emailVerified` | boolean | Whether the user's email is verified |
| `image` | string? | User's image URL (optional) |
| `createdAt` | Date | Timestamp of when the user account was created |
| `updatedAt` | Date | Timestamp of the last update to the user's information |

#### `session`

```sql
CREATE TABLE "session" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "expiresAt" DATE NOT NULL,
  "token"     TEXT NOT NULL UNIQUE,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId"    TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE INDEX "session_userId_idx" ON "session" ("userId");
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier for each session (primary key) |
| `userId` | string | The ID of the user (foreign key → `user.id`) |
| `token` | string | The unique session token |
| `expiresAt` | Date | The time when the session expires |
| `ipAddress` | string? | The IP address of the device (optional) |
| `userAgent` | string? | The user agent information of the device (optional) |
| `createdAt` | Date | Timestamp of when the session was created |
| `updatedAt` | Date | Timestamp of when the session was updated |

#### `account`

An account represents one authentication method linked to a user. better-auth identifies the provider-side identity by the pair (`providerId`, `accountId`), while `id` identifies the local account row.

For this app (email + password only), each user has one account with `providerId = "credential"` and `accountId` equal to the user's `id`; the hashed password lives in `account.password`, **not** on the `user` table.

```sql
CREATE TABLE "account" (
  "id"                    TEXT NOT NULL PRIMARY KEY,
  "accountId"             TEXT NOT NULL,
  "providerId"            TEXT NOT NULL,
  "userId"                TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "accessToken"           TEXT,
  "refreshToken"          TEXT,
  "idToken"               TEXT,
  "accessTokenExpiresAt"  DATE,
  "refreshTokenExpiresAt" DATE,
  "scope"                 TEXT,
  "password"              TEXT,
  "createdAt"             DATE NOT NULL,
  "updatedAt"             DATE NOT NULL
);

CREATE INDEX "account_userId_idx" ON "account" ("userId");
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier for each account row (primary key). Use this when an account API asks for an `accountId` |
| `userId` | string | The ID of the user (foreign key → `user.id`) |
| `accountId` | string | The provider-side account ID; for credential accounts, the user's `id` |
| `providerId` | string | The ID of the provider (`"credential"` for email/password; e.g. `"google"`, `"github"` for OAuth) |
| `accessToken` | string? | The access token returned by the provider (optional) |
| `refreshToken` | string? | The refresh token returned by the provider (optional) |
| `accessTokenExpiresAt` | Date? | The time when the access token expires (optional) |
| `refreshTokenExpiresAt` | Date? | The time when the refresh token expires (optional) |
| `scope` | string? | The scope of the account returned by the provider (optional) |
| `idToken` | string? | The ID token returned from the provider (optional) |
| `password` | string? | The hashed password for email/password authentication (optional) |
| `createdAt` | Date | Timestamp of when the account was created |
| `updatedAt` | Date | Timestamp of when the account was updated |

#### `verification`

```sql
CREATE TABLE "verification" (
  "id"         TEXT NOT NULL PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value"      TEXT NOT NULL,
  "expiresAt"  DATE NOT NULL,
  "createdAt"  DATE NOT NULL,
  "updatedAt"  DATE NOT NULL
);

CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier for each verification (primary key) |
| `identifier` | string | The identifier for the verification request |
| `value` | string | The value to be verified |
| `expiresAt` | Date | The time when the verification request expires |
| `createdAt` | Date | Timestamp of when the verification request was created |
| `updatedAt` | Date | Timestamp of when the verification request was updated |

### 5.2 App Tables

#### `notes`

Owned by the app and created by our own migration script (see §12).

```sql
CREATE TABLE notes (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  title        TEXT NOT NULL,
  content_json TEXT NOT NULL,
  is_public    INTEGER NOT NULL DEFAULT 0,
  public_slug  TEXT UNIQUE,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE
);
```

> **Note:** `user` is a keyword in some SQL dialects, so always quote it (`"user"`) in raw SQL. SQLite only enforces foreign keys when `PRAGMA foreign_keys = ON;` is set on the connection.

### 5.3 Indexes

```sql
CREATE INDEX idx_notes_user_id ON notes(user_id);
CREATE INDEX idx_notes_public_slug ON notes(public_slug);
CREATE INDEX idx_notes_is_public ON notes(is_public);
```

Auth table indexes are created by better-auth's migrations (see §5.1).

## 6. Backend: DB & API Layer

### 6.1 Database Access Module

**File:** `lib/db.ts`

- Initialize Bun SQLite client with the DB file (`data/app.db`)
- Enable `PRAGMA foreign_keys = ON`
- Export helper functions such as:
  - `getDb()` – returns singleton DB connection
  - Utility wrappers for:
    - `query<T>(sql, params?): T[]`
    - `get<T>(sql, params?): T | undefined`
    - `run(sql, params?)`

### 6.2 Note Repository Functions

**File:** `lib/notes.ts`

TypeScript types:

```typescript
export type Note = {
  id: string;
  userId: string;
  title: string;
  contentJson: string; // stringified TipTap doc
  isPublic: boolean;
  publicSlug: string | null;
  createdAt: string;
  updatedAt: string;
};
```

Repository functions:

- `createNote(userId: string, data: { title?: string; contentJson?: string }): Promise<Note>`
- `getNoteById(userId: string, noteId: string): Promise<Note | null>`
- `getNotesByUser(userId: string): Promise<Note[]>`
- `updateNote(userId: string, noteId: string, data: Partial<{ title: string; contentJson: string }>): Promise<Note | null>`
- `deleteNote(userId: string, noteId: string): Promise<void>`
- `setNotePublic(userId: string, noteId: string, isPublic: boolean): Promise<Note | null>`
- `getNoteByPublicSlug(slug: string): Promise<Note | null>`

Each function enforces `user_id = ?` in SQL where applicable, to avoid cross-user access.

## 7. API Design (Next.js Route Handlers)

Base path: `/api/notes`.

### 7.1 Authentication Access

Implement a server helper on top of better-auth, e.g. `getCurrentUser()` / `getSession()` using `auth.api.getSession({ headers })`.

All `/api/notes` handlers (except public read) must:

- Check auth
- Return `401` if not authenticated

### 7.2 Endpoints

#### `GET /api/notes`

List notes for the current user.

**Response `200`:**

```json
[
  {
    "id": "note-id",
    "title": "My Note",
    "isPublic": true,
    "updatedAt": "2025-01-01T12:00:00Z"
  }
]
```

Optionally omit `contentJson` from the list for performance.

#### `POST /api/notes`

Create a new note.

**Request body:**

```jsonc
{
  "title": "Optional title",
  "contentJson": { "type": "doc", "content": [] }
}
```

**Behavior:**

- Default title = "Untitled note" if missing
- Default `contentJson` = empty TipTap document if missing

**Response `201`:** created note (or a minimal subset)

#### `GET /api/notes/:id`

Get a single note owned by the current user.

**Responses:**

- `200` with full note including `contentJson`
- `404` if not found or not owned by user

#### `PUT /api/notes/:id`

Update note title/content.

**Request body:**

```jsonc
{
  "title": "New title",
  "contentJson": { "type": "doc", "content": [ /* ... */ ] }
}
```

**Responses:**

- `200` with updated note
- `404` if not found

#### `DELETE /api/notes/:id`

Delete a note.

**Responses:**

- `204` on success
- `404` if not found

#### `POST /api/notes/:id/share`

Toggle public sharing.

**Request body:**

```json
{
  "isPublic": true
}
```

**Behavior:**

- If `isPublic = true` and the note has no `public_slug`, generate a new slug (`nanoid()`)
- If `isPublic = false`, set `is_public = 0` and `public_slug = NULL`

**Response `200`:**

```json
{
  "id": "note-id",
  "isPublic": true,
  "publicSlug": "abcdef1234"
}
```

### 7.3 Public Note Endpoint

#### `GET /api/public-notes/:slug`

Read-only access to public notes.

**Response `200`:**

```jsonc
{
  "title": "Public note",
  "contentJson": { "type": "doc", "content": [ /* ... */ ] }
}
```

- `404` if slug not found or `is_public = 0`

(Alternatively, skip this API and resolve directly in the `/p/[slug]` route using server components.)

## 8. Frontend – Pages & Components

### 8.1 Routes

Assuming Next.js App Router structure:

| Route | Access | Contents |
|-------|--------|----------|
| `/` | Public | Landing page — marketing / "Log in / Sign up" CTA |
| `/dashboard` | Authenticated | List of user notes, "Create note" button |
| `/notes/[id]` | Authenticated | TipTap editor, title field, share toggle, delete button |
| `/p/[slug]` | Public | Read-only note content; no nav to user-specific areas for unauthenticated viewers |

### 8.2 Layout & Navigation

- Global layout: `app/layout.tsx`
  - Header with app name, login/logout/account & theme
- `app/authenticate` — single custom page for sign-in and sign-up, email + password only (better-auth does not ship UI; uses the better-auth client)

### 8.3 Components

| Component | Description |
|-----------|-------------|
| `components/NoteList.tsx` | Props: `notes: { id, title, updatedAt, isPublic }[]`. Renders list with links to `/notes/[id]` |
| `components/NoteEditor.tsx` | TipTap-based editor, controlled by parent (`onChange` updates state, eventual API call) |
| `components/ShareToggle.tsx` | Switch/checkbox for `isPublic`; shows public URL when enabled |
| `components/DeleteNoteButton.tsx` | Confirms and calls the DELETE API |
| `components/PublicNoteViewer.tsx` | Renders TipTap content in read-only mode (or uses `EditorContent` with `editable: false`) |

## 9. TipTap Integration

### 9.1 Extensions

Enable at minimum:

- `StarterKit` (paragraphs, headings, bold, italic, bullet lists, horizontal rule, etc.)
- `Code` (inline code)
- `CodeBlockLowlight` or `CodeBlock` (for code snippets)

Example editor config:

```typescript
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Code from "@tiptap/extension-code";
import CodeBlock from "@tiptap/extension-code-block";

const editor = useEditor({
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Code,
    CodeBlock,
  ],
  content: initialContentJson, // TipTap JSON
  onUpdate: ({ editor }) => {
    const json = editor.getJSON();
    onChange(json);
  },
});
```

Content is always stored in the DB as `JSON.stringify(json)`; when loading, `JSON.parse` it and pass it as `content`.

### 9.2 Toolbar

Buttons:

- Bold, Italic
- H1, H2, H3, Paragraph
- Bullet list
- Inline code
- Code block
- Horizontal rule

Each button calls the relevant TipTap chain, e.g. `editor.chain().focus().toggleBold().run()`.

## 10. Styling (TailwindCSS)

- Configure Tailwind in `tailwind.config.ts`
- Use a minimal design:
  - Neutral background, card-like note container
  - Utility classes on components
- Consider a prose style for read-only content (using `@tailwindcss/typography`)

## 11. Security Considerations

- **Auth enforcement**
  - All `/dashboard` and `/notes/[id]` routes check auth on the server
  - API routes verify the user and take `userId` from the session
- **Authorization**
  - Every note query in the auth context filters by `user_id`
- **Public notes**
  - Slugs should be sufficiently random to prevent guessing (e.g. 16+ chars)
- **XSS**
  - Primary data is TipTap JSON, not raw HTML
  - When rendering to HTML, only use TipTap's rendering (no `dangerouslySetInnerHTML` with unsanitized data)
- **Rate limiting** (optional enhancement)
  - Apply per-IP or per-user rate limiting to API routes if exposed publicly

## 12. Development Workflow

1. Initialize Next.js app with Bun & TypeScript
2. Set up TailwindCSS
3. Integrate better-auth (`lib/auth.ts`, auth route handler, client) and run `bunx auth@latest migrate` to create the auth tables
4. Create the app's `notes` table and indexes (e.g. via `scripts/init-db.ts` or a manual `.sql` file)
5. Build DB helpers and note repository
6. Implement `/api/notes` and sharing APIs
7. Build dashboard and note editor pages
8. Integrate TipTap editor and toolbar
9. Implement public note pages `/p/[slug]`
10. Add polish (loading states, toast messages, error handling)
