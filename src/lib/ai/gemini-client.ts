import { GoogleGenAI } from "@google/genai";

/**
 * Free-tier-compatible default. Overridable via GEMINI_MODEL so the demo
 * keeps working if Google renames or retires this specific model id.
 */
const DEFAULT_MODEL = "gemini-2.5-flash";

let cachedClient: GoogleGenAI | null = null;

/** True only when a server-only GEMINI_API_KEY is configured. */
export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

/** Returns null when GEMINI_API_KEY is not configured — callers must treat that as "AI unavailable", never throw. */
export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!cachedClient) cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}
