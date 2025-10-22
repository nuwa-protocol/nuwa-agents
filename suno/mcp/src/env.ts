const DEFAULT_BASE_URL = "https://api.sunoapi.org";

export interface SunoConfig {
  baseUrl: string;
  apiKey: string;
}

export const resolveSunoConfig = (): SunoConfig => {
  const baseUrl = process.env.SUNO_API_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const apiKey = process.env.SUNO_API_KEY?.trim() || "";

  if (!apiKey) {
    throw new Error("SUNO_API_KEY is required. Set it in your environment before starting the server.");
  }

  return { baseUrl, apiKey };
};
