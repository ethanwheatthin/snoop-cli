export type Ecosystem = "npm" | "pip";

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
  cached: boolean;
}
