/**
 * Custom template example - Handlebars-style formatting
 */

import { AgentLoop } from 'iteratio';
import { WorkflowPlugin } from '../src';

const mockLLM = async (messages: any[]) => {
  return {
    role: 'assistant',
    content: 'Processing...'
  };
};

// Create workflow plugin with custom template
const workflowPlugin = new WorkflowPlugin({
  mode: 'nudge',
  nudgeInterval: 3,
  autoGenerate: true,
  template: `
╔═══════════════════════════════════════╗
║   📋 TASK PROGRESS TRACKER           ║
╚═══════════════════════════════════════╝

Progress: {{progress.completed}}/{{progress.total}} ({{progress.percent}}%)

🎯 Current Focus:
   {{currentTodo.title}}

📝 All Tasks:
{{#each todos}}
   {{#if completed}}✅{{else}}⏳{{/if}} {{title}}
{{/each}}

Keep going! 💪
  `
});

const loop = AgentLoop.builder()
  .withLLM(mockLLM)
  .withPlugin(workflowPlugin)
  .build();

async function main() {
  await loop.run({
    messages: [
      {
        role: 'user',
        content: `
          Create a data analysis pipeline:
          1. Load CSV data
          2. Clean and validate data
          3. Perform statistical analysis
          4. Generate visualizations
          5. Export report
        `
      }
    ]
  });
}

main().catch(console.error);
