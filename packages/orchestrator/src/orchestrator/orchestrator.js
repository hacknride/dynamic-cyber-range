/**
 * @file orchestrator.js
 * @description Orchestrates the end-to-end process of provisioning and configuring VM ranges.
 * @author Matthew De Binion (hacknride) 
 */
import path from "path";
import { fileURLToPath } from "url";
import { validatePayload, buildPlan } from "./planning.js";
import { terraformInitApplyOutput, terraformDestroy } from "./terraform.js";
import { nowISO } from "../utils/time.js";
import { removeMinions, acceptMinionsFromPlan, applyPlanToMinionAsync  } from "./salt.js";
import { loadCurrentJob, saveCurrentJob, clearCurrentJob } from "../utils/persistence.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * CurrentJob status codes:
 * queued - waiting to start
 * building - provisioning infrastructure
 * destroying - tearing down infrastructure
 * deployed - successfully completed
 * failed - encountered an error
 * canceled - canceled by user
 * destroyed - successfully destroyed
 */
let currentJob = loadCurrentJob();

/**
 * Starts the orchestration process based on the request payload from the user.
 * @param {JSON} body The request payload containing options and scenarios.
 * @returns 
 */
export function startOrchestration(body) {
  const v = validatePayload(body);
  if (!v.ok) return { ok: false, code: 400, error: "Validation failed", details: v.errors };

  // Is the range already running? (Already running/provisioning if not destroyed/failed/canceled)
  if (currentJob && ["queued", "building", "destroying", "deployed"].includes(currentJob.status)) {
    return { ok: false, code: 409, error: "A range is already running." };
  }

  currentJob = {
    status: "queued",
    progress: "Queued",
    createdAt: nowISO(),
    updatedAt: nowISO(),
    options: body.options,
    scenarios: body.scenarios,
    machines: [],
    error: null,
  };
  saveCurrentJob(currentJob);

  setImmediate(runProvision); // fire-and-forget
  return { ok: true, code: 202, status: "queued" };
}

/**
 * Destroy the current range, if any.
 * @param {Boolean} force Whether to force destroy if a build is in progress. 
 * @returns 
 */
export async function destroyRange({ force = false } = {}) {
  if (currentJob && (currentJob.status === "queued" || currentJob.status === "building")) {
    if (!force) {
      return { ok: false, code: 409, error: "A range is currently running (queued/building)." };
    }
    setJob({ status: "canceled", progress: "Canceled by destroy (force)" });
  }

  const planForVars = currentJob?.machines || [];
  try {
    if (currentJob) setJob({ status: "destroying", progress: "Unregistering minions..." });
    await removeMinions();

    if (currentJob) setJob({ progress: "Destroying infrastructure with Terraform..." });
    await terraformDestroy(planForVars);

    setJob({
      status: "destroyed",
      progress: "Range destroyed successfully.",
      machines: [],
      error: null
    });

    // Optional: clear persisted record after a successful destroy
    // clearCurrentJob(); currentJob = null;

    return { ok: true, status: "destroyed" };
  } catch (err) {
    setJob({
      status: "failed",
      progress: "Destroy failed!",
      error: { message: String(err.message || err), stack: String(err.stack || "") }
    });
    return { ok: false, code: 500, error: "Destroy failed", details: currentJob.error };
  }
}

/**
 * TODO: Cancels the current orchestration process.
 * @returns 
 */
export function cancel() {
  if (!currentJob) return { ok: false, code: 404, error: "No active or recent job" };
  if (["deployed", "failed", "destroyed"].includes(currentJob.status)) {
    return { ok: false, code: 409, error: `Job already ${currentJob.status}` };
  }

  setJob({ status: "canceled", progress: "Canceled by user" });
  return { ok: true, status: "canceled" };
}



/**
 * Runs the provisioning process.
 * @returns 
 */
async function runProvision() {
  try {
    if (!currentJob || currentJob.status !== "queued") return;

    console.log("[INFO] Starting orchestration process...");
    setJob({ status: "building", progress: "Planning machines..." });
    const plan = await buildPlan({ options: currentJob.options, scenarios: currentJob.scenarios });
    setJob({ machines: plan, progress: "Planning complete" });

    // Terraform apply
    console.log("[INFO] Starting Terraform provisioning...");
    setJob({ progress: "Provisioning infrastructure with Terraform..." });
    const planWithIps = await terraformInitApplyOutput(plan);

    setJob({ machines: planWithIps, progress: "Terraform provisioning complete" });
    console.log("[INFO] Terraform provisioning complete.");

    // Once machines are provisioned, wait for Salt minions to check in!
    console.log("[INFO] Waiting for machines to check in...");
    setJob({ progress: "Waiting for Salt minions to check in..." });
    await acceptMinionsFromPlan(planWithIps, { timeoutMs: 180000 });

    setJob({ progress: "All Salt minions accepted." });
    console.log("[INFO] All Salt minions accepted!");

    // // Salt configurations - apply to all minions in parallel
    console.log("[INFO] Applying Salt configuration...");
    setJob({ progress: "Configuring machines with Salt" });
    
    const saltPromises = planWithIps.map(async (m) => {
      try {
        await applyPlanToMinionAsync(m, { timeoutMs: 12 * 60 * 1000, pollIntervalMs: 2000 });
      } catch (e) {
        console.error(`[ERROR] Salt apply failed for ${m.hostname}: ${e.message}`);
        // Don't throw, just log - allow other minions to continue
      }
    });
    
    // Wait for all Salt applies to complete
    await Promise.all(saltPromises);

    setJob({ machines: planWithIps, progress: "Salt apply complete" });

    // Done! Range provisioned and unlock.
    console.log("[INFO] Orchestration process complete!");
    setJob({ status: "deployed", progress: "Range deployed successfully!" });
  } catch (err) {
    console.error("[ERROR] Orchestration process failed:", err);
    setJob({ status: "failed", progress: "Range deployment failed", error: { message: String(err.message || err), stack: String(err.stack || "") } });
  }
}

/**
 * Attempts to recover from a previous incomplete orchestration or destroy.
 * @returns 
 */
export function recoverIfNeeded() {
  if (!currentJob) return;

  // If we crashed mid-run, mark as recovering and resume the appropriate step.
  if (["queued", "building"].includes(currentJob.status)) {
    setJob({ progress: "Recovering previous run...", status: "queued" });
    setImmediate(runProvision);
  } else if (currentJob.status === "destroying") {
    setJob({ progress: "Recovering previous destroy..." });
    setImmediate(() => destroyRange({ force: true }));
  } else if (currentJob.status === "failed" && currentJob.error?.message) {
    // Check if failure was due to Terraform conflicts (VM already exists, config file conflicts, etc.)
    const errorMsg = currentJob.error.message.toLowerCase();
    const isTerraformConflict = 
      errorMsg.includes("config file already exists") ||
      errorMsg.includes("unable to create vm") ||
      errorMsg.includes("already exists") ||
      errorMsg.includes("resource already exists");
    
    if (isTerraformConflict) {
      console.log("[INFO] Detected Terraform conflict error, attempting recovery...");
      console.log("[WARN] Manual cleanup may be required - VMs may exist in Proxmox but not in Terraform state");
      console.log("[WARN] If recovery fails repeatedly, manually delete VMs from Proxmox and clear Terraform state");
      
      setJob({ progress: "Recovering from Terraform conflict...", status: "destroying" });
      
      // Async recovery: destroy partial resources, then retry provisioning
      setImmediate(async () => {
        try {
          console.log("[INFO] Cleaning up partial Terraform state...");
          
          // Try to destroy, but if it fails due to state issues, we'll need manual intervention
          try {
            await destroyRange({ force: true });
          } catch (destroyErr) {
            console.error("[ERROR] Terraform destroy failed:", destroyErr.message);
            console.log("[INFO] Attempting to clear Terraform state and retry...");
            
            // If destroy fails, the VMs are orphaned in Proxmox
            // User needs to manually delete them or we need to import them first
            throw new Error(
              "Terraform state is inconsistent. Please manually delete VMs 5011-5014 from Proxmox, " +
              "then run: cd /opt/dcr-app/packages/orchestrator/terraform && rm terraform.tfstate*"
            );
          }
          
          // Wait a moment for cleanup to complete
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Reset to queued and retry provisioning with same parameters
          console.log("[INFO] Retrying provisioning after cleanup...");
          setJob({ 
            status: "queued", 
            progress: "Retrying after recovery...",
            error: null 
          });
          
          setImmediate(runProvision);
        } catch (err) {
          console.error("[ERROR] Recovery failed:", err);
          setJob({ 
            status: "failed", 
            progress: "Recovery failed - manual cleanup required",
            error: { message: String(err.message || err), stack: String(err.stack || "") }
          });
        }
      });
    }
  }
}

/**
 * Gets the current orchestration status.
 * @returns {Object} The current orchestration status.
 */
export function getStatus() {
  return currentJob ? { ok: true, ...currentJob } : { ok: true, status: "idle" };
}

/**
 * Sets the current job state with a patch.
 * @param {*} patch 
 * @returns 
 */
function setJob(patch) {
  currentJob = { ...currentJob, ...patch, updatedAt: nowISO() };
  saveCurrentJob(currentJob);
  return currentJob;
}
