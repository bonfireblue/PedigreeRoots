import type { Prisma, PrismaClient } from "@prisma/client";

// Any client that can write ChangeLog rows: the root client or a transaction.
export type ChangeLogWriter = Pick<PrismaClient, "changeLog"> | Prisma.TransactionClient;

export type ChangeLogTargetType = "PERSON" | "PARENT_CHILD" | "SPOUSE" | "INVITATION" | "VOUCH";
export type ChangeLogAction = "CREATE" | "UPDATE" | "DELETE" | "RESTORE";

export type ChangeLogEntry = {
  familyGraphId: string;
  actorUserId: string;
  targetPersonId?: string | null;
  targetType: ChangeLogTargetType;
  targetId: string;
  action: ChangeLogAction;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  toldByPersonId?: string | null; // scribe attribution (Phase 3a)
};

export const CHANGE_VALUE_MAX_LEN = 500;

// Serialize a field value for storage: strings pass through, dates become
// ISO strings, everything else is JSON; always truncated to 500 chars.
export function serializeValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  let s: string;
  if (typeof value === "string") {
    s = value;
  } else if (value instanceof Date) {
    s = value.toISOString();
  } else {
    s = JSON.stringify(value);
  }

  return s.length > CHANGE_VALUE_MAX_LEN ? s.slice(0, CHANGE_VALUE_MAX_LEN) : s;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    const at = a instanceof Date ? a.getTime() : a === null || a === undefined ? null : new Date(a as any).getTime();
    const bt = b instanceof Date ? b.getTime() : b === null || b === undefined ? null : new Date(b as any).getTime();
    return at === bt;
  }
  return (a ?? null) === (b ?? null);
}

// Compute field-level change rows for a person update. `patch` holds only the
// fields the request intends to set; `before` is the current row.
export function diffPersonFields(
  before: Record<string, unknown>,
  patch: Record<string, unknown>
): Array<{ field: string; oldValue: string | null; newValue: string | null }> {
  const changes: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];

  for (const field of Object.keys(patch)) {
    const oldRaw = before[field];
    const newRaw = patch[field];
    if (valuesEqual(oldRaw, newRaw)) continue;

    changes.push({
      field,
      oldValue: serializeValue(oldRaw),
      newValue: serializeValue(newRaw),
    });
  }

  return changes;
}

// Write one or more ChangeLog rows. Call inside the same transaction as the
// mutation it describes.
export async function logChanges(db: ChangeLogWriter, entries: ChangeLogEntry[]): Promise<void> {
  if (entries.length === 0) return;

  await db.changeLog.createMany({
    data: entries.map((e) => ({
      familyGraphId: e.familyGraphId,
      actorUserId: e.actorUserId,
      targetPersonId: e.targetPersonId ?? null,
      targetType: e.targetType,
      targetId: e.targetId,
      action: e.action,
      field: e.field ?? null,
      oldValue: e.oldValue ?? null,
      newValue: e.newValue ?? null,
      toldByPersonId: e.toldByPersonId ?? null,
    })),
  });
}

// Convenience: person update → one row per changed field. Returns the number
// of rows written so callers can skip no-op updates if they want.
export async function logPersonUpdate(
  db: ChangeLogWriter,
  params: {
    familyGraphId: string;
    actorUserId: string;
    personId: string;
    before: Record<string, unknown>;
    patch: Record<string, unknown>;
    toldByPersonId?: string | null;
  }
): Promise<number> {
  const changes = diffPersonFields(params.before, params.patch);

  await logChanges(
    db,
    changes.map((c) => ({
      familyGraphId: params.familyGraphId,
      actorUserId: params.actorUserId,
      targetPersonId: params.personId,
      targetType: "PERSON" as const,
      targetId: params.personId,
      action: "UPDATE" as const,
      field: c.field,
      oldValue: c.oldValue,
      newValue: c.newValue,
      toldByPersonId: params.toldByPersonId ?? null,
    }))
  );

  return changes.length;
}

// Human-readable labels for person fields, used by the activity feed.
export const FIELD_LABELS: Record<string, string> = {
  fullName: "name",
  firstName: "first name",
  lastName: "last name",
  gender: "gender",
  bio: "story",
  story: "story",
  location: "location",
  grewUpLocation: "grew up in",
  currentLocation: "lives in",
  birthDate: "birth date",
  deathDate: "death date",
  photoUrl: "photo",
  proudOf: "proud of",
  occupation: "occupation",
  interests: "interests",
  isPrivate: "privacy",
  claimedByUserId: "claimed by",
  isVerified: "verified",
};

// Cursor helpers for the activity feed: opaque base64 of "createdAtMs:id".
export function encodeActivityCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.getTime()}:${id}`, "utf8").toString("base64url");
}

export function decodeActivityCursor(cursor: string): { createdAt: Date; id: string } | null {
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const sep = decoded.indexOf(":");
  if (sep <= 0) return null;

  const ms = Number(decoded.slice(0, sep));
  const id = decoded.slice(sep + 1);
  if (!Number.isFinite(ms) || !id) return null;

  return { createdAt: new Date(ms), id };
}
