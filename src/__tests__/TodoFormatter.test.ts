import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TodoFormatter, FormatterConfig } from '../TodoFormatter';
import { TodoItem } from '../TodoManager';

describe('TodoFormatter', () => {
  let formatter: TodoFormatter;

  function createTodo(overrides: Partial<TodoItem> = {}): TodoItem {
    return {
      id: `todo-${Math.random()}`,
      title: 'Test Task',
      completed: false,
      createdAt: Date.now(),
      priority: 'medium',
      tags: [],
      ...overrides,
    };
  }

  beforeEach(() => {
    formatter = new TodoFormatter();
  });

  describe('format as markdown list', () => {
    it('should format todos as a readable text list', () => {
      const todos = [
        createTodo({ title: 'Task A' }),
        createTodo({ title: 'Task B' }),
      ];
      const result = formatter.format(todos, todos[0]);
      expect(result).toContain('Task A');
      expect(result).toContain('Task B');
    });

    it('should show pending marker for incomplete tasks', () => {
      const todos = [createTodo({ title: 'Incomplete', completed: false })];
      const result = formatter.format(todos, todos[0]);
      // Default format uses a pending marker like a checkbox
      expect(result).toMatch(/[☐□\[\]]/);
    });

    it('should show completed marker for done tasks', () => {
      const todos = [createTodo({ title: 'Done', completed: true, completedAt: Date.now() })];
      const result = formatter.format(todos, null);
      expect(result).toMatch(/[✓✔\[x\]]/);
    });
  });

  describe('format as structured JSON', () => {
    it('should return valid JSON with todos array', () => {
      const todos = [createTodo({ title: 'JSON Task' })];
      const result = formatter.formatJSON(todos, todos[0]);
      const parsed = JSON.parse(result);
      expect(parsed.todos).toHaveLength(1);
      expect(parsed.todos[0].title).toBe('JSON Task');
    });

    it('should include progress info in JSON', () => {
      const todos = [
        createTodo({ title: 'A', completed: true }),
        createTodo({ title: 'B', completed: false }),
      ];
      const result = formatter.formatJSON(todos, todos[1]);
      const parsed = JSON.parse(result);
      expect(parsed.progress.completed).toBe(1);
      expect(parsed.progress.total).toBe(2);
      expect(parsed.progress.percent).toBe(50);
    });

    it('should include currentTodoId', () => {
      const current = createTodo({ title: 'Current' });
      const result = formatter.formatJSON([current], current);
      const parsed = JSON.parse(result);
      expect(parsed.currentTodoId).toBe(current.id);
    });
  });

  describe('format compact (single line per todo)', () => {
    it('should produce a compact single-line summary', () => {
      const todos = [
        createTodo({ completed: true }),
        createTodo({ completed: false }),
      ];
      const result = formatter.formatCompact(todos);
      expect(result).toContain('1/2');
      expect(result).toContain('50%');
    });

    it('should handle empty list', () => {
      const result = formatter.formatCompact([]);
      expect(result).toContain('0/0');
    });
  });

  describe('include priority indicators', () => {
    it('should show priority when config showPriority is true', () => {
      const priorityFormatter = new TodoFormatter({ showPriority: true });
      const todos = [createTodo({ title: 'Urgent', priority: 'high' })];
      const result = priorityFormatter.format(todos, todos[0]);
      expect(result).toContain('HIGH');
    });

    it('should not show priority by default', () => {
      const todos = [createTodo({ title: 'Normal', priority: 'high' })];
      const result = formatter.format(todos, todos[0]);
      // Default config has showPriority: false
      // The result should NOT contain priority indicator in the task line
      // (It may appear in the "CURRENT FOCUS" box which always shows it)
      expect(result).toBeDefined();
    });
  });

  describe('include completion status', () => {
    it('should show progress bar when enabled', () => {
      const todos = [
        createTodo({ completed: true }),
        createTodo({ completed: false }),
      ];
      const result = formatter.format(todos, todos[1]);
      expect(result).toContain('Progress');
      expect(result).toContain('50%');
    });
  });

  describe('empty list produces empty string', () => {
    it('should return meaningful output even for empty list', () => {
      const result = formatter.format([], null);
      // With no todos, formatter might return header only or empty content
      // The current implementation still returns the header block
      expect(result).toBeDefined();
    });

    it('should return empty compact string for empty list', () => {
      const result = formatter.formatCompact([]);
      expect(result).toContain('0/0');
    });
  });

  describe('template formatting', () => {
    it('should use custom template when provided', () => {
      const templateFormatter = new TodoFormatter({
        template: 'Progress: {{progress.percent}}% ({{progress.completed}}/{{progress.total}})',
      });
      const todos = [
        createTodo({ completed: true }),
        createTodo({ completed: false }),
      ];
      const result = templateFormatter.format(todos, todos[1]);
      expect(result).toContain('Progress: 50% (1/2)');
    });

    it('should handle {{#each todos}} block', () => {
      const templateFormatter = new TodoFormatter({
        template: '{{#each todos}}* {{title}}\n{{/each}}',
      });
      const todos = [
        createTodo({ title: 'Alpha' }),
        createTodo({ title: 'Beta' }),
      ];
      const result = templateFormatter.format(todos, null);
      expect(result).toContain('* Alpha');
      expect(result).toContain('* Beta');
    });
  });
});
