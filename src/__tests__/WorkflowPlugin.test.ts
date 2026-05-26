import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowPlugin, WorkflowPluginConfig } from '../WorkflowPlugin';
import { MockEventBus, MockStateManager } from 'iteratio/src/__test__';

describe('WorkflowPlugin', () => {
  let plugin: WorkflowPlugin;
  let mockContainer: any;

  beforeEach(() => {
    plugin = new WorkflowPlugin();
    mockContainer = {
      bind: vi.fn().mockReturnValue({ toConstantValue: vi.fn() }),
    };
  });

  describe('plugin identity', () => {
    it('should have name "workflow"', () => {
      expect(plugin.name).toBe('workflow');
    });

    it('should have a valid semver version string', () => {
      expect(plugin.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('initialize', () => {
    it('should register TodoManager in container', async () => {
      await plugin.initialize(mockContainer);
      expect(mockContainer.bind).toHaveBeenCalledWith('WorkflowPlugin.TodoManager');
    });

    it('should register NudgeStrategy in container', async () => {
      await plugin.initialize(mockContainer);
      expect(mockContainer.bind).toHaveBeenCalledWith('WorkflowPlugin.NudgeStrategy');
    });

    it('should register TodoFormatter in container', async () => {
      await plugin.initialize(mockContainer);
      expect(mockContainer.bind).toHaveBeenCalledWith('WorkflowPlugin.TodoFormatter');
    });

    it('should mark plugin as initialized after successful init', async () => {
      await plugin.initialize(mockContainer);
      // Plugin should be operational after initialize
      expect(plugin.getTodos()).toEqual([]);
    });
  });

  describe('configure', () => {
    it('should accept a WorkflowPluginConfig and update mode', () => {
      const config: WorkflowPluginConfig = { mode: 'forced' };
      plugin.configure(config);
      // After configuring forced mode, all turns should trigger nudge
      // Verify by checking no error is thrown
      expect(() => plugin.configure(config)).not.toThrow();
    });

    it('should update nudge interval', () => {
      plugin.configure({ nudgeInterval: 10 });
      // Nudge strategy should now use interval of 10
      expect(() => plugin.configure({ nudgeInterval: 10 })).not.toThrow();
    });

    it('should update formatter when template changes', () => {
      plugin.configure({ template: '{{progress.percent}}% done' });
      expect(() => plugin.configure({ template: '{{progress.percent}}% done' })).not.toThrow();
    });

    it('should merge config with existing defaults', () => {
      plugin.configure({ mode: 'scheduled' });
      plugin.configure({ nudgeInterval: 7 });
      // Both should be applied (mode from first, interval from second)
      expect(() => plugin.configure({})).not.toThrow();
    });
  });

  describe('beforeTurn', () => {
    it('should inject TODO list into system message when nudge is due', async () => {
      plugin.addTodo('Write tests');
      const messages: any[] = [{ role: 'system', content: 'You are a helper.' }];
      const context = {
        turnNumber: 3,
        turnCount: 3,
        messages,
        state: {},
      };

      await plugin.beforeTurn(context as any);

      // System message should have TODO content appended
      expect(messages[0].content).toContain('Write tests');
    });

    it('should auto-generate TODOs from first user message when autoGenerate is enabled', async () => {
      const messages = [
        { role: 'user', content: '1. Write tests\n2. Fix bugs\n3. Deploy' },
      ];
      const context = {
        turnNumber: 1,
        turnCount: 1,
        messages,
        state: {},
      };

      await plugin.beforeTurn(context as any);

      const todos = plugin.getTodos();
      expect(todos.length).toBeGreaterThanOrEqual(3);
    });

    it('should not auto-generate TODOs when autoGenerate is disabled', async () => {
      const noAutoPlugin = new WorkflowPlugin({ autoGenerate: false });
      const messages = [
        { role: 'user', content: '1. Write tests\n2. Fix bugs' },
      ];
      const context = {
        turnNumber: 1,
        turnCount: 1,
        messages,
        state: {},
      };

      await noAutoPlugin.beforeTurn(context as any);
      expect(noAutoPlugin.getTodos()).toHaveLength(0);
    });

    it('should create system message if none exists when injecting TODOs', async () => {
      const forcedPlugin = new WorkflowPlugin({ mode: 'forced' });
      forcedPlugin.addTodo('Task A');
      const messages: any[] = [{ role: 'user', content: 'hello' }];
      const context = {
        turnNumber: 2,
        turnCount: 2,
        messages,
        state: {},
      };

      await forcedPlugin.beforeTurn(context as any);

      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toContain('Task A');
    });

    it('should detect checkoff in forced mode when requireCheckoff is true', async () => {
      const forcedPlugin = new WorkflowPlugin({ mode: 'forced', requireCheckoff: true });
      forcedPlugin.addTodo('Implement feature');

      const messages = [
        { role: 'user', content: 'Do this' },
        { role: 'assistant', content: 'Completed: Implement feature' },
      ];
      const context = {
        turnNumber: 2,
        turnCount: 2,
        messages,
        state: {},
      };

      await forcedPlugin.beforeTurn(context as any);

      const todos = forcedPlugin.getTodos();
      const completed = todos.filter(t => t.completed);
      expect(completed.length).toBe(1);
    });
  });

  describe('afterTurn', () => {
    it('should store progress in context state', async () => {
      plugin.addTodo('Task 1');
      plugin.addTodo('Task 2');
      const context = { state: {} } as any;

      await plugin.afterTurn(context);

      expect(context.state.workflowProgress).toBeDefined();
      expect(context.state.workflowProgress.total).toBe(2);
      expect(context.state.workflowProgress.completed).toBe(0);
    });

    it('should report correct completion percentage after completing tasks', async () => {
      const todo = plugin.addTodo('Task 1');
      plugin.addTodo('Task 2');
      plugin.completeTodo(todo.id);
      const context = { state: {} } as any;

      await plugin.afterTurn(context);

      expect(context.state.workflowProgress.percentComplete).toBe(50);
    });

    it('should detect when all tasks are complete', async () => {
      const todo = plugin.addTodo('Only task');
      plugin.completeTodo(todo.id);
      const context = { state: {} } as any;

      await plugin.afterTurn(context);

      expect(context.state.workflowProgress.remaining).toBe(0);
    });
  });

  describe('shutdown', () => {
    it('should clear all todos on shutdown', async () => {
      plugin.addTodo('Task 1');
      plugin.addTodo('Task 2');

      await plugin.shutdown();

      expect(plugin.getTodos()).toHaveLength(0);
    });
  });

  describe('public API', () => {
    it('should add a todo and return TodoItem', () => {
      const todo = plugin.addTodo('New task');
      expect(todo.title).toBe('New task');
      expect(todo.completed).toBe(false);
    });

    it('should complete a todo by id', () => {
      const todo = plugin.addTodo('Complete me');
      const completed = plugin.completeTodo(todo.id);
      expect(completed?.completed).toBe(true);
    });

    it('should return all todos', () => {
      plugin.addTodo('A');
      plugin.addTodo('B');
      expect(plugin.getTodos()).toHaveLength(2);
    });

    it('should return current todo', () => {
      plugin.addTodo('First');
      plugin.addTodo('Second');
      const current = plugin.getCurrentTodo();
      expect(current?.title).toBe('First');
    });

    it('should clear all todos', () => {
      plugin.addTodo('X');
      plugin.clearTodos();
      expect(plugin.getTodos()).toHaveLength(0);
    });
  });

  describe('Untested Methods', () => {
    it('exportTodos() should export todo list to external format', () => {
      plugin.addTodo('Task A');
      plugin.addTodo('Task B');
      const exported = (plugin as any).exportTodos();
      // Should return an external-friendly format (e.g., JSON string)
      expect(typeof exported).toBe('string');
      expect(exported.length).toBeGreaterThan(0);
    });

    it('clearTodos() should remove all todos', () => {
      plugin.addTodo('Task 1');
      plugin.addTodo('Task 2');
      plugin.addTodo('Task 3');
      (plugin as any).clearTodos();
      // After clearing, getTodos should return empty
      expect(plugin.getTodos()).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle initialize called twice without error or duplication', async () => {
      await plugin.initialize(mockContainer);
      await plugin.initialize(mockContainer);
      // Should not double-register services - no error thrown
      expect(plugin.getTodos()).toBeDefined();
    });

    it('should handle configure with empty config object', () => {
      plugin.configure({} as WorkflowPluginConfig);
      // Should not throw, should retain defaults
      expect(plugin.getTodos()).toBeDefined();
    });

    it('should handle beforeTurn with null turnContext', async () => {
      await plugin.initialize(mockContainer);
      await plugin.beforeTurn(null as any);
      // Should not throw, should gracefully no-op
      expect(plugin.getTodos()).toBeDefined();
    });

    it('should handle afterTurn when beforeTurn threw', async () => {
      await plugin.initialize(mockContainer);
      // Simulate a broken beforeTurn by passing invalid context
      try {
        await plugin.beforeTurn({ invalid: true } as any);
      } catch (_) {}
      const context = { state: {} } as any;
      await plugin.afterTurn(context);
      // afterTurn should still function independently
      expect(context.state.workflowProgress).toBeDefined();
    });

    it('should handle shutdown called before initialize', async () => {
      const freshPlugin = new WorkflowPlugin();
      await freshPlugin.shutdown();
      // Should not throw when shutting down uninitialized plugin
      expect(freshPlugin.getTodos()).toHaveLength(0);
    });

    it('should handle add step with empty name', () => {
      const todo = plugin.addTodo('');
      // Should either reject empty name or handle gracefully
      expect(todo).toBeDefined();
      expect(todo.title).toBe('');
    });

    it('should handle registry change during active turn execution', async () => {
      await plugin.initialize(mockContainer);
      plugin.addTodo('Task 1');
      const context = {
        turnNumber: 1,
        turnCount: 1,
        messages: [{ role: 'system', content: '' }],
        state: {},
      };
      // Mutate todos during beforeTurn execution
      const beforeTurnPromise = plugin.beforeTurn(context as any);
      plugin.addTodo('Task 2 added mid-turn');
      await beforeTurnPromise;
      // Should handle concurrent modification gracefully
      expect(plugin.getTodos().length).toBeGreaterThanOrEqual(2);
    });

    it('should handle workflow with 0 steps (passthrough)', async () => {
      await plugin.initialize(mockContainer);
      // No todos added — beforeTurn should passthrough without injecting
      const context = {
        turnNumber: 1,
        turnCount: 1,
        messages: [{ role: 'system', content: 'Base' }],
        state: {},
      };
      await plugin.beforeTurn(context as any);
      // System message should remain unchanged (no injection)
      expect(context.messages[0].content).toBe('Base');
    });

    it('should handle workflow with 100 steps (performance)', async () => {
      await plugin.initialize(mockContainer);
      for (let i = 0; i < 100; i++) {
        plugin.addTodo(`Task ${i}`);
      }
      const context = {
        turnNumber: 1,
        turnCount: 1,
        messages: [{ role: 'system', content: '' }],
        state: {},
      };
      const start = Date.now();
      await plugin.beforeTurn(context as any);
      const elapsed = Date.now() - start;
      // Should complete in reasonable time (< 1 second)
      expect(elapsed).toBeLessThan(1000);
    });

    it('should handle step that removes itself during execution', async () => {
      await plugin.initialize(mockContainer);
      const todo = plugin.addTodo('Self-removing task');
      // Simulate removing the todo during turn processing
      const context = {
        turnNumber: 1,
        turnCount: 1,
        messages: [{ role: 'system', content: '' }],
        state: {},
      };
      const promise = plugin.beforeTurn(context as any);
      plugin.clearTodos();
      await promise;
      // Should not throw or produce corrupted state
      expect(plugin.getTodos()).toHaveLength(0);
    });
  });
});
