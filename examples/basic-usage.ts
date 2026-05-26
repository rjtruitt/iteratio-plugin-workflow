/**
 * Basic usage example - Nudge mode with auto-generation
 */

import { AgentLoop } from 'iteratio';
import { WorkflowPlugin } from '../src';

// Mock LLM provider for demo
const mockLLM = async (messages: any[]) => {
  return {
    role: 'assistant',
    content: 'Working on the task...'
  };
};

// Create workflow plugin with default settings
const workflowPlugin = new WorkflowPlugin({
  mode: 'nudge',          // Gentle reminders
  nudgeInterval: 3,       // Every 3 turns
  autoGenerate: true      // Auto-extract TODOs from request
});

// Build agent loop
const loop = AgentLoop.builder()
  .withLLM(mockLLM)
  .withPlugin(workflowPlugin)
  .build();

// Run with a multi-step task
async function main() {
  await loop.run({
    messages: [
      {
        role: 'user',
        content: `
          Build a REST API with these features:
          1. User authentication with JWT
          2. CRUD operations for posts
          3. Comments on posts
          4. Rate limiting middleware
          5. API documentation
        `
      }
    ]
  });

  // Check progress
  const progress = workflowPlugin.getProgress();
  console.log(`\nFinal Progress: ${progress.completed}/${progress.total} (${progress.percentComplete}%)`);

  // Get all TODOs
  const todos = workflowPlugin.getTodos();
  console.log('\nTODO List:');
  todos.forEach(todo => {
    const status = todo.completed ? '✓' : '☐';
    console.log(`  ${status} ${todo.title}`);
  });
}

main().catch(console.error);
