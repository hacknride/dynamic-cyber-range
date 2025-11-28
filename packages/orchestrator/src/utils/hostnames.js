import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "./src/data");
const USED_PATH = path.join(DATA_DIR, "usedHostnames.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadUsed() {
  try {
    if (!fs.existsSync(USED_PATH)) return new Set();
    const raw = fs.readFileSync(USED_PATH, "utf8");
    const arr = JSON.parse(raw || "[]");
    return new Set(arr);
  } catch (e) {
    return new Set();
  }
}

function saveUsed(set) {
  try {
    ensureDataDir();
    const tmp = USED_PATH + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(Array.from(set), null, 2), "utf8");
    fs.renameSync(tmp, USED_PATH);
  } catch (e) {
    // best-effort
  }
}

const ADJECTIVES = [
  "silver",
  "crimson",
  "silent",
  "lone",
  "rapid",
  "brisk",
  "shadow",
  "azure",
  "golden",
  "frost",
  "vivid",
  "rusty",
  "neon",
  "sable",
  "quiet",
  "bold"
];

const NOUNS = [
  "falcon",
  "tiger",
  "otter",
  "fox",
  "beacon",
  "raven",
  "harbor",
  "praxis",
  "engine",
  "anchor",
  "phoenix",
  "harpy",
  "walrus",
  "comet",
  "sage"
];

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate an adjective-noun hostname (kebab-case).
 * If an `existing` Set is provided, ensure uniqueness only within that Set (plan-local uniqueness).
 * If no Set is provided, fall back to persisted global uniqueness (legacy behavior).
 *
 * @param {Set<string>} [existing] Optional Set to ensure plan-local uniqueness. The set will be mutated.
 */
export function generateUniqueHostname(existing) {
  const makeName = () => `${randomChoice(ADJECTIVES)}-${randomChoice(NOUNS)}`.toLowerCase();

  if (existing instanceof Set) {
    for (let i = 0; i < 10000; i++) {
      const name = makeName();
      if (!existing.has(name)) {
        existing.add(name);
        return name;
      }
    }
    // fallback with suffix
    for (let suffix = 1; suffix < 10000; suffix++) {
      const name = `${makeName()}-${suffix}`;
      if (!existing.has(name)) {
        existing.add(name);
        return name;
      }
    }
    throw new Error("Unable to generate unique hostname for plan-local set");
  }

  // Legacy/persisted behavior if no set provided
  const used = loadUsed();
  // attempt many times; in practice space is large enough for our scale
  for (let i = 0; i < 10000; i++) {
    const name = makeName();
    if (!used.has(name)) {
      used.add(name);
      saveUsed(used);
      return name;
    }
  }
  // fallback: append timestamp
  const fallback = `host-${Date.now()}`;
  const used2 = loadUsed();
  used2.add(fallback);
  saveUsed(used2);
  return fallback;
}

export function resetUsedHostnames() {
  try {
    if (fs.existsSync(USED_PATH)) fs.unlinkSync(USED_PATH);
  } catch (e) {
    // ignore
  }
}
