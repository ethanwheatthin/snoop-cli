import chalk from "chalk";
import type { AnalyzeResponse } from "./types.js";
import type { ProjectScan, ScannedPackage } from "./scan.js";
import type { AnalysisResult } from "./api.js";

function formatDownloads(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B/week`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M/week`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K/week`;
  }
  return `${value}/week`;
}

function padRight(text: string, width: number): string {
  if (text.length >= width) {
    return text.slice(0, width);
  }
  return text + " ".repeat(width - text.length);
}

function wrapLine(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > width) {
      if (current) {
        lines.push(current);
      }
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length ? lines : [""];
}

export function renderCard(data: AnalyzeResponse): void {
  const width = 62;
  const inner = width - 2;

  const title = `${data.package} @${data.version} (${data.ecosystem})`;
  const licenseLine = `${data.license_risk ? "!" : "OK"} License: ${data.license_type}`;
  const depsLine = `Deps: ${data.dep_count} | Install size: ~${data.install_size_kb} KB`;
  const healthLine = `Health: ${data.health_score}/100`;
  const downloadsLine = `Downloads: ${formatDownloads(data.weekly_downloads)}`;

  const out: string[] = [];
  out.push(chalk.cyan("┌" + "─".repeat(inner) + "┐"));
  out.push(chalk.cyan(`│${padRight(`  ${title}`, inner)}│`));
  out.push(chalk.cyan("├" + "─".repeat(inner) + "┤"));

  out.push(chalk.cyan(`│${padRight("  What it does", inner)}│`));
  for (const line of wrapLine(data.summary, inner - 4)) {
    out.push(chalk.cyan(`│${padRight(`  ${line}`, inner)}│`));
  }

  out.push(chalk.cyan(`│${padRight("", inner)}│`));
  out.push(chalk.cyan(`│${padRight(`  ${licenseLine}`, inner)}│`));
  out.push(chalk.cyan(`│${padRight(`  ${depsLine}`, inner)}│`));
  out.push(chalk.cyan(`│${padRight(`  ${healthLine}`, inner)}│`));
  out.push(chalk.cyan(`│${padRight(`  ${downloadsLine}`, inner)}│`));

  out.push(chalk.cyan(`│${padRight("", inner)}│`));
  out.push(chalk.cyan(`│${padRight("  Alternatives", inner)}│`));

  for (const alt of data.alternatives.slice(0, 3)) {
    const lines = wrapLine(`- ${alt.name} - ${alt.comparison}`, inner - 4);
    for (const line of lines) {
      out.push(chalk.cyan(`│${padRight(`  ${line}`, inner)}│`));
    }
  }

  if (!data.alternatives.length) {
    out.push(chalk.cyan(`│${padRight("  - No alternatives suggested", inner)}│`));
  }

  out.push(chalk.cyan("└" + "─".repeat(inner) + "┘"));

  console.log(out.join("\n"));
}

// ── Scan results renderer ─────────────────────────────────────────────────────

const COL_NAME = 22;
const COL_VER = 9;
const COL_HEALTH = 9;
const COL_LICENSE = 13;
const COL_DL = 12;
const SCAN_INNER = 2 + COL_NAME + 1 + COL_VER + 1 + COL_HEALTH + 1 + COL_LICENSE + 1 + COL_DL + 1;

function scanPad(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width - 1) + "…";
  return text + " ".repeat(width - text.length);
}

function buildRow(name: string, ver: string, health: string, license: string, downloads: string): string {
  return (
    "  " +
    scanPad(name, COL_NAME) +
    " " +
    scanPad(ver, COL_VER) +
    " " +
    scanPad(health, COL_HEALTH) +
    " " +
    scanPad(license, COL_LICENSE) +
    " " +
    scanPad(downloads, COL_DL) +
    " "
  );
}

export interface ScanEntry {
  pkg: ScannedPackage;
  result: AnalysisResult;
}

export function renderScanResults(scan: ProjectScan, entries: ScanEntry[]): void {
  const out: string[] = [];
  const sep = "─".repeat(SCAN_INNER);

  out.push(chalk.cyan("┌" + "─".repeat(SCAN_INNER) + "┐"));
  const header = `  Scan: ${scan.projectFile} (${scan.ecosystem}) — ${entries.length} packages`;
  out.push(chalk.cyan(`│${scanPad(header, SCAN_INNER)}│`));
  out.push(chalk.cyan("├" + sep + "┤"));

  const colHeader = buildRow("Package", "Version", "Health", "License", "Downloads");
  out.push(chalk.cyan(`│${chalk.bold(colHeader)}│`));
  out.push(chalk.cyan("├" + sep + "┤"));

  let licenseRisks = 0;
  let errors = 0;

  for (const { pkg, result } of entries) {
    if ("error" in result) {
      errors++;
      const errRow = buildRow(`✗ ${pkg.name}`, pkg.version, "—", "—", "—");
      out.push(chalk.cyan("│") + chalk.red(errRow) + chalk.cyan("│"));
      continue;
    }

    const hasRisk = result.license_risk;
    if (hasRisk) licenseRisks++;

    const nameLabel = (hasRisk ? "! " : "  ") + result.package;
    const healthLabel = `${result.health_score}/100`;
    const dlLabel = formatDownloads(result.weekly_downloads);
    const row = buildRow(nameLabel, result.version, healthLabel, result.license_type, dlLabel);

    if (hasRisk) {
      out.push(chalk.cyan("│") + chalk.yellow(row) + chalk.cyan("│"));
    } else {
      out.push(chalk.cyan("│") + row + chalk.cyan("│"));
    }
  }

  out.push(chalk.cyan("├" + sep + "┤"));

  const summaryParts: string[] = [`${entries.length - errors} analyzed`];
  if (errors > 0) summaryParts.push(chalk.red(`${errors} error(s)`));
  if (licenseRisks > 0) summaryParts.push(chalk.yellow(`${licenseRisks} license risk(s)`));
  const summaryLine = `  ${summaryParts.join("  ·  ")}`;
  out.push(chalk.cyan(`│${scanPad(summaryLine, SCAN_INNER)}│`));
  out.push(chalk.cyan("└" + "─".repeat(SCAN_INNER) + "┘"));

  console.log(out.join("\n"));
}
