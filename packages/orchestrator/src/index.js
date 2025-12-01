/**
 * [Dynamic Cyber Range ascii art here?]
 * @author Matthew De Binion (hacknride)
 * @version 1.0.0
 * @description An Express server that allows orchestration of VM ranges with SaltStack configuration.
 */

import express from "express";
import dotenv from "dotenv";
import { startOrchestration, getStatus, cancel, destroyRange, recoverIfNeeded } from "./orchestrator/orchestrator.js";
import { readdir } from "fs/promises";
import { join } from "path";
import { fileURLToPath } from "url";
import jsYaml from "js-yaml";
import { readFile } from "fs/promises";

dotenv.config({ path: "../../.env" }); // Load from root .env

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = process.env.ORCHESTRATOR_PORT || 8080;
const ORCHESTRATOR_SECRET = process.env.ORCHESTRATOR_SECRET;

const app = express();
app.use(express.json());

// Authentication middleware - validates shared secret token
const validateToken = (req, res, next) => {
  // Skip authentication if no secret is configured (development/localhost mode)
  if (!ORCHESTRATOR_SECRET) {
    return next();
  }
  
  const token = req.headers['x-orchestrator-token'];
  
  if (!token || token !== ORCHESTRATOR_SECRET) {
    console.warn(`[WARN] Unauthorized access attempt from ${req.ip}`);
    return res.status(403).json({ error: 'Forbidden: Invalid or missing authentication token' });
  }
  
  next();
};

// Apply authentication to all routes except health check
app.use((req, res, next) => {
  if (req.path === '/server-status') {
    return next(); // Allow health checks without auth
  }
  validateToken(req, res, next);
});

/**
 * Starts the orchestration process.
 */
app.post("/orchestrate", (req, res) => {
  const r = startOrchestration(req.body);
  if (!r.ok) {
    if (r.code === 409) res.set("Retry-After", "15");
    return res.status(r.code || 400).json(r);
  }
  return res.status(r.code).json({ status: r.status });
});

/**
 * Gets the server status.
 */
app.get("/server-status", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() });
});

/**
 * Gets the current orchestration status.
 */
app.get("/range/status", (req, res) => res.json(getStatus()));

/**
 * Destroys the current range, if any.
 */
app.post("/range/destroy", async (req, res) => {
  const r = await destroyRange({ force: Boolean(req.body?.force) });
  if (!r.ok) return res.status(r.code || 400).json(r);
  return res.json(r);
});

/**
 * Cancels the current orchestration process.
 */
app.post("/range/cancel", (req, res) => {
  const r = cancel();
  if (!r.ok) return res.status(r.code || 400).json(r);
  return res.json(r);
});

/**
 * Lists all available scenarios grouped by stage (initial-access, privilege-escalation).
 * Now supports nested folder structure like initial-access/databases/default-database
 */
app.get("/scenarios", async (req, res) => {
  try {
    const scenariosPath = join(__dirname, "../scenarios");
    const stages = await readdir(scenariosPath, { withFileTypes: true });
    
    const result = [];
    
    for (const stage of stages) {
      if (!stage.isDirectory()) continue;
      
      const stagePath = join(scenariosPath, stage.name);
      const categories = await readdir(stagePath, { withFileTypes: true });
      
      const subcategories = [];
      
      // Iterate through subcategories (databases, websites, binaries, etc.)
      for (const category of categories) {
        if (!category.isDirectory()) continue;
        
        const categoryPath = join(stagePath, category.name);
        const services = await readdir(categoryPath, { withFileTypes: true });
        
        const scenarios = [];
        
        for (const service of services) {
          if (!service.isDirectory()) continue;
          
          const servicePath = join(categoryPath, service.name);
          const serviceYamlPath = join(servicePath, "service.yaml");
          
          try {
            const yamlContent = await readFile(serviceYamlPath, "utf-8");
            const metadata = jsYaml.load(yamlContent);
            
            scenarios.push({
              name: service.name,
              fullPath: `${stage.name}/${category.name}/${service.name}`,
              os: metadata.os || "unknown",
              difficulty: metadata.difficulty || "medium",
              vars: metadata.vars || {},
              givens: metadata.givens || null
            });
          } catch (err) {
            // If service.yaml doesn't exist or can't be parsed, skip
            console.warn(`Failed to load service.yaml for ${stage.name}/${category.name}/${service.name}`);
          }
        }
        
        if (scenarios.length > 0) {
          subcategories.push({
            name: category.name,
            displayName: category.name.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
            scenarios
          });
        }
      }
      
      result.push({
        stage: stage.name,
        displayName: stage.name.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
        subcategories
      });
    }
    
    res.json(result);
  } catch (err) {
    console.error("Error reading scenarios:", err);
    res.status(500).json({ error: "Failed to read scenarios" });
  }
});

app.listen(PORT, () => {
  console.log(`[Orchestrator] Running on http://localhost:${PORT}`);
  console.log(`[Orchestrator] Authentication: ${ORCHESTRATOR_SECRET ? 'ENABLED' : 'DISABLED (no secret set)'}`);
  // Attempt to resume a previous run if any
  recoverIfNeeded();
});
