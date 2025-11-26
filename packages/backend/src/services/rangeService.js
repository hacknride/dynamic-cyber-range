export async function createRangeFromConfig(config) {
  const machines = [];
  let idx = 1;

  const add = (count, prefix) => {
    for (let i = 0; i < count; i++) {
      machines.push({
        id: `${config.id}-${prefix}-${idx}`,
        name: `${prefix}-${idx}`,
        ipAddress: `10.0.0.${10 + idx}`,
        osType: prefix === "win" ? "windows" : prefix === "lin" ? "linux" : "mixed",
        category: config.category,
      });
      idx++;
    }
  };

  add(config.composition.windows, "win");
  add(config.composition.linux, "lin");
  add(config.composition.random, "rnd");

  return { status: "provisioning", machines };
}
