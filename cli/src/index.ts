#!/usr/bin/env node

import { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import { cwd } from "node:process";
import { fetchAnalysis, fetchAnalysisBatch } from "./api.js";
import { renderCard, renderScanResults } from "./display.js";
import { promptAndInstall } from "./install.js";
import { scanDirectory } from "./scan.js";
import type { Ecosystem } from "./types.js";

interface CliOptions {
  ecosystem?: Ecosystem;
  json?: boolean;
  install?: boolean;
  scan?: boolean;
}

interface PackageSpec {
  name: string;
  version?: string;
}

/** Parse "axios@1.13.2" or "@scope/pkg@1.0.0" → { name, version } */
function parseVersionSuffix(raw: string): PackageSpec {
  // scoped: @scope/name@version — split on the 2nd "@"
  if (raw.startsWith("@")) {
    const atIdx = raw.indexOf("@", 1);
    if (atIdx !== -1) {
      return { name: raw.slice(0, atIdx), version: raw.slice(atIdx + 1) || undefined };
    }
    return { name: raw };
  }
  // unscoped: name@version
  const atIdx = raw.indexOf("@");
  if (atIdx !== -1) {
    return { name: raw.slice(0, atIdx), version: raw.slice(atIdx + 1) || undefined };
  }
  return { name: raw };
}

function normalizePackageInput(input: string): PackageSpec {
  const value = input.trim();

  if (!/^https?:\/\//i.test(value)) {
    return parseVersionSuffix(value);
  }

  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);

    const npmPackageIndex = segments.indexOf("package");
    if (url.hostname.includes("npmjs.com") && npmPackageIndex !== -1) {
      const raw = decodeURIComponent(segments.slice(npmPackageIndex + 1).join("/"));
      return parseVersionSuffix(raw);
    }

    const pypiProjectIndex = segments.indexOf("project");
    if (url.hostname.includes("pypi.org") && pypiProjectIndex !== -1) {
      const raw = decodeURIComponent(segments[pypiProjectIndex + 1] ?? "");
      return parseVersionSuffix(raw);
    }

    return parseVersionSuffix(value);
  } catch {
    return parseVersionSuffix(value);
  }
}

const program = new Command();

program
  .name("snoop")
  .description("Explain npm/pip packages before installing them")
  .argument("[package]", "Package name to analyze")
  .option("-e, --ecosystem <ecosystem>", "npm or pip", "npm")
  .option("--json", "Print raw JSON output")
  .option("--no-install", "Analyze only, skip install prompt")
  .option("-s, --scan", "Scan the current directory for packages and analyze them")
  .action(async (packageInput: string | undefined, options: CliOptions) => {
    // ── Scan mode ──────────────────────────────────────────────────────────────
    if (options.scan) {
      const dir = cwd();
      const spinner = ora(`Scanning ${dir}...`).start();

      const projectScans = await scanDirectory(dir);

      if (projectScans.length === 0) {
        spinner.fail(
          "No supported project files found (package.json, requirements.txt, pyproject.toml, Pipfile).",
        );
        process.exitCode = 1;
        return;
      }

      for (const scan of projectScans) {
        const total = scan.packages.length;
        spinner.text = `Scanning ${scan.projectFile} — 0 / ${total}`;

        const results = await fetchAnalysisBatch(scan.packages, {
          onProgress: (done, _total, current) => {
            spinner.text = `Scanning ${scan.projectFile} — ${done} / ${_total}  (${current})`;
          },
        });

        spinner.stop();

        const entries = scan.packages.map((pkg, i) => ({ pkg, result: results[i] }));

        if (options.json) {
          console.log(JSON.stringify({ projectFile: scan.projectFile, ecosystem: scan.ecosystem, entries }, null, 2));
        } else {
          renderScanResults(scan, entries);
        }
      }
      return;
    }

    // ── Single-package mode ────────────────────────────────────────────────────
    if (!packageInput) {
      console.error(chalk.red("Specify a package name or use --scan / -s to scan the current directory."));
      program.help();
      process.exitCode = 1;
      return;
    }

    const ecosystem = (options.ecosystem ?? "npm") as Ecosystem;
    const { name: packageName, version: packageVersion } = normalizePackageInput(packageInput);

    if (ecosystem !== "npm" && ecosystem !== "pip") {
      console.error(chalk.red("Invalid ecosystem. Use 'npm' or 'pip'."));
      process.exitCode = 1;
      return;
    }

    const versionLabel = packageVersion ? `@${packageVersion}` : "";
    const spinner = ora(`Analyzing ${packageName}${versionLabel} (${ecosystem})...`).start();

    try {
      const analysis = await fetchAnalysis(packageName, ecosystem, undefined, packageVersion);
      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify(analysis, null, 2));
      } else {
        renderCard(analysis);
      }

      if (options.install !== false) {
        await promptAndInstall(packageName, ecosystem);
      }
    } catch (error) {
      spinner.fail("Analysis failed");
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(chalk.red(message));
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv);
