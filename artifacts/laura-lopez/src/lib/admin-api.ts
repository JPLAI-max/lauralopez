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
  logout: () => apiFetch<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  totpEnroll: () =>
    apiFetch<{ otpauthUrl: string; secret: string }>("/auth/totp/enroll", { method: "POST" }),
  totpConfirm: (code: string) =>
    apiFetch<{ ok: boolean }>("/auth/totp/confirm", { method: "POST", json: { code } }),
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
};
