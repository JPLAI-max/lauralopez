/**
 * Campaign copy generator via Anthropic claude-haiku-4-5.
 *
 * HARD RULE: The model writes around {{price}}, {{address}}, {{beds}},
 * {{baths}}, {{sqft}}, {{yearBuilt}} placeholders.
 * After generation we substitute the real values. Any draft still
 * containing a raw digit outside a placeholder is REJECTED.
 */

import { anthropic } from "@workspace/integrations-anthropic-ai";
import { randomBytes } from "node:crypto";
import { putObject } from "./storage";

// Channels that produce copy
export type CopyChannel =
  | "instagram_post"
  | "instagram_story"
  | "email"
  | "postcard"
  | "mailer"
  | "voicemail";

export interface PropertyFacts {
  address:    string;
  price:      string | null;
  beds:       string | null;
  baths:      string | null;
  sqft:       number | null;
  yearBuilt:  number | null;
  commentary: string | null;
}

export interface CopyOutput {
  raw:          string;   // after substitution (no placeholders remain)
  storageKey:   string | null;   // null if R2 not configured
}

// ---------------------------------------------------------------------------
// Placeholder substitution
// ---------------------------------------------------------------------------
function substitute(text: string, facts: PropertyFacts): string {
  return text
    .replace(/\{\{price\}\}/g,     facts.price     ?? "Price on Request")
    .replace(/\{\{address\}\}/g,   facts.address)
    .replace(/\{\{beds\}\}/g,      facts.beds      ?? "—")
    .replace(/\{\{baths\}\}/g,     facts.baths     ?? "—")
    .replace(/\{\{sqft\}\}/g,      facts.sqft      != null ? facts.sqft.toLocaleString() : "—")
    .replace(/\{\{yearBuilt\}\}/g, facts.yearBuilt != null ? String(facts.yearBuilt)    : "—");
}

/**
 * Checks whether any raw digits remain outside {{...}} placeholders.
 * Returns true if the copy is clean, false if it must be rejected.
 */
function noRawDigits(text: string): boolean {
  // Remove all remaining {{...}} (already substituted — none should remain)
  // Then check for any digit
  const stripped = text.replace(/\{\{[^}]+\}\}/g, "");
  return !/\d/.test(stripped);
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------
function systemPrompt(): string {
  return `You are a luxury real estate copywriter for a Beverly Hills estate agent.
Write marketing copy that is elegant, aspirational, and specific to the property.
CRITICAL RULES:
1. Never invent or write any number, price, date, or statistic.
2. Where a fact is needed (price, beds, baths, sqft, year built, address), use EXACTLY these placeholders: {{price}} {{address}} {{beds}} {{baths}} {{sqft}} {{yearBuilt}}
3. Your copy must not contain any digit character (0-9) outside a placeholder.
4. Write in active present tense. Avoid clichés.
5. Output ONLY the requested copy — no commentary, no labels.`;
}

function userPrompt(channel: CopyChannel, facts: PropertyFacts): string {
  const factBlock = [
    `Property: {{address}}`,
    `Price: {{price}}`,
    `Beds: {{beds}} | Baths: {{baths}}`,
    `Sq Ft: {{sqft}}`,
    `Year Built: {{yearBuilt}}`,
    facts.commentary ? `Agent commentary: ${facts.commentary}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const instructions: Record<CopyChannel, string> = {
    instagram_post: `Write an Instagram caption (max 220 chars including hashtags). Use the property placeholders. End with 3–5 relevant hashtags.`,
    instagram_story: `Write a punchy Instagram Story overlay text (max 80 chars). Single powerful line. Use at most one placeholder.`,
    email: `Write an email with format:
SUBJECT: [subject line, max 60 chars]
BODY: [2–3 short paragraphs, professional, use placeholders for all facts]`,
    postcard: `Write postcard copy with format:
HEADLINE: [max 55 chars]
BODY: [2 short sentences, max 140 chars total, use placeholders]
CTA: [call to action, max 30 chars]`,
    mailer: `Write mailer copy with format:
HEADLINE: [max 70 chars]
BODY: [3–4 sentences, use placeholders for all facts]
CTA: [call to action, max 40 chars]`,
    voicemail: `Write a ringless voicemail script (30–45 seconds at normal speaking pace). Use placeholders for all facts. End with a callback number placeholder [PHONE].`,
  };

  return `${factBlock}\n\nTask: ${instructions[channel]}`;
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------
export async function generateCampaignCopy(
  channel: CopyChannel,
  facts: PropertyFacts,
): Promise<CopyOutput> {
  const message = await anthropic.messages.create({
    model:      "claude-haiku-4-5",
    max_tokens: 8192,
    system:     systemPrompt(),
    messages:   [{ role: "user", content: userPrompt(channel, facts) }],
  });

  const block = message.content[0];
  if (!block || block.type !== "text") {
    throw new Error("Anthropic returned no text content");
  }

  const rawDraft = block.text.trim();

  // Substitute placeholders
  const substituted = substitute(rawDraft, facts);

  // Hard reject: any digit outside a placeholder that somehow survived
  if (!noRawDigits(rawDraft)) {
    throw Object.assign(
      new Error(
        `Generated copy contains a raw digit outside a placeholder. ` +
        `The model must use {{price}}, {{address}}, etc. Rejected draft.`,
      ),
      { code: "RAW_DIGIT_IN_COPY", draft: rawDraft },
    );
  }

  // Optionally store to R2 as a text file (for email/long-form)
  let storageKey: string | null = null;
  try {
    storageKey = `campaigns/copy/${randomBytes(12).toString("hex")}_${channel}.txt`;
    await putObject(storageKey, Buffer.from(substituted, "utf8"), "text/plain");
  } catch {
    storageKey = null; // R2 not configured or failed — text will live in DB only
  }

  return { raw: substituted, storageKey };
}
