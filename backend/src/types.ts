export type Ecosystem = "npm" | "pip";

export type VulnSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export interface Vulnerability {
  id: string;
  severity: VulnSeverity;
  summary: string;
  fixed_version?: string;
  patched: boolean;
}

export interface AnalyzeRequest {
  package: string;
  ecosystem?: Ecosystem;
}

export interface AnalysisLLMResult {
  summary: string;
  use_case: string;
  alternatives: Array<{ name: string; comparison: string }>;
  license_risk: boolean;
  license_type: string;
  health_score: number;
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

export interface PackageFacts {
  package: string;
  version: string;
  ecosystem: Ecosystem;
  license: string;
  dep_count: number;
  install_size_kb: number;
  weekly_downloads: number;
  last_published: string;
  readme_excerpt: string;
  repository_url?: string;
  github_open_issues?: number;
  github_last_commit?: string;
}
