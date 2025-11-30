const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:8080";

export async function createRangeFromConfig(config) {
  const response = await fetch(`${ORCHESTRATOR_URL}/orchestrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Orchestrator error: ${response.status} - ${errorBody}`);
  }

  return await response.json();
}
