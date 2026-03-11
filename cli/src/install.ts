import { spawn } from "node:child_process";
import inquirer from "inquirer";
import type { Ecosystem } from "./types.js";

function runCommand(command: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

export async function promptAndInstall(packageName: string, ecosystem: Ecosystem): Promise<void> {
  const { install } = await inquirer.prompt<{ install: boolean }>([
    {
      type: "confirm",
      name: "install",
      message: `Install ${packageName}?`,
      default: false,
    },
  ]);

  if (!install) {
    console.log("Install skipped.");
    return;
  }

  const command = ecosystem === "pip" ? "pip" : "npm";
  const args = ecosystem === "pip" ? ["install", packageName] : ["install", packageName];

  const code = await runCommand(command, args);
  if (code !== 0) {
    throw new Error(`${command} install failed with exit code ${code}`);
  }
}
