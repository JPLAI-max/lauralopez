/**
 * campaign-marketing-gen.ts
 *
 * Renders brand-correct Instagram story (1080×1920) and post (1080×1080)
 * images from a marketing_templates row + field map.
 *
 * Rendering pipeline:
 *   1. Validate every requiredField is non-empty
 *   2. Focal-point crop the source photo
 *   3. Build SVG overlay (scrims + headline block + signature)
 *   4. sharp composite → PNG at canvas size
 *   5. Produce WebP derivative
 *   6. Upload both to R2; return storageKeys
 *   7. Generate caption (instagram channels: appends DRE + brokerage — REQUIRED)
 *
 * Spec: spec/brick-52-marketing-template-system.txt
 */

import path from "node:path";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import type { Sharp as SharpType } from "sharp";

// createRequire is needed because sharp is a native CJS module.
// The esbuild bundle injects globalThis.require via its banner, but when this
// file is run directly through tsx (ESM mode), require is not defined.
// Using createRequire makes both paths work correctly.
const _require = createRequire(import.meta.url);

type SharpConstructor = (input?: Buffer) => SharpType;
let sharp: SharpConstructor | null = null;
try {
  sharp = _require("sharp") as SharpConstructor;
} catch { /* sharp optional — rendering will throw at call-site if null */ }

import { putObject, isConfigured } from "./storage";
import type { MarketingTemplate } from "@workspace/db";

// ---------------------------------------------------------------------------
// Font loading — reads bundled WOFF2, base64-encodes, caches at module level
// ---------------------------------------------------------------------------
// Resolve fonts directory relative to the CWD: the server is always started
// from artifacts/api-server/ (both in dev via tsx and in production via
// `node ./dist/index.mjs`), so process.cwd()/fonts is stable in both modes.
// Using import.meta.url would break after esbuild bundling (URL points to
// dist/index.mjs → ../../fonts resolves to artifacts/fonts, not api-server/fonts).
const FONTS_DIR = path.join(process.cwd(), "fonts");

let _fontB64: string | null = null;
let _fontLoaded = false;

function getFontBase64(): string | null {
  if (_fontLoaded) return _fontB64;
  _fontLoaded = true;
  try {
    const buf = readFileSync(path.join(FONTS_DIR, "Cormorant-variable-normal.woff2"));
    _fontB64 = buf.toString("base64");
  } catch {
    _fontB64 = null; // graceful degradation to Georgia
  }
  return _fontB64;
}

// ---------------------------------------------------------------------------
// Layer types (matches the definition JSON stored in marketing_templates)
// ---------------------------------------------------------------------------
interface PhotoLayer       { type: "photo" }
interface ScrimLayer       { type: "scrim"; position: "top" | "bottom"; fromYPct: number; toYPct: number; maxOpacity: number }
interface TextLayer        { type: "text"; field?: string; format?: string; yPct: number; fontSize: number; fontSizeLong?: number; maxCharsNormal?: number; fontWeight: 300 | 400; trackingEm: number; anchor: "center" | "left" }
interface RuleLayer        { type: "rule"; yPct: number; widthPx: number; heightPx: number; opacity: number }
interface WordmarkLayer    { type: "wordmark"; yPct: number; widthPct: number }

type LayerDef = PhotoLayer | ScrimLayer | TextLayer | RuleLayer | WordmarkLayer;

// The definition column stores a LayerDef[] array directly (not { layers: [...] }).
export type TemplateDefinition = LayerDef[];

// ---------------------------------------------------------------------------
// Field map types
// ---------------------------------------------------------------------------
export interface MarketingFields {
  headline:     string;
  address:      string;
  city:         string;
  price:        string;       // display string, e.g. "$15,000,000"
  roleLine:     string;       // "LISTED BY" | "REPRESENTED BUYER" | "REPRESENTED SELLER"
  agentName:    string;
  brokerageMark: string;      // brokerage name (validation key — also caption)
  [key: string]: string;      // for extra/future fields
}

export interface MarketingGenInput {
  template:       MarketingTemplate;
  fields:         MarketingFields;
  sourceBuffer:   Buffer;
  srcWidth:       number;
  srcHeight:      number;
  focalX:         number;   // 0..1
  focalY:         number;   // 0..1
  dreLicense:     string;
  brokerageName:  string;
  // previewOnly: skip R2 upload, return buffer directly as WebP
  previewOnly?:   boolean;
  previewWidth?:  number;   // target width for thumbnail (default: full canvas)
}

export interface MarketingGenResult {
  storageKey:  string | null;     // PNG in R2  (null if previewOnly)
  webpKey:     string | null;     // WebP in R2 (null if previewOnly)
  pngBuffer:   Buffer;
  webpBuffer:  Buffer;
  caption:     string;            // instagram caption with DRE appended
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
function validateFields(requiredFields: string[], fields: Record<string, string>): void {
  for (const f of requiredFields) {
    if (f === "heroImage" || f === "brokerageMark") continue; // structural, not text
    const val = fields[f];
    if (!val || val.trim() === "") {
      throw Object.assign(
        new Error(`Required template field "${f}" is missing or empty. Cannot render.`),
        { code: "MISSING_TEMPLATE_FIELD", field: f },
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Caption generation
// ---------------------------------------------------------------------------
export function generateInstagramCaption(
  channel: string,
  fields: MarketingFields,
  dreLicense: string,
  brokerageName: string,
): string {
  if (!dreLicense || dreLicense.trim() === "") {
    throw Object.assign(
      new Error(`DRE license is required for Instagram ${channel} captions but the setting is blank. Configure it in Settings.`),
      { code: "SETTING_MISSING", key: "dre_license" },
    );
  }
  if (!brokerageName || brokerageName.trim() === "") {
    throw Object.assign(
      new Error(`Brokerage name is required for Instagram ${channel} captions but the setting is blank. Configure it in Settings.`),
      { code: "SETTING_MISSING", key: "brokerage_name" },
    );
  }

  const parts: string[] = [
    fields.headline.toUpperCase(),
    fields.address,
  ];
  if (fields.price) parts.push(`LP ${fields.price}`);
  if (fields.roleLine) parts.push(fields.roleLine);
  parts.push(`${brokerageName} | DRE #${dreLicense}`);
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// Focal-point crop (mirrors campaign-image-gen.ts)
// ---------------------------------------------------------------------------
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

async function focalCrop(
  buf: Buffer,
  srcW: number,
  srcH: number,
  focalX: number,
  focalY: number,
  targetW: number,
  targetH: number,
): Promise<Buffer> {
  if (!sharp) throw new Error("sharp not available");

  const scale  = Math.max(targetW / srcW, targetH / srcH);
  const scaledW = Math.round(srcW * scale);
  const scaledH = Math.round(srcH * scale);

  const left = clamp(Math.round(focalX * scaledW - targetW / 2), 0, scaledW - targetW);
  const top  = clamp(Math.round(focalY * scaledH - targetH / 2), 0, scaledH - targetH);

  return sharp!(buf)
    .resize(scaledW, scaledH)
    .extract({ left, top, width: targetW, height: targetH })
    .toBuffer();
}

// ---------------------------------------------------------------------------
// XML escape
// ---------------------------------------------------------------------------
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ---------------------------------------------------------------------------
// Format-string substitution: "{city} | LP {price}" → "Beverly Hills | LP $15M"
// ---------------------------------------------------------------------------
function applyFormat(format: string, fields: Record<string, string>): string {
  return format.replace(/\{(\w+)\}/g, (_, k: string) => fields[k] ?? "");
}

// ---------------------------------------------------------------------------
// SVG builder
// ---------------------------------------------------------------------------
function buildOverlaySvg(
  w: number,
  h: number,
  layers: TemplateDefinition,
  fields: Record<string, string>,
  fontB64: string | null,
): string {
  const fontFamily = fontB64
    ? "Cormorant, Georgia, serif"
    : "Georgia, serif";

  const fontFaceBlock = fontB64
    ? `<style>
    @font-face {
      font-family: 'Cormorant';
      src: url('data:font/woff2;base64,${fontB64}') format('woff2');
      font-weight: 100 900;
      font-style: normal;
    }
  </style>`
    : "";

  const parts: string[] = [];
  const gradDefs: string[] = [];

  let gradIdx = 0;
  for (const layer of layers) {
    if (layer.type === "photo") continue; // photo is the base image, not SVG

    if (layer.type === "scrim") {
      const gid = `scrim${gradIdx++}`;
      const rectY = Math.round(layer.fromYPct * h);
      const rectH = Math.round((layer.toYPct - layer.fromYPct) * h);
      const op    = layer.maxOpacity;
      if (layer.position === "top") {
        gradDefs.push(`
    <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="black" stop-opacity="${op}"/>
      <stop offset="100%" stop-color="black" stop-opacity="0"/>
    </linearGradient>`);
      } else {
        gradDefs.push(`
    <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="black" stop-opacity="0"/>
      <stop offset="100%" stop-color="black" stop-opacity="${op}"/>
    </linearGradient>`);
      }
      parts.push(`<rect x="0" y="${rectY}" width="${w}" height="${rectH}" fill="url(#${gid})"/>`);
      continue;
    }

    if (layer.type === "rule") {
      const y   = Math.round(layer.yPct * h);
      const rx  = Math.round((w - layer.widthPx) / 2);
      parts.push(
        `<rect x="${rx}" y="${y}" width="${layer.widthPx}" height="${layer.heightPx}" ` +
        `fill="white" opacity="${layer.opacity}"/>`,
      );
      continue;
    }

    if (layer.type === "wordmark") {
      const y         = Math.round(layer.yPct * h);
      const textWidth = Math.round(layer.widthPct * w);
      // Sizing: wordmark text in Cormorant at ~24px base, then textLength enforces width
      const fontSize  = Math.round(w * 0.022); // ~24px at 1080
      parts.push(
        `<text x="${w / 2}" y="${y}" text-anchor="middle" ` +
        `font-family="${fontFamily}" font-size="${fontSize}" font-weight="300" ` +
        `fill="white" textLength="${textWidth}" lengthAdjust="spacing">` +
        `THE BEVERLY HILLS ESTATES</text>`,
      );
      continue;
    }

    if (layer.type === "text") {
      const y = Math.round(layer.yPct * h);

      // Compute display text
      let display: string;
      if (layer.format) {
        display = applyFormat(layer.format, fields);
      } else if (layer.field) {
        display = fields[layer.field] ?? "";
      } else {
        continue;
      }
      if (!display) continue;

      // Uppercase all story/post text per spec
      display = display.toUpperCase();

      // Fit-to-width: step font size down in 2px increments until the estimated
      // rendered width fits within 84% of the canvas width.
      // Headline layers (those that declare maxCharsNormal or fontSizeLong) use a
      // spec-defined floor of 52px; all other layers use 60% of their specified size.
      // Cormorant display caps are approximately 0.62em wide; add letter-spacing per char.
      const isHeadline = layer.maxCharsNormal !== undefined || layer.fontSizeLong !== undefined;
      const sizeFloor  = isHeadline ? 52 : Math.round(layer.fontSize * 0.60);
      const maxWidthPx = Math.round(w * 0.84);
      const CAP_WIDTH  = 0.62; // Cormorant Garamond capital em-width
      let fontSize = layer.fontSize;
      while (fontSize > sizeFloor) {
        const estW = display.length * fontSize * (CAP_WIDTH + layer.trackingEm);
        if (estW <= maxWidthPx) break;
        fontSize = Math.max(sizeFloor, fontSize - 2);
      }

      const letterSpacing = (layer.trackingEm * fontSize).toFixed(2);
      const x             = layer.anchor === "center" ? w / 2 : Math.round(w * 0.06);
      const anchor        = layer.anchor === "center" ? "middle" : "start";

      parts.push(
        `<text x="${x}" y="${y}" text-anchor="${anchor}" ` +
        `font-family="${fontFamily}" font-size="${fontSize}" font-weight="${layer.fontWeight}" ` +
        `letter-spacing="${letterSpacing}" ` +
        `fill="white">${esc(display)}</text>`,
      );
      continue;
    }
  }

  const defsBlock = (gradDefs.length > 0 || fontFaceBlock)
    ? `<defs>${fontFaceBlock}\n${gradDefs.join("\n")}\n  </defs>`
    : "";

  return [
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">`,
    defsBlock,
    parts.join("\n"),
    `</svg>`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------
export async function generateMarketingImage(
  input: MarketingGenInput,
): Promise<MarketingGenResult> {
  if (!sharp) throw new Error("sharp not available — cannot generate marketing images");

  const {
    template, fields, sourceBuffer, srcWidth, srcHeight,
    focalX, focalY, dreLicense, brokerageName,
    previewOnly = false, previewWidth,
  } = input;

  const requiredFields = template.requiredFields as string[];
  validateFields(requiredFields, fields);

  const canvasW = template.canvasWidth;
  const canvasH = template.canvasHeight;

  // 1. Focal-point crop to canvas size
  const cropped = await focalCrop(
    sourceBuffer, srcWidth, srcHeight,
    focalX, focalY, canvasW, canvasH,
  );

  // 2. Build SVG overlay
  const layers  = template.definition as unknown as TemplateDefinition;
  const fontB64 = getFontBase64();
  const svgStr  = buildOverlaySvg(canvasW, canvasH, layers, fields, fontB64);

  // 3. Composite → full-size PNG
  const pngBuffer = await sharp!(cropped)
    .composite([{ input: Buffer.from(svgStr), blend: "over" }])
    .png({ compressionLevel: 6 })
    .toBuffer();

  // 4. WebP derivative (optionally scaled down for preview)
  let webpBuffer: Buffer;
  if (previewOnly && previewWidth && previewWidth < canvasW) {
    const scale  = previewWidth / canvasW;
    const thumbH = Math.round(canvasH * scale);
    webpBuffer = await sharp!(pngBuffer)
      .resize(previewWidth, thumbH)
      .webp({ quality: 82 })
      .toBuffer();
  } else {
    webpBuffer = await sharp!(pngBuffer)
      .webp({ quality: 85 })
      .toBuffer();
  }

  // 5. Caption (required for instagram channels)
  const caption = generateInstagramCaption(
    template.channel, fields, dreLicense, brokerageName,
  );

  if (previewOnly) {
    return { storageKey: null, webpKey: null, pngBuffer, webpBuffer, caption };
  }

  // 6. Upload to R2
  if (!isConfigured()) {
    throw new Error("Object storage not configured — cannot upload marketing image.");
  }

  const stem       = randomBytes(12).toString("hex");
  const storageKey = `campaigns/mkt/${stem}_${canvasW}x${canvasH}.png`;
  const webpKey    = `campaigns/mkt/${stem}_${canvasW}x${canvasH}.webp`;

  await Promise.all([
    putObject(storageKey, pngBuffer,  "image/png"),
    putObject(webpKey,   webpBuffer, "image/webp"),
  ]);

  return { storageKey, webpKey, pngBuffer, webpBuffer, caption };
}

// ---------------------------------------------------------------------------
// Photo selection — pick gallery image whose aspect ratio is closest to target
// ---------------------------------------------------------------------------
export interface GalleryEntry {
  mediaId:     string;
  aspectRatio: string;   // numeric string, e.g. "0.5625"
  width:       number;
  height:      number;
  focalX:      string;
  focalY:      string;
  storageKey:  string;
}

export function selectBestPhoto(
  gallery: GalleryEntry[],
  targetAspect: number,
): GalleryEntry | null {
  if (gallery.length === 0) return null;
  return gallery
    .slice()
    .sort((a, b) => {
      const da = Math.abs(parseFloat(a.aspectRatio) - targetAspect);
      const db = Math.abs(parseFloat(b.aspectRatio) - targetAspect);
      return da - db;
    })[0] ?? null;
}

// ---------------------------------------------------------------------------
// Street extraction — everything before the first comma.
// "412 N Mapleton Dr, Beverly Hills, CA 90210" → "412 N Mapleton Dr"
// If there is no comma the whole string is returned.
// ---------------------------------------------------------------------------
export function extractStreet(address: string): string {
  const commaIdx = address.indexOf(",");
  return commaIdx >= 0 ? address.slice(0, commaIdx).trim() : address.trim();
}

// ---------------------------------------------------------------------------
// City extraction — naively splits "123 Main St, Beverly Hills, CA 90210"
// ---------------------------------------------------------------------------
export function extractCity(address: string): string {
  const parts = address.split(",").map((p) => p.trim());
  // City is typically the second-to-last part before state+zip
  if (parts.length >= 3) return parts[parts.length - 2] ?? parts[0] ?? "";
  if (parts.length === 2) return parts[1] ?? parts[0] ?? "";
  return parts[0] ?? "";
}
