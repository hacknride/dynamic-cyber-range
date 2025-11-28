import express from "express";
import { getCurrentJob } from "../services/jobService.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const currentJob = await getCurrentJob();
    return res.json(currentJob);
  } catch (error) {
    console.error("Error fetching current job:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});

export default router;
