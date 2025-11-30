// Turn UI form data into the orchestrator JSON spec you showed
export function buildOrchestratorSpec(form) {
    return {
      options: {
        difficulty: form.difficulty,                   // "easy" | "medium" | "hard"
        "amt-machines": Number(form.machinesPresent),  // 👈 hyphen key, numeric
        composition: {
          windows: Number(form.windowsCount || 0),
          linux:   Number(form.linuxCount   || 0),
          random:  Number(form.randomCount  || 0),
        },
      },
      scenarios: [
        {
          name: toScenarioName(form.category), // e.g. "web-exploits"
          vars: {},                            // extend later as needed
        },
      ],
    };
  }
  
  // Map your UI category to the scenario name expected by the orchestrator.
  // Adjust the mapping as your taxonomy evolves.
  function toScenarioName(category) {
    const map = {
      "web-app-exploits": "web-exploits",
      "active-directory": "active-directory",
      "linux-privesc":    "linux-privesc",
      "reverse-engineering": "reverse-engineering",
    };
    if (map[category]) return map[category];
    // fallback: simple slug (replace spaces/underscores with hyphens)
    return String(category).trim().toLowerCase().replace(/[\s_]+/g, "-");
  }
  