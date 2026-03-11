#!/usr/bin/env node

import { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import { fetchAnalysis } from "./api.js";
import { renderCard } from "./display.js";
import { promptAndInstall } from "./install.js";
import type { Ecosystem } from "./types.js";

interface CliOptions {
  ecosystem?: Ecosystem;
  json?: boolean;
  install?: boolean;
}

function normalizePackageInput(input: string): string {
  const value = input.trim();

  if (!/^https?:\/\//i.test(value)) {
    return value;
  }

  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);

    const npmPackageIndex = segments.indexOf("package");
    if (url.hostname.includes("npmjs.com") && npmPackageIndex !== -1) {
      const raw = segments.slice(npmPackageIndex + 1).join("/");
      return decodeURIComponent(raw);
    }

    const pypiProjectIndex = segments.indexOf("project");
    if (url.hostname.includes("pypi.org") && pypiProjectIndex !== -1) {
      const raw = segments[pypiProjectIndex + 1] ?? "";
      return decodeURIComponent(raw);
    }

    return value;
  } catch {
    return value;
  }
}

const program = new Command();

program
  .name("snoop")
  .description("Explain npm/pip packages before installing them")
  .argument("<package>", "Package name to analyze")
  .option("-e, --ecosystem <ecosystem>", "npm or pip", "npm")
  .option("--json", "Print raw JSON output")
  .option("--no-install", "Analyze only, skip install prompt")
  .action(async (packageInput: string, options: CliOptions) => {
    const ecosystem = (options.ecosystem ?? "npm") as Ecosystem;
    const packageName = normalizePackageInput(packageInput);

    if (ecosystem !== "npm" && ecosystem !== "pip") {
      console.error(chalk.red("Invalid ecosystem. Use 'npm' or 'pip'."));
      process.exitCode = 1;
      return;
    }

    const spinner = ora(`Analyzing ${packageName} (${ecosystem})...`).start();

    try {
      const analysis = await fetchAnalysis(packageName, ecosystem);
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
