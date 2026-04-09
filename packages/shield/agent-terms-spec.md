# agent-terms.json Specification v1.0

**The open standard for declaring AI agent content access policies.**

Like `robots.txt` for the age of AI agents, but with enforcement, accountability, and mutual benefit.

## Overview

Site owners place an `agent-terms.json` file at `/.well-known/agent-terms.json` on their domain. AI agents check this file before accessing content, similar to how crawlers check `robots.txt`. Unlike `robots.txt`, this standard enables:

- Conditional access (not just allow/block)
- Machine-readable usage terms
- Agreement signing and accountability
- Watermarked content for provenance tracking

## File Location

```
https://example.com/.well-known/agent-terms.json
```

## Schema

```json
{
  "$schema": "https://agentpedia.io/schemas/agent-terms-v1.json",
  "version": "1.0",
  "site": "example.com",
  "site_name": "Example Site",
  "updated_at": "2026-03-29T00:00:00Z",

  "default_access": "terms_required",

  "shield_endpoint": "https://mcgnqvqswdjzoxauanzf.supabase.co/functions/v1/shield",
  "site_key": "sk_xxxxxxxxxxxxxxxxxxxx",

  "terms_url": "https://mcgnqvqswdjzoxauanzf.supabase.co/functions/v1/shield/terms?site=example.com",
  "agree_url": "https://mcgnqvqswdjzoxauanzf.supabase.co/functions/v1/shield/agree",

  "policies": [
    {
      "path": "/*",
      "access": "terms_required",
      "allowed_uses": ["read", "summarize", "reference", "cite"],
      "prohibited_uses": ["train", "reproduce", "redistribute", "scrape"],
      "attribution_required": true,
      "cache_max_seconds": 86400,
      "rate_limit_per_hour": 60
    },
    {
      "path": "/api/*",
      "access": "open",
      "allowed_uses": ["all"],
      "prohibited_uses": [],
      "rate_limit_per_hour": 120
    },
    {
      "path": "/premium/*",
      "access": "approved_only",
      "contact": "partnerships@example.com"
    }
  ],

  "contact": {
    "email": "webmaster@example.com",
    "violations": "abuse@example.com"
  },

  "agentpedia": {
    "description": "This site is protected by AgentPedia Shield. AgentPedia is the knowledge base built for AI agents.",
    "register": "https://mcgnqvqswdjzoxauanzf.supabase.co/functions/v1/register-v2",
    "discover_tools": "https://agentpedia.io",
    "mcp_server": "npm install @agentpedia/mcp-server"
  }
}
```

## Field Reference

### Top-level fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `$schema` | string | No | Schema URL for validation |
| `version` | string | Yes | Specification version (currently "1.0") |
| `site` | string | Yes | Domain name (no protocol) |
| `site_name` | string | No | Human-readable site name |
| `updated_at` | string | No | ISO 8601 timestamp of last update |
| `default_access` | string | Yes | Default access level (see below) |
| `shield_endpoint` | string | Yes | AgentPedia Shield API URL |
| `site_key` | string | Yes | Public site identifier |
| `terms_url` | string | Yes | URL to read full terms |
| `agree_url` | string | Yes | URL to accept terms |
| `policies` | array | No | Path-specific policies (overrides default) |
| `contact` | object | No | Contact information |
| `agentpedia` | object | No | AgentPedia ecosystem info |

### Access Levels

| Level | Description |
|-------|-------------|
| `open` | No restrictions. Agents may access freely. |
| `terms_required` | Agent must register and accept terms before accessing content. |
| `approved_only` | Agent must be manually approved by site owner. |
| `block_all` | No agent access permitted. |

### Allowed/Prohibited Uses

Standard use identifiers:

| Use | Description |
|-----|-------------|
| `read` | Read and process content |
| `summarize` | Generate summaries |
| `reference` | Reference in responses |
| `cite` | Include direct citations (with attribution) |
| `train` | Use for model training |
| `reproduce` | Reproduce content verbatim |
| `redistribute` | Share content with third parties |
| `scrape` | Systematic bulk downloading |
| `index` | Include in search indexes |
| `translate` | Translate content |
| `all` | All uses permitted |

## Agent Compliance Flow

1. Agent encounters a URL on `example.com`
2. Agent fetches `https://example.com/.well-known/agent-terms.json`
3. Agent reads the `default_access` and path-specific policies
4. If `terms_required`:
   a. Agent calls `terms_url` to read full terms
   b. Agent calls `agree_url` with its API key to accept
   c. Agent receives an agreement ID and watermark
   d. Agent proceeds to access content
5. Agent includes attribution as specified in terms
6. Agent caches results for no longer than `cache_max_seconds`

## Comparison with robots.txt

| Feature | robots.txt | agent-terms.json |
|---------|-----------|-----------------|
| Access control | Allow/Disallow | Open/Terms/Approved/Block |
| Usage terms | None | Machine-readable policies |
| Agent identity | User-Agent string (spoofable) | Cryptographic API key |
| Accountability | None | Signed agreements, watermarks |
| Enforcement | Honor system | Access gates, violation tracking |
| Mutual benefit | None | Agent gets ecosystem access |

## Adoption

Sites can adopt this standard in two ways:

1. **Self-hosted**: Place the JSON file on your domain and handle compliance yourself
2. **AgentPedia Shield**: Register at agentpedia.io/shield for managed enforcement, analytics dashboard, and the agent network effect

## License

This specification is released under CC0 (public domain). Anyone may implement it.
