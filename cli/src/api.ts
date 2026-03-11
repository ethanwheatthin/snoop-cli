import type { AnalyzeResponse, Ecosystem } from "./types.js";

const DEFAULT_API_BASE = process.env.SNOOP_API_URL ?? "http://localhost:8787";

export async function fetchAnalysis(
  packageName: string,
  ecosystem: Ecosystem,
  apiBase = DEFAULT_API_BASE,
): Promise<AnalyzeResponse> {
  let response: Response;

  try {
    response = await fetch(`${apiBase}/analyze`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ package: packageName, ecosystem }),
    });
  } catch {
    throw new Error(
      `Could not reach Snoop backend at ${apiBase}. Start the backend or set SNOOP_API_URL.`,
    );
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    const detail = payload?.error ? `: ${payload.error}` : "";
    throw new Error(`Backend request failed (${response.status})${detail}`);
  }

  return (await response.json()) as AnalyzeResponse;
}
