export class PersonError extends Error {
  code: string;
  status: number;

  constructor(code: string, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export type PersonAccessRow = {
  createdById: string;
  claimedByUserId: string | null;
  isPrivate: boolean;
};

export type PersonEditRow = {
  createdById: string;
  claimedByUserId: string | null;
};

export type DeleteImpactWarning = {
  code:
    | "PERSON_HAS_PARENT_LINKS"
    | "PERSON_HAS_CHILD_LINKS"
    | "PERSON_HAS_SPOUSE_LINKS"
    | "PERSON_HAS_INVITATIONS"
    | "PERSON_IS_CLAIMED";
  message: string;
};

export function isVerifiedRole(role: string) {
  return role === "FOUNDER" || role === "TRUSTED" || role === "ADMIN";
}

export function canViewPerson(
  meId: string,
  isAdmin: boolean,
  membershipRole: string,
  row: PersonAccessRow
) {
  if (!row.isPrivate) return true;
  if (isAdmin) return true;
  if (row.createdById === meId) return true;
  if (row.claimedByUserId === meId) return true;
  if (isVerifiedRole(membershipRole)) return true;
  return false;
}

// Open-editing model (accountability over prevention): any member of the
// person's FamilyGraph may edit any UNCLAIMED person. Callers must have
// already verified the actor's membership in that graph — the membershipRole
// parameter exists as proof of that lookup, not for role gating.
export function canEditPerson(meId: string, membershipRole: string, row: PersonEditRow) {
  // Claimed node: only the claimer can edit (invariant — no admin override)
  if (row.claimedByUserId) {
    return row.claimedByUserId === meId;
  }

  // Unclaimed node: any member of the graph may edit
  return Boolean(membershipRole);
}

// Any member may soft-delete an unclaimed person; claimed persons are
// undeletable through this path for everyone (including admins). Hard delete
// (purge) remains an admin-only concern outside member routes.
export function canDeletePerson(meId: string, membershipRole: string, row: PersonEditRow) {
  if (row.claimedByUserId) return false;
  return Boolean(membershipRole);
}

// ——— Per-field privacy (Phase 3d) ———
// On claimed profiles the claimer can mark these fields "private" (claimer +
// admins only). Everything else is always family-visible.
export const PRIVATE_CONTROLLABLE_FIELDS = [
  "birthDate",
  "currentLocation",
  "grewUpLocation",
  "location",
] as const;

export type FieldVisibility = Record<string, "family" | "private">;

// Validate a fieldVisibility patch: only known fields, only known values.
export function normalizeFieldVisibility(value: unknown): FieldVisibility | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new PersonError("INVALID_FIELD_VISIBILITY", 400);
  }

  const out: FieldVisibility = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (!(PRIVATE_CONTROLLABLE_FIELDS as readonly string[]).includes(key)) {
      throw new PersonError("INVALID_FIELD_VISIBILITY", 400);
    }
    if (v !== "family" && v !== "private") {
      throw new PersonError("INVALID_FIELD_VISIBILITY", 400);
    }
    if (v === "private") out[key] = v; // "family" is the default — don't store it
  }

  return out;
}

// Null out private fields for viewers who aren't the claimer or an admin.
// Only claimed profiles have claimer-controlled privacy; unclaimed profiles
// ignore fieldVisibility entirely.
export function applyFieldVisibility<T extends Record<string, unknown>>(
  person: T & { claimedByUserId?: string | null; fieldVisibility?: unknown },
  viewerId: string,
  isAdmin: boolean
): T {
  const claimer = person.claimedByUserId ?? null;
  if (!claimer || claimer === viewerId || isAdmin) return person;

  const visibility = person.fieldVisibility as FieldVisibility | null | undefined;
  if (!visibility || typeof visibility !== "object") return person;

  const out: Record<string, unknown> = { ...person };
  for (const field of PRIVATE_CONTROLLABLE_FIELDS) {
    if (visibility[field] === "private" && field in out) {
      out[field] = null;
    }
  }
  return out as T;
}

export function normalizeTrimmedString(
  value: unknown,
  fieldCode: string,
  maxLen: number,
  allowNull = false
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) {
    if (allowNull) return null;
    throw new PersonError(fieldCode, 400);
  }
  if (typeof value !== "string") {
    throw new PersonError(fieldCode, 400);
  }

  const trimmed = value.trim();

  if (!allowNull && trimmed.length === 0) {
    throw new PersonError(fieldCode, 400);
  }

  if (trimmed.length > maxLen) {
    throw new PersonError(fieldCode, 400);
  }

  if (allowNull && trimmed.length === 0) return null;
  return trimmed;
}

export function normalizeFullName(value: unknown) {
  return normalizeTrimmedString(value, "INVALID_FULL_NAME", 120, false) as string | undefined;
}

export function normalizeFirstName(value: unknown) {
  return normalizeTrimmedString(value, "INVALID_FIRST_NAME", 60, true);
}

export function normalizeLastName(value: unknown) {
  return normalizeTrimmedString(value, "INVALID_LAST_NAME", 60, true);
}

export function normalizeBio(value: unknown) {
  return normalizeTrimmedString(value, "INVALID_BIO", 2000, true);
}

export function normalizeLocation(value: unknown) {
  return normalizeTrimmedString(value, "INVALID_LOCATION", 160, true);
}

export function normalizeGrewUpLocation(value: unknown) {
  return normalizeTrimmedString(value, "INVALID_GREW_UP_LOCATION", 160, true);
}

export function normalizeCurrentLocation(value: unknown) {
  return normalizeTrimmedString(value, "INVALID_CURRENT_LOCATION", 160, true);
}

export function normalizeProudOf(value: unknown) {
  return normalizeTrimmedString(value, "INVALID_PROUD_OF", 2000, true);
}

export function normalizeOccupation(value: unknown) {
  return normalizeTrimmedString(value, "INVALID_OCCUPATION", 200, true);
}

export function normalizeInterests(value: unknown) {
  return normalizeTrimmedString(value, "INVALID_INTERESTS", 500, true);
}

export function normalizeOptionalDate(value: unknown, fieldCode: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new PersonError(fieldCode, 400);

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new PersonError(fieldCode, 400);
  }

  return d;
}

export function normalizePhotoUrl(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new PersonError("INVALID_PHOTO_URL", 400);

  const trimmed = value.trim();
  if (trimmed.length > 500) throw new PersonError("INVALID_PHOTO_URL", 400);

  // Allow relative paths (for Vercel Blob pathnames like "profile-photos/...")
  // or full URLs (http/https)
  if (trimmed.startsWith("profile-photos/") || trimmed.startsWith("/")) {
    return trimmed;
  }

  // Validate full URLs
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new PersonError("INVALID_PHOTO_URL", 400);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new PersonError("INVALID_PHOTO_URL", 400);
  }

  return trimmed;
}

export function assertBirthBeforeDeath(birthDate?: Date | null, deathDate?: Date | null) {
  if (birthDate && deathDate && birthDate.getTime() > deathDate.getTime()) {
    throw new PersonError("BIRTH_AFTER_DEATH", 400);
  }
}

export function buildPersonPatch(body: any) {
  const firstName = normalizeFirstName(body?.firstName);
  const lastName = normalizeLastName(body?.lastName);
  const fullName = normalizeFullName(body?.fullName);
  const bio = normalizeBio(body?.bio);
  const location = normalizeLocation(body?.location);
  const grewUpLocation = normalizeGrewUpLocation(body?.grewUpLocation);
  const currentLocation = normalizeCurrentLocation(body?.currentLocation);
  const birthDate = normalizeOptionalDate(body?.birthDate, "INVALID_BIRTH_DATE");
  const deathDate = normalizeOptionalDate(body?.deathDate, "INVALID_DEATH_DATE");
  const photoUrl = normalizePhotoUrl(body?.photoUrl);
  const proudOf = normalizeProudOf(body?.proudOf);
  const occupation = normalizeOccupation(body?.occupation);
  const interests = normalizeInterests(body?.interests);
  const isPrivate = typeof body?.isPrivate === "boolean" ? body.isPrivate : undefined;

  assertBirthBeforeDeath(
    birthDate === undefined ? undefined : birthDate,
    deathDate === undefined ? undefined : deathDate
  );

  const data: Record<string, unknown> = {};

  if (firstName !== undefined) data.firstName = firstName;
  if (lastName !== undefined) data.lastName = lastName;
  if (fullName !== undefined) data.fullName = fullName;
  if (bio !== undefined) data.bio = bio;
  if (location !== undefined) data.location = location;
  if (grewUpLocation !== undefined) data.grewUpLocation = grewUpLocation;
  if (currentLocation !== undefined) data.currentLocation = currentLocation;
  if (birthDate !== undefined) data.birthDate = birthDate;
  if (deathDate !== undefined) data.deathDate = deathDate;
  if (photoUrl !== undefined) data.photoUrl = photoUrl;
  if (proudOf !== undefined) data.proudOf = proudOf;
  if (occupation !== undefined) data.occupation = occupation;
  if (interests !== undefined) data.interests = interests;
  if (isPrivate !== undefined) data.isPrivate = isPrivate;

  if (Object.keys(data).length === 0) {
    throw new PersonError("NO_VALID_FIELDS", 400);
  }

  return data;
}
