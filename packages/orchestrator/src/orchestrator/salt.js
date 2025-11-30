/**
 * @file salt.js
 * @description A salt bridge to apply states to provisioned VMs.
 * @author Matthew De Binion (hacknride) 
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

// Resolve saltenv from CLI/env (default: base)
const saltenv = getArg("saltenv", "base");

/**
 * Scans the Salt fileserver to build a registry of all available Salt modules (scenarios) and services.
 *
 * This function executes `salt-run` commands to determine the master’s active `file_roots` directory
 * and enumerates all `.sls` and `.yaml` files visible in that environment. It then looks for every
 * `service.yaml` file and parses its metadata, mapping each service to its parent scenario.
 *
 * The resulting object provides a structured overview of all provisionable services organized by
 * their scenario category. Each service entry corresponds to the metadata defined in its
 * `service.yaml`, which may include OS type, difficulty level, and variable definitions.
 *
 * ### Example `service.yaml`
 * ```yaml
 * os: linux
 * difficulty: easy
 * vars:
 *   version: "6.4"
 * ```
 *
 * ### Example return value
 * ```json
 * {
 *   "web-exploits": {
 *     "wordpress": {
 *       "os": "linux",
 *       "difficulty": "easy",
 *       "vars": { "version": "6.4" }
 *     }
 *   },
 *   "active-directory": {
 *     "kerberosting": {
 *       "os": "windows",
 *       "difficulty": "medium",
 *       "vars": {}
 *     }
 *   }
 * }
 * ```
 *
 * @function getSaltModulesAndServices
 * @returns {Object<string, Object<string, Object>>} 
 *   A nested registry object in the form `{ [scenarioName]: { [serviceName]: metadata } }`, where:
 *   - **scenarioName** — the top-level folder grouping (e.g., `"web-exploits"`)
 *   - **serviceName** — the specific service directory name (e.g., `"wordpress"`)
 *   - **metadata** — the parsed contents of that service’s `service.yaml`
 *
 * @throws {Error} If the Salt master cannot determine `file_roots` or list files.
 */
export function getSaltModulesAndServices() {
  let baseDir;
  let files = [];

  // Find base file_root for the env
  try {
    const out = sh(`salt-run config.get file_roots:${saltenv} --out=json`);
    const parsed = JSON.parse(out);             // usually an array of paths
    baseDir = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!baseDir) throw new Error("Empty base path from config.get!");
  } catch (e) {
    console.error(`[ERROR] Failed to determine base directory: ${e.message}`);
    return {};
  }

  // List all files the fileserver sees for this env
  try {
    const out = sh(`salt-run fileserver.file_list saltenv=${saltenv} --out=json`);
    const parsed = JSON.parse(out);
    files = Array.isArray(parsed) ? parsed : (parsed?.[saltenv] ?? []);
  } catch (e) {
    console.error(`[ERROR] Failed to list Salt files: ${e.message}`);
    return {};
  }

  // Only services that have a service.yaml
  const serviceYamlPaths = files.filter(f => f.endsWith("/service.yaml") || f === "service.yaml");

  const result = {};

  for (const relativePath of serviceYamlPaths) {
    const keys = deriveKeys(relativePath); // returning { scenario, service }
    if (!keys) continue;

    const fullPath = path.join(baseDir, relativePath);
    try {
      const raw = readFileSync(fullPath, "utf8");
      const data = yaml.load(raw);
      if (!data || typeof data !== "object") continue;

      if (!result[keys.scenario]) result[keys.scenario] = {};
      result[keys.scenario][keys.service] = data;
    } catch (e) {
      console.warn(`[WARNING] Failed to load or parse ${fullPath}: ${e.message}`);
    }
  }

  return result;
}

/**
 * Waits for and accepts all Salt minions defined in the provided plan.
 *
 * This function polls the Salt master's key list until all expected minions
 * appear as pending, then automatically accepts them.
 *
 * It’s typically called after Terraform has finished provisioning infrastructure
 * but before applying any Salt states.
 *
 * @async
 * @function acceptMinionsFromPlan
 * @param {Array<{hostname: string}>} machines - The list of machine objects from `buildPlan`.
 * @param {Object} [options]
 * @param {number} [options.timeoutMs=120000] - How long to wait before giving up (in milliseconds).
 * @param {number} [options.intervalMs=5000] - How often to poll for new minions (in milliseconds).
 * @returns {Promise<void>} Resolves when all minions have been accepted or throws on timeout/failure.
 */
export async function acceptMinionsFromPlan(machines, { timeoutMs = 120000, intervalMs = 5000 } = {}) {
  if (!Array.isArray(machines) || machines.length === 0) {
    throw new Error("acceptMinionsFromPlan: machines array is empty or invalid.");
  }

  const expectedHosts = machines.map(m => m.hostname);
  console.log(`[INFO] Awaiting minion keys for: ${expectedHosts.join(", ")}`);

  const start = Date.now();

  // Helper to run shell commands safely
  const sh = cmd => execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] }).toString("utf8").trim();

  const listKeys = () => {
    const out = sh("salt-key -L --out=json");
    return JSON.parse(out);
  };

  const acceptMinion = (hostname) => {
    try {
      sh(`salt-key -A -y ${hostname}`);
      console.log(`[ACCEPTED] Minion key accepted: ${hostname}`);
    } catch (err) {
      console.warn(`[WARN] Failed to accept ${hostname}: ${err.message}`);
    }
  };

  while (true) {
    const elapsed = Date.now() - start;
    if (elapsed > timeoutMs) {
      throw new Error(`Timeout waiting for minions to connect after ${timeoutMs / 1000}s`);
    }

    let keys;
    try {
      keys = listKeys();
    } catch (e) {
      console.warn(`[WARN] Could not list keys: ${e.message}`);
      await new Promise(r => setTimeout(r, intervalMs));
      continue;
    }

    const accepted = new Set(keys?.minions || []);
    const pending = new Set(keys?.minions_pre || []);

    // Figure out which hosts are already accepted and which are pending
    const toAccept = expectedHosts.filter(h => pending.has(h));
    const remaining = expectedHosts.filter(h => !accepted.has(h));

    // Accept pending ones
    for (const host of toAccept) {
      acceptMinion(host);
    }

    // All hosts accepted?
    const allAccepted = remaining.every(h => accepted.has(h));
    if (allAccepted) {
      console.log(`[INFO] All ${expectedHosts.length} minions are now accepted!`);
      return;
    }

    console.log(`[INFO] Still waiting on: ${remaining.filter(h => !accepted.has(h)).join(", ") || "(none)"}`);
    await new Promise(r => setTimeout(r, intervalMs));
  }
}

/**
 * Apply a machine's planned Salt states **asynchronously** and show real-time progress.
 *
 * Assumptions:
 *  - saltenv is always "base"
 *  - no dry-runs
 *
 * Steps:
 *  1) test.ping to ensure the minion is reachable
 *  2) saltutil.refresh_pillar (best practice when injecting pillar)
 *  3) start async state.apply and capture the JID
 *  4) poll jobs.lookup_jid <jid> for incremental results until complete (or timeout)
 *
 * @async
 * @function applyPlanToMinionAsync
 * @param {Object} machine A single plan entry: { hostname, saltStates: string[], vars: object, os, ip }
 * @param {Object} [options]
 * @param {string}  [options.minionId]        Override minion target (defaults to machine.hostname || machine.ip)
 * @param {number}  [options.timeoutMs=900000] Overall timeout for the whole operation (ms)
 * @param {number}  [options.pollIntervalMs=2000] Poll interval for job status (ms)
 * @param {boolean} [options.refreshPillar=true] Whether to run saltutil.refresh_pillar first
 * @returns {Promise<{
 *   minion: string,
 *   jid: string,
 *   ok: boolean,
 *   changed: number,
 *   failed: number,
 *   chunks: Array<{ id: string, result: boolean|null, changes: object, comment: string }>,
 *   raw: any
 * }>}
 */
export async function applyPlanToMinionAsync(
  machine,
  { minionId, timeoutMs = 15 * 60 * 1000, pollIntervalMs = 2000, refreshPillar = true } = {}
) {
  if (!machine || !Array.isArray(machine.saltStates) || machine.saltStates.length === 0) {
    throw new Error("applyPlanToMinionAsync: machine.saltStates is required and must be a non-empty array.");
  }

  const target = String(minionId || machine.hostname || machine.ip || "").trim();
  if (!target) throw new Error("applyPlanToMinionAsync: no minion target (hostname/ip) provided.");

  const saltenv = "base";
  // Merge vars and givens into pillar data so Salt states can access both
  const pillarData = { ...(machine.vars || {}), ...(machine.givens || {}) };
  const pillarJson = JSON.stringify(pillarData);
  const pillarArg = `pillar='${shellQuote(pillarJson)}'`;

  const sh = (cmd) =>
    execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] }).toString("utf8").trim();

  // 1) verify connectivity with retry logic
  {
    const maxRetries = 5;
    const retryDelay = 3000; // 3 seconds between retries
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[INFO] ${target}: Attempting to ping minion (attempt ${attempt}/${maxRetries})...`);
        const out = sh(`salt -t 30 --out=json '${shellQuote(target)}' test.ping`);
        const parsed = JSON.parse(out || "{}");
        if (parsed?.[target] === true) {
          console.log(`[INFO] ${target}: Minion responded successfully`);
          break; // Success, exit retry loop
        }
        throw new Error(`Minion ${target} did not return true for test.ping`);
      } catch (e) {
        lastError = e;
        console.warn(`[WARN] ${target}: Ping attempt ${attempt} failed: ${e.message}`);
        
        if (attempt < maxRetries) {
          console.log(`[INFO] ${target}: Waiting ${retryDelay}ms before retry...`);
          execSync(`sleep ${retryDelay / 1000}`, { stdio: "ignore" });
        } else {
          throw new Error(`Minion ${target} is not responding after ${maxRetries} attempts: ${lastError.message}`);
        }
      }
    }
  }

  // 2) refresh pillar (optional)
  if (refreshPillar) {
    try {
      sh(`salt -t 60 --out=json '${shellQuote(target)}' saltutil.refresh_pillar`);
    } catch (e) {
      console.warn(`[WARN] refresh_pillar failed for ${target}: ${e.message}`);
    }
  }

  // 3) kick off async job for ALL states in one apply (comma-separated)
  const statesCsv = machine.saltStates.map(s => s.replace(/'/g, "")).join(",");
  const asyncCmd =
    `salt --async '${shellQuote(target)}' ` +
    `state.apply '${shellQuote(statesCsv)}' saltenv='${saltenv}' ${pillarArg}`;

  const asyncOut = sh(asyncCmd);
  const jid = extractJid(asyncOut);
  if (!jid) throw new Error(`Failed to start async state.apply for ${target} (no JID found)`);

  console.log(`[INFO] ${target}: started state.apply (jid=${jid}) for [${machine.saltStates.join(", ")}]`);

  // 4) poll for progress until completion/timeout
  const start = Date.now();
  let lastRunCount = 0;
  let finalPayload = null;

  while (true) {
    const elapsed = Date.now() - start;
    if (elapsed > timeoutMs) {
      throw new Error(`Timeout waiting for job ${jid} on ${target} after ${Math.round(timeoutMs / 1000)}s`);
    }

    // lookup current job results
    let lookup;
    try {
      const out = sh(`salt-run jobs.lookup_jid ${jid} --out=json`);
      lookup = JSON.parse(out || "{}");
    } catch (e) {
      console.warn(`[WARN] ${target}: jobs.lookup_jid failed: ${e.message}`);
      await sleep(pollIntervalMs);
      continue;
    }

    const ret = lookup?.[target];
    if (ret && typeof ret === "object" && Object.keys(ret).length > 0) {
      // we have (partial or final) state return
      const { runCount, changed, failed } = summarizeStateReturn(ret);
      if (runCount > lastRunCount) {
        console.log(`[PROGRESS] ${target}: ${runCount} chunks reported so far (changed=${changed}, failed=${failed})`);
        lastRunCount = runCount;
      }

      // determine completion: if every chunk has a boolean result OR jobs.active no longer lists the jid
      const done = allChunksHaveResult(ret) || !isJobActive(sh, jid);
      if (done) {
        finalPayload = ret;
        break;
      }
    } else {
      // No return yet; see if job is still active
      if (!isJobActive(sh, jid)) {
        // job finished but we didn't get a payload; break and report whatever we have
        break;
      }
    }

    await sleep(pollIntervalMs);
  }

  // Final summary
  const ret = finalPayload || {};
  const { changed, failed, chunks } = finalizeSummary(ret);
  const ok = failed === 0;

  console.log(`[RESULT] ${target}: ok=${ok} changed=${changed} failed=${failed}`);
  return { minion: target, jid, ok, changed, failed, chunks, raw: ret };
}

/**
 * Remove Salt minion keys from the master without any prompts.
 *
 * By default, this deletes ALL keys across accepted, pending, denied, and rejected.
 * You can narrow deletion with a `filter` (string or RegExp) and/or select which
 * key lists to target.
 *
 * @function removeMinions
 * @param {Object} [options]
 * @param {RegExp|string|null} [options.filter=null]  - Only delete minions whose IDs match this filter.
 * @param {Array<"minions"|"minions_pre"|"minions_denied"|"minions_rejected">} [options.lists]
 *   Which salt-key lists to delete from. Defaults to all four.
 * @returns {Promise<string[]>} The list of minion IDs that were deleted.
 *
 * @example
 * // nuke everything (no prompts):
 * await removeMinions();
 *
 * // delete only IDs containing "web":
 * await removeMinions({ filter: "web" });
 *
 * // delete only pending (pre) keys:
 * await removeMinions({ lists: ["minions_pre"] });
 */
export async function removeMinions({
  filter = null,
  lists = ["minions", "minions_pre", "minions_denied", "minions_rejected"],
} = {}) {
  const sh = (cmd) =>
    execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] })
      .toString("utf8")
      .trim();

  let keys;
  try {
    const out = sh("salt-key -L --out=json");
    keys = JSON.parse(out);
  } catch (e) {
    console.error("[ERROR] Failed to list Salt keys:", e.message);
    return [];
  }

  const pool = new Set();
  for (const list of lists) {
    for (const id of keys[list] || []) pool.add(id);
  }

  const matches = (id) =>
    !filter ||
    (filter instanceof RegExp ? filter.test(id) : String(id).includes(filter));

  const targets = [...pool].filter(matches);
  if (targets.length === 0) {
    console.log("[INFO] No minions matched for deletion.");
    return [];
  }

  const deleted = [];
  for (const id of targets) {
    try {
      // -y = assume yes; fully non-interactive
      sh(`salt-key -y -d ${id}`);
      console.log(`[REMOVED] ${id}`);
      deleted.push(id);
    } catch (e) {
      console.warn(`[WARN] Failed to delete ${id}: ${e.message}`);
    }
  }

  console.log(`[INFO] Removed ${deleted.length} minion(s).`);
  return deleted;
}

/* =================
 * HELPER FUNCTIONS
 * ================= */

function sh(cmd) {
  return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] })
    .toString("utf8")
    .trim();
}

function getArg(name, def) {
  const fromEnv = process.env[name.toUpperCase()];
  if (fromEnv) return fromEnv;
  const pref = `--${name}=`;
  const arg = process.argv.find(a => a.startsWith(pref));
  return arg ? arg.slice(pref.length) : def;
}

/**
 * Derive {scenario, service} from e.g. "web-exploits/wordpress/service.yaml"
 */
function deriveKeys(p) {
  const parts = p.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const fileName = parts.at(-1);
  if (fileName !== "service.yaml") return null;

  const service = parts.at(-2);
  
  // Handle three-level hierarchy: stage/subcategory/service/service.yaml
  // For example: initial-access/databases/default-database/service.yaml
  if (parts.length >= 4) {
    const stage = parts.at(-4);        // e.g., "initial-access"
    const subcategory = parts.at(-3);  // e.g., "databases"
    const scenario = `${stage}/${subcategory}`;
    return { scenario, service };
  }
  
  // Fallback for two-level: scenario/service/service.yaml
  const scenario = parts.at(-3) || "uncategorized";
  return { scenario, service };
}

function shellQuote(s) {
  return String(s).replace(/'/g, `'\\''`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractJid(text) {
  // salt --async output example:
  // "Executed command with job ID: 20251118173412983809"
  const m = String(text || "").match(/job ID:\s*(\d{18,})/i);
  return m ? m[1] : null;
}

function isJobActive(sh, jid) {
  try {
    const out = sh("salt-run jobs.active --out=json");
    const active = JSON.parse(out || "{}");
    // active is an object keyed by jid; presence means still running
    return Boolean(active && typeof active === "object" && Object.prototype.hasOwnProperty.call(active, jid));
  } catch {
    return true; // on error, assume maybe active to avoid false negatives
  }
}

function summarizeStateReturn(retObj) {
  let runCount = 0;
  let changed = 0;
  let failed = 0;

  for (const [_id, chunk] of Object.entries(retObj)) {
    if (!chunk || typeof chunk !== "object") continue;
    runCount++;
    if (chunk.result === false) failed++;
    if (chunk.changes && Object.keys(chunk.changes).length > 0) changed++;
  }
  return { runCount, changed, failed };
}

function allChunksHaveResult(retObj) {
  for (const chunk of Object.values(retObj || {})) {
    if (!chunk || typeof chunk !== "object") continue;
    if (typeof chunk.result !== "boolean") return false;
  }
  return Object.keys(retObj || {}).length > 0;
}

function finalizeSummary(retObj) {
  const chunks = [];
  let changed = 0;
  let failed = 0;

  for (const [id, chunk] of Object.entries(retObj || {})) {
    if (!chunk || typeof chunk !== "object") continue;
    const hasChanges = chunk.changes && Object.keys(chunk.changes).length > 0;
    if (hasChanges) changed++;
    if (chunk.result === false) failed++;

    chunks.push({
      id,
      result: typeof chunk.result === "boolean" ? chunk.result : null,
      changes: chunk.changes || {},
      comment: chunk.comment || ""
    });
  }

  return { changed, failed, chunks };
}