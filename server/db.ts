import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  attachments,
  conversations,
  InsertAttachment,
  InsertUser,
  messages,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined || user.openId === ENV.ownerOpenId) {
    values.role = user.role ?? "admin";
    updateSet.role = values.role;
  }
  values.lastSignedIn ??= new Date();
  updateSet.lastSignedIn ??= new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function createConversation(userId: number, title: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(conversations).values({ userId, title: title.slice(0, 160) });
  return Number((result as any)[0]?.insertId ?? (result as any).insertId ?? 0) || null;
}

export async function listConversations(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(conversations).where(eq(conversations.userId, userId)).orderBy(desc(conversations.updatedAt));
}

export async function getConversation(userId: number, conversationId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId))).limit(1);
  return result[0];
}

export async function renameConversation(userId: number, conversationId: number, title: string) {
  const db = await getDb();
  if (!db) return false;
  await db.update(conversations).set({ title: title.slice(0, 160), updatedAt: new Date() }).where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));
  return true;
}

export async function deleteConversation(userId: number, conversationId: number) {
  const db = await getDb();
  if (!db) return false;
  await db.delete(messages).where(eq(messages.conversationId, conversationId));
  await db.delete(attachments).where(and(eq(attachments.userId, userId), eq(attachments.conversationId, conversationId)));
  await db.delete(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));
  return true;
}

export async function getMessages(userId: number, conversationId: number) {
  const db = await getDb();
  if (!db) return [];
  const conversation = await getConversation(userId, conversationId);
  if (!conversation) return [];
  return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
}

export async function addMessage(input: { conversationId: number; role: "user" | "assistant" | "system"; content: string; attachmentJson?: string }) {
  const db = await getDb();
  if (!db) return;
  await db.insert(messages).values({ ...input, attachmentJson: input.attachmentJson ?? null });
  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, input.conversationId));
}

export async function addAttachment(input: InsertAttachment) {
  const db = await getDb();
  if (!db) return;
  await db.insert(attachments).values(input);
}
