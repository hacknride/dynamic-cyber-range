/**
 * @file planning.js
 * @description Contains functions to validate incoming provisioning requests and build a provisioning plans.
 * @author Matthew De Binion (hacknride)
 */

import { getSaltModulesAndServices } from "./salt.js"; // exports the registry { [scenario]: { services: [...] } }
import { generateUniqueHostname } from "../utils/hostnames.js";

/**
 * Validates an incoming JSON object's payload to ensure it meets the required structure before provisioning.
 * @param {object} body
 * @returns {{ok:true}|{ok:false,errors:string[]}}
 */
export function validatePayload(body) {
  const errors = [];
  const options = body?.options ?? {};
  const scenarios = body?.scenarios;

  const allowed = ["easy", "medium", "hard"];
  if (typeof options?.difficulty !== "string" || !allowed.includes(options.difficulty.toLowerCase())) {
    errors.push(`options.difficulty must be one of: ${allowed.join(", ")}`);
  }

  const amt = options?.["amt-machines"];
  if (!Number.isInteger(amt) || amt < 1 || amt > 5) {
    errors.push("options.amt-machines must be an integer between 1 and 5 (inclusive).");
  }

  if (!Array.isArray(scenarios) || scenarios.length < 1) {
    errors.push("scenarios must be a non-empty array.");
  } else {
    scenarios.forEach((s, i) => {
      if (!s || typeof s.name !== "string" || s.name.trim() === "") {
        errors.push(`scenarios[${i}].name is required and must be a non-empty string.`);
      }
      if (s.vars && typeof s.vars !== "object") {
        errors.push(`scenarios[${i}].vars must be an object if provided.`);
      }
    });
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true };
}

/**
 * Build a provisioning plan from the provided payload.
 * @param {{
 *   options: { difficulty: "easy"|"medium"|"hard", "amt-machines": number, composition?: { windows?: number, linux?: number, random?: number } },
 *   scenarios: Array<{ name: string, vars?: object }>
 * }} payload
 * @returns {Promise<Array<{
 *   hostname: string,
 *   scenario: string,
 *   service: string,
 *   saltState: string[],
 *   vars: object,
 *   os: "linux"|"windows",
 *   ip: string
 * }>>}
 */
export async function buildPlan(payload) {
  const { options, scenarios } = payload;
  const amt = options["amt-machines"];
  const difficulty = options.difficulty.toLowerCase();

  // Load the registry from Salt (scenario -> services[])
  const rawRegistry = getSaltModulesAndServices();
  const registry = isAlreadyNormalized(rawRegistry) ? rawRegistry : normalizeRegistry(rawRegistry);

  // Validate and normalize composition, assign OS to each machine in the payload.
  const composition = buildComposition(options);
  const osList = assignOSList(amt, composition);

  // Assign scenarios round-robin if fewer scenarios than machines amount.
  const assignedScenarios = Array.from({ length: amt }, (_, i) => scenarios[i % scenarios.length]);

  const usedMap = Object.create(null); //usedMap[scenario][difficulty] = Set of salt states services already chosen.

  // Plan-local hostname set to guarantee uniqueness within this provisioning run
  const planHostnames = new Set();

  const plan = [];
  for (let m = 0; m < amt; m++) {
    const os = osList[m];
    const { name: scenarioName, vars: userVars = {} } = assignedScenarios[m];

    // Pick a service from the registry that matches the scenario, difficulty, and OS.
    const picked = pickService({
      registry,
      usedMap,
      scenarioName,
      os,
      difficulty,
      userVars
    });

    const serviceName = picked.saltState.split("/").pop();
    // Generate a human-friendly unique hostname (adjective-noun) and ensure uniqueness within this plan
    const hostname = generateUniqueHostname(planHostnames);

    plan.push({
      hostname,
      scenario: scenarioName,
      service: serviceName,
      saltStates: [picked.saltState],
      vars: { [serviceName]: picked.vars },
      os,
      ip: "<awaiting-terraform>"
    });
  }

  return plan;
}

/**
 * Picks a random service from the Salt Fileserver.
 * @param {Object} param0 An object containing registry, scenarioName, os, difficulty, and applicable vars.
 * @returns {Object} The selected service.
 */
function pickService({ registry, usedMap, scenarioName, os, difficulty, userVars = {} }) {
  const scenario = registry?.[scenarioName];
  if (!scenario) throw new Error(`Unknown scenario: ${scenarioName}`);

  const allServices = scenario.services || [];

  // Strict pool: same difficulty, OS matches (or service has no OS set)
  let pool = allServices.filter(s =>
    (s.difficulty?.toLowerCase?.() === difficulty) &&
    (!s.os || s.os === os)
  );

  // Relax OS (still same difficulty) if empty
  if (pool.length === 0) {
    pool = allServices.filter(s => s.difficulty?.toLowerCase?.() === difficulty);
  }

  // If still empty, fall back to any difficulty but keep OS match preference
  if (pool.length === 0) {
    pool = allServices.filter(s => !s.os || s.os === os);
    if (pool.length === 0) pool = allServices.slice(); // truly nothing matched OS; allow anything
  }

  // Track used saltStates per scenario+difficulty
  if (!usedMap[scenarioName]) usedMap[scenarioName] = Object.create(null);
  if (!usedMap[scenarioName][difficulty]) usedMap[scenarioName][difficulty] = new Set();
  const used = usedMap[scenarioName][difficulty];

  // Prefer never-used items first
  const fresh = pool.filter(s => !used.has(s.saltState));
  const pickFrom = fresh.length > 0 ? fresh : pool; // if exhausted, repeats allowed

  // Pure random among candidates
  const chosen = pickFrom[Math.floor(Math.random() * pickFrom.length)];

  // Mark used (only for the main difficulty bucket)
  used.add(chosen.saltState);

  // Merge vars with user overrides
  const mergedVars = { ...(chosen.vars ?? {}), ...(userVars ?? {}) };

  return { ...chosen, vars: mergedVars };
}

/**
 * When given options.composition in the request payload, builds the composition object and ensures
 * it is valid by summing up the counts to options.amt-machines.
 * @param {Object} options
 * @returns An object with windows, linux, and random counts.
 */
function buildComposition(options) {
  const comp = options?.composition ?? {};
  const amt = options["amt-machines"];
  const win = Number.isInteger(comp.windows) ? comp.windows : 0;
  const lin = Number.isInteger(comp.linux) ? comp.linux : 0;
  const rnd = Number.isInteger(comp.random) ? comp.random : amt; // default: all random if not provided

  const sum = win + lin + rnd;
  if (sum !== amt) {
    // If the user specified composition, enforce exact sum
    if (options?.composition) {
      throw new Error(`composition counts must add up to amt-machines (${amt}).`);
    }
    // Otherwise normalize: keep provided win/lin, fill rest with random
    const fixed = win + lin;
    return { windows: win, linux: lin, random: Math.max(0, amt - fixed) };
  }
  return { windows: win, linux: lin, random: rnd };
}

/**
 * When given options.composition in the request payload, ensures to assign OS types accordingly.
 * @param {Integer} amt The value of options.amt-machines (number of machines to create).
 * @param {Object} param1 The composition object with windows, linux, and random counts.
 * @returns An array of OS types assigned to each machine.
 */
function assignOSList(amt, { windows, linux, random }) {
  const out = [];
  for (let i = 0; i < linux; i++) out.push("linux");
  for (let i = 0; i < windows; i++) out.push("windows");
  for (let i = 0; i < random; i++) out.push(Math.random() < 0.5 ? "linux" : "windows");

  // Fisher–Yates shuffle
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, amt);
}



/* ============
 * Normalizers
 * ============ */

/**
 * Detects whether registry is already in the normalized shape:
 * { scenario: { services: [ { name, saltState, ... } ] }, ... }
 */
function isAlreadyNormalized(reg) {
  if (!reg || typeof reg !== "object") return false;
  const firstScenario = Object.values(reg)[0];
  return firstScenario && Array.isArray(firstScenario.services);
}

/**
 * Converts { scenario: { serviceName: meta, ... }, ... }
 *   → { scenario: { services: [ { name, saltState, os, difficulty, vars, weights }, ... ] } }
 */
function normalizeRegistry(raw) {
  const out = {};
  for (const [scenario, servicesObj] of Object.entries(raw || {})) {
    const services = [];
    for (const [name, meta] of Object.entries(servicesObj || {})) {
      const os = typeof meta?.os === "string" ? meta.os.toLowerCase() : undefined;
      const difficulty = typeof meta?.difficulty === "string" ? meta.difficulty.toLowerCase() : undefined;
      const vars = (meta?.vars && typeof meta.vars === "object") ? meta.vars : {};
      const weights = { easy: 1, medium: 1, hard: 1 };
      if (difficulty && ["easy","medium","hard"].includes(difficulty)) weights[difficulty] = 3;

      services.push({
        name,
        saltState: `${scenario}/${name}`,
        os,
        difficulty,
        vars,
        weights
      });
    }
    out[scenario] = { services };
  }
  return out;
}