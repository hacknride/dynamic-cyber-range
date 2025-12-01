import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import rangesRouter from "./src/routes/ranges.js";
import currentJobRouter from "./src/routes/currentJob.js";

dotenv.config({ path: "../../.env" }); // Load from root .env

const app = express();
const PORT = process.env.BACKEND_PORT || 6247;
const CORS_ORIGIN = process.env.CORS_ORIGIN || process.env.DASHBOARD_URL || "http://localhost:5173";

app.use(express.json());
app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true,
  })
);

// Simple root + favicon (avoid any auth middleware here)
app.get("/", (_req, res) => res.send("Welcome to the Dynamic Cyber Range API!"));
app.get("/favicon.ico", (_req, res) => res.status(204).end());

// ONLY mount your ranges API
app.use("/api/ranges", rangesRouter);

// Mount current job API
app.use("/api/current-job", currentJobRouter);

// Proxy scenarios endpoint to orchestrator
app.get("/api/scenarios", async (req, res) => {
  try {
    const orchUrl = process.env.ORCHESTRATOR_URL || "http://localhost:8080";
    const headers = {};
    if (process.env.ORCHESTRATOR_SECRET) {
      headers['X-Orchestrator-Token'] = process.env.ORCHESTRATOR_SECRET;
    }
    const response = await fetch(`${orchUrl}/scenarios`, { headers });
    if (!response.ok) throw new Error(`Orchestrator returned ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Error fetching scenarios:", err);
    res.status(500).json({ error: "Failed to fetch scenarios from orchestrator" });
  }
});

// Optional status endpoint
app.get("/api/status", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`[Backend] Running on http://localhost:${PORT}`);
  console.log(`[Backend] CORS enabled for: ${CORS_ORIGIN}`);
  console.log(`[Backend] Orchestrator URL: ${process.env.ORCHESTRATOR_URL || 'http://localhost:8080'}`);
});
