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
