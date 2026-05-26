# iteratio-plugin-workflow

Task tracking plugin for iteratio that keeps LLMs on track during long-running operations.

## Install

```
npm install iteratio-plugin-workflow
```

## What It Does

Injects TODO lists into the LLM's context at configurable intervals so the model does not lose track of multi-step tasks. Supports nudge, forced, and scheduled modes. Can auto-generate task lists from user requests or accept them manually.

## Usage

```typescript
import { AgentLoop } from 'iteratio';
import { WorkflowPlugin } from 'iteratio-plugin-workflow';

const loop = AgentLoop.builder()
  .withLLM(claude)
  .withPlugin(new WorkflowPlugin({
    mode: 'nudge',
    nudgeInterval: 3,
    autoGenerate: true
  }))
  .build();

await loop.run({ messages: [{ role: 'user', content: 'Build auth, CRUD, and rate limiting' }] });
```

## License

MIT
