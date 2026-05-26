/**
 * Manual TODO management example
 */

import { AgentLoop } from 'iteratio';
import { WorkflowPlugin } from '../src';

const mockLLM = async (messages: any[]) => {
  return {
    role: 'assistant',
    content: 'Working on it...'
  };
};

// Create workflow plugin without auto-generation
const workflowPlugin = new WorkflowPlugin({
  mode: 'nudge',
  nudgeInterval: 2,
  autoGenerate: false  // We'll add TODOs manually
});

const loop = AgentLoop.builder()
  .withLLM(mockLLM)
  .withPlugin(workflowPlugin)
  .build();

async function main() {
  // Manually add TODOs with detailed configuration
  console.log('Setting up TODO list...\n');

  const todo1 = workflowPlugin.addTodo('Design database schema', {
    description: 'Create ERD and define all tables, relationships, and constraints',
    priority: 'high',
    tags: ['backend', 'database']
  });
  console.log(`Added: ${todo1.title} [${todo1.priority}]`);

  const todo2 = workflowPlugin.addTodo('Implement authentication layer', {
    description: 'JWT tokens with refresh mechanism and OAuth integration',
    priority: 'high',
    tags: ['backend', 'security']
  });
  console.log(`Added: ${todo2.title} [${todo2.priority}]`);

  const todo3 = workflowPlugin.addTodo('Create API endpoints', {
    priority: 'medium',
    tags: ['backend', 'api']
  });
  console.log(`Added: ${todo3.title} [${todo3.priority}]`);

  const todo4 = workflowPlugin.addTodo('Write unit tests', {
    priority: 'medium',
    tags: ['testing']
  });
  console.log(`Added: ${todo4.title} [${todo4.priority}]`);

  const todo5 = workflowPlugin.addTodo('Deploy to staging', {
    priority: 'low',
    tags: ['devops']
  });
  console.log(`Added: ${todo5.title} [${todo5.priority}]\n`);

  // Show current state
  console.log('Initial TODO list:');
  console.log(workflowPlugin.exportTodos());

  // Run the loop
  await loop.run({
    messages: [
      {
        role: 'user',
        content: 'Start working on the backend development tasks'
      }
    ]
  });

  // Manually mark some as complete
  console.log('\n\nManually completing tasks...');
  workflowPlugin.completeTodo(todo1.id);
  console.log(`✓ Completed: ${todo1.title}`);

  workflowPlugin.completeTodo(todo2.id);
  console.log(`✓ Completed: ${todo2.title}`);

  // Check progress
  const progress = workflowPlugin.getProgress();
  console.log(`\nProgress: ${progress.completed}/${progress.total} (${progress.percentComplete}%)`);

  // Show current TODO
  const current = workflowPlugin.getCurrentTodo();
  console.log(`\nCurrent focus: ${current?.title || 'None'}`);

  // Export final state
  console.log('\nFinal state:');
  console.log(workflowPlugin.exportTodos());
}

main().catch(console.error);
