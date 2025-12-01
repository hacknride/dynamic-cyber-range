import express from "express";
import { z } from "zod";

const asInt = z.union([z.number(), z.string()]).transform((v) => Number(v));
const asBool = z.union([z.boolean(), z.string()]).transform((v) =>
  typeof v === "string" ? v === "true" : !!v
);

const incomingSchema = z.object({
  difficulty: z.enum(["easy", "medium", "hard"]),
  machinesPresent: asInt.pipe(z.number().int().min(1).max(10)),
  category: z.union([z.string(), z.array(z.string())]).transform(val => 
    Array.isArray(val) ? val : [val]
  ),
  // New: support for selected categories within each stage
  initialAccess: z.array(z.string()).optional().default([]),
  privilegeEscalation: z.array(z.string()).optional().default([]),
  windowsCount: asInt.pipe(z.number().int().min(0)),
  linuxCount: asInt.pipe(z.number().int().min(0)),
  randomCount: asInt.pipe(z.number().int().min(0)),
  segmentation: asBool.default(false),
});

function buildRangeConfig(userId, data) {
  const rangeId = `range-${Date.now()}`;
  
  // Transform frontend payload to orchestrator format
  const scenarios = [
    {
      name: 'initial-access',
      vars: {},
      categories: data.initialAccess || []
    },
    {
      name: 'privilege-escalation',
      vars: {},
      categories: data.privilegeEscalation || []
    }
  ];
  
  return {
    options: {
      difficulty: data.difficulty,
      "amt-machines": data.machinesPresent,
      composition: {
        windows: data.windowsCount,
        linux: data.linuxCount,
        random: data.randomCount,
      },
    },
    scenarios,
    metadata: {
      id: rangeId,
      createdByUserId: userId,
      createdAt: new Date().toISOString(),
    },
  };
}

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const userId =
      (req.auth && req.auth.user && (req.auth.user.id || req.auth.user.email)) ||
      "demo-user";

    const parsed = incomingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid request", details: parsed.error.issues });
    }

    const config = buildRangeConfig(userId, parsed.data);
    
    // Call orchestrator directly
    const orchUrl = process.env.ORCHESTRATOR_URL || "http://localhost:8080";
    const headers = { "Content-Type": "application/json" };
    if (process.env.ORCHESTRATOR_SECRET) {
      headers['X-Orchestrator-Token'] = process.env.ORCHESTRATOR_SECRET;
    }
    
    const response = await fetch(`${orchUrl}/orchestrate`, {
      method: "POST",
      headers,
      body: JSON.stringify(config),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return res.status(response.status).json({ error: `Orchestrator error: ${errorBody}` });
    }

    const result = await response.json();
    return res.status(202).json(result);
  } catch (e) {
    console.error("Error creating range:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/", async (req, res) => {
  try {
    const orchUrl = process.env.ORCHESTRATOR_URL || "http://localhost:8080";
    const headers = { "Content-Type": "application/json" };
    if (process.env.ORCHESTRATOR_SECRET) {
      headers['X-Orchestrator-Token'] = process.env.ORCHESTRATOR_SECRET;
    }
    
    const response = await fetch(`${orchUrl}/range/destroy`, {
      method: "POST",
      headers,
      body: JSON.stringify({ force: false }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Orchestrator destroy error:", errorText);
      return res.status(response.status).json({ error: errorText || "Failed to destroy range" });
    }

    const result = await response.json();
    return res.json(result);
  } catch (e) {
    console.error("Error destroying range:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
