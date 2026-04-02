# Support Subscription-based (API Key-less) Authentication for Agents

**Issue**: #59  
**Status**: Proposed  
**Spec**: `specs/000-project-handbook/subscription-auth.md`

## Summary

Allow agents (Claude, Gemini, Codex) to run without API keys when the user has a valid local login session. Authentication is performed inside Docker and persisted via Docker volumes.

## Quick Start (after implementation)

```bash
# One-time setup: authenticate inside Docker
bun src/index.ts --setup-auth claude

# Run benchmark without API key
bun src/index.ts --agent claude --exercise acronym --docker
```

## Spec

See `specs/000-project-handbook/subscription-auth.md` for full design and implementation details.
