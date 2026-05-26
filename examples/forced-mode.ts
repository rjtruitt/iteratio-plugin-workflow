/**
 * Forced mode example - Strict tracking with required checkoffs
 */

import { AgentLoop } from 'iteratio';
import { WorkflowPlugin } from '../src';

const mockLLM = async (messages: any[]) => {
  // Simulate LLM checking off tasks
  return {
    role: 'assistant',
    content: 'I have completed the user authentication. ✓ User authentication with JWT'
  };
};

// Create workflow plugin in forced mode
const workflowPlugin = new WorkflowPlugin({
  mode: 'forced',           // Always show TODOs
  requireCheckoff: true,    // LLM must explicitly check off
  autoGenerate: true
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
          Complete these critical deployment steps:
          1. Run all test suites
          2. Backup production database
          3. Deploy to staging and verify
          4. Deploy to production
          5. Monitor for 1 hour
          6. Send notification to team
        `
      }
    ]
  });

  const progress = workflowPlugin.getProgress();
  console.log(`\nDeployment Progress: ${progress.percentComplete}%`);
}

main().catch(console.error);
