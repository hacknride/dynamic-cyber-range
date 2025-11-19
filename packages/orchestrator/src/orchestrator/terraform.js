/**
 * @file terraform.js
 * @description Handles Terraform operations for provisioning infrastructure.
 * @author Matthew De Binion (hacknride)
 */

import os from 'os';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const TF_DIR = '/opt/dcr-app/packages/orchestrator/terraform'; // Terraform working directory

/**
 * Initialize Terraform, apply the configuration, and return the output.
 * @param {*} plan 
 * @returns 
 */
export async function terraformInitApplyOutput(plan) {
  const tfvarsPath = writeTfVars(plan);
  const tfEnv = {
    ...process.env,
    PM_API_URL: process.env.PM_API_URL,
    PM_API_TOKEN_ID: process.env.PM_API_TOKEN_ID,
    PM_API_TOKEN_SECRET: process.env.PM_API_TOKEN_SECRET,
  };

  await run("terraform", [`-chdir=${TF_DIR}`, "init"], { env: tfEnv });
  await run("terraform", [`-chdir=${TF_DIR}`, "apply", "-auto-approve", "-var-file", tfvarsPath], { env: tfEnv });
  const { stdout } = await run("terraform", [`-chdir=${TF_DIR}`, "output", "-json"], { env: tfEnv });

  const outputs = JSON.parse(stdout);
  const ips = outputs?.ips?.value || {};
  return plan.map(m => ({ ...m, ip: ips[m.hostname] || "<ip-unavailable>" }));
}

/**
 * Destroys the Terraform-managed infrastructure.
 * @param {*} optionalPlan 
 */
export async function terraformDestroy(optionalPlan) {
  let tfvarsPath = null;
  if (Array.isArray(optionalPlan) && optionalPlan.length > 0) {
    tfvarsPath = writeTfVars(optionalPlan);
  }

  const tfEnv = {
    ...process.env,
    PM_API_URL: process.env.PM_API_URL,
    PM_API_TOKEN_ID: process.env.PM_API_TOKEN_ID,
    PM_API_TOKEN_SECRET: process.env.PM_API_TOKEN_SECRET,
  };

  // Ensure plugins present
  await run("terraform", [`-chdir=${TF_DIR}`, "init", "-upgrade"], { env: tfEnv });

  const args = [`-chdir=${TF_DIR}`, "destroy", "-auto-approve"];
  if (tfvarsPath) args.push("-var-file", tfvarsPath);

  await run("terraform", args, { env: tfEnv });
}



/**
 * Writes Terraform variable file for the given machines.
 * @param {*} machines Array of machine objects.
 * @returns {String} The path to the Terraform variable file.
 */
function writeTfVars(machines) {
  const vars = { machines: machines.map(m => ({ name: m.hostname })) };
  const filePath = path.join(os.tmpdir(), `tfvars-${Date.now()}.json`);
  fs.writeFileSync(filePath, JSON.stringify(vars, null, 2), "utf8");
  return filePath;
}

/**
 * Run a command with arguments and options.
 * @param {String} cmd The command to run.
 * @param {Array<String>} args Arguments for the command.
 * @param {Object} opts Optional spawn options.
 * @returns 
 */
function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { ...opts });
    let stdout = "", stderr = "";
    proc.stdout.on("data", d => stdout += d.toString());
    proc.stderr.on("data", d => stderr += d.toString());
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`${cmd} ${args.join(" ")} failed (rc=${code})\n${stderr || stdout}`));
      resolve({ stdout, stderr });
    });
  });
}