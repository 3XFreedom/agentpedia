# @agentpedia/cli

Command-line tool for submitting and managing your AgentPedia listings. Integrates with npm's publish lifecycle so your listing stays up to date automatically.

## Install

```bash
npm install -g @agentpedia/cli
```

Or use as a dev dependency for the postpublish hook:

```bash
npm install --save-dev @agentpedia/cli
```

## Quick Start

### 1. Register for an API key

```bash
agentpedia register --name my-tool
```

Save the returned key:

```bash
export AGENTPEDIA_API_KEY=ap_xxxxxxxxxxxx
```

### 2. Initialize your config

```bash
agentpedia init
```

This creates a `.agentpedia.json` file pre-filled from your `package.json`. Edit it with your tool details.

### 3. Submit your listing

```bash
agentpedia submit
```

### 4. Auto-submit on every npm publish

Add to your `package.json`:

```json
{
  "scripts": {
    "postpublish": "agentpedia submit"
  }
}
```

Now every time you run `npm publish`, your AgentPedia listing updates automatically.

## Configuration

The CLI reads configuration from two sources (in order):

1. `.agentpedia.json` in your project root
2. An `agentpedia` field in your `package.json`

### .agentpedia.json example

```json
{
  "slug": "my-tool",
  "name": "My Tool",
  "type": "tool",
  "category": "developer_tools",
  "short_description": "A tool that helps agents process data",
  "website": "https://mytool.dev",
  "documentation_url": "https://docs.mytool.dev",
  "capabilities": ["data-processing", "transformation"]
}
```

### package.json example

```json
{
  "name": "my-tool",
  "agentpedia": {
    "slug": "my-tool",
    "name": "My Tool",
    "type": "tool",
    "category": "developer_tools",
    "short_description": "A tool that helps agents process data",
    "capabilities": ["data-processing"]
  }
}
```

## Commands

| Command | Description |
|---------|-------------|
| `agentpedia init` | Create `.agentpedia.json` config file |
| `agentpedia submit` | Submit or update your listing |
| `agentpedia register --name X` | Register for an API key |
| `agentpedia search --query X` | Search the knowledge base |
| `agentpedia help` | Show help |

## CI/CD Integration

### GitHub Actions

Add `AGENTPEDIA_API_KEY` to your repository secrets, then:

```yaml
- name: Publish to npm
  run: npm publish
  env:
    AGENTPEDIA_API_KEY: ${{ secrets.AGENTPEDIA_API_KEY }}
```

The `postpublish` script handles the rest.

### GitLab CI

```yaml
publish:
  script:
    - npm publish
  variables:
    AGENTPEDIA_API_KEY: $AGENTPEDIA_API_KEY
```

## Graceful Failures

The CLI is designed to never block your publish workflow. If AgentPedia is unreachable or the submission fails, it logs a warning and exits cleanly. Your npm publish always succeeds regardless.

## License

MIT
