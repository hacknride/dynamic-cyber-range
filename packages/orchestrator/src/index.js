/**
 * [Dynamic Cyber Range ascii art here?]
 * @author Matthew De Binion (hacknride)
 * @version 1.0.0
 * @description An Express server that allows orchestration of VM ranges with SaltStack configuration.
 */

import express from "express";
import { startOrchestration, getStatus, cancel, destroyRange, recoverIfNeeded } from "./orchestrator/orchestrator.js";
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

app.listen(PORT, () => {
  console.log(`Listening on :${PORT}`);
  // Attempt to resume a previous run if any
  recoverIfNeeded();
});
