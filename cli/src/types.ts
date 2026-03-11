export type Ecosystem = "npm" | "pip";

export type VulnSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export interface Vulnerability {
  id: string;
  severity: VulnSeverity;
  summary: string;
  fixed_version?: string;
  patched: boolean;
}

export interface AnalyzeResponse {
  package: string;
  version: string;
  ecosystem: Ecosystem;
  summary: string;
  use_case: string;
  alternatives: Array<{ name: string; comparison: string }>;
  license_type: string;
  license_risk: boolean;
  dep_count: number;
  install_size_kb: number;
  weekly_downloads: number;
  last_published: string;
  health_score: number;
  vulnerabilities: Vulnerability[];
  cached: boolean;
}
