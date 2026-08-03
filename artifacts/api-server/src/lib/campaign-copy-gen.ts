/**
 * Campaign copy generator via Anthropic (model read from settings at runtime).
 *
 * HARD RULE: The model writes around {{price}}, {{address}}, {{beds}},
 * {{baths}}, {{sqft}}, {{yearBuilt}} placeholders.
 * After generation we substitute the real values. Any draft containing a
 * raw digit outside a placeholder is REJECTED.
 *
 * Retry policy: on first rejection, retry once with a corrective instruction
 * that names the violated rule. If the second attempt also fails, throw
 * RAW_DIGIT_IN_COPY and include BOTH drafts in the error payload.
 * Both rejections are logged at warn level with channel + draft.
 */

import { anthropic } from "@workspace/integrations-anthropic-ai";
import { randomBytes } from "node:crypto";
import { putObject } from "./storage";
import { logger } from "./logger";

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
  raw:          string;            // after substitution (no placeholders remain)
  storageKey:   string | null;     // null if R2 not configured
}

// ---------------------------------------------------------------------------
// Default model — used when no copy_model setting is configured
// ---------------------------------------------------------------------------
export const DEFAULT_COPY_MODEL = "claude-sonnet-4-6";

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
 * Returns true when no raw digit exists outside {{...}} placeholders.
 * Called on the PRE-substitution draft so placeholders are still intact.
 */
function noRawDigits(text: string): boolean {
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
// Internal — single Anthropic call
// ---------------------------------------------------------------------------
type Msg = { role: "user" | "assistant"; content: string };

async function callModel(model: string, messages: Msg[]): Promise<string> {
  const response = await anthropic.messages.create({
    model,
    max_tokens: 8192,
    system:     systemPrompt(),
    messages,
  });
  const block = response.content[0];
  if (!block || block.type !== "text") {
    throw new Error("Anthropic returned no text content");
  }
  return block.text.trim();
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------
/**
 * @param model  Anthropic model name. If omitted, falls back to DEFAULT_COPY_MODEL.
 *               Pass the value of the `copy_model` setting from the owner's settings
 *               table so the model can change without a redeploy.
 */
export async function generateCampaignCopy(
  channel: CopyChannel,
  facts:   PropertyFacts,
  model?:  string,
): Promise<CopyOutput> {
  const useModel = model ?? DEFAULT_COPY_MODEL;

  // ── Attempt 1 ────────────────────────────────────────────────────────────
  const firstMessages: Msg[] = [{ role: "user", content: userPrompt(channel, facts) }];
  const rawDraft1 = await callModel(useModel, firstMessages);

  let rawDraft: string;

  if (!noRawDigits(rawDraft1)) {
    // Log and retry once
    logger.warn(
      { channel, model: useModel, draft: rawDraft1 },
      "campaign-copy-gen: digit rejection on attempt 1 — retrying",
    );

    // ── Attempt 2 — corrective instruction ──────────────────────────────────
    const retryMessages: Msg[] = [
      ...firstMessages,
      { role: "assistant", content: rawDraft1 },
      {
        role: "user",
        content:
          "Your previous response violated the rules: it contained one or more raw digit " +
          "characters (0–9) outside a placeholder. You MUST use ONLY the placeholders " +
          "{{price}}, {{beds}}, {{baths}}, {{sqft}}, {{yearBuilt}} wherever a number " +
          "is needed. Rewrite the copy now with absolutely no bare digits anywhere.",
      },
    ];

    const rawDraft2 = await callModel(useModel, retryMessages);

    if (!noRawDigits(rawDraft2)) {
      logger.warn(
        { channel, model: useModel, draft: rawDraft2 },
        "campaign-copy-gen: digit rejection on attempt 2 — giving up",
      );
      throw Object.assign(
        new Error(
          `Generated copy contains raw digits outside placeholders after retry. Both drafts rejected.\n` +
          `Draft 1: ${rawDraft1}\nDraft 2: ${rawDraft2}`,
        ),
        { code: "RAW_DIGIT_IN_COPY", draft1: rawDraft1, draft2: rawDraft2 },
      );
    }

    rawDraft = rawDraft2;
  } else {
    rawDraft = rawDraft1;
  }

  // ── Substitute real values and store ─────────────────────────────────────
  const substituted = substitute(rawDraft, facts);

  let storageKey: string | null = null;
  try {
    storageKey = `campaigns/copy/${randomBytes(12).toString("hex")}_${channel}.txt`;
    await putObject(storageKey, Buffer.from(substituted, "utf8"), "text/plain");
  } catch {
    storageKey = null; // R2 not configured or failed — text lives in DB only
  }

  return { raw: substituted, storageKey };
}
