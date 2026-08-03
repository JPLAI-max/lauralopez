/**
 * Campaign PDF generator — produces print-ready postcards and mailers.
 *
 * Postcard / Mailer:
 *   6 × 9 inches at 300 dpi  → 1800 × 2700 pt  (in PDF-lib, 1pt = 1/72 in)
 *   6 × 9 at 72pt/in         → 432 × 648 pt  (native PDF points)
 *   Plus 0.125" bleed on all sides = 0.125 × 72 = 9pt per edge
 *   Final page: (432 + 18) × (648 + 18) = 450 × 666 pt
 *
 * Colors are CMYK-safe: we use named brand colors that map cleanly.
 * pdf-lib uses 0–1 RGB internally; all values chosen from DTP-safe swatches.
 *
 * DRE compliance: dreLicense + brokerageName embedded on every page.
 */

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { randomBytes } from "node:crypto";
import { putObject } from "./storage";

// ---------------------------------------------------------------------------
// Brand palette — CMYK-safe RGB equivalents
// ---------------------------------------------------------------------------
// Navy:  C=90 M=70 Y=40 K=30  → #1A2332
// Cream: C=3  M=4  Y=10 K=0   → #F5F0E8
// Gold:  C=15 M=30 Y=75 K=5   → #C9A84C
// White: C=0  M=0  Y=0  K=0   → #FFFFFF
const NAVY  = rgb(0.102, 0.137, 0.196);
const CREAM = rgb(0.961, 0.941, 0.910);
const GOLD  = rgb(0.788, 0.659, 0.298);
const WHITE = rgb(1,     1,     1    );

// PDF dimensions (in points: 1pt = 1/72 inch)
const BLEED_PT      = 9;        // 0.125 in × 72
const PAGE_W_TRIM   = 432;      // 6 in  × 72
const PAGE_H_TRIM   = 648;      // 9 in  × 72
const PAGE_W        = PAGE_W_TRIM + 2 * BLEED_PT;   // 450 pt
const PAGE_H        = PAGE_H_TRIM + 2 * BLEED_PT;   // 666 pt
const MARGIN        = BLEED_PT + 28;                 // safe area: bleed + 28pt

export type PdfChannel = "postcard" | "mailer";

export interface PdfGenInput {
  channel:         PdfChannel;
  address:         string;
  price:           string | null;
  agentName:       string;
  dreLicense:      string;  // required
  brokerageName:   string;  // required
  listingBrokerage?: string | null;
  headline?:       string;
  body?:           string;
  cta?:            string;
  /** When true, skip R2 upload and return the buffer only (for scripts/preview). */
  previewOnly?:    boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function drawTextWrapped(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
): number {
  const words = text.split(" ");
  let line    = "";
  let curY    = y;

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      page.drawText(line, { x, y: curY, size, font, color });
      curY -= lineHeight;
      line  = word;
    } else {
      line = test;
    }
  }
  if (line) {
    page.drawText(line, { x, y: curY, size, font, color });
    curY -= lineHeight;
  }
  return curY;
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------
export async function generateCampaignPdf(input: PdfGenInput): Promise<{
  storageKey: string;
  buffer: Uint8Array;
}> {
  const {
    channel, address, price, agentName,
    dreLicense, brokerageName, listingBrokerage,
    headline, body, cta,
  } = input;

  const pdfDoc = await PDFDocument.create();
  // Embed metadata
  pdfDoc.setTitle(`${channel === "postcard" ? "Postcard" : "Mailer"} — ${address}`);
  pdfDoc.setCreator("The Beverly Hills Estates — Campaign Engine");

  // Load fonts
  const fontSerif = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const fontBold  = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const fontSans  = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontSansB = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // ---------------------------------------------------------------------------
  // FRONT PAGE
  // ---------------------------------------------------------------------------
  const front = pdfDoc.addPage([PAGE_W, PAGE_H]);

  // Bleed background
  front.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: NAVY });

  // Trim-box gold border
  front.drawRectangle({
    x: BLEED_PT - 1, y: BLEED_PT - 1,
    width: PAGE_W_TRIM + 2, height: PAGE_H_TRIM + 2,
    borderColor: GOLD, borderWidth: 1.5, color: undefined as unknown as ReturnType<typeof rgb>,
  });

  // Gold accent bar
  front.drawRectangle({ x: MARGIN, y: PAGE_H - MARGIN - 4, width: 60, height: 3, color: GOLD });

  // Headline
  const headlineText = headline ?? address;
  let curY = PAGE_H - MARGIN - 36;
  curY = drawTextWrapped(
    front, headlineText, MARGIN, curY,
    PAGE_W - MARGIN * 2, 28,
    fontBold, 22, CREAM,
  );

  curY -= 12;

  // Price
  if (price) {
    front.drawText(price, { x: MARGIN, y: curY, size: 28, font: fontSansB, color: GOLD });
    curY -= 38;
  }

  // Address
  const addrShort = address.length > 50 ? address.slice(0, 47) + "…" : address;
  front.drawText(addrShort, { x: MARGIN, y: curY, size: 11, font: fontSans, color: CREAM });
  curY -= 28;

  // Body copy
  if (body) {
    curY = drawTextWrapped(
      front, body, MARGIN, curY,
      PAGE_W - MARGIN * 2, 18,
      fontSerif, 11, CREAM,
    );
    curY -= 8;
  }

  // CTA
  if (cta) {
    front.drawText(cta.toUpperCase(), {
      x: MARGIN, y: curY, size: 10,
      font: fontSansB, color: GOLD,
    });
  }

  // Agent + DRE compliance footer (REQUIRED)
  const footerY  = BLEED_PT + 22;
  const dreFooter = listingBrokerage
    ? `${brokerageName} | ${listingBrokerage} | DRE ${dreLicense}`
    : `${brokerageName} | DRE ${dreLicense}`;

  front.drawText(agentName.toUpperCase(), {
    x: MARGIN, y: footerY + 14,
    size: 9, font: fontSansB, color: GOLD,
  });
  front.drawText(dreFooter, {
    x: MARGIN, y: footerY,
    size: 7, font: fontSans, color: CREAM,
    opacity: 0.75,
  });

  // ---------------------------------------------------------------------------
  // BACK PAGE (mailer gets a return address area; postcard minimal)
  // ---------------------------------------------------------------------------
  const back = pdfDoc.addPage([PAGE_W, PAGE_H]);
  back.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: WHITE });
  back.drawRectangle({
    x: BLEED_PT - 1, y: BLEED_PT - 1,
    width: PAGE_W_TRIM + 2, height: PAGE_H_TRIM + 2,
    borderColor: NAVY, borderWidth: 1,
    color: undefined as unknown as ReturnType<typeof rgb>,
  });

  // Return address area (top-left)
  back.drawText(agentName, { x: MARGIN, y: PAGE_H - MARGIN - 20, size: 9, font: fontSansB, color: NAVY });
  back.drawText(dreFooter, { x: MARGIN, y: PAGE_H - MARGIN - 34, size: 7, font: fontSans, color: NAVY });

  // Postage area placeholder (top-right)
  back.drawRectangle({
    x: PAGE_W - MARGIN - 72, y: PAGE_H - MARGIN - 60,
    width: 72, height: 60,
    borderColor: NAVY, borderWidth: 0.5,
    color: undefined as unknown as ReturnType<typeof rgb>,
  });
  back.drawText("POSTAGE", {
    x: PAGE_W - MARGIN - 60, y: PAGE_H - MARGIN - 35,
    size: 7, font: fontSans, color: NAVY, opacity: 0.4,
  });

  // Address area (center-right)
  const lineCount = channel === "mailer" ? 6 : 4;
  const lineStart = PAGE_H / 2 + 20;
  for (let i = 0; i < lineCount; i++) {
    back.drawLine({
      start: { x: PAGE_W / 2 + 20, y: lineStart - i * 22 },
      end:   { x: PAGE_W - MARGIN, y: lineStart - i * 22 },
      thickness: 0.5, color: NAVY, opacity: 0.25,
    });
  }

  // ---------------------------------------------------------------------------
  // Serialize
  // ---------------------------------------------------------------------------
  const bytes  = await pdfDoc.save();
  const buffer = Buffer.from(bytes);

  if (input.previewOnly) {
    return { storageKey: null as unknown as string, buffer: bytes };
  }

  const storageKey = `campaigns/pdf/${randomBytes(12).toString("hex")}_${channel}.pdf`;
  await putObject(storageKey, buffer, "application/pdf");

  return { storageKey, buffer: bytes };
}
