import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const BASE_URL = "https://mcgnqvqswdjzoxauanzf.supabase.co/functions/v1";

interface AgentPediaConfig {
  slug: string;
  name: string;
  type: "agent" | "api" | "tool";
  category: string;
  short_description: string;
  website?: string;
  documentation_url?: string;
  capabilities?: string[];
}

function loadConfig(): AgentPediaConfig | null {
  // Check for .agentpedia.json in project root
  const configPath = resolve(process.cwd(), ".agentpedia.json");
  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, "utf-8");
      return JSON.parse(raw) as AgentPediaConfig;
    } catch (e) {
      console.error("Error reading .agentpedia.json:", e);
      return null;
    }
  }

  // Fall back to package.json "agentpedia" field
  const pkgPath = resolve(process.cwd(), "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.agentpedia) {
        return pkg.agentpedia as AgentPediaConfig;
      }
    } catch (e) {
      // ignore
    }
  }

  return null;
}

async function submit(config: AgentPediaConfig): Promise<void> {
  const apiKey = process.env.AGENTPEDIA_API_KEY;
  if (!apiKey) {
    console.log(
      "AGENTPEDIA_API_KEY not set. Skipping AgentPedia submission."
    );
    console.log(
      "To get a key, run: agentpedia register --name your-tool-name"
    );
    return;
  }

  console.log(`Submitting ${config.name} to AgentPedia...`);

  try {
    const response = await fetch(`${BASE_URL}/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-agent-key": apiKey,
      },
      body: JSON.stringify(config),
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`Successfully submitted ${config.name} to AgentPedia!`);
      console.log(JSON.stringify(result, null, 2));
    } else {
      const error = await response.text();
      console.log(
        `AgentPedia submission returned ${response.status}: ${error}`
      );
      console.log("Your publish was not affected.");
    }
  } catch (e) {
    console.log(`Could not reach AgentPedia: ${e}`);
    console.log("Your publish was not affected.");
  }
}

async function register(name: string): Promise<void> {
  console.log(`Registering "${name}" with AgentPedia...`);

  try {
    const response = await fetch(`${BASE_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_name: name }),
    });

    if (response.ok) {
      const result = (await response.json()) as Record<string, unknown>;
      console.log("Registration successful!");
      console.log(`API Key: ${result.api_key}`);
      console.log("");
      console.log("Add this to your environment:");
      console.log(`  export AGENTPEDIA_API_KEY=${result.api_key}`);
      console.log("");
      console.log("Or add it to your CI/CD secrets for automatic submissions.");
    } else {
      const error = await response.text();
      console.error(`Registration failed (${response.status}): ${error}`);
    }
  } catch (e) {
    console.error(`Could not reach AgentPedia: ${e}`);
  }
}

async function init(): Promise<void> {
  const pkgPath = resolve(process.cwd(), "package.json");
  let defaults: Partial<AgentPediaConfig> = {};

  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      defaults = {
        name: pkg.name,
        slug: (pkg.name || "")
          .replace(/^@[^/]+\//, "")
          .replace(/[^a-z0-9-]/g, "-"),
        short_description: pkg.description,
        website: pkg.homepage,
      };
    } catch (e) {
      // ignore
    }
  }

  const config: AgentPediaConfig = {
    slug: defaults.slug || "your-tool-slug",
    name: defaults.name || "Your Tool Name",
    type: "tool",
    category: "developer_tools",
    short_description: defaults.short_description || "A brief description of your tool",
    website: defaults.website,
    capabilities: [],
  };

  const configPath = resolve(process.cwd(), ".agentpedia.json");
  const fs = await import("fs");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  console.log("Created .agentpedia.json");
  console.log("Edit this file with your tool details, then run:");
  console.log("  agentpedia submit");
  console.log("");
  console.log("To auto-submit on npm publish, add to your package.json:");
  console.log('  "scripts": { "postpublish": "agentpedia submit" }');
}

async function search(query: string): Promise<void> {
  try {
    const response = await fetch(
      `${BASE_URL}/api-v3/search?q=${encodeURIComponent(query)}`
    );
    if (response.ok) {
      const result = await response.json();
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.error(`Search failed: ${response.status}`);
    }
  } catch (e) {
    console.error(`Could not reach AgentPedia: ${e}`);
  }
}

function printHelp(): void {
  console.log(`
agentpedia - CLI for the AgentPedia knowledge base

COMMANDS:
  init                Create a .agentpedia.json config file in the current directory
  submit              Submit or update your listing (reads from .agentpedia.json or package.json)
  register --name X   Register for an API key
  search --query X    Search the AgentPedia knowledge base

ENVIRONMENT:
  AGENTPEDIA_API_KEY  Your API key (required for submit)

NPM HOOK:
  Add to package.json for automatic submission on publish:
    "scripts": { "postpublish": "agentpedia submit" }

EXAMPLES:
  agentpedia init
  agentpedia register --name my-cool-tool
  agentpedia submit
  agentpedia search --query "code generation"

LEARN MORE:
  https://github.com/3xfreedom/agentpedia
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "init":
      await init();
      break;

    case "submit": {
      const config = loadConfig();
      if (!config) {
        console.error(
          "No AgentPedia config found. Run 'agentpedia init' first,"
        );
        console.error(
          "or add an 'agentpedia' field to your package.json."
        );
        process.exit(1);
      }
      await submit(config);
      break;
    }

    case "register": {
      const nameIdx = args.indexOf("--name");
      const name = nameIdx >= 0 ? args[nameIdx + 1] : args[1];
      if (!name) {
        console.error("Usage: agentpedia register --name your-tool-name");
        process.exit(1);
      }
      await register(name);
      break;
    }

    case "search": {
      const queryIdx = args.indexOf("--query");
      const query = queryIdx >= 0 ? args[queryIdx + 1] : args[1];
      if (!query) {
        console.error("Usage: agentpedia search --query your-search-term");
        process.exit(1);
      }
      await search(query);
      break;
    }

    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;

    default:
      if (command) {
        console.error(`Unknown command: ${command}`);
      }
      printHelp();
      break;
  }
}

main().catch(console.error);
