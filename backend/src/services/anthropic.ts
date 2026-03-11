import Anthropic from "@anthropic-ai/sdk";
import type { AnalysisLLMResult, PackageFacts, Vulnerability } from "../types.js";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

function normalizeEnvValue(value?: string): string {
  if (!value) {
    return "";
  }

  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function stripCodeFences(text: string): string {
  return text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
}

function safeJsonParse<T>(input: string): T {
  try {
    return JSON.parse(input) as T;
  } catch {
    const firstBrace = input.indexOf("{");
    const lastBrace = input.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const slice = input.slice(firstBrace, lastBrace + 1);
      return JSON.parse(slice) as T;
    }
    throw new Error("Model did not return valid JSON");
  }
}

function buildUserPrompt(facts: PackageFacts, vulnerabilities: Vulnerability[]): string {
  const activeVulns   = vulnerabilities.filter((v) => !v.patched);
  const patchedVulns  = vulnerabilities.filter((v) => v.patched);

  const formatVuln = (v: Vulnerability) =>
    `- ${v.id} [${v.severity}]${v.fixed_version ? ` (fixed in ${v.fixed_version})` : ""}: ${v.summary}`;

  const vulnSection = [
    activeVulns.length
      ? `Active (affects current version):\n${activeVulns.slice(0, 5).map(formatVuln).join("\n")}`
      : "Active: none.",
    patchedVulns.length
      ? `Historical (patched in a later version):\n${patchedVulns.slice(0, 5).map(formatVuln).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `Analyze this package and return JSON in this exact shape:
{
  "summary": "string",
  "use_case": "string",
  "alternatives": [{ "name": "string", "comparison": "string" }],
  "license_risk": false,
  "license_type": "string",
  "health_score": 0
}

Package name: ${facts.package}
Weekly downloads: ${facts.weekly_downloads}
Last published: ${facts.last_published}
License: ${facts.license}
README excerpt: ${facts.readme_excerpt}
Dependencies: ${facts.dep_count}
Known vulnerabilities:\n${vulnSection}`;
}

function fallbackAnalysis(facts: PackageFacts): AnalysisLLMResult {
  const ecosystemWord = facts.ecosystem === "npm" ? "JavaScript" : "Python";

  return {
    summary: `${facts.package} is a ${ecosystemWord} package. Review docs and examples before adding it to production code.`,
    use_case: `Use ${facts.package} when its API aligns with your project requirements.`,
    alternatives: [
      { name: "manual-evaluation", comparison: "Compare by API fit, maintenance, and install size." },
      { name: "project-native-option", comparison: "Prefer built-in platform features when possible." },
    ],
    license_risk: /gpl|agpl|sspl/i.test(facts.license),
    license_type: facts.license,
    health_score: 70,
  };
}

async function callAnthropicViaHttp(params: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: 900,
      system: params.systemPrompt,
      messages: [{ role: "user", content: params.userPrompt }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP fallback failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };

  const firstText = payload.content?.find((item) => item.type === "text")?.text;
  if (!firstText) {
    throw new Error("HTTP fallback response had no text content");
  }

  return firstText;
}

export async function analyzeWithAnthropic(
  facts: PackageFacts,
  vulnerabilities: Vulnerability[] = [],
): Promise<AnalysisLLMResult> {
  const apiKey = normalizeEnvValue(process.env.ANTHROPIC_API_KEY);
  const model = normalizeEnvValue(process.env.MODEL) || DEFAULT_MODEL;
  if (!apiKey) {
    console.warn("[anthropic] ANTHROPIC_API_KEY is missing. Using fallback analysis.");
    return fallbackAnalysis(facts);
  }

  // Short keys are usually placeholders or truncated secrets.
  if (apiKey.trim().length < 20) {
    console.warn("[anthropic] ANTHROPIC_API_KEY appears invalid (too short). Using fallback analysis.");
    return fallbackAnalysis(facts);
  }

  try {
    const anthropic = new Anthropic({ apiKey });

    const systemPrompt =
      "You are a developer tool that analyzes npm/PyPI packages and returns structured JSON. Always return valid JSON only - no markdown, no explanation outside the JSON.";

    const userPrompt = buildUserPrompt(facts, vulnerabilities);

    const response = await anthropic.messages.create({
      model,
      max_tokens: 900,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const firstTextBlock = response.content.find((block) => block.type === "text");
    if (!firstTextBlock || firstTextBlock.type !== "text") {
      throw new Error("No text response from model");
    }

    const parsed = safeJsonParse<AnalysisLLMResult>(stripCodeFences(firstTextBlock.text));

    return {
      summary: parsed.summary,
      use_case: parsed.use_case,
      alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives.slice(0, 3) : [],
      license_risk: Boolean(parsed.license_risk),
      license_type: parsed.license_type || facts.license,
      health_score: Number.isFinite(parsed.health_score) ? parsed.health_score : 0,
    };
  } catch (sdkError) {
    const sdkMessage = sdkError instanceof Error ? sdkError.message : "Unknown Anthropic SDK error";
    console.warn(`[anthropic] SDK call failed, trying HTTP fallback: ${sdkMessage}`);

    try {
      const systemPrompt =
        "You are a developer tool that analyzes npm/PyPI packages and returns structured JSON. Always return valid JSON only - no markdown, no explanation outside the JSON.";

      const userPrompt = buildUserPrompt(facts, vulnerabilities);

      const text = await callAnthropicViaHttp({
        apiKey,
        model,
        systemPrompt,
        userPrompt,
      });

      const parsed = safeJsonParse<AnalysisLLMResult>(stripCodeFences(text));
      return {
        summary: parsed.summary,
        use_case: parsed.use_case,
        alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives.slice(0, 3) : [],
        license_risk: Boolean(parsed.license_risk),
        license_type: parsed.license_type || facts.license,
        health_score: Number.isFinite(parsed.health_score) ? parsed.health_score : 0,
      };
    } catch (httpError) {
      const httpMessage = httpError instanceof Error ? httpError.message : "Unknown Anthropic HTTP error";
      console.warn(`[anthropic] request failed, using fallback analysis: ${httpMessage}`);
      return fallbackAnalysis(facts);
    }
  }
}
