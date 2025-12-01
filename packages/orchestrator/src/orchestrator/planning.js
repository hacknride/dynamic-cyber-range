/**
 * @file planning.js
 * @description Contains functions to validate incoming provisioning requests and build a provisioning plans.
 * @author Matthew De Binion (hacknride)
 */

import { getSaltModulesAndServices } from "./salt.js"; // exports the registry { [scenario]: { services: [...] } }
import { generateUniqueHostname } from "../utils/hostnames.js";

/**
 * Difficulty-based weighting for service selection.
 * Higher weight = more likely to be selected.
 * 'random' has equal weights for all difficulties (no bias).
 */
const DIFFICULTY_WEIGHTS = {
  random: { easy: 1, medium: 1, hard: 1 },
  easy:   { easy: 7, medium: 2.5, hard: 0.5 },
  medium: { easy: 2, medium: 6, hard: 2 },
  hard:   { easy: 0.5, medium: 3, hard: 6.5 }
};

/**
 * Validates an incoming JSON object's payload to ensure it meets the required structure before provisioning.
 * @param {object} body
 * @returns {{ok:true}|{ok:false,errors:string[]}}
 */
export function validatePayload(body) {
  const errors = [];
  const options = body?.options ?? {};
  const scenarios = body?.scenarios;

  const allowed = ["random", "easy", "medium", "hard"];
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

  // Determine available OSes from registry
  const availableOSes = getAvailableOSes(registry);
  
  // Validate and normalize composition, assign OS to each machine in the payload.
  const composition = buildComposition(options);
  const osList = assignOSList(amt, composition, availableOSes);

  // Separate scenarios into initial-access and privilege-escalation categories
  const initialAccessScenarios = scenarios.filter(s => 
    s.name === 'initial-access' || s.name.startsWith('initial-access/')
  );
  const privEscScenarios = scenarios.filter(s => 
    s.name === 'privilege-escalation' || s.name.startsWith('privilege-escalation/')
  );

  // Track used services per category to ensure uniqueness until exhausted
  const usedInitialAccess = new Set();
  const usedPrivEsc = new Set();

  // Plan-local hostname set to guarantee uniqueness within this provisioning run
  const planHostnames = new Set();

  const plan = [];
  for (let m = 0; m < amt; m++) {
    const os = osList[m];
    const hostname = generateUniqueHostname(planHostnames);
    
    let saltStates = [];
    let combinedVars = {};
    let givens = null;
    let scenarioName = "combined";
    let serviceName = "multi-stage";

    // Pick initial access
    const initialAccess = pickServiceWithUniqueness({
      registry,
      requestedScenarios: initialAccessScenarios.length > 0 ? initialAccessScenarios : null,
      category: 'initial-access',
      usedSet: usedInitialAccess,
      os,
      difficulty
    });
    
    if (initialAccess) {
      saltStates.push(initialAccess.saltState);
      const initialServiceName = initialAccess.saltState.split("/").pop();
      combinedVars[initialServiceName] = initialAccess.vars;
      givens = initialAccess.givens; // Initial access provides credentials
      scenarioName = initialAccess.scenario;
      serviceName = initialServiceName;
    }

    // Pick privilege escalation
    const privEsc = pickServiceWithUniqueness({
      registry,
      requestedScenarios: privEscScenarios.length > 0 ? privEscScenarios : null,
      category: 'privilege-escalation',
      usedSet: usedPrivEsc,
      os,
      difficulty
    });
    
    if (privEsc) {
      saltStates.push(privEsc.saltState);
      const privEscServiceName = privEsc.saltState.split("/").pop();
      combinedVars[privEscServiceName] = privEsc.vars;
      
      if (initialAccess) {
        scenarioName = "combined";
        serviceName = `${serviceName}-${privEscServiceName}`;
      } else {
        scenarioName = privEsc.scenario;
        serviceName = privEscServiceName;
      }
    }

    plan.push({
      hostname,
      scenario: scenarioName,
      service: serviceName,
      saltStates,
      vars: combinedVars,
      givens,
      os,
      ip: "<awaiting-terraform>"
    });
  }

  return plan;
}

/**
 * Performs weighted random selection from a pool of items.
 * Each item should have a 'weight' property (defaults to 1 if missing).
 * Higher weight = more likely to be selected.
 * @param {Array} items Array of items with optional 'weight' property
 * @returns {Object} The randomly selected item
 */
function weightedRandomPick(items) {
  if (!items || items.length === 0) return null;
  if (items.length === 1) return items[0];
  
  const totalWeight = items.reduce((sum, item) => sum + (item.weight || 1), 0);
  let random = Math.random() * totalWeight;
  
  for (const item of items) {
    random -= (item.weight || 1);
    if (random <= 0) return item;
  }
  
  // Fallback (shouldn't reach here, but safety net)
  return items[items.length - 1];
}

/**
 * Picks a service with uniqueness tracking until options are exhausted, then allows repeats.
 * @param {Object} param0 Contains registry, requestedScenarios, category, usedSet, os, difficulty
 * @returns {Object|null} The selected service or null if none available
 */
function pickServiceWithUniqueness({ registry, requestedScenarios, category, usedSet, os, difficulty }) {
  // Determine which scenarios to search
  let scenariosToSearch = [];
  
  // Extract selected subcategories (e.g., ['databases', 'websites'])
  const selectedCategories = requestedScenarios && requestedScenarios.length > 0
    ? requestedScenarios
        .filter(s => s.categories && s.categories.length > 0)
        .flatMap(s => s.categories)
    : [];
  
  if (selectedCategories.length > 0) {
    // User selected specific subcategories - filter to those paths
    scenariosToSearch = Object.keys(registry).filter(key => {
      if (!key.startsWith(category + '/')) return false;
      const subcategory = key.split('/')[1]; // e.g., 'databases' from 'initial-access/databases'
      return selectedCategories.includes(subcategory);
    });

  } else {
    // No categories selected - use all available in this category
    scenariosToSearch = Object.keys(registry).filter(key => 
      key === category || key.startsWith(category + '/')
    );
  }
  
  if (scenariosToSearch.length === 0) {
    console.warn(`[WARN] No scenarios available for category: ${category}`);
    return null; // No scenarios available in this category
  }
  
  // Collect all services from the specified scenarios
  let allCandidates = [];
  for (const scenarioName of scenariosToSearch) {
    const scenario = registry[scenarioName];
    if (scenario && scenario.services) {
      scenario.services.forEach(service => {
        allCandidates.push({
          ...service,
          scenario: scenarioName
        });
      });
    }
  }
  
  if (allCandidates.length === 0) {
    return null;
  }
  
  // Filter by OS only
  let pool = allCandidates.filter(s => !s.os || s.os === os);
  
  if (pool.length === 0) {
    // Fallback: use all candidates if OS filter eliminates everything
    pool = allCandidates;
  }
  
  // Apply difficulty-based weights
  const weights = DIFFICULTY_WEIGHTS[difficulty] || DIFFICULTY_WEIGHTS.random;
  pool = pool.map(s => ({
    ...s,
    weight: weights[s.difficulty] || 1
  }));
  
  // Prefer unused services first
  const unused = pool.filter(s => !usedSet.has(s.saltState));
  const pickFrom = unused.length > 0 ? unused : pool;
  
  // Weighted random selection
  const chosen = weightedRandomPick(pickFrom);
  
  // Mark as used
  usedSet.add(chosen.saltState);
  
  return chosen;
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
 * @param {Array<string>} availableOSes List of OSes that have available states (e.g., ["linux", "windows"]).
 * @returns An array of OS types assigned to each machine.
 */
function assignOSList(amt, { windows, linux, random }, availableOSes = ["linux", "windows"]) {
  const out = [];
  
  // Validate requested OSes are available
  if (linux > 0 && !availableOSes.includes("linux")) {
    throw new Error("Linux machines requested but no Linux states are available");
  }
  if (windows > 0 && !availableOSes.includes("windows")) {
    throw new Error("Windows machines requested but no Windows states are available");
  }
  
  for (let i = 0; i < linux; i++) out.push("linux");
  for (let i = 0; i < windows; i++) out.push("windows");
  
  // For random, only pick from available OSes
  for (let i = 0; i < random; i++) {
    if (availableOSes.length === 0) {
      throw new Error("No operating systems have available states");
    }
    const randomOS = availableOSes[Math.floor(Math.random() * availableOSes.length)];
    out.push(randomOS);
  }

  // Fisher–Yates shuffle
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, amt);
}

/**
 * Determines which operating systems have available Salt states in the registry.
 * @param {Object} registry The normalized registry object.
 * @returns {Array<string>} Array of available OS types (e.g., ["linux"], ["windows"], or ["linux", "windows"]).
 */
function getAvailableOSes(registry) {
  const osSet = new Set();
  
  for (const scenario of Object.values(registry || {})) {
    const services = scenario.services || [];
    for (const service of services) {
      if (service.os) {
        osSet.add(service.os);
      }
    }
  }
  
  // If no OS is explicitly set on any service, assume all are available
  if (osSet.size === 0) {
    return ["linux", "windows"];
  }
  
  return Array.from(osSet);
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
      const givens = (meta?.givens && typeof meta.givens === "object") ? meta.givens : null;
      const weights = { easy: 1, medium: 1, hard: 1 };
      if (difficulty && ["easy","medium","hard"].includes(difficulty)) weights[difficulty] = 3;

      services.push({
        name,
        saltState: `${scenario}/${name}`,
        os,
        difficulty,
        vars,
        givens,
        weights
      });
    }
    out[scenario] = { services };
  }
  return out;
}