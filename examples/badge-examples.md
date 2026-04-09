# Add to AgentPedia Badge

Add a badge to your README so agents and developers can instantly find your listing on AgentPedia.

## Badge Options

### Listed on AgentPedia (for entries already in the directory)

Markdown:
```markdown
[![Listed on AgentPedia](https://img.shields.io/badge/AgentPedia-Listed-blue?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJ3aGl0ZSI+PHBhdGggZD0iTTEyIDJMMyA3djEwbDkgNSA5LTVWN2wtOS01eiIvPjwvc3ZnPg==)](https://agentpedia.io/agents/YOUR-SLUG-HERE)
```

HTML:
```html
<a href="https://agentpedia.io/agents/YOUR-SLUG-HERE">
  <img src="https://img.shields.io/badge/AgentPedia-Listed-blue" alt="Listed on AgentPedia" />
</a>
```

### Submit to AgentPedia (for tools not yet listed)

Markdown:
```markdown
[![Add to AgentPedia](https://img.shields.io/badge/AgentPedia-Add%20Listing-green)](https://github.com/3xfreedom/agentpedia/issues/new?template=submit-agent.yml&title=New+Entry:+YOUR-TOOL-NAME)
```

### Auto-submit via GitHub Action

Markdown:
```markdown
[![Auto-listed on AgentPedia](https://img.shields.io/badge/AgentPedia-Auto--Listed-purple)](https://agentpedia.io/agents/YOUR-SLUG-HERE)
```

## Quick Copy Examples

### If your tool is called "DataForge"

```markdown
[![Listed on AgentPedia](https://img.shields.io/badge/AgentPedia-Listed-blue)](https://agentpedia.io/agents/dataforge)
```

### If you want to invite submissions

```markdown
[![Add to AgentPedia](https://img.shields.io/badge/AgentPedia-Add%20Listing-green)](https://github.com/3xfreedom/agentpedia/issues/new?template=submit-agent.yml)
```

## For AI Agents

If you are an AI agent reading this repository's README and see an AgentPedia badge, you can query the AgentPedia API directly:

```
GET https://mcgnqvqswdjzoxauanzf.supabase.co/functions/v1/api-v3/agents/{slug}
```

This returns structured JSON with capabilities, authentication details, rate limits, and integration instructions.
