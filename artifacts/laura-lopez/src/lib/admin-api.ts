/**
 * Thin fetch wrapper for admin API calls.
 * Cookies are sent automatically where supported. In cross-origin iframe contexts
 * (e.g. Replit preview) Chrome blocks SameSite=None cookies, so the pending auth
 * token is also stored in sessionStorage and sent as X-Pending-Token header.
 */

const API_BASE = "/api";

// ---------------------------------------------------------------------------
// Pending token — cookie-less fallback for iframe/third-party-cookie-blocked contexts
// ---------------------------------------------------------------------------
const PENDING_TOKEN_KEY = "admin_pending_token";

export function storePendingToken(token: string): void {
  try { sessionStorage.setItem(PENDING_TOKEN_KEY, token); } catch { /* private browsing */ }
}

export function clearPendingToken(): void {
  try { sessionStorage.removeItem(PENDING_TOKEN_KEY); } catch { /* ignore */ }
}

function readPendingToken(): string | null {
  try { return sessionStorage.getItem(PENDING_TOKEN_KEY); } catch { return null; }
}

// ---------------------------------------------------------------------------
// Session token — cookie-less fallback for iframe/cross-origin contexts
// ---------------------------------------------------------------------------
// After verify-totp / totp/confirm / verify-recovery the API returns the plain
// session UUID in the response body. We store it here and send it as
// X-Session-Token on every request so requireAuth can validate it even when
// the sid cookie is blocked (Chrome third-party cookie blocking in Replit's
// cross-origin preview iframe).
const SESSION_TOKEN_KEY = "admin_session_token";

export function storeSessionToken(token: string): void {
  try { sessionStorage.setItem(SESSION_TOKEN_KEY, token); } catch { /* private browsing */ }
}

export function clearSessionToken(): void {
  try { sessionStorage.removeItem(SESSION_TOKEN_KEY); } catch { /* ignore */ }
}

function readSessionToken(): string | null {
  try { return sessionStorage.getItem(SESSION_TOKEN_KEY); } catch { return null; }
}

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
  const pendingToken = readPendingToken();
  const sessionToken = readSessionToken();
  const headers: Record<string, string> = {
    ...(json != null ? { "Content-Type": "application/json" } : {}),
    ...(pendingToken ? { "X-Pending-Token": pendingToken } : {}),
    ...(sessionToken ? { "X-Session-Token": sessionToken } : {}),
    ...(extraHeaders as Record<string, string> | undefined),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers,
    body: json != null ? JSON.stringify(json) : rest.body,
    ...rest,
  });

  const ct = res.headers.get("content-type") ?? "";
  const isJson = ct.includes("application/json");

  if (!res.ok) {
    const method = ((rest as RequestInit).method ?? "GET").toUpperCase();
    console.error(`[apiFetch] ${method} ${path} → ${res.status} (${ct || "no content-type"})`);
    if (!isJson) {
      throw new ApiError(
        res.status,
        `Expected JSON, received ${ct || "no content-type"} (${res.status})`,
      );
    }
    let msg = "";
    try {
      const data = await res.json();
      const raw = (data as { error?: unknown })?.error;
      if (typeof raw === "string" && raw.trim()) msg = raw.trim();
    } catch (_) {}
    if (!msg && res.statusText) msg = res.statusText;
    if (!msg) msg = `Request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }

  // 204 / no-content
  if (res.status === 204) return undefined as T;

  // 2xx but not JSON — proxy is up but returning the wrong thing (e.g. Vite index.html)
  if (!isJson) {
    throw new ApiError(
      res.status,
      `API unreachable — expected JSON, received ${ct || "unknown content-type"}`,
    );
  }
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
    apiFetch<{ requiresTotp: boolean; requiresTotpSetup: boolean; pendingToken?: string }>("/auth/login", {
      method: "POST",
      json: { email, password },
    }),
  verifyTotp: (code: string) =>
    apiFetch<{ ok: boolean; sessionToken?: string }>("/auth/verify-totp", { method: "POST", json: { code } }),
  verifyRecovery: (code: string) =>
    apiFetch<{ ok: boolean; sessionToken?: string }>("/auth/verify-recovery", { method: "POST", json: { code } }),
  logout: () => apiFetch<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  totpEnroll: () =>
    apiFetch<{ otpauthUrl: string; secret: string }>("/auth/totp/enroll", { method: "POST" }),
  totpConfirm: (code: string) =>
    apiFetch<{ ok: boolean; recoveryCodes: string[]; sessionToken?: string }>("/auth/totp/confirm", {
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
  inquiryToContact: (id: string) =>
    apiFetch<{ contact: Contact; merged: boolean }>(`/admin/inquiries/${id}/to-contact`, { method: "POST" }),
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

// ---------------------------------------------------------------------------
// Settings API
// ---------------------------------------------------------------------------
export const settingsApi = {
  list: () => apiFetch<{ settings: Record<string, string> }>("/admin/settings"),
  put:  (settings: Record<string, string>) =>
    apiFetch<{ settings: Record<string, string> }>("/admin/settings", { method: "PUT", json: settings }),
};

// ---------------------------------------------------------------------------
// Campaign types
// ---------------------------------------------------------------------------
export type CampaignStatus   = "active" | "complete" | "cancelled";
export type CampaignTrigger  = "new_listing" | "price_change" | "open_house" | "sold";
export type CampaignChannel  = "instagram_post" | "instagram_story" | "email" | "postcard" | "mailer" | "voicemail" | "manual";
export type TaskStatus       = "pending" | "ready" | "done" | "skipped";
export type AssetStatus      = "draft" | "approved" | "rejected";

export interface CampaignTemplate {
  id:        string;
  ownerId:   string;
  name:      string;
  trigger:   CampaignTrigger;
  isDefault: boolean;
  createdAt: string;
  items:     CampaignTemplateItem[];
}

export interface CampaignTemplateItem {
  id:         string;
  templateId: string;
  label:      string;
  channel:    CampaignChannel;
  offsetDays: number;
  dayType:    "calendar" | "business";
  assetType:  string | null;
  sortOrder:  number;
}

export interface Campaign {
  id:          string;
  ownerId:     string;
  propertyId:  string;
  templateId:  string | null;
  trigger:     CampaignTrigger;
  anchorDate:  string;
  status:      CampaignStatus;
  createdAt:   string;
  completedAt: string | null;
}

export interface CampaignSummary extends Campaign {
  propertyAddress: string;
  tasksDone:       number;
  tasksTotal:      number;
  nextDueDate:     string | null;
}

export interface CampaignTask {
  id:           string;
  campaignId:   string;
  ownerId:      string;
  label:        string;
  channel:      CampaignChannel;
  assetType:    string | null;
  computedDate: string | null;
  overrideDate: string | null;
  effectiveDate?: string | null;
  overdue?:     boolean;
  status:       TaskStatus;
  assetId:      string | null;
  notes:        string | null;
  completedAt:  string | null;
  sortOrder:    number;
}

export interface CampaignAsset {
  id:              string;
  ownerId:         string;
  campaignId:      string;
  taskId:          string;
  assetType:       string;
  storageKey:      string | null;
  textContent:     string | null;
  status:          AssetStatus;
  approvedAt:      string | null;
  approvedBy:      string | null;
  // Brick 5.2 — marketing template provenance
  templateId:      string | null;
  templateVersion: number | null;
  createdAt:       string;
  url?:            string | null;
}

// ---------------------------------------------------------------------------
// Marketing template types (Brick 5.2)
// ---------------------------------------------------------------------------
export interface MarketingTemplate {
  id:             string;
  ownerId:        string | null;
  officeId:       string | null;
  key:            string;
  name:           string;
  channel:        string;
  version:        number;
  canvasWidth:    number;
  canvasHeight:   number;
  definition:     unknown;
  requiredFields: string[];
  photoAspect:    string;
  isActive:       boolean;
  createdAt:      string;
}

export interface CampaignPreviewTask {
  templateItemId: string;
  label:          string;
  channel:        CampaignChannel;
  assetType:      string | null;
  offsetDays:     number;
  dayType:        string;
  sortOrder:      number;
  computedDate:   string | null;
}

export interface CampaignPreviewResponse {
  template:   { id: string; name: string; trigger: CampaignTrigger };
  property:   { id: string; address: string };
  anchorDate: string;
  tasks:      CampaignPreviewTask[];
}

// ---------------------------------------------------------------------------
// Marketing Template API (Brick 5.2)
// ---------------------------------------------------------------------------
export const marketingTemplateApi = {
  list: (channel?: string) => {
    const qs = channel ? `?channel=${encodeURIComponent(channel)}` : "";
    return apiFetch<{ templates: MarketingTemplate[] }>(`/admin/marketing-templates${qs}`);
  },
  preview: (id: string, propertyId: string, opts?: { headline?: string; roleLine?: string }) =>
    apiFetch<{ image: string; caption: string }>(
      `/admin/marketing-templates/${id}/preview`,
      { method: "POST", json: { propertyId, ...opts } },
    ),
};

// ---------------------------------------------------------------------------
// Campaign API client
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------
export interface Contact {
  id: string;
  ownerId: string;
  officeId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
  contactType: string;
  neighborhood: string | null;
  address: string | null;
  source: string;
  sourceInquiryId: string | null;
  notes: string | null;
  tags: string[];
  subscribedIntelligence: boolean;
  subscribedAt: string | null;
  unsubscribedAt: string | null;
  lastContactedAt: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContactInteraction {
  id: string;
  contactId: string;
  ownerId: string;
  kind: string;
  body: string;
  occurredAt: string;
  createdAt: string;
}

export interface ContactsListResponse {
  contacts: Contact[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  intelligenceCount: number;
}

export interface ContactDetailResponse {
  contact: Contact;
  interactions: ContactInteraction[];
  transactions: Array<{
    id: string;
    propertyAddress: string;
    status: string;
    side: string;
    clientName: string;
    createdAt: string;
  }>;
}

export interface ImportResult {
  dryRun: boolean;
  created: number;
  merged: number;
  skipped: number;
  preview: Array<{ action: "create" | "merge"; email: string | null; name: string }>;
}

export const contactsApi = {
  list: (params?: { contactType?: string; search?: string; subscribed?: boolean; archived?: boolean; page?: number }) => {
    const q = new URLSearchParams();
    if (params?.contactType) q.set("contactType", params.contactType);
    if (params?.search) q.set("search", params.search);
    if (params?.subscribed) q.set("subscribed", "true");
    if (params?.archived) q.set("archived", "true");
    if (params?.page) q.set("page", String(params.page));
    return apiFetch<ContactsListResponse>(`/admin/contacts?${q}`);
  },
  create: (body: Partial<Contact>) =>
    apiFetch<{ contact: Contact }>("/admin/contacts", { method: "POST", json: body }),
  get: (id: string) =>
    apiFetch<ContactDetailResponse>(`/admin/contacts/${id}`),
  update: (id: string, body: Partial<Contact>) =>
    apiFetch<{ contact: Contact }>(`/admin/contacts/${id}`, { method: "PATCH", json: body }),
  archive: (id: string) =>
    apiFetch<{ contact: Contact }>(`/admin/contacts/${id}/archive`, { method: "POST" }),
  addInteraction: (id: string, body: { kind: string; body: string; occurredAt?: string }) =>
    apiFetch<{ interaction: ContactInteraction }>(`/admin/contacts/${id}/interactions`, { method: "POST", json: body }),
  subscribe: (id: string) =>
    apiFetch<{ contact: Contact }>(`/admin/contacts/${id}/subscribe`, { method: "POST" }),
  unsubscribe: (id: string) =>
    apiFetch<{ contact: Contact }>(`/admin/contacts/${id}/unsubscribe`, { method: "POST" }),
  import: (rows: unknown[], dryRun: boolean) =>
    apiFetch<ImportResult>("/admin/contacts/import", { method: "POST", json: { rows, dryRun } }),
};

export const campaignApi = {
  templates: {
    list: () =>
      apiFetch<{ templates: CampaignTemplate[] }>("/admin/campaign-templates"),
    get: (id: string) =>
      apiFetch<{ template: CampaignTemplate }>(`/admin/campaign-templates/${id}`),
    create: (body: { name: string; trigger: CampaignTrigger; isDefault?: boolean; items?: Partial<CampaignTemplateItem>[] }) =>
      apiFetch<{ template: CampaignTemplate }>("/admin/campaign-templates", { method: "POST", json: body }),
    patch: (id: string, body: { name?: string; trigger?: CampaignTrigger; isDefault?: boolean }) =>
      apiFetch<{ template: CampaignTemplate }>(`/admin/campaign-templates/${id}`, { method: "PATCH", json: body }),
    delete: (id: string) =>
      apiFetch<{ ok: boolean }>(`/admin/campaign-templates/${id}`, { method: "DELETE" }),
  },

  preview: (body: { propertyId: string; templateId: string; anchorDate: string }) =>
    apiFetch<CampaignPreviewResponse>("/admin/campaigns/preview", { method: "POST", json: body }),

  list: () =>
    apiFetch<{ campaigns: CampaignSummary[] }>("/admin/campaigns"),

  get: (id: string) =>
    apiFetch<{ campaign: Campaign; tasks: CampaignTask[]; assets: CampaignAsset[]; property: AdminProperty | null }>(
      `/admin/campaigns/${id}`,
    ),

  create: (body: { propertyId: string; templateId: string; anchorDate: string; trigger: CampaignTrigger }) =>
    apiFetch<{ campaign: Campaign; tasks: CampaignTask[] }>("/admin/campaigns", { method: "POST", json: body }),

  patch: (id: string, body: { status?: CampaignStatus }) =>
    apiFetch<{ campaign: Campaign }>(`/admin/campaigns/${id}`, { method: "PATCH", json: body }),

  delete: (id: string) =>
    apiFetch<{ ok: boolean }>(`/admin/campaigns/${id}`, { method: "DELETE" }),

  events: (id: string) =>
    apiFetch<{ events: unknown[] }>(`/admin/campaigns/${id}/events`),

  recipientCount: () =>
    apiFetch<{ count: number }>("/admin/campaigns/recipient-count"),

  tasks: {
    patch: (taskId: string, body: { overrideDate?: string | null; status?: TaskStatus; notes?: string | null }) =>
      apiFetch<{ task: CampaignTask }>(`/admin/campaign-tasks/${taskId}`, { method: "PATCH", json: body }),
    generate: (taskId: string, body?: { templateId?: string; templateVersion?: number }) =>
      apiFetch<{ asset: CampaignAsset }>(`/admin/campaign-tasks/${taskId}/generate`, {
        method: "POST",
        json: body ?? {},
      }),
    approve: (taskId: string) =>
      apiFetch<{ asset: CampaignAsset }>(`/admin/campaign-tasks/${taskId}/approve`, { method: "POST" }),
    reject: (taskId: string) =>
      apiFetch<{ asset: CampaignAsset }>(`/admin/campaign-tasks/${taskId}/reject`, { method: "POST" }),
  },
};
