/**
 * Campaign image generator — produces focal-point-cropped images with
 * brand overlays for instagram_post (1080×1080) and instagram_story (1080×1920).
 *
 * DRE compliance rule: dre_license and brokerage_name MUST be present
 * before any image is generated. getSettingOrFail is called first.
 */

import { randomBytes } from "node:crypto";
import type { Sharp as SharpType } from "sharp";
type SharpConstructor = (input?: Buffer) => SharpType;

let sharp: SharpConstructor | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  sharp = require("sharp") as SharpConstructor;
} catch {
  /* sharp optional */
}

import { putObject } from "./storage";

// Brand palette (hex → 0-255)
const PALETTE = {
  cream:    "#F5F0E8",
  navy:     "#1A2332",
  gold:     "#C9A84C",
  overlay:  "rgba(26,35,50,0.62)",
} as const;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface ImageGenInput {
  sourceBuffer: Buffer;
  srcWidth:     number;
  srcHeight:    number;
  focalX:       number;   // 0..1
  focalY:       number;   // 0..1
  targetWidth:  number;
  targetHeight: number;
  address:      string;
  price:        string | null;
  agentName:    string;
  dreLicense:   string;
  brokerageName: string;
  listingBrokerage?: string | null;
}

/** Builds the SVG overlay string for the given canvas size */
function buildOverlaySvg(
  w: number,
  h: number,
  address: string,
  price: string | null,
  agentName: string,
  dreLicense: string,
  brokerageName: string,
  listingBrokerage?: string | null,
): string {
  // Truncate address for display
  const addrDisplay = address.length > 55 ? address.slice(0, 52) + "…" : address;

  const bar1Y  = h - 120;     // price + agent bar start
  const fontLg = Math.round(w * 0.038);   // ~41px at 1080
  const fontMd = Math.round(w * 0.028);   // ~30px
  const fontSm = Math.round(w * 0.020);   // ~22px
  const fontXs = Math.round(w * 0.016);   // ~17px

  const [nr, ng, nb] = hexToRgb(PALETTE.navy);
  const [gr, gg, gb] = hexToRgb(PALETTE.gold);
  const [cr, cg, cb] = hexToRgb(PALETTE.cream);

  const priceStr   = price ? price : "";
  const dreFooter  = listingBrokerage
    ? `${brokerageName} | ${listingBrokerage} | DRE ${dreLicense}`
    : `${brokerageName} | DRE ${dreLicense}`;

  return `
<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <!-- gradient overlay bottom -->
  <defs>
    <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgb(${nr},${ng},${nb})" stop-opacity="0"/>
      <stop offset="60%" stop-color="rgb(${nr},${ng},${nb})" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="rgb(${nr},${ng},${nb})" stop-opacity="0.90"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#grad)"/>

  <!-- address -->
  <text
    x="${w * 0.06}"
    y="${bar1Y - fontMd * 1.8}"
    font-family="Georgia, serif"
    font-size="${fontMd}"
    fill="rgb(${cr},${cg},${cb})"
    opacity="0.92"
  >${escapeXml(addrDisplay)}</text>

  <!-- price -->
  ${priceStr ? `<text
    x="${w * 0.06}"
    y="${bar1Y}"
    font-family="Georgia, serif"
    font-size="${fontLg}"
    font-weight="bold"
    fill="rgb(${gr},${gg},${gb})"
  >${escapeXml(priceStr)}</text>` : ""}

  <!-- agent name -->
  <text
    x="${w * 0.06}"
    y="${bar1Y + fontMd * 2}"
    font-family="Arial, sans-serif"
    font-size="${fontSm}"
    fill="rgb(${cr},${cg},${cb})"
    letter-spacing="2"
  >${escapeXml(agentName.toUpperCase())}</text>

  <!-- DRE / brokerage footer (REQUIRED by DRE compliance) -->
  <text
    x="${w * 0.06}"
    y="${h - fontXs * 1.5}"
    font-family="Arial, sans-serif"
    font-size="${fontXs}"
    fill="rgb(${cr},${cg},${cb})"
    opacity="0.75"
  >${escapeXml(dreFooter)}</text>
</svg>`.trim();
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generates a focal-point-cropped image with brand overlay.
 * Returns { storageKey, buffer }.
 */
export async function generateCampaignImage(input: ImageGenInput): Promise<{
  storageKey: string;
  buffer: Buffer;
}> {
  if (!sharp) throw new Error("sharp not available — cannot generate images");

  const {
    sourceBuffer, srcWidth, srcHeight,
    focalX, focalY, targetWidth, targetHeight,
    address, price, agentName, dreLicense, brokerageName, listingBrokerage,
  } = input;

  // ---------------------------------------------------------------------------
  // 1. Focal-point crop: scale source to cover the target dimensions first
  // ---------------------------------------------------------------------------
  const scaleX = targetWidth  / srcWidth;
  const scaleY = targetHeight / srcHeight;
  const scale  = Math.max(scaleX, scaleY);

  const scaledW = Math.round(srcWidth  * scale);
  const scaledH = Math.round(srcHeight * scale);

  // Crop region within scaled image
  const cropW = targetWidth;
  const cropH = targetHeight;

  // Focal point maps to the desired centre of the crop
  const left = clamp(
    Math.round(focalX * scaledW - cropW / 2),
    0,
    scaledW - cropW,
  );
  const top = clamp(
    Math.round(focalY * scaledH - cropH / 2),
    0,
    scaledH - cropH,
  );

  const resized = await sharp!(sourceBuffer)
    .resize(scaledW, scaledH)
    .extract({ left, top, width: cropW, height: cropH })
    .toBuffer();

  // ---------------------------------------------------------------------------
  // 2. Build SVG overlay and composite
  // ---------------------------------------------------------------------------
  const svgStr = buildOverlaySvg(
    targetWidth, targetHeight,
    address, price, agentName, dreLicense, brokerageName, listingBrokerage,
  );

  const final = await sharp!(resized)
    .composite([{ input: Buffer.from(svgStr), blend: "over" }])
    .jpeg({ quality: 90 })
    .toBuffer();

  // ---------------------------------------------------------------------------
  // 3. Store to R2
  // ---------------------------------------------------------------------------
  const storageKey = `campaigns/${randomBytes(12).toString("hex")}_${targetWidth}x${targetHeight}.jpg`;
  await putObject(storageKey, final, "image/jpeg");

  return { storageKey, buffer: final };
}
