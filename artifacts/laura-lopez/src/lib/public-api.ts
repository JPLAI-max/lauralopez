/**
 * Public API client for the Laura Lopez site.
 * No auth required — these endpoints are publicly accessible.
 */

const API_BASE = "/api";

export class PublicApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "PublicApiError";
  }
}

async function publicFetch<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    let msg = res.statusText;
    try { const d = await res.json(); msg = d?.error ?? msg; } catch { /* ignore */ }
    throw new PublicApiError(res.status, msg);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) return undefined as T;
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface PublicArticle {
  id: string;
  slug: string;
  title: string;
  category: string;
  excerpt: string;
  heroMediaId: string | null;
  publishedAt: string | null;
  heroUrl?: string | null;
  heroAlt?: string | null;
  body?: string;
}

export interface PublicProperty {
  id: string;
  address: string;
  neighborhood: string | null;
  status: string;
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
  heroUrl: string | null;
  heroSrcset: string | null;
  heroAlt: string | null;
  heroFocalX: string | null;
  heroFocalY: string | null;
  featured: boolean;
  sortOrder: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicSlot {
  id: string;
  slotKey: string;
  label: string;
  aspectRatio: string;
  minWidth: number;
  currentMediaId: string | null;
  currentPropertyId: string | null;
  assignedAt: string | null;
  currentMedia: {
    id: string;
    url: string | null;
    srcset: string | null;
    alt: string;
    focalX: string;
    focalY: string;
  } | null;
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------
export const publicApi = {
  articles: {
    list: (params?: { category?: string; page?: number; pageSize?: number }) => {
      const qs = new URLSearchParams();
      if (params?.category) qs.set("category", params.category);
      if (params?.page) qs.set("page", String(params.page));
      if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
      return publicFetch<{ articles: PublicArticle[]; page: number; pageSize: number }>(
        `/content/articles?${qs.toString()}`,
      );
    },
    get: (slug: string) =>
      publicFetch<{ article: PublicArticle }>(`/content/articles/${slug}`),
  },

  properties: {
    list: (params?: { status?: string }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set("status", params.status);
      return publicFetch<{ properties: PublicProperty[] }>(
        `/content/properties?${qs.toString()}`,
      );
    },
  },

  slots: {
    list: () => publicFetch<{ slots: PublicSlot[] }>("/content/slots"),
  },
};

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------
export function formatPrice(price: string | null): string {
  if (!price) return "";
  const n = parseFloat(price);
  if (isNaN(n)) return price;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

export function focalObjectPosition(focalX: string | null, focalY: string | null): string {
  const x = focalX ? Math.round(parseFloat(focalX) * 100) : 50;
  const y = focalY ? Math.round(parseFloat(focalY) * 100) : 50;
  return `${x}% ${y}%`;
}
