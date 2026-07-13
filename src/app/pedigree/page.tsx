"use client";
// Pedigree page - March 17 2026 rebuild v4
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { PedigreeCanvas } from "@/components/PedigreeCanvas";
import { useLanguage, LanguageToggle } from "@/contexts/LanguageContext";

// Format phone number as user types - supports up to 12 digits for international
function formatPhoneNumber(value: string): string {
  // Remove all non-digits
  const digits = value.replace(/\D/g, "");
  
  // Limit to 12 digits to support international numbers
  const limited = digits.slice(0, 12);
  
  if (limited.length === 0) return "";
  if (limited.length <= 3) return `(${limited}`;
  if (limited.length <= 6) return `(${limited.slice(0, 3)}) ${limited.slice(3)}`;
  if (limited.length <= 10) return `(${limited.slice(0, 3)}) ${limited.slice(3, 6)}-${limited.slice(6)}`;
  // For numbers longer than 10 digits (international), add remaining digits
  return `(${limited.slice(0, 3)}) ${limited.slice(3, 6)}-${limited.slice(6, 10)}-${limited.slice(10)}`;
}

// Get raw digits from formatted phone
function getPhoneDigits(formatted: string): string {
  return formatted.replace(/\D/g, "");
}

type TreeApiNode = {
  id: string;
  fullName?: string;
  isPrivate?: boolean;
  createdAt?: string;
  bio?: string | null;
  location?: string | null;
  birthDate?: string | null;
  deathDate?: string | null;
  photoUrl?: string | null;
  claimedByUserId?: string | null;
};

type TreeApiEdgePC = { parentId: string; childId: string };
type TreeApiEdgeSp = { aId: string; bId: string };

type TreeApiResponse = {
  centerId: string;
  depth: number;
  limit: number;
  nodes: TreeApiNode[];
  edges: {
    parentChild: TreeApiEdgePC[];
    spouse: TreeApiEdgeSp[];
  };
};

type PersonLite = {
  id: string;
  fullName: string;
  photoUrl?: string | null;
  createdAt: string;
  isPrivate: boolean;
  claimedByUserId?: string | null;
  relationshipType?: string | null; // parent/child links: biological | adopted | step | guardian
  relationshipStatus?: string | null; // spouse links: married | partner | divorced | widowed
};

type DuplicateMatch = {
  id: string;
  fullName: string;
  photoUrl: string | null;
  birthYear: number | null;
  claimed: boolean;
};

type PersonDetail = {
  person: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    fullName: string;
    bio?: string | null;
    location?: string | null;
    grewUpLocation?: string | null;
    currentLocation?: string | null;
    birthDate?: string | null;
    deathDate?: string | null;
    gender?: string | null;
    photoUrl?: string | null;
    proudOf?: string | null;
    story?: string | null;
    occupation?: string | null;
    interests?: string | null;
    isPrivate: boolean;
    isVerified: boolean;
    createdAt: string;
    claimedByUserId?: string | null;
    fieldVisibility?: Record<string, string> | null; // claimer-only in API response
  };
  parents: PersonLite[];
  children: PersonLite[];
  spouses: PersonLite[];
  siblings: PersonLite[];
  canVouch?: boolean; // Whether current user can vouch for this person
};

type SearchResult = {
  id: string;
  fullName: string;
  isPrivate: boolean;
  createdAt: string;
  claimedByUserId?: string | null;
};

type RelMode = "PARENT" | "CHILD" | "SPOUSE" | "SIBLING";

function badgeStyle(claimed: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.2,
    background: claimed ? "#ecfdf5" : "#fffbeb",
    color: claimed ? "#166534" : "#b45309",
    border: `1px solid ${claimed ? "#a7f3d0" : "#fde68a"}`,
  };
}

function sectionCardStyle(): React.CSSProperties {
  return {
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    background: "#ffffff",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
  };
}

function drawerListButtonStyle(): React.CSSProperties {
  return {
    width: "100%",
    textAlign: "left",
    border: "1px solid #e5e7eb",
    background: "#ffffff",
    borderRadius: 12,
    padding: "10px 12px",
    cursor: "pointer",
  };
}

function actionButtonStyle(primary = false): React.CSSProperties {
  return {
    borderRadius: 12,
    padding: "10px 14px",
    border: primary ? "1px solid #111827" : "1px solid #d1d5db",
    background: primary ? "#111827" : "#ffffff",
    color: primary ? "#ffffff" : "#111827",
    fontWeight: 700,
    cursor: "pointer",
  };
}

// Pedigree tree view component
export default function PedigreePage() {
  const { status } = useSession();

  const initialCenterId = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("centerId") ?? "";
  }, []);

  const [treeData, setTreeData] = useState<TreeApiResponse | null>(null);
  const [currentCenterId, setCurrentCenterId] = useState<string>(initialCenterId);
  const [selectedId, setSelectedId] = useState<string>(initialCenterId);
  const [focusKey, setFocusKey] = useState(0);
  const [personDetail, setPersonDetail] = useState<PersonDetail | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loadingTree, setLoadingTree] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [initializing, setInitializing] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  const [relMode, setRelMode] = useState<RelMode>("PARENT");
  const [relBusy, setRelBusy] = useState(false);
  const [newRelativeName, setNewRelativeName] = useState("");
  const [newRelativePrivate, setNewRelativePrivate] = useState(false);
  const [existingRelQuery, setExistingRelQuery] = useState("");
  const [existingRelResults, setExistingRelResults] = useState<SearchResult[]>([]);
  const [existingRelOpen, setExistingRelOpen] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [vouchBusy, setVouchBusy] = useState(false);
  const [showInviteConfirm, setShowInviteConfirm] = useState(false);

  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editGender, setEditGender] = useState("");
  const [editBirthDate, setEditBirthDate] = useState("");
  const [editDeathDate, setEditDeathDate] = useState("");
  const [editGrewUpLocation, setEditGrewUpLocation] = useState("");
  const [editOccupation, setEditOccupation] = useState("");
  const [editProudOf, setEditProudOf] = useState("");
  const [editStory, setEditStory] = useState("");
  
  // Use global language context
  const { lang, setLang, t } = useLanguage();
  const [editInterests, setEditInterests] = useState("");
  const [editPhotoUrl, setEditPhotoUrl] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [editBusy, setEditBusy] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [myUserId, setMyUserId] = useState<string | null>(null);
  // Scribe mode (Phase 3a): edits to an unclaimed profile get "told by" attribution
  const [scribeMode, setScribeMode] = useState(false);
  // Duplicate warning (Phase 3b): non-blocking; user picks existing or creates anyway
  const [dupWarning, setDupWarning] = useState<{ name: string; matches: DuplicateMatch[] } | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      window.location.href = "/sign-in";
    }
  }, [status]);

  const syncUrl = useCallback((id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("centerId", id);
    window.history.replaceState({}, "", url.toString());
  }, []);

  const loadPersonDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);

    try {
      const res = await fetch(`/api/people/${encodeURIComponent(id)}`);
      const data = await res.json().catch(() => null);

      if (!res.ok || !data) {
        setPersonDetail(null);
        setError((data as any)?.error ?? `PERSON_LOAD_FAILED_${res.status}`);
        return;
      }

      const detail = data as PersonDetail;
      setPersonDetail(detail);
      
      // Populate form fields
setEditFirstName(detail.person.firstName ?? "");
  setEditLastName(detail.person.lastName ?? "");
  setEditGender(detail.person.gender ?? "");
  setEditBirthDate(detail.person.birthDate ? detail.person.birthDate.split("T")[0] : "");
      setEditDeathDate(detail.person.deathDate ? detail.person.deathDate.split("T")[0] : "");
      setEditGrewUpLocation(detail.person.grewUpLocation ?? "");
      setEditOccupation(detail.person.occupation ?? "");
      setEditProudOf(detail.person.proudOf ?? "");
      setEditStory(detail.person.story ?? "");
      setEditInterests(detail.person.interests ?? "");
      setEditPhotoUrl(detail.person.photoUrl ?? "");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const loadTree = useCallback(
    async (id: string) => {
      if (!id) return;

      setLoadingTree(true);
      setError(null);

      try {
        const res = await fetch(`/api/tree?centerId=${encodeURIComponent(id)}&depth=4`);
        const data = (await res.json().catch(() => null)) as TreeApiResponse | null;

        if (!res.ok || !data) {
          setTreeData(null);
          setError((data as any)?.error ?? `TREE_LOAD_FAILED_${res.status}`);
          return;
        }

        setCurrentCenterId(id);
        setSelectedId(id);
        setTreeData(data);
        syncUrl(id);
        setFocusKey((v) => v + 1);
        await loadPersonDetail(id);
      } finally {
        setLoadingTree(false);
      }
    },
    [loadPersonDetail, syncUrl]
  );

  useEffect(() => {
    async function initializeTree() {
      try {
        const res = await fetch("/api/me");
        if (res.ok) {
          const data = await res.json();
          if (data.user?.id) setMyUserId(data.user.id);
          if (initialCenterId) {
            await loadTree(initialCenterId);
          } else if (data.claimedPersonId) {
            await loadTree(data.claimedPersonId);
          }
        } else if (initialCenterId) {
          await loadTree(initialCenterId);
        }
      } catch {
        // Silently fail
      } finally {
        setInitializing(false);
      }
    }
    void initializeTree();
  }, [initialCenterId, loadTree]);

    const selectPersonInCurrentTree = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setError(null);
      setFocusKey((v) => v + 1);
      await loadPersonDetail(id);
    },
    [loadPersonDetail]
  );

  const runGlobalSearch = useCallback(
    async (q: string) => {
      if (!selectedId || !q.trim()) {
        setSearchResults([]);
        return;
      }

      const res = await fetch(
        `/api/people/search?q=${encodeURIComponent(q)}&centerId=${encodeURIComponent(selectedId)}&limit=10`
      );

      if (!res.ok) return;

      const data = await res.json().catch(() => ({ results: [] }));
      setSearchResults(data.results ?? []);
    },
    [selectedId]
  );

  useEffect(() => {
    const q = searchQuery.trim();

    if (!q || !selectedId) {
      setSearchOpen(false);
      setSearchResults([]);
      return;
    }

    setSearchOpen(true);
    const t = setTimeout(() => {
      void runGlobalSearch(q);
    }, 180);

    return () => clearTimeout(t);
  }, [searchQuery, runGlobalSearch, selectedId]);

  const runRelationshipSearch = useCallback(
    async (q: string) => {
      if (!selectedId || !q.trim()) {
        setExistingRelResults([]);
        return;
      }

      const res = await fetch(
        `/api/people/search?q=${encodeURIComponent(q)}&centerId=${encodeURIComponent(selectedId)}&limit=10`
      );

      if (!res.ok) return;

      const data = await res.json().catch(() => ({ results: [] }));
      setExistingRelResults((data.results ?? []).filter((p: SearchResult) => p.id !== selectedId));
    },
    [selectedId]
  );

  useEffect(() => {
    const q = existingRelQuery.trim();

    if (!q || !selectedId) {
      setExistingRelOpen(false);
      setExistingRelResults([]);
      return;
    }

    setExistingRelOpen(true);
    const t = setTimeout(() => {
      void runRelationshipSearch(q);
    }, 180);

    return () => clearTimeout(t);
  }, [existingRelQuery, runRelationshipSearch, selectedId]);

  async function createPersonQuick(fullName: string, isPrivate: boolean) {
    const res = await fetch("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, isPrivate }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? `CREATE_FAILED_${res.status}`);
    return data.person.id as string;
  }

  async function linkParentChild(parentId: string, childId: string) {
    const res = await fetch("/api/relationships/parent-child", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId, childId }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? `LINK_PC_FAILED_${res.status}`);
  }

  async function linkSpouse(aId: string, bId: string) {
    const res = await fetch("/api/relationships/spouse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aId, bId }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? `LINK_SPOUSE_FAILED_${res.status}`);
  }

  async function linkRelationship(targetId: string) {
    if (!selectedId) return;

    setRelBusy(true);
    setError(null);

    try {
      if (relMode === "PARENT") {
        await linkParentChild(targetId, selectedId);
      } else if (relMode === "CHILD") {
        await linkParentChild(selectedId, targetId);
      } else if (relMode === "SPOUSE") {
        // API automatically links children of both spouses to each other
        await linkSpouse(selectedId, targetId);
      } else if (relMode === "SIBLING") {
        // Link sibling by sharing parents
        if (!personDetail?.parents || personDetail.parents.length === 0) {
          throw new Error("Cannot add sibling: selected person has no parents. Add parents first.");
        }
        // Link the sibling to all of the selected person's parents
        for (const parent of personDetail.parents) {
          await linkParentChild(parent.id, targetId);
        }
      }

      setExistingRelQuery("");
      setExistingRelOpen(false);
      await loadTree(selectedId);
    } catch (e: unknown) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setRelBusy(false);
    }
  }

  async function createAndLinkRelationship(skipDuplicateCheck = false) {
    const name = newRelativeName.trim();
    if (!selectedId || !name) return;

    setRelBusy(true);
    setError(null);

    try {
      // Duplicate warning (Phase 3b): non-blocking — offer the existing match
      // but never prevent creation
      if (!skipDuplicateCheck) {
        const dupRes = await fetch(`/api/people/duplicates?name=${encodeURIComponent(name)}`);
        const dupData = await dupRes.json().catch(() => ({ matches: [] }));
        const matches = (dupData?.matches ?? []).filter((m: DuplicateMatch) => m.id !== selectedId);
        if (dupRes.ok && matches.length > 0) {
          setDupWarning({ name, matches });
          setRelBusy(false);
          return;
        }
      }
      setDupWarning(null);

      const newId = await createPersonQuick(name, newRelativePrivate);

      if (relMode === "PARENT") {
        await linkParentChild(newId, selectedId);
      } else if (relMode === "CHILD") {
        await linkParentChild(selectedId, newId);
      } else if (relMode === "SPOUSE") {
        // API automatically links children of both spouses to each other
        await linkSpouse(selectedId, newId);
      } else if (relMode === "SIBLING") {
        // Link sibling by sharing parents
        if (!personDetail?.parents || personDetail.parents.length === 0) {
          throw new Error("Cannot add sibling: selected person has no parents. Add parents first.");
        }
        // Link the new sibling to all of the selected person's parents
        for (const parent of personDetail.parents) {
          await linkParentChild(parent.id, newId);
        }
      }

      setNewRelativeName("");
      setNewRelativePrivate(false);
      await loadTree(selectedId);
    } catch (e: unknown) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setRelBusy(false);
    }
  }

  // Duplicate warning: "Use existing" — link the already-existing person
  async function useExistingFromDuplicate(existingId: string) {
    setDupWarning(null);
    setNewRelativeName("");
    await linkRelationship(existingId);
  }

  // Set relationship type on a parent/child link (Phase 3c)
  async function setParentChildType(parentId: string, childId: string, type: string) {
    setError(null);
    const res = await fetch("/api/relationships/parent-child", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId, childId, type: type || null }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? `TYPE_UPDATE_FAILED_${res.status}`);
      return;
    }
    if (selectedId) await loadPersonDetail(selectedId);
  }

  // Set status on a spouse link (Phase 3c)
  async function setSpouseStatus(spouseId: string, status: string) {
    if (!selectedId) return;
    setError(null);
    const res = await fetch("/api/relationships/spouse", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aId: selectedId, bId: spouseId, status: status || null }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? `STATUS_UPDATE_FAILED_${res.status}`);
      return;
    }
    await loadPersonDetail(selectedId);
  }

  // Per-field privacy (Phase 3d): claimer marks a field private/family
  async function toggleFieldPrivacy(field: string) {
    if (!selectedId || !personDetail) return;
    const current = personDetail.person.fieldVisibility ?? {};
    const next: Record<string, string> = { ...current };
    if (next[field] === "private") {
      delete next[field];
    } else {
      next[field] = "private";
    }

    setEditBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/people/${encodeURIComponent(selectedId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fieldVisibility: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? `PRIVACY_UPDATE_FAILED_${res.status}`);
        return;
      }
      await loadPersonDetail(selectedId);
    } finally {
      setEditBusy(false);
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPhoto(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Photo upload failed");
        return;
      }

      // Store the pathname for serving via /api/file route
      setEditPhotoUrl(data.pathname);
    } catch {
      setError("Photo upload failed");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function saveSelectedPerson() {
    if (!selectedId) return;

    // Compute fullName from firstName + lastName
    const fullName = [editFirstName.trim(), editLastName.trim()].filter(Boolean).join(" ") || "Unnamed";

    setEditBusy(true);
    setError(null);

    try {
      // Use new simplified save-profile API
      const res = await fetch("/api/save-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          personId: selectedId,
          firstName: editFirstName.trim() || null,
          lastName: editLastName.trim() || null,
          fullName,
          gender: editGender || null,
          birthDate: editBirthDate || null,
          deathDate: editDeathDate || null,
          grewUpLocation: editGrewUpLocation.trim() || null,
          occupation: editOccupation.trim() || null,
          proudOf: editProudOf.trim() || null,
        story: editStory.trim() || null,
          interests: editInterests.trim() || null,
          photoUrl: editPhotoUrl || null,
          // Scribe attribution (Phase 3a): this edit records the profile
          // person's own knowledge, written down by the current user
          toldByPersonId:
            scribeMode && !personDetail?.person.claimedByUserId ? selectedId : undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error ?? `SAVE_FAILED_${res.status}`);
        return;
      }
      await loadTree(selectedId);
      await loadPersonDetail(selectedId);
    } finally {
      setEditBusy(false);
    }
  }

  async function togglePrivacy() {
    if (!selectedId || !personDetail) return;

    setEditBusy(true);
    setError(null);

    try {
      const res = await fetch(`/api/people/${encodeURIComponent(selectedId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isPrivate: !personDetail.person.isPrivate }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error ?? `PRIVACY_TOGGLE_FAILED_${res.status}`);
        return;
      }

      await loadTree(selectedId);
    } finally {
      setEditBusy(false);
    }
  }

// Show confirmation before sending invite
  function handleInviteClick() {
    const phoneDigits = getPhoneDigits(invitePhone);
    const hasEmail = inviteEmail.trim().length > 0;
    const hasPhone = phoneDigits.length >= 10;
    if (!selectedId || (!hasEmail && !hasPhone)) return;
    setShowInviteConfirm(true);
  }

  async function sendInvite() {
    const phoneDigits = getPhoneDigits(invitePhone);
    const hasEmail = inviteEmail.trim().length > 0;
    const hasPhone = phoneDigits.length >= 10;
    if (!selectedId || (!hasEmail && !hasPhone)) return;
    
    setInviteBusy(true);
    setError(null);
    setShowInviteConfirm(false);
    
    try {
      const payload: { targetPersonId: string; email?: string; phone?: string } = {
        targetPersonId: selectedId,
      };
      // Add email if provided
      if (hasEmail) {
        payload.email = inviteEmail.trim();
      }
      // Add phone if provided - prepend + for international format
      if (hasPhone) {
        payload.phone = `+${phoneDigits}`;
      }

      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok) {
        setError(data?.error ?? `INVITE_FAILED_${res.status}`);
        return;
      }
      
      const inviteUrl = data.inviteUrl;
      const personName = personDetail?.person.fullName ?? "";
      
      // If phone number provided, open SMS app with pre-filled message
      if (hasPhone && inviteUrl) {
        const smsMessage = `You've been invited to join ${personName}'s family tree on Pedigree Roots! When you sign up, use this phone number (not your email). Click here to accept: ${inviteUrl}`;
        const smsUrl = `sms:${invitePhone.replace(/\D/g, "")}?body=${encodeURIComponent(smsMessage)}`;
        window.open(smsUrl, "_self");
      }
      
      // Clear inputs
      setInviteEmail("");
      setInvitePhone("");
      
      // Only show success popup if email was sent (no phone)
      // If phone was provided, SMS app handles it
      if (hasEmail && !hasPhone) {
        // Email sent - no need to show link popup
        // The email contains the link
      }
      
      await loadTree(selectedId);
    } finally {
      setInviteBusy(false);
    }
  }

  async function deleteParentChildRelationship(parentId: string, childId: string) {
    if (!confirm("Remove this parent-child relationship?\n\nThis will not delete either person, only the connection between them.")) {
      return;
    }
    
    setError(null);
    
    try {
      const res = await fetch("/api/relationships/parent-child", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId, childId }),
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? `DELETE_FAILED_${res.status}`);
        return;
      }
      
      // Refresh the person detail to update relationships
      if (selectedId) {
        await loadPersonDetail(selectedId);
        await loadTree(selectedId);
      }
    } catch (e: unknown) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  async function deleteSpouseRelationship(spouseId: string) {
    if (!selectedId) return;
    if (!confirm("Remove this spouse relationship?\n\nThis will not delete either person or affect shared children, only the marriage connection between them.")) {
      return;
    }
    
    setError(null);
    
    try {
      const res = await fetch("/api/relationships/spouse", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aId: selectedId, bId: spouseId }),
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? `DELETE_FAILED_${res.status}`);
        return;
      }
      
      // Refresh the person detail to update relationships
      if (selectedId) {
        await loadPersonDetail(selectedId);
        await loadTree(selectedId);
      }
    } catch (e: unknown) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  async function deleteSiblingRelationship(siblingId: string) {
    if (!selectedId) return;
    if (!confirm("Remove this sibling relationship?\n\nThis will remove the sibling from your shared parents. The sibling will no longer appear as a child of your parents.")) {
      return;
    }
    
    setError(null);
    
    try {
      // To remove a sibling relationship, we need to remove the parent-child links
      // that make them siblings (shared parents)
      // Get parents of both the selected person and the sibling
      const selectedParents = personDetail?.parents ?? [];
      
      // For each shared parent, remove the sibling as their child
      for (const parent of selectedParents) {
        await fetch("/api/relationships/parent-child", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parentId: parent.id, childId: siblingId }),
        });
      }
      
      // Refresh the person detail to update relationships
      if (selectedId) {
        await loadPersonDetail(selectedId);
        await loadTree(selectedId);
      }
    } catch (e: unknown) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  async function deletePerson() {
    if (!selectedId || !personDetail) return;
    
    const personName = personDetail.person.fullName || "this person";
    if (!confirm(`Delete "${personName}"?\n\nThis will permanently remove this person and all their relationships. This action cannot be undone.`)) {
      return;
    }
    
    setError(null);
    
    try {
      const res = await fetch(`/api/people/${selectedId}`, {
        method: "DELETE",
      });
      
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok) {
        if (data?.error === "CANNOT_DELETE_CLAIMED_PERSON") {
          setError("Cannot delete a claimed person. Only unclaimed profiles can be deleted.");
        } else if (data?.error === "ONLY_CREATOR_CAN_DELETE") {
          setError("You can only delete people you created.");
        } else {
          setError(data?.error ?? `DELETE_FAILED_${res.status}`);
        }
        return;
      }
      
      // Navigate back to current user's tree after deletion
      setSelectedId("");
      setPersonDetail(null);
      const meRes = await fetch("/api/me");
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData.claimedPersonId) {
          await loadTree(meData.claimedPersonId);
        }
      }
    } catch (e: unknown) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  async function vouchForPerson() {
    if (!selectedId) return;
    
    setVouchBusy(true);
    setError(null);
    
    try {
      const res = await fetch("/api/vouch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: selectedId }),
      });
      
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok) {
        setError(data?.error ?? `VOUCH_FAILED_${res.status}`);
        return;
      }
      
      // Refresh person detail to show updated verification status
      await loadPersonDetail(selectedId);
    } finally {
      setVouchBusy(false);
    }
  }

  const selectedName = personDetail?.person.fullName ?? (lang === "vi" ? "Chưa chọn người nào" : "No person selected");
  const selectedClaimed = Boolean(personDetail?.person.claimedByUserId);
const relTitle =
  relMode === "PARENT" ? t.addParent : relMode === "CHILD" ? t.addChild : relMode === "SPOUSE" ? t.addSpouse : t.addSibling;

  if (status === "loading") return null;
  if (status === "unauthenticated") return null;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        color: "#0f172a",
      }}
    >
      {/* Recenter button - fixed bottom left */}
      {selectedId && (
        <button
          type="button"
          onClick={() => {
            if (!selectedId) return;
            void loadTree(selectedId);
          }}
          style={{
            position: "fixed",
            bottom: 20,
            left: 20,
            zIndex: 50,
            padding: "12px 20px",
            borderRadius: 12,
            background: "#111827",
            color: "#ffffff",
            border: "none",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Recenter
        </button>
      )}

      {/* Mobile sidebar toggle */}
      <button
        type="button"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        style={{
          display: "none",
          position: "fixed",
          bottom: 20,
          right: 20,
          zIndex: 50,
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "#111827",
          color: "#ffffff",
          border: "none",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          cursor: "pointer",
          fontSize: 24,
        }}
        className="mobile-fab"
      >
        {sidebarOpen ? "×" : "☰"}
      </button>

      <style>{`
        .pedigree-sidebar input,
        .pedigree-sidebar textarea,
        .pedigree-sidebar select {
          box-sizing: border-box;
          width: 100%;
        }
        @media (max-width: 768px) {
          .mobile-fab { display: flex !important; align-items: center; justify-content: center; }
          .pedigree-grid { grid-template-columns: 1fr !important; }
          .pedigree-sidebar { 
            position: fixed !important; 
            top: 0 !important; 
            left: 0 !important;
            right: 0 !important; 
            bottom: 0 !important; 
            width: 100vw !important;
            max-width: 100vw !important;
            z-index: 40 !important;
            transform: translateX(${sidebarOpen ? "0" : "100%"});
            transition: transform 0.3s ease;
            overflow-y: auto !important;
            overflow-x: hidden !important;
            background: #f8fafc !important;
            padding: 12px !important;
            box-sizing: border-box !important;
          }
          .pedigree-sidebar input,
          .pedigree-sidebar textarea,
          .pedigree-sidebar select {
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
          }
          .pedigree-overlay {
            display: ${sidebarOpen ? "block" : "none"} !important;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.3);
            z-index: 35;
          }
        }
      `}</style>

      {/* Mobile overlay */}
      <div 
        className="pedigree-overlay" 
        style={{ display: "none" }}
        onClick={() => setSidebarOpen(false)}
      />

      <div
        className="pedigree-grid"
        style={{
          height: "100vh",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 360px",
          gap: 16,
          padding: 16,
        }}
      >
        <section
          style={{
            minWidth: 0,
            display: "grid",
            gridTemplateRows: "auto minmax(0, 1fr)",
            gap: 16,
          }}
        >
          <div
            style={{
              ...sectionCardStyle(),
              padding: 14,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>
              <span style={{ color: "#2d5a3d" }}>Pedigree</span>
              <span style={{ color: "#4a7c59" }}>Roots</span>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ position: "relative", width: 320, maxWidth: "100%" }}>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => searchQuery.trim() && setSearchOpen(true)}
                  placeholder={selectedId ? t.searchPeople : (lang === "vi" ? "Tải một người trước…" : "Load a person first…")}
                  disabled={!selectedId}
                  style={{
  width: "100%",
  borderRadius: 12,
  border: "1px solid #d1d5db",
  padding: "11px 14px",
  background: "#ffffff",
  color: "#111827",
  caretColor: "#111827"
}}
                />

                {searchOpen && searchResults.length > 0 ? (
                  <div
                    style={{
                      position: "absolute",
                      top: 48,
                      left: 0,
                      right: 0,
                      zIndex: 20,
                      background: "#ffffff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 14,
                      boxShadow: "0 18px 40px rgba(15, 23, 42, 0.12)",
                      padding: 8,
                    }}
                  >
                    {searchResults.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setSearchQuery("");
                          setSearchOpen(false);
                          void selectPersonInCurrentTree(r.id);
                        }}
                        style={{
  width: "100%",
  textAlign: "left",
  border: "none",
  background: "#ffffff",
  color: "#111827",
  padding: "10px 12px",
  borderRadius: 10,
  cursor: "pointer",
}}
                      >
                        <div style={{ fontWeight: 700, color: "#111827" }}>{r.fullName}</div>
                        <div style={{ marginTop: 2, fontSize: 12, color: "#64748b" }}>
                          {r.isPrivate ? "Private" : "Public"} ·{" "}
                          {r.claimedByUserId ? "Claimed" : "Unclaimed"}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <a
                href="/activity"
                style={{
                  borderRadius: 12,
                  border: "1px solid #d1d5db",
                  padding: "11px 14px",
                  background: "#ffffff",
                  color: "#111827",
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: 14,
                  whiteSpace: "nowrap",
                }}
              >
                Activity
              </a>

              </div>
          </div>

          <div
            style={{
              ...sectionCardStyle(),
              overflow: "hidden",
              minHeight: 0,
              position: "relative",
            }}
          >
            {initializing ? (
              <div style={{ padding: 24 }}>Loading...</div>
            ) : !selectedId && !treeData ? (
              <div style={{ padding: 24 }}>
                <div style={{ fontSize: 20, fontWeight: 800 }}>No pedigree found</div>
                <div style={{ marginTop: 8, color: "#64748b" }}>
                  You haven&apos;t claimed a person profile yet. Accept an invitation to get started.
                </div>
              </div>
            ) : loadingTree && !treeData ? (
              <div style={{ padding: 24 }}>Loading pedigree…</div>
            ) : treeData ? (
             <PedigreeCanvas
  data={treeData}
  selectedId={selectedId}
  focusKey={focusKey}
  onSelectPerson={(id) => {
    void selectPersonInCurrentTree(id);
  }}
  onNavigateToTree={(id) => {
    void loadTree(id);
  }}
/>

            ) : (
              <div style={{ padding: 24 }}>Unable to load pedigree.</div>
            )}

            {error ? (
              <div
                style={{
                  position: "absolute",
                  left: 16,
                  bottom: 16,
                  maxWidth: 440,
                  background: "#fef2f2",
                  color: "#991b1b",
                  border: "1px solid #fecaca",
                  borderRadius: 14,
                  padding: "12px 14px",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 4 }}>Error</div>
                <div style={{ fontSize: 14 }}>{error}</div>
              </div>
            ) : null}
          </div>
        </section>

        <aside
          className="pedigree-sidebar"
          style={{
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            overflowY: "auto",
            maxHeight: "calc(100vh - 32px)",
            paddingBottom: 24,
          }}
        >
          <div style={{ ...sectionCardStyle(), padding: 16 }}>
            {/* Language Toggle - Top Left */}
            <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 12 }}>
              <LanguageToggle />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, color: "#64748b" }}>
                  {lang === "vi" ? "NGƯỜI ĐƯỢC CHỌN" : "SELECTED PERSON"}
                </div>
                <div style={{ marginTop: 4, fontSize: 22, lineHeight: "28px", fontWeight: 900 }}>
                  {selectedName}
                </div>
              </div>

              <div style={{ display: "flex", gap: 6 }}>
                <div style={badgeStyle(selectedClaimed)}>
                  {selectedClaimed ? (lang === "vi" ? "ĐÃ NHẬN" : "CLAIMED") : (lang === "vi" ? "CHƯA NHẬN" : "UNCLAIMED")}
                </div>
                {selectedClaimed && (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      borderRadius: 999,
                      padding: "4px 10px",
                      fontSize: 11,
                      fontWeight: 700,
                      background: personDetail?.person.isVerified ? "#d1fae5" : "#fef3c7",
                      color: personDetail?.person.isVerified ? "#065f46" : "#92400e",
                    }}
                  >
                    {personDetail?.person.isVerified ? (lang === "vi" ? "ĐÃ XÁC MINH" : "VERIFIED") : (lang === "vi" ? "CHƯA XÁC MINH" : "UNVERIFIED")}
                  </div>
                )}
              </div>
            </div>

            {loadingDetail ? (
              <div style={{ marginTop: 12, color: "#64748b" }}>{t.loading}</div>
            ) : personDetail ? (
              <>
                <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
                  {/* Profile Photo */}
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div
                      style={{
                        width: 80,
                        height: 80,
                        borderRadius: "50%",
                        background: "#e2e8f0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                        flexShrink: 0,
                      }}
                    >
                      {editPhotoUrl ? (
                        <img
                          src={`/api/file?pathname=${encodeURIComponent(editPhotoUrl)}`}
                          alt={t.profile}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <span style={{ fontSize: 32, color: "#94a3b8" }}>
                          {editFirstName?.[0]?.toUpperCase() || editLastName?.[0]?.toUpperCase() || "?"}
                        </span>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          display: "inline-block",
                          padding: "8px 16px",
                          borderRadius: 8,
                          background: "#f1f5f9",
                          color: "#334155",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: uploadingPhoto ? "not-allowed" : "pointer",
                          opacity: uploadingPhoto ? 0.6 : 1,
                        }}
                      >
                        {uploadingPhoto ? t.uploadingPhoto : editPhotoUrl ? t.changePhoto : t.uploadPhoto}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp"
                          onChange={handlePhotoUpload}
                          disabled={uploadingPhoto}
                          style={{ display: "none" }}
                        />
                      </label>
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
                        {t.photoFormat}
                      </div>
                    </div>
                  </div>

                  {/* Name fields */}
                  <div className="name-fields-grid" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4, display: "block" }}>
                        {t.firstName}
                      </label>
                      <input
                        value={editFirstName}
                        onChange={(e) => setEditFirstName(e.target.value)}
                        placeholder={t.firstNamePlaceholder}
                        style={{
                          width: "100%",
                          maxWidth: "100%",
                          boxSizing: "border-box" as const,
                          borderRadius: 12,
                          border: "1px solid #d1d5db",
                          padding: "10px 12px",
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4, display: "block" }}>
                        {t.lastName}
                      </label>
                      <input
                        value={editLastName}
                        onChange={(e) => setEditLastName(e.target.value)}
                        placeholder={t.lastNamePlaceholder}
                        style={{
                          width: "100%",
                          maxWidth: "100%",
                          boxSizing: "border-box" as const,
                          borderRadius: 12,
                          border: "1px solid #d1d5db",
                          padding: "10px 12px",
                        }}
                      />
                    </div>
                  </div>

                  {/* Gender */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4, display: "block" }}>
                      {t.gender}
                    </label>
                    <select
                      value={editGender}
                      onChange={(e) => setEditGender(e.target.value)}
                      style={{
                        width: "100%",
                        maxWidth: "100%",
                        boxSizing: "border-box" as const,
                        borderRadius: 12,
                        border: "1px solid #d1d5db",
                        padding: "10px 12px",
                        background: "#111827",
                        color: "#ffffff",
                      }}
                    >
                      <option value="" style={{ background: "#111827", color: "#ffffff" }}>{t.preferNotToSay}</option>
                      <option value="male" style={{ background: "#111827", color: "#ffffff" }}>{t.male}</option>
                      <option value="female" style={{ background: "#111827", color: "#ffffff" }}>{t.female}</option>
                      <option value="other" style={{ background: "#111827", color: "#ffffff" }}>{t.other}</option>
                    </select>
                  </div>

                  {/* Lived From - To */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4, display: "block" }}>
                      {t.livedFromTo}
                    </label>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <input
                        type="date"
                        value={editBirthDate}
                        onChange={(e) => setEditBirthDate(e.target.value)}
                        style={{
                          width: "100%",
                          maxWidth: "100%",
                          boxSizing: "border-box" as const,
                          borderRadius: 12,
                          border: "1px solid #d1d5db",
                          padding: "10px 12px",
                        }}
                      />
                      <span style={{ color: "#64748b", fontWeight: 700, textAlign: "center" }}>—</span>
                      <input
                        type="date"
                        value={editDeathDate}
                        onChange={(e) => setEditDeathDate(e.target.value)}
                        style={{
                          width: "100%",
                          maxWidth: "100%",
                          boxSizing: "border-box" as const,
                          borderRadius: 12,
                          border: "1px solid #d1d5db",
                          padding: "10px 12px",
                        }}
                      />
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                      {t.leaveEndDateEmpty}
                    </div>
                  </div>

                  {/* Where did you grow up */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4, display: "block" }}>
                      {t.grewUp}
                    </label>
                    <input
                      value={editGrewUpLocation}
                      onChange={(e) => setEditGrewUpLocation(e.target.value)}
                      placeholder={t.grewUpPlaceholder}
                      style={{
                        width: "100%",
                        maxWidth: "100%",
                        boxSizing: "border-box" as const,
                        borderRadius: 12,
                        border: "1px solid #d1d5db",
                        padding: "10px 12px",
                      }}
                    />
                  </div>

                  {/* Occupation */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4, display: "block" }}>
                      {t.occupation}
                    </label>
                    <input
                      value={editOccupation}
                      onChange={(e) => setEditOccupation(e.target.value)}
                      placeholder={t.occupationPlaceholder}
                      style={{
                        width: "100%",
                        maxWidth: "100%",
                        boxSizing: "border-box" as const,
                        borderRadius: 12,
                        border: "1px solid #d1d5db",
                        padding: "10px 12px",
                      }}
                    />
                  </div>

                  {/* Interests */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4, display: "block" }}>
                      {t.interests}
                    </label>
                    <input
                      value={editInterests}
                      onChange={(e) => setEditInterests(e.target.value)}
                      placeholder={t.interestsPlaceholder}
                      style={{
                        width: "100%",
                        maxWidth: "100%",
                        boxSizing: "border-box" as const,
                        borderRadius: 12,
                        border: "1px solid #d1d5db",
                        padding: "10px 12px",
                      }}
                    />
                  </div>

                  {/* Story */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4, display: "block" }}>
                      {t.story}
                    </label>
                    <textarea
                      value={editStory}
                      onChange={(e) => setEditStory(e.target.value)}
                      placeholder={t.storyPlaceholder}
                      rows={4}
                      style={{
                        width: "100%",
                        maxWidth: "100%",
                        boxSizing: "border-box" as const,
                        borderRadius: 12,
                        border: "1px solid #d1d5db",
                        padding: "10px 12px",
                        resize: "vertical",
                        fontFamily: "inherit",
                      }}
                    />
                  </div>

                  {/* Proud Of */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4, display: "block" }}>
                      {t.proudOf}
                    </label>
                    <textarea
                      value={editProudOf}
                      onChange={(e) => setEditProudOf(e.target.value)}
                      placeholder={t.proudOfPlaceholder}
                      rows={3}
                      style={{
                        width: "100%",
                        maxWidth: "100%",
                        boxSizing: "border-box" as const,
                        borderRadius: 12,
                        border: "1px solid #d1d5db",
                        padding: "10px 12px",
                        resize: "vertical",
                        fontFamily: "inherit",
                      }}
                    />
                  </div>

                  {/* Scribe mode (Phase 3a): only for unclaimed profiles */}
                  {!selectedClaimed && (
                    <label
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 8,
                        fontSize: 13,
                        color: "#374151",
                        background: scribeMode ? "rgba(45, 90, 61, 0.06)" : "transparent",
                        border: `1px solid ${scribeMode ? "#a7f3d0" : "#e5e7eb"}`,
                        borderRadius: 12,
                        padding: "10px 12px",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={scribeMode}
                        onChange={(e) => setScribeMode(e.target.checked)}
                        style={{ marginTop: 2 }}
                      />
                      <span>
                        <strong>{lang === "vi" ? "Tôi đang điền giúp/cùng họ" : "I'm filling this in with/for them"}</strong>
                        <span style={{ display: "block", color: "#64748b", marginTop: 2 }}>
                          {lang === "vi"
                            ? "Các thay đổi sẽ ghi rõ thông tin do họ kể lại, bạn ghi chép."
                            : "Changes will be recorded as their knowledge, written down by you."}
                        </span>
                      </span>
                    </label>
                  )}

                  {/* Per-field privacy (Phase 3d): claimer only, on own profile */}
                  {personDetail.person.claimedByUserId && personDetail.person.claimedByUserId === myUserId && (
                    <div
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        padding: "10px 12px",
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 8 }}>
                        {lang === "vi" ? "Chỉ mình tôi thấy:" : "Keep private (only you and admins see):"}
                      </div>
                      <div style={{ display: "grid", gap: 6 }}>
                        {[
                          { field: "birthDate", label: lang === "vi" ? "Ngày sinh" : "Birth date" },
                          { field: "currentLocation", label: lang === "vi" ? "Nơi ở hiện tại" : "Current location" },
                          { field: "grewUpLocation", label: lang === "vi" ? "Nơi lớn lên" : "Grew up in" },
                        ].map(({ field, label }) => (
                          <label key={field} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                            <input
                              type="checkbox"
                              checked={(personDetail.person.fieldVisibility ?? {})[field] === "private"}
                              onChange={() => void toggleFieldPrivacy(field)}
                              disabled={editBusy}
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => void saveSelectedPerson()}
                      disabled={!selectedId || editBusy}
                      style={actionButtonStyle(true)}
                    >
                      {editBusy ? t.saving : t.saveChanges}
                    </button>

                    <button
                      type="button"
                      onClick={() => void togglePrivacy()}
                      disabled={!selectedId || editBusy}
                      style={actionButtonStyle(false)}
                    >
                      {personDetail.person.isPrivate ? t.makePublic : t.makePrivate}
                    </button>

                    {/* Vouch button - only show for claimed but unverified persons */}
                    {selectedClaimed && !personDetail.person.isVerified && personDetail.canVouch && (
                      <button
                        type="button"
                        onClick={() => void vouchForPerson()}
                        disabled={vouchBusy}
                        style={{
                          ...actionButtonStyle(false),
                          background: "#d1fae5",
                          color: "#065f46",
                          border: "1px solid #10b981",
                        }}
                      >
                        {vouchBusy ? t.verifying : t.verify}
                      </button>
                    )}

                    {/* Delete button - only show for unclaimed persons created by current user */}
                    {!selectedClaimed && (
                      <button
                        type="button"
                        onClick={() => void deletePerson()}
                        style={{
                          ...actionButtonStyle(false),
                          background: "#fef2f2",
                          color: "#dc2626",
                          border: "1px solid #fca5a5",
                        }}
                      >
                        {t.deletePerson}
                      </button>
                    )}
                  </div>
                </div>

                {!selectedClaimed ? (
                  <div
                    style={{
                      marginTop: 16,
                      borderTop: "1px solid #e5e7eb",
                      paddingTop: 16,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, color: "#64748b" }}>
                      {t.inviteToClaim}
                    </div>

                    {/* Email and Phone inputs */}
                    <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
                          {t.email}
                        </label>
                        <input
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder={t.emailPlaceholder}
                          type="email"
                          style={{
                            width: "100%",
                            borderRadius: 10,
                            border: "1px solid #d1d5db",
                            padding: "10px 12px",
                            fontSize: 14,
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
                          {t.phone} <span style={{ fontWeight: 400, color: "#9ca3af" }}>(with country code)</span>
                        </label>
                        <input
                          value={invitePhone}
                          onChange={(e) => setInvitePhone(formatPhoneNumber(e.target.value))}
                          placeholder="(1) 555-123-4567"
                          type="tel"
                          style={{
                            width: "100%",
                            borderRadius: 10,
                            border: "1px solid #d1d5db",
                            padding: "10px 12px",
                            fontSize: 14,
                            fontFamily: "system-ui, -apple-system, sans-serif",
                            letterSpacing: "0.5px",
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleInviteClick}
                        disabled={(!inviteEmail.trim() && getPhoneDigits(invitePhone).length < 10) || inviteBusy}
                        style={actionButtonStyle(false)}
                      >
                        {inviteBusy ? t.sendingInvite : t.sendInvite}
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          <div style={{ ...sectionCardStyle(), padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, color: "#64748b" }}>
              {t.relationshipActions}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <button
                type="button"
                onClick={() => setRelMode("PARENT")}
                style={{
                  ...actionButtonStyle(relMode === "PARENT"),
                  background: relMode === "PARENT" ? "#111827" : "#ffffff",
                  color: relMode === "PARENT" ? "#ffffff" : "#111827",
                }}
              >
                {t.parent}
              </button>

              <button
                type="button"
                onClick={() => setRelMode("CHILD")}
                style={{
                  ...actionButtonStyle(relMode === "CHILD"),
                  background: relMode === "CHILD" ? "#111827" : "#ffffff",
                  color: relMode === "CHILD" ? "#ffffff" : "#111827",
                }}
              >
                {t.child}
              </button>

              <button
                type="button"
                onClick={() => setRelMode("SPOUSE")}
                style={{
                  ...actionButtonStyle(relMode === "SPOUSE"),
                  background: relMode === "SPOUSE" ? "#111827" : "#ffffff",
                  color: relMode === "SPOUSE" ? "#ffffff" : "#111827",
                }}
              >
                {t.spouse}
              </button>

              <button
                type="button"
                onClick={() => setRelMode("SIBLING")}
                style={{
                  ...actionButtonStyle(relMode === "SIBLING"),
                  background: relMode === "SIBLING" ? "#111827" : "#ffffff",
                  color: relMode === "SIBLING" ? "#ffffff" : "#111827",
                }}
              >
                {t.sibling}
              </button>
            </div>

            <div style={{ marginTop: 14, fontWeight: 800 }}>{relTitle}</div>

            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              <input
                value={newRelativeName}
                onChange={(e) => setNewRelativeName(e.target.value)}
                placeholder={relMode === "PARENT" ? t.createNewParent : relMode === "CHILD" ? t.createNewChild : relMode === "SPOUSE" ? t.createNewSpouse : t.createNewSibling}
                style={{
                  width: "100%",
                  borderRadius: 12,
                  border: "1px solid #d1d5db",
                  padding: "10px 12px",
                }}
              />

              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={newRelativePrivate}
                  onChange={(e) => setNewRelativePrivate(e.target.checked)}
                />
                {t.makeNewProfilePrivate}
              </label>

              <button
                type="button"
                onClick={() => void createAndLinkRelationship()}
                disabled={!selectedId || !newRelativeName.trim() || relBusy}
                style={actionButtonStyle(true)}
              >
                {relBusy ? t.working : t.createAndLink}
              </button>

              {/* Duplicate warning (Phase 3b): non-blocking */}
              {dupWarning && (
                <div
                  style={{
                    border: "1px solid #fde68a",
                    background: "#fffbeb",
                    borderRadius: 12,
                    padding: 12,
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e" }}>
                    {lang === "vi"
                      ? `Đã có người tên "${dupWarning.name}" trong cây:`
                      : `Someone named "${dupWarning.name}" already exists in this tree:`}
                  </div>
                  {dupWarning.matches.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => void useExistingFromDuplicate(m.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        border: "1px solid #e5e7eb",
                        background: "#ffffff",
                        borderRadius: 10,
                        padding: "8px 10px",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: "50%",
                          background: "#e2e8f0",
                          overflow: "hidden",
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {m.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/file?pathname=${encodeURIComponent(m.photoUrl)}`}
                            alt=""
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <span style={{ color: "#94a3b8", fontWeight: 700 }}>{m.fullName[0]}</span>
                        )}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: "#111827", fontSize: 14 }}>
                          {lang === "vi" ? "Dùng người có sẵn: " : "Use existing: "}
                          {m.fullName}
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>
                          {m.birthYear ? `b. ${m.birthYear} · ` : ""}
                          {m.claimed ? (lang === "vi" ? "Đã nhận" : "Claimed") : lang === "vi" ? "Chưa nhận" : "Unclaimed"}
                        </div>
                      </div>
                    </button>
                  ))}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => void createAndLinkRelationship(true)}
                      disabled={relBusy}
                      style={{ ...actionButtonStyle(false), fontSize: 13 }}
                    >
                      {lang === "vi" ? "Vẫn tạo mới" : "Create anyway"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDupWarning(null)}
                      style={{ ...actionButtonStyle(false), fontSize: 13 }}
                    >
                      {t.cancel ?? "Cancel"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div
              style={{
                marginTop: 16,
                paddingTop: 16,
                borderTop: "1px solid #e5e7eb",
                position: "relative",
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 8 }}>{t.linkExistingPerson}</div>

              <input
                value={existingRelQuery}
                onChange={(e) => setExistingRelQuery(e.target.value)}
                onFocus={() => existingRelQuery.trim() && setExistingRelOpen(true)}
                placeholder={relMode === "PARENT" ? t.searchExistingParent : relMode === "CHILD" ? t.searchExistingChild : relMode === "SPOUSE" ? t.searchExistingSpouse : t.searchExistingSibling}
                style={{
  width: "100%",
  borderRadius: 12,
  border: "1px solid #d1d5db",
  padding: "10px 12px",
  background: "#ffffff",
  color: "#111827",
  caretColor: "#111827"
}}
              />

              {existingRelOpen && existingRelResults.length > 0 ? (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: 96,
                    zIndex: 20,
                    background: "#ffffff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 14,
                    boxShadow: "0 18px 40px rgba(15, 23, 42, 0.12)",
                    padding: 8,
                  }}
                >
                  {existingRelResults.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setExistingRelQuery("");
                        setExistingRelOpen(false);
                        void linkRelationship(r.id);
                      }}
                    style={{
  width: "100%",
  textAlign: "left",
  border: "none",
  background: "#ffffff",
  color: "#111827",
  padding: "10px 12px",
  borderRadius: 10,
  cursor: "pointer",
}}
                    >
                      <div style={{ fontWeight: 700, color: "#111827" }}>{r.fullName}</div>
                      <div style={{ marginTop: 2, fontSize: 12, color: "#64748b" }}>
                        {r.isPrivate ? "Private" : "Public"} ·{" "}
                        {r.claimedByUserId ? "Claimed" : "Unclaimed"}
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div style={{ ...sectionCardStyle(), padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, color: "#64748b" }}>
              {t.quickCounts}
            </div>

            <div
              style={{
                marginTop: 12,
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 10,
              }}
            >
              {[
                { label: t.parents, value: personDetail?.parents.length ?? 0 },
                { label: t.spouses, value: personDetail?.spouses.length ?? 0 },
                { label: t.children, value: personDetail?.children.length ?? 0 },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 14,
                    padding: "12px 10px",
                    textAlign: "center",
                    background: "#f8fafc",
                  }}
                >
                  <div style={{ fontSize: 22, fontWeight: 900 }}>{item.value}</div>
                  <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>{item.label}</div>
                </div>
              ))}
            </div>
          </div>

<div style={{ ...sectionCardStyle(), padding: 16, flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, color: "#64748b" }}>
              {t.relationships}
            </div>

            <RelationshipSection
              title={t.parents}
              people={personDetail?.parents ?? []}
              onSelect={(id) => void selectPersonInCurrentTree(id)}
              onDelete={selectedId ? (parentId) => void deleteParentChildRelationship(parentId, selectedId) : undefined}
              emptyText={t.none}
              typeOptions={[
                { value: "biological", label: lang === "vi" ? "Ruột" : "Biological" },
                { value: "adopted", label: lang === "vi" ? "Nuôi" : "Adopted" },
                { value: "step", label: lang === "vi" ? "Kế" : "Step" },
                { value: "guardian", label: lang === "vi" ? "Giám hộ" : "Guardian" },
              ]}
              typeValue={(p) => p.relationshipType}
              onTypeChange={selectedId ? (parentId, v) => void setParentChildType(parentId, selectedId, v) : undefined}
            />

            <RelationshipSection
              title={t.spouses}
              people={personDetail?.spouses ?? []}
              onSelect={(id) => void selectPersonInCurrentTree(id)}
              onDelete={(spouseId) => void deleteSpouseRelationship(spouseId)}
              emptyText={t.none}
              typeOptions={[
                { value: "married", label: lang === "vi" ? "Kết hôn" : "Married" },
                { value: "partner", label: lang === "vi" ? "Bạn đời" : "Partner" },
                { value: "divorced", label: lang === "vi" ? "Ly hôn" : "Divorced" },
                { value: "widowed", label: lang === "vi" ? "Góa" : "Widowed" },
              ]}
              typeValue={(p) => p.relationshipStatus}
              onTypeChange={(spouseId, v) => void setSpouseStatus(spouseId, v)}
            />

            <RelationshipSection
              title={t.children}
              people={personDetail?.children ?? []}
              onSelect={(id) => void selectPersonInCurrentTree(id)}
              onDelete={selectedId ? (childId) => void deleteParentChildRelationship(selectedId, childId) : undefined}
              emptyText={t.none}
              typeOptions={[
                { value: "biological", label: lang === "vi" ? "Ruột" : "Biological" },
                { value: "adopted", label: lang === "vi" ? "Nuôi" : "Adopted" },
                { value: "step", label: lang === "vi" ? "Kế" : "Step" },
                { value: "guardian", label: lang === "vi" ? "Giám hộ" : "Guardian" },
              ]}
              typeValue={(p) => p.relationshipType}
              onTypeChange={selectedId ? (childId, v) => void setParentChildType(selectedId, childId, v) : undefined}
            />

            <RelationshipSection
              title={t.siblings}
              people={personDetail?.siblings ?? []}
              onSelect={(id) => void selectPersonInCurrentTree(id)}
              onDelete={(siblingId) => void deleteSiblingRelationship(siblingId)}
              emptyText={t.none}
            />
          </div>
        </aside>
      </div>

      {/* Invite Confirmation Modal */}
      {showInviteConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setShowInviteConfirm(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 16,
              padding: 24,
              maxWidth: 400,
              width: "100%",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" }}>
              {t.invitePerson}
            </h3>
            <p style={{ marginTop: 12, fontSize: 14, color: "#6b7280", lineHeight: 1.5 }}>
              Send invite to:
            </p>
            <div style={{ marginTop: 8, fontSize: 14, color: "#111827" }}>
              {inviteEmail.trim() && <div>{inviteEmail}</div>}
              {getPhoneDigits(invitePhone).length >= 10 && <div>{invitePhone}</div>}
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 20, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setShowInviteConfirm(false)}
                style={{
                  padding: "10px 20px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  color: "#374151",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={() => void sendInvite()}
                disabled={inviteBusy}
                style={{
                  padding: "10px 20px",
                  borderRadius: 8,
                  border: "none",
                  background: "#111827",
                  color: "#ffffff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: inviteBusy ? "not-allowed" : "pointer",
                  opacity: inviteBusy ? 0.7 : 1,
                }}
              >
                {inviteBusy ? t.sendingInvite : t.sendInvite}
              </button>
            </div>
          </div>
        </div>
      )}

      
    </main>
  );
}

function RelationshipSection({
  title,
  people,
  onSelect,
  onDelete,
  emptyText = "None",
  typeOptions,
  typeValue,
  onTypeChange,
}: {
  title: string;
  people: PersonLite[];
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
  emptyText?: string;
  // Optional relationship-type dropdown (Phase 3c) — always optional, never forced
  typeOptions?: { value: string; label: string }[];
  typeValue?: (p: PersonLite) => string | null | undefined;
  onTypeChange?: (id: string, value: string) => void;
}) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>
        {title} <span style={{ color: "#64748b" }}>({people.length})</span>
      </div>

      {people.length === 0 ? (
        <div
          style={{
            border: "1px dashed #d1d5db",
            borderRadius: 12,
            padding: "10px 12px",
            color: "#64748b",
            fontSize: 14,
          }}
        >
          {emptyText}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {people.map((p) => (
            <div
              key={p.id}
              style={{
                ...drawerListButtonStyle(),
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={() => onSelect(p.id)}
                style={{ flex: 1, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <div style={{ fontWeight: 800, color: "#111827" }}>{p.fullName}</div>
                  <div style={badgeStyle(Boolean(p.claimedByUserId))}>
                    {p.claimedByUserId ? "Claimed" : "Unclaimed"}
                  </div>
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>
                  {p.isPrivate ? "Private" : "Public"}
                </div>
              </button>
              {typeOptions && onTypeChange && (
                <select
                  value={typeValue?.(p) ?? ""}
                  onChange={(e) => onTypeChange(p.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: "1px solid #d1d5db",
                    padding: "6px 6px",
                    background: "#ffffff",
                    color: "#374151",
                    flexShrink: 0,
                    maxWidth: 110,
                  }}
                >
                  <option value="">—</option>
                  {typeOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(p.id);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 4,
                    cursor: "pointer",
                    color: "#dc2626",
                    fontSize: 18,
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                  title="Remove relationship"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
