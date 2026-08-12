export type RobotsRule = { allow: boolean; path: string };

export function parseRobots(text: string, agent = "LemiriKnowledgeBot") {
  const groups: Array<{ agents: string[]; rules: RobotsRule[] }> = [];
  let group: { agents: string[]; rules: RobotsRule[] } | undefined;
  let sawRule = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") {
      if (!group || sawRule) {
        group = { agents: [], rules: [] };
        groups.push(group);
        sawRule = false;
      }
      group.agents.push(value.toLowerCase());
    } else if (group && (field === "allow" || field === "disallow")) {
      sawRule = true;
      if (value) group.rules.push({ allow: field === "allow", path: value });
    }
  }
  const name = agent.toLowerCase();
  const specific = groups.filter((item) => item.agents.some((candidate) => name.includes(candidate) && candidate !== "*"));
  return (specific.length ? specific : groups.filter((item) => item.agents.includes("*"))).flatMap((item) => item.rules);
}

export function isAllowedByRobots(url: URL, rules: RobotsRule[]) {
  const target = `${url.pathname}${url.search}`;
  const matches = rules.filter((rule) => target.startsWith(rule.path.replace(/\*.*$/, ""))).sort((left, right) => right.path.length - left.path.length);
  return matches[0]?.allow ?? true;
}
