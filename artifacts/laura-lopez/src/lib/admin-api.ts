/**
 * Thin fetch wrapper for admin API calls.
 * Uses the same origin — cookies are sent automatically.
 */

const API_BASE = "/api";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers: extraHeaders, ...rest } = options;
  const headers: Record<string, string> = {
    ...(json != null ? { "Content-Type": "application/json" } : {}),
    ...(extraHeaders as Record<string, string> | undefined),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers,
    body: json != null ? JSON.stringify(json) : rest.body,
    ...rest,
  });

  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = await res.json();
      msg = data?.error ?? msg;
    } catch (_) {}
    throw new ApiError(res.status, msg);
  }

  // 204 / no-content
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) return undefined as T;
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: string;
  totpEnabled: boolean;
}

export const authApi = {
  me: () => apiFetch<{ user: CurrentUser }>("/auth/me"),
  login: (email: string, password: string) =>
    apiFetch<{ requiresTotp: boolean; requiresTotpSetup: boolean }>("/auth/login", {
      method: "POST",
      json: { email, password },
    }),
  verifyTotp: (code: string) =>
    apiFetch<{ ok: boolean }>("/auth/verify-totp", { method: "POST", json: { code } }),
  verifyRecovery: (code: string) =>
    apiFetch<{ ok: boolean }>("/auth/verify-recovery", { method: "POST", json: { code } }),
  logout: () => apiFetch<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  totpEnroll: () =>
    apiFetch<{ otpauthUrl: string; secret: string }>("/auth/totp/enroll", { method: "POST" }),
  totpConfirm: (code: string) =>
    apiFetch<{ ok: boolean; recoveryCodes: string[] }>("/auth/totp/confirm", {
      method: "POST",
      json: { code },
    }),
  recoveryCodes: {
    count: () => apiFetch<{ remaining: number }>("/auth/recovery-codes/count"),
    regenerate: () =>
      apiFetch<{ recoveryCodes: string[] }>("/auth/recovery-codes/regenerate", { method: "POST" }),
  },
};

// ---------------------------------------------------------------------------
// Admin — Inquiries
// ---------------------------------------------------------------------------
export interface Inquiry {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  affiliation: string;
  inquiryType: string;
  message: string;
  status: string;
  source: string;
  createdAt: string;
  readAt: string | null;
}

export interface InquiriesResponse {
  inquiries: Inquiry[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  unreadCount: number;
}

export const adminApi = {
  listInquiries: (params?: { status?: string; page?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.page) qs.set("page", String(params.page));
    return apiFetch<InquiriesResponse>(`/admin/inquiries?${qs.toString()}`);
  },
  getInquiry: (id: string) => apiFetch<{ inquiry: Inquiry }>(`/admin/inquiries/${id}`),
  patchInquiry: (id: string, status: string) =>
    apiFetch<{ inquiry: Inquiry }>(`/admin/inquiries/${id}`, {
      method: "PATCH",
      json: { status },
    }),

  // Transactions
  transactions: {
    list: (params?: { status?: string }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set("status", params.status);
      return apiFetch<{ transactions: TransactionSummary[] }>(
        `/admin/transactions?${qs.toString()}`,
      );
    },
    preview: (body: PreviewRequest) =>
      apiFetch<PreviewResponse>("/admin/transactions/preview", { method: "POST", json: body }),
    create: (body: CreateTransactionRequest) =>
      apiFetch<{ transaction: Transaction; milestones: TransactionMilestone[] }>(
        "/admin/transactions",
        { method: "POST", json: body },
      ),
    get: (id: string) =>
      apiFetch<{ transaction: Transaction; milestones: TransactionMilestoneWithDerived[] }>(
        `/admin/transactions/${id}`,
      ),
    patch: (id: string, body: PatchTransactionRequest) =>
      apiFetch<{ transaction: Transaction }>(`/admin/transactions/${id}`, {
        method: "PATCH",
        json: body,
      }),
    delete: (id: string) =>
      apiFetch<{ ok: boolean }>(`/admin/transactions/${id}`, { method: "DELETE" }),
    patchMilestone: (txId: string, mid: string, body: PatchMilestoneRequest) =>
      apiFetch<{ milestone: TransactionMilestoneWithDerived }>(
        `/admin/transactions/${txId}/milestones/${mid}`,
        { method: "PATCH", json: body },
      ),
    addMilestone: (txId: string, body: CreateMilestoneRequest) =>
      apiFetch<{ milestone: TransactionMilestone }>(`/admin/transactions/${txId}/milestones`, {
        method: "POST",
        json: body,
      }),
    deleteMilestone: (txId: string, mid: string) =>
      apiFetch<{ ok: boolean }>(`/admin/transactions/${txId}/milestones/${mid}`, {
        method: "DELETE",
      }),
    events: (id: string) =>
      apiFetch<{ events: TransactionEvent[] }>(`/admin/transactions/${id}/events`),
    templates: () =>
      apiFetch<{ templates: MilestoneTemplate[] }>("/admin/transactions/templates"),
  },
};

// ---------------------------------------------------------------------------
// Transaction types
// ---------------------------------------------------------------------------
export type TransactionStatus = "active" | "closed" | "cancelled" | "pending";
export type TransactionSide = "buy" | "sell";
export type MilestoneStatus = "pending" | "complete" | "waived";
export type MilestoneCategory = "contingency" | "disclosure" | "inspection" | "financing" | "admin";

export interface Transaction {
  id: string;
  ownerId: string;
  propertyAddress: string;
  side: TransactionSide;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  status: TransactionStatus;
  acceptanceDate: string | null;
  closeOfEscrowDate: string | null;
  closedAt: string | null;
  purchasePrice: string | null;
  escrowCompany: string | null;
  escrowOfficer: string | null;
  escrowOfficerEmail: string | null;
  lender: string | null;
  coopAgent: string | null;
  coopBrokerage: string | null;
  notes: string | null;
  icsToken: string;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionSummary extends Transaction {
  overdueCount: number;
  nextMilestone: { id: string; label: string; effectiveDate: string | null } | null;
}

export interface TransactionMilestone {
  id: string;
  transactionId: string;
  ownerId: string;
  label: string;
  category: MilestoneCategory;
  status: MilestoneStatus;
  offsetDays: number | null;
  anchor: string | null;
  direction: string | null;
  dayType: string | null;
  computedDate: string | null;
  overrideDate: string | null;
  requiresWrittenRemoval: boolean;
  removalDeliveredAt: string | null;
  notes: string | null;
  completedAt: string | null;
  completedBy: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface TransactionMilestoneWithDerived extends TransactionMilestone {
  effectiveDate: string | null;
  overdue: boolean;
}

export interface TransactionEvent {
  id: string;
  transactionId: string;
  actor: string;
  action: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface MilestoneTemplate {
  id: string;
  name: string;
  side: TransactionSide;
  items: {
    id: string;
    label: string;
    category: MilestoneCategory;
    offsetDays: number;
    anchor: string;
    direction: string;
    dayType: string;
    requiresWrittenRemoval: boolean;
    sortOrder: number;
  }[];
}

export interface PreviewMilestone {
  templateItemId: string;
  label: string;
  category: MilestoneCategory;
  computedDate: string | null;
  requiresWrittenRemoval: boolean;
  sortOrder: number;
  offsetDays: number;
  anchor: string;
  direction: string;
  dayType: string;
}

export interface PreviewRequest {
  templateId: string;
  acceptanceDate?: string;
  closeOfEscrowDate?: string;
}

export interface PreviewResponse {
  template: { id: string; name: string; side: TransactionSide };
  milestones: PreviewMilestone[];
}

export interface CreateTransactionRequest {
  propertyAddress: string;
  side: TransactionSide;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  acceptanceDate?: string;
  closeOfEscrowDate?: string;
  purchasePrice?: number;
  templateId?: string;
  milestoneOverrides?: Record<string, string>;
  escrowCompany?: string;
  escrowOfficer?: string;
  escrowOfficerEmail?: string;
  lender?: string;
  coopAgent?: string;
  coopBrokerage?: string;
  notes?: string;
}

export interface PatchTransactionRequest {
  propertyAddress?: string;
  status?: TransactionStatus;
  clientName?: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  acceptanceDate?: string | null;
  closeOfEscrowDate?: string | null;
  purchasePrice?: number | null;
  escrowCompany?: string | null;
  escrowOfficer?: string | null;
  escrowOfficerEmail?: string | null;
  lender?: string | null;
  coopAgent?: string | null;
  coopBrokerage?: string | null;
  notes?: string | null;
}

export interface PatchMilestoneRequest {
  status?: MilestoneStatus;
  overrideDate?: string | null;
  removalDeliveredAt?: string | null;
  notes?: string | null;
  completedBy?: string | null;
}

export interface CreateMilestoneRequest {
  label: string;
  category: MilestoneCategory;
  effectiveDate?: string;
  requiresWrittenRemoval?: boolean;
  notes?: string;
  sortOrder?: number;
}

// ---------------------------------------------------------------------------
// Content types
// ---------------------------------------------------------------------------
export type ArticleCategory = "neighborhood" | "regulatory" | "architecture" | "insurance" | "market";
export type ArticleStatus = "draft" | "published";
export type PropertyStatus = "pick" | "listed" | "sold";

export interface AdminArticle {
  id: string;
  ownerId: string;
  slug: string;
  title: string;
  category: ArticleCategory;
  excerpt: string;
  body: string;
  heroMediaId: string | null;
  status: ArticleStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProperty {
  id: string;
  ownerId: string;
  address: string;
  neighborhood: string | null;
  status: PropertyStatus;
  listPrice: string | null;
  soldPrice: string | null;
  soldDate: string | null;
  beds: string | null;
  baths: string | null;
  sqft: number | null;
  lotSqft: number | null;
  yearBuilt: number | null;
  architect: string | null;
  isLauraListing: boolean;
  listingBrokerage: string | null;
  commentary: string | null;
  architectureNotes: string | null;
  lotNotes: string | null;
  valueNotes: string | null;
  heroMediaId: string | null;
  heroUrl?: string | null;
  featured: boolean;
  sortOrder: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  gallery?: { mediaId: string; sortOrder: number }[];
}

export interface AdminMedia {
  id: string;
  ownerId: string;
  storageKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  aspectRatio: string;
  focalX: string;
  focalY: string;
  altText: string | null;
  credit: string | null;
  derivatives: Record<string, string>;
  url: string | null;
  createdAt: string;
}

export interface AdminSlot {
  id: string;
  slotKey: string;
  label: string;
  aspectRatio: string;
  minWidth: number;
  currentMediaId: string | null;
  currentPropertyId: string | null;
  assignedAt: string | null;
  currentMedia: { id: string; filename: string; url: string | null } | null;
}

export interface SlotSuggestion extends AdminSlot {
  currentThumbnail: string | null;
}

export interface PresignResponse {
  uploadUrl: string;
  storageKey: string;
}

/** Input type for create/patch — prices are numbers, not strings */
export interface PropertyInput {
  address?: string;
  neighborhood?: string | null;
  status?: PropertyStatus;
  listPrice?: number | null;
  soldPrice?: number | null;
  soldDate?: string | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  lotSqft?: number | null;
  yearBuilt?: number | null;
  architect?: string | null;
  isLauraListing?: boolean;
  listingBrokerage?: string | null;
  commentary?: string | null;
  architectureNotes?: string | null;
  lotNotes?: string | null;
  valueNotes?: string | null;
  heroMediaId?: string | null;
  featured?: boolean;
  sortOrder?: number;
  archived?: boolean;
  gallery?: string[];
}

// ---------------------------------------------------------------------------
// Content API client
// ---------------------------------------------------------------------------
export const contentApi = {
  articles: {
    list: (params?: { status?: string; category?: string }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set("status", params.status);
      if (params?.category) qs.set("category", params.category);
      return apiFetch<{ articles: AdminArticle[] }>(`/admin/articles?${qs.toString()}`);
    },
    get: (id: string) => apiFetch<{ article: AdminArticle }>(`/admin/articles/${id}`),
    create: (body: Partial<AdminArticle>) =>
      apiFetch<{ article: AdminArticle }>("/admin/articles", { method: "POST", json: body }),
    patch: (id: string, body: Partial<AdminArticle>) =>
      apiFetch<{ article: AdminArticle }>(`/admin/articles/${id}`, { method: "PATCH", json: body }),
    delete: (id: string) => apiFetch<{ ok: boolean }>(`/admin/articles/${id}`, { method: "DELETE" }),
    slugCheck: (slug: string, excludeId?: string) => {
      const qs = new URLSearchParams({ slug });
      if (excludeId) qs.set("excludeId", excludeId);
      return apiFetch<{ available: boolean; suggested: string }>(`/admin/articles/slug-check?${qs.toString()}`);
    },
  },

  properties: {
    list: () => apiFetch<{ properties: AdminProperty[] }>("/admin/properties"),
    get: (id: string) => apiFetch<{ property: AdminProperty }>(`/admin/properties/${id}`),
    create: (body: PropertyInput) =>
      apiFetch<{ property: AdminProperty }>("/admin/properties", { method: "POST", json: body }),
    patch: (id: string, body: PropertyInput) =>
      apiFetch<{ property: AdminProperty }>(`/admin/properties/${id}`, { method: "PATCH", json: body }),
    delete: (id: string) => apiFetch<{ property: AdminProperty }>(`/admin/properties/${id}`, { method: "DELETE" }),
    addGallery: (id: string, mediaId: string) =>
      apiFetch<{ row: unknown }>(`/admin/properties/${id}/gallery`, { method: "POST", json: { mediaId } }),
    removeGallery: (id: string, mediaId: string) =>
      apiFetch<{ ok: boolean }>(`/admin/properties/${id}/gallery/${mediaId}`, { method: "DELETE" }),
  },

  media: {
    list: () => apiFetch<{ media: AdminMedia[] }>("/admin/media"),
    get: (id: string) => apiFetch<{ media: AdminMedia }>(`/admin/media/${id}`),
    presign: (body: { filename: string; mimeType: string; sizeBytes: number }) =>
      apiFetch<PresignResponse>("/admin/media/presign", { method: "POST", json: body }),
    complete: (body: { storageKey: string; filename: string; mimeType: string }) =>
      apiFetch<{ media: AdminMedia }>("/admin/media/complete", { method: "POST", json: body }),
    patch: (id: string, body: { focalX?: number; focalY?: number; altText?: string | null; credit?: string | null }) =>
      apiFetch<{ media: AdminMedia }>(`/admin/media/${id}`, { method: "PATCH", json: body }),
    delete: (id: string) => apiFetch<{ ok: boolean }>(`/admin/media/${id}`, { method: "DELETE" }),
    slotSuggestions: (id: string) =>
      apiFetch<{ suggestions: SlotSuggestion[] }>(`/admin/media/${id}/slot-suggestions`),
  },

  slots: {
    list: () => apiFetch<{ slots: AdminSlot[] }>("/admin/slots"),
    assign: (slotKey: string, mediaId: string, propertyId?: string) =>
      apiFetch<{ slot: AdminSlot }>(`/admin/slots/${slotKey}/assign`, {
        method: "POST",
        json: { mediaId, propertyId },
      }),
    revert: (slotKey: string) =>
      apiFetch<{ slot: AdminSlot }>(`/admin/slots/${slotKey}/revert`, { method: "POST" }),
  },
};
