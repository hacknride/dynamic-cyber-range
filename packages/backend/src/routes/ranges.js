import { z } from "zod";
import express from "express";
import { createRangeFromConfig } from "../services/rangeService.js";
import { buildOrchestratorSpec } from "../services/specBuilder.js";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const router = express.Router();

const asInt  = z.union([z.number(), z.string()]).transform((v) => Number(v));
const asBool = z.union([z.boolean(), z.string()]).transform((v) =>
  typeof v === "string" ? v === "true" : !!v
);

const incomingSchema = z.object({
  difficulty: z.enum(["easy", "medium", "hard"]),
  machinesPresent: asInt.pipe(z.number().int().min(1).max(10)),
  category: z.string().min(1),
  windowsCount: asInt.pipe(z.number().int().min(0)),
  linuxCount:  asInt.pipe(z.number().int().min(0)),
  randomCount: asInt.pipe(z.number().int().min(0)),
  segmentation: asBool.optional().default(false),
});

function buildRangeConfig(userId, data) {
  const rangeId = `range-${Date.now()}`;
  return {
    id: rangeId,
    difficulty: data.difficulty,
    machinesPresent: data.machinesPresent,
    category: data.category,
    composition: {
      windows: data.windowsCount,
      linux: data.linuxCount,
      random: data.randomCount,
    },
    segmentation: data.segmentation,
    createdByUserId: userId ?? "demo-user",
    createdAt: new Date().toISOString(),
  };
}

router.post("/", async (req, res) => {
  try {
    const parsed = incomingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    }

    // Optional: enforce composition sum
    const { windowsCount, linuxCount, randomCount, machinesPresent } = parsed.data;
    if (windowsCount + linuxCount + randomCount !== machinesPresent) {
      return res.status(400).json({ error: "Composition must equal Machines Present" });
    }

    const userId = req.auth?.user?.id || req.auth?.user?.email || "demo-user";
    const config = buildRangeConfig(userId, parsed.data);

    // 👉 Build orchestrator spec in the format you want
    const spec = buildOrchestratorSpec(parsed.data);

    // (Optional) Write the JSON to disk per range (handy for Terraform/Salt pickup or debugging)
    // Adjust this folder to your needs, or remove if not needed.
    const outDir = path.join(process.cwd(), "out", "ranges", config.id);
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "range-spec.json"), JSON.stringify(spec, null, 2), "utf-8");

    // Hand off to your existing orchestrator service (still returns machines)
    const result = await createRangeFromConfig(config);

    return res.status(201).json({
      id: config.id,
      status: result.status,
      machines: result.machines,
      orchestrationId: result.orchestrationId, // if your service returns it
      spec,     // 👈 include compiled spec in response (helps UI & debugging)
      config,   // (optional) keep old config echo if useful
    });
  } catch (err) {
    console.error("Error creating range:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
