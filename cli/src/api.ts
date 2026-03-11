import type { AnalyzeResponse, Ecosystem } from "./types.js";

const DEFAULT_API_BASE = process.env.SNOOP_API_URL ?? "http://localhost:8787";

export type AnalysisResult = AnalyzeResponse | { error: string };

export async function fetchAnalysisBatch(
  packages: Array<{ name: string; ecosystem: Ecosystem }>,
  options: {
    concurrency?: number;
    apiBase?: string;
    onProgress?: (done: number, total: number, current: string) => void;
  } = {},
): Promise<AnalysisResult[]> {
  const { concurrency = 5, apiBase = DEFAULT_API_BASE, onProgress } = options;
  const results: AnalysisResult[] = new Array(packages.length);

  let nextIndex = 0;
  let done = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= packages.length) break;
      const { name, ecosystem } = packages[i];
      try {
        results[i] = await fetchAnalysis(name, ecosystem, apiBase);
      } catch (e) {
        results[i] = { error: e instanceof Error ? e.message : "Unknown error" };
      }
      done++;
      onProgress?.(done, packages.length, name);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, packages.length) }, () => worker()));
  return results;
}

export async function fetchAnalysis(
  packageName: string,
  ecosystem: Ecosystem,
  apiBase = DEFAULT_API_BASE,
  version?: string,
): Promise<AnalyzeResponse> {
  let response: Response;

  try {
    response = await fetch(`${apiBase}/analyze`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ package: packageName, ecosystem, ...(version ? { version } : {}) }),
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
