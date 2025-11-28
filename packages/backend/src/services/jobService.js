import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CURRENT_JOB_PATH = path.resolve(__dirname, "../../..", "orchestrator/src/data/currentJob.json");

export async function getCurrentJob() {
  try {
    const data = await fs.readFile(CURRENT_JOB_PATH, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading currentJob.json:", error);
    throw new Error("Unable to fetch current job status");
  }
}
