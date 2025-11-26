import express from "express";
import { z } from "zod";
import { createRangeFromConfig } from "../services/rangeService.js";

const asInt = z.union([z.number(), z.string()]).transform((v) => Number(v));
const asBool = z.union([z.boolean(), z.string()]).transform((v) =>
  typeof v === "string" ? v === "true" : !!v
);

const incomingSchema = z.object({
  difficulty: z.enum(["easy", "medium", "hard"]),
  machinesPresent: asInt.pipe(z.number().int().min(1).max(10)),
  category: z.string().min(1),
  windowsCount: asInt.pipe(z.number().int().min(0)),
  linuxCount: asInt.pipe(z.number().int().min(0)),
  randomCount: asInt.pipe(z.number().int().min(0)),
  segmentation: asBool.default(false),
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
    createdByUserId: userId,
    createdAt: new Date().toISOString(),
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
    const result = await createRangeFromConfig(config);

    return res.status(201).json({
      id: config.id,
      status: result.status,
      machines: result.machines,
      config,
    });
  } catch (e) {
    console.error("Error creating range:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  const { id } = req.params;
  return res.json({
    id,
    status: "active",
    machines: [{ id: `${id}-lin-1`, name: "lin-1", ipAddress: "10.0.0.11" }],
  });
});

export default router;
