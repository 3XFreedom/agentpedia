# AgentPedia Shield

**Content protection for the age of AI agents.**

Shield gives content creators control over how AI agents access their content. Instead of blindly blocking agents (losing traffic) or allowing unrestricted access (losing control), Shield provides a middle path: accountable access with machine-enforceable agreements.

## How It Works

1. **Content creator** registers their site with Shield (free)
2. **Content creator** adds a small snippet to their site or a `.well-known/agent-terms.json` file
3. **AI agent** encounters the protected site
4. **AI agent** reads the terms, registers with AgentPedia, and accepts them
5. **AI agent** gets a watermarked agreement and can now access the content
6. **Content creator** sees which agents access their content, what they agreed to, and can flag violations

Everyone wins: content creators get accountability and control, agents get access instead of blocks.

## Quick Start

### 1. Register your site

```bash
curl -X POST https://mcgnqvqswdjzoxauanzf.supabase.co/functions/v1/shield/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "you@example.com",
    "site_domain": "example.com",
    "site_name": "My Site"
  }'
```

You will receive a `site_key` and `site_secret`. Save these.

### 2. Add the snippet to your site

```html
<script src="https://cdn.agentpedia.io/shield.js"
        data-site-key="sk_your_key_here"
        data-mode="enforce">
</script>
```

### 3. Add agent-terms.json (optional but recommended)

Place at `https://yourdomain.com/.well-known/agent-terms.json`. See `agent-terms-example.json` for a template.

### 4. View your dashboard

Open `dashboard.html` or visit [agentpedia.io/shield/dashboard](https://agentpedia.io/shield/dashboard).

## API Reference

### Site Owner Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/shield/register` | Register a new site |
| PUT | `/shield/policy` | Create/update content policies |
| GET | `/shield/dashboard` | View analytics and agreements |

### Agent Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/shield/terms?site=...` | Read terms for a site |
| POST | `/shield/agree` | Accept terms (signs agreement) |
| GET | `/shield/check?site=...` | Check access status |
| GET | `/shield/my-agreements` | View all signed agreements |

### Public

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/shield/stats` | Network-wide statistics |

## Access Levels

- **open** - No restrictions, agents access freely
- **terms_required** - Agents must register and accept terms (recommended)
- **approved_only** - Manual approval required for each agent
- **block_all** - No agent access permitted

## The agent-terms.json Standard

Shield introduces the `agent-terms.json` specification, an open standard for declaring AI agent content policies. Think of it as `robots.txt` with teeth. See `agent-terms-spec.md` for the full specification.

## Snippet Modes

- **enforce** - Blocks agent access until terms are accepted (default)
- **monitor** - Logs agent access but does not block
- **strict** - Blocks all unregistered agents entirely

## Dashboard

The Shield dashboard provides real-time visibility into:

- Which agents are accessing your content
- What terms they agreed to
- Access logs with grant/deny status
- Violation reports and tracking
- Daily traffic analytics

## Files in this package

| File | Description |
|------|-------------|
| `README.md` | This file |
| `agent-terms-spec.md` | Full specification for the agent-terms.json standard |
| `agent-terms-example.json` | Example agent-terms.json to place in .well-known/ |
| `shield-snippet.js` | Embeddable JavaScript snippet for content creators |
| `dashboard.html` | React SPA dashboard for content creators |

## Part of the AgentPedia Ecosystem

Shield is built on top of AgentPedia's agent identity system. When agents register to comply with Shield terms, they automatically become part of the AgentPedia ecosystem, where they can discover other AI tools, APIs, and agents.

## License

MIT
