/**
 * @file persistence.js
 * @description Handles persistence of orchestration state to disk across restarts in the event
 * the express server goes down.
 * @author Matthew De Binion (hacknride)
 */
import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "./src/data");
const JOB_PATH = path.join(DATA_DIR, "currentJob.json");

/**
 * Pulls the current job state from disk, if any.
 * @returns {Object|null} The current job state or null if not found.
 */
export function loadCurrentJob() {
  try {
    if (!fs.existsSync(JOB_PATH)) return null;
    const raw = fs.readFileSync(JOB_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return null; // if file is corrupt, start clean
  }
}

/**
 * Saves the current state of the job to disk.
 * @param {*} job The current job state.
 */
export function saveCurrentJob(job) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    // atomic-ish write: write temp then rename
    const tmp = JOB_PATH + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(job, null, 2), "utf8");
    fs.renameSync(tmp, JOB_PATH);
  } catch {
    // best-effort; don't throw in orchestrator flow
  }
}

/**
 * Clears the current job state from disk.
 */
export function clearCurrentJob() {
  try {
    if (fs.existsSync(JOB_PATH)) fs.unlinkSync(JOB_PATH);
  } catch {
    // ignore
  }
}