export * from "./generated/api";
export * from "./generated/types";

/**
 * The exact wording shown to the user on the inquiry opt-in checkbox.
 * This string is stored verbatim in consentText so old records prove
 * what the person actually agreed to. Never change it without creating
 * a new versioned constant.
 */
export const INTEL_CONSENT_TEXT =
  "Send me Laura's Market Intelligence — periodic briefings on Beverly Hills market activity, regulation, and architecture.";
