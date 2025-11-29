/**
 * [Dynamic Cyber Range ascii art here?]
 * @author Matthew De Binion (hacknride)
 * @version 1.0.0
 * @description An Express server that allows orchestration of VM ranges with SaltStack configuration.
 */

import express from "express";
import { startOrchestration, getStatus, cancel, destroyRange, recoverIfNeeded } from "./orchestrator/orchestrator.js";
import { readdir } from "fs/promises";
import { join } from "path";
import { fileURLToPath } from "url";
import jsYaml from "js-yaml";
import { readFile } from "fs/promises";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = process.env.PORT || 8080;

const app = express();
app.use(express.json());

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
 * Lists all available scenarios grouped by attack focus category.
 */
app.get("/scenarios", async (req, res) => {
  try {
    const scenariosPath = join(__dirname, "../scenarios");
    const categories = await readdir(scenariosPath, { withFileTypes: true });
    
    const result = [];
    
    for (const category of categories) {
      if (!category.isDirectory()) continue;
      
      const categoryPath = join(scenariosPath, category.name);
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
            os: metadata.os || "unknown",
            difficulty: metadata.difficulty || "medium",
            vars: metadata.vars || {},
            givens: metadata.givens || null
          });
        } catch (err) {
          // If service.yaml doesn't exist or can't be parsed, skip or use defaults
          scenarios.push({
            name: service.name,
            os: "unknown",
            difficulty: "medium",
            vars: {},
            givens: null
          });
        }
      }
      
      result.push({
        category: category.name,
        displayName: category.name.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
        scenarios
      });
    }
    
    res.json(result);
  } catch (err) {
    console.error("Error reading scenarios:", err);
    res.status(500).json({ error: "Failed to read scenarios" });
  }
});

app.listen(PORT, () => {
  console.log(`Listening on :${PORT}`);
  // Attempt to resume a previous run if any
  recoverIfNeeded();
});
