import { db } from "./db";
import type { AuthUser, UserRow } from "./types";

const SESSION_TTL_DAYS = 30;

const selectUserByEmailStatement = db.query(
  "SELECT id, name, email, password_hash, created_at FROM users WHERE email = ? LIMIT 1"
);
const insertUserStatement = db.prepare(
  "INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)"
);
const selectAuthUserByTokenStatement = db.query(`
  SELECT
    u.id,
    u.name,
    u.email,
    s.token,
    s.expires_at
  FROM sessions s
  INNER JOIN users u ON u.id = s.user_id
  WHERE s.token = ?
  LIMIT 1
`);
const insertSessionStatement = db.prepare(
  "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
);
const deleteSessionStatement = db.prepare("DELETE FROM sessions WHERE token = ?");

const buildSessionToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Buffer.from(bytes).toString("base64url");
};

const getExpirationDateIso = (): string => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS);
  return expiresAt.toISOString();
};

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const findUserByEmail = (email: string): UserRow | null => {
  const row = selectUserByEmailStatement.get(email) as UserRow | null;
  return row ?? null;
};

export const createUser = (input: {
  name: string;
  email: string;
  passwordHash: string;
}): number => {
  const createdAt = new Date().toISOString();
  const result = insertUserStatement.run(
    input.name,
    normalizeEmail(input.email),
    input.passwordHash,
    createdAt
  );

  return Number(result.lastInsertRowid);
};

export const createSession = (userId: number): string => {
  const createdAt = new Date().toISOString();
  const expiresAt = getExpirationDateIso();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = buildSessionToken();

    try {
      insertSessionStatement.run(token, userId, createdAt, expiresAt);
      return token;
    } catch {
      // Retry on rare token collisions.
    }
  }

  throw new Error("Failed to create session token");
};

export const removeSession = (token: string): void => {
  deleteSessionStatement.run(token);
};

export const getAuthUserByToken = (token: string): AuthUser | null => {
  const row = selectAuthUserByTokenStatement.get(token) as
    | {
        id: number;
        name: string;
        email: string;
        token: string;
        expires_at: string;
      }
    | null;

  if (!row) {
    return null;
  }

  const expiresAtTimestamp = Date.parse(row.expires_at);
  if (Number.isNaN(expiresAtTimestamp) || expiresAtTimestamp <= Date.now()) {
    removeSession(token);
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    token: row.token,
  };
};
