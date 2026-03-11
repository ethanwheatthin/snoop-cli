export type VulnSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export interface Vulnerability {
  id: string;
  severity: VulnSeverity;
  summary: string;
  fixed_version?: string;
  /** true = fixed in a later version; false = still affects the current version */
  patched: boolean;
}

// ── OSV API types ─────────────────────────────────────────────────────────────

interface OsvSeverity {
  type: string;
  score: string;
}

interface OsvRangeEvent {
  introduced?: string;
  fixed?: string;
}

interface OsvRange {
  type: string;
  events: OsvRangeEvent[];
}

interface OsvAffected {
  ranges?: OsvRange[];
}

interface OsvVuln {
  id: string;
  summary?: string;
  severity?: OsvSeverity[];
  affected?: OsvAffected[];
  database_specific?: {
    severity?: string;
    cvss_score?: number;
  };
}

interface OsvResponse {
  vulns?: OsvVuln[];
}

// ── CVSS v3 base score → severity ─────────────────────────────────────────────

/**
 * Parses a CVSS v3 vector string and returns the numeric base score (0–10),
 * or null if the vector cannot be parsed.
 */
function parseCvssV3Score(vector: string): number | null {
  const m = vector.match(
    /^CVSS:3\.\d\/AV:([NALP])\/AC:([LH])\/PR:([NLH])\/UI:([NR])\/S:([UC])\/C:([NLH])\/I:([NLH])\/A:([NLH])/,
  );
  if (!m) return null;

  const [, av, ac, pr, ui, s, c, i, a] = m;

  const avW: Record<string, number> = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 };
  const acW: Record<string, number> = { L: 0.77, H: 0.44 };
  const uiW: Record<string, number> = { N: 0.85, R: 0.62 };
  const impW: Record<string, number> = { N: 0, L: 0.22, H: 0.56 };
  const prW: Record<"U" | "C", Record<string, number>> = {
    U: { N: 0.85, L: 0.62, H: 0.27 },
    C: { N: 0.85, L: 0.5, H: 0.15 },
  };

  const scope = s as "U" | "C";
  const iss = 1 - (1 - impW[c]) * (1 - impW[i]) * (1 - impW[a]);
  const impact =
    scope === "U"
      ? 6.42 * iss
      : 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15);

  if (impact <= 0) return 0;

  const exploit = 8.22 * avW[av] * acW[ac] * prW[scope][pr] * uiW[ui];
  const raw =
    scope === "U"
      ? Math.min(impact + exploit, 10)
      : Math.min(1.08 * (impact + exploit), 10);

  // Ceiling to one decimal place (per CVSS spec)
  return Math.ceil(raw * 10) / 10;
}

function numericScoreToSeverity(score: number): VulnSeverity {
  if (score >= 9.0) return "CRITICAL";
  if (score >= 7.0) return "HIGH";
  if (score >= 4.0) return "MEDIUM";
  if (score > 0) return "LOW";
  return "UNKNOWN";
}

function extractSeverity(vuln: OsvVuln): VulnSeverity {
  // GitHub Advisory database provides a pre-computed string severity.
  const dbSev = vuln.database_specific?.severity;
  if (dbSev) {
    const s = dbSev.toUpperCase();
    if (s === "CRITICAL") return "CRITICAL";
    if (s === "HIGH") return "HIGH";
    if (s === "MODERATE" || s === "MEDIUM") return "MEDIUM";
    if (s === "LOW") return "LOW";
  }

  // Some entries include a pre-computed numeric CVSS score.
  const numericScore = vuln.database_specific?.cvss_score;
  if (typeof numericScore === "number") {
    return numericScoreToSeverity(numericScore);
  }

  // Fall back to parsing CVSS v3 vector.
  const cvssV3 = vuln.severity?.find((s) => s.type === "CVSS_V3");
  if (cvssV3) {
    const score = parseCvssV3Score(cvssV3.score);
    if (score !== null) return numericScoreToSeverity(score);
  }

  return "UNKNOWN";
}

function extractFixedVersion(vuln: OsvVuln): string | undefined {
  for (const affected of vuln.affected ?? []) {
    for (const range of affected.ranges ?? []) {
      if (range.type === "ECOSYSTEM") {
        const fixed = range.events.find((e) => e.fixed !== undefined);
        if (fixed?.fixed) return fixed.fixed;
      }
    }
  }
  return undefined;
}

// ── Public API ────────────────────────────────────────────────────────────────

async function queryOsv(
  packageName: string,
  osvEcosystem: string,
  version?: string,
): Promise<OsvVuln[]> {
  let res: Response;
  try {
    res = await fetch("https://api.osv.dev/v1/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(version !== undefined ? { version } : {}),
        package: { name: packageName, ecosystem: osvEcosystem },
      }),
    });
  } catch {
    return [];
  }
  if (!res.ok) return [];
  const data = (await res.json()) as OsvResponse;
  return data.vulns ?? [];
}

export async function fetchVulnerabilities(
  packageName: string,
  version: string,
  ecosystem: "npm" | "pip",
): Promise<Vulnerability[]> {
  const osvEcosystem = ecosystem === "npm" ? "npm" : "PyPI";

  // Run both queries in parallel:
  // - scoped query returns only vulns that still affect the current version
  // - unscoped query returns all historical vulns for the package
  const [scopedVulns, allVulns] = await Promise.all([
    queryOsv(packageName, osvEcosystem, version),
    queryOsv(packageName, osvEcosystem),
  ]);

  const activeIds = new Set(scopedVulns.map((v) => v.id));

  // Deduplicate by id, preferring entries from the full list (richer data).
  const seen = new Set<string>();
  const merged: Vulnerability[] = [];
  for (const v of allVulns) {
    if (seen.has(v.id)) continue;
    seen.add(v.id);
    merged.push({
      id: v.id,
      severity: extractSeverity(v),
      summary: v.summary ?? "No description available.",
      fixed_version: extractFixedVersion(v),
      patched: !activeIds.has(v.id),
    });
  }

  // Sort: unpatched first, then by severity.
  const sevOrder: Record<VulnSeverity, number> = {
    CRITICAL: 0,
    HIGH: 1,
    MEDIUM: 2,
    LOW: 3,
    UNKNOWN: 4,
  };
  merged.sort((a, b) => {
    if (a.patched !== b.patched) return a.patched ? 1 : -1;
    return sevOrder[a.severity] - sevOrder[b.severity];
  });

  return merged;
}
