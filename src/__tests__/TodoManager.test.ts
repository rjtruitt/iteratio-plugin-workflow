import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TodoManager, TodoItem } from '../TodoManager';

describe('TodoManager', () => {
  let manager: TodoManager;

  beforeEach(() => {
    manager = new TodoManager();
  });

  describe('add todo item', () => {
    it('should create a todo with a title', () => {
      const todo = manager.createTodo('Write unit tests');
      expect(todo.title).toBe('Write unit tests');
      expect(todo.id).toBeDefined();
    });

    it('should assign a unique id to each todo', () => {
      const todo1 = manager.createTodo('Task A');
      const todo2 = manager.createTodo('Task B');
      expect(todo1.id).not.toBe(todo2.id);
    });

    it('should set completed to false on creation', () => {
      const todo = manager.createTodo('New task');
      expect(todo.completed).toBe(false);
    });

    it('should set a creation timestamp', () => {
      const before = Date.now();
      const todo = manager.createTodo('Timed task');
      const after = Date.now();
      expect(todo.createdAt).toBeGreaterThanOrEqual(before);
      expect(todo.createdAt).toBeLessThanOrEqual(after);
    });

    it('should accept optional description', () => {
      const todo = manager.createTodo('Task', { description: 'Detailed info' });
      expect(todo.description).toBe('Detailed info');
    });

    it('should accept optional priority', () => {
      const todo = manager.createTodo('High priority', { priority: 'high' });
      expect(todo.priority).toBe('high');
    });

    it('should default priority to medium', () => {
      const todo = manager.createTodo('Default priority');
      expect(todo.priority).toBe('medium');
    });

    it('should accept optional tags', () => {
      const todo = manager.createTodo('Tagged', { tags: ['urgent', 'backend'] });
      expect(todo.tags).toEqual(['urgent', 'backend']);
    });
  });

  describe('remove todo item', () => {
    it('should delete a todo by id', () => {
      const todo = manager.createTodo('Delete me');
      const result = manager.deleteTodo(todo.id);
      expect(result).toBe(true);
      expect(manager.getAllTodos()).toHaveLength(0);
    });

    it('should return false when deleting non-existent todo', () => {
      const result = manager.deleteTodo('nonexistent-id');
      expect(result).toBe(false);
    });
  });

  describe('mark complete', () => {
    it('should mark a todo as completed', () => {
      const todo = manager.createTodo('Complete me');
      const completed = manager.completeTodo(todo.id);
      expect(completed?.completed).toBe(true);
    });

    it('should set completedAt timestamp', () => {
      const todo = manager.createTodo('Stamp me');
      const completed = manager.completeTodo(todo.id);
      expect(completed?.completedAt).toBeDefined();
      expect(completed?.completedAt).toBeGreaterThan(0);
    });

    it('should return null for non-existent todo id', () => {
      const result = manager.completeTodo('fake-id');
      expect(result).toBeNull();
    });
  });

  describe('get all todos', () => {
    it('should return all created todos', () => {
      manager.createTodo('A');
      manager.createTodo('B');
      manager.createTodo('C');
      expect(manager.getAllTodos()).toHaveLength(3);
    });

    it('should return empty array when no todos exist', () => {
      expect(manager.getAllTodos()).toHaveLength(0);
    });
  });

  describe('get pending todos only', () => {
    it('should return only incomplete todos', () => {
      const todo1 = manager.createTodo('Done');
      manager.createTodo('Not done');
      manager.completeTodo(todo1.id);

      const pending = manager.getIncompleteTodos();
      expect(pending).toHaveLength(1);
      expect(pending[0].title).toBe('Not done');
    });
  });

  describe('ordering preserved', () => {
    it('should maintain insertion order', () => {
      manager.createTodo('First');
      manager.createTodo('Second');
      manager.createTodo('Third');

      const todos = manager.getAllTodos();
      expect(todos[0].title).toBe('First');
      expect(todos[1].title).toBe('Second');
      expect(todos[2].title).toBe('Third');
    });
  });

  describe('persistence (serialize/deserialize)', () => {
    it('should serialize todos to a storable format', () => {
      manager.createTodo('Persist me');
      // The manager stores items in a Map; getAllTodos returns serializable objects
      const todos = manager.getAllTodos();
      const json = JSON.stringify(todos);
      const parsed = JSON.parse(json);
      expect(parsed[0].title).toBe('Persist me');
    });

    it('should support reconstructing state from serialized data', () => {
      manager.createTodo('Serialized task');
      const todos = manager.getAllTodos();
      const json = JSON.stringify(todos);

      // Create new manager and restore state
      const newManager = new TodoManager();
      const restored: TodoItem[] = JSON.parse(json);
      // Currently no restoreFromSerialized method exists - this should FAIL
      // Expected: newManager.restoreFromSerialized(restored);
      // expect(newManager.getAllTodos()).toHaveLength(1);
      expect((newManager as any).restoreFromSerialized).toBeDefined();
    });
  });

  describe('clear all', () => {
    it('should remove all todos', () => {
      manager.createTodo('X');
      manager.createTodo('Y');
      manager.clear();
      expect(manager.getAllTodos()).toHaveLength(0);
    });

    it('should reset current index', () => {
      manager.createTodo('A');
      manager.createTodo('B');
      manager.clear();
      expect(manager.getCurrentTodo()).toBeNull();
    });
  });

  describe('update todo text', () => {
    it('should update the title of an existing todo', () => {
      const todo = manager.createTodo('Original');
      const updated = manager.updateTodo(todo.id, { title: 'Updated' });
      expect(updated?.title).toBe('Updated');
    });

    it('should return null when updating non-existent todo', () => {
      const result = manager.updateTodo('fake-id', { title: 'Nope' });
      expect(result).toBeNull();
    });
  });

  describe('todo with priority', () => {
    it('should support low priority', () => {
      const todo = manager.createTodo('Low', { priority: 'low' });
      expect(todo.priority).toBe('low');
    });

    it('should support high priority', () => {
      const todo = manager.createTodo('High', { priority: 'high' });
      expect(todo.priority).toBe('high');
    });

    it('should support medium priority', () => {
      const todo = manager.createTodo('Medium', { priority: 'medium' });
      expect(todo.priority).toBe('medium');
    });
  });

  describe('progress tracking', () => {
    it('should report correct progress statistics', () => {
      manager.createTodo('A');
      const todo2 = manager.createTodo('B');
      manager.createTodo('C');
      manager.completeTodo(todo2.id);

      const progress = manager.getProgress();
      expect(progress.total).toBe(3);
      expect(progress.completed).toBe(1);
      expect(progress.remaining).toBe(2);
      expect(progress.percentComplete).toBe(33);
    });

    it('should return 0% when no todos exist', () => {
      const progress = manager.getProgress();
      expect(progress.percentComplete).toBe(0);
    });
  });

  describe('Untested Methods', () => {
    it('reorderTodos(newOrder) should reorder the todo list', () => {
      const a = manager.createTodo('A');
      const b = manager.createTodo('B');
      const c = manager.createTodo('C');
      (manager as any).reorderTodos([c.id, a.id, b.id]);
      const todos = manager.getAllTodos();
      // After reorder, order should be C, A, B
      expect(todos[0].title).toBe('C');
      expect(todos[1].title).toBe('A');
      expect(todos[2].title).toBe('B');
    });

    it('advanceToNextIncomplete() should move cursor to next incomplete todo', () => {
      const a = manager.createTodo('A');
      const b = manager.createTodo('B');
      const c = manager.createTodo('C');
      manager.completeTodo(a.id);
      (manager as any).advanceToNextIncomplete();
      // Current todo should now be B (first incomplete)
      const current = manager.getCurrentTodo();
      expect(current?.title).toBe('B');
    });

    it('getCompletedTodos() should return only completed todos', () => {
      const a = manager.createTodo('A');
      const b = manager.createTodo('B');
      const c = manager.createTodo('C');
      manager.completeTodo(a.id);
      manager.completeTodo(c.id);
      const completed = (manager as any).getCompletedTodos();
      // Should return only A and C
      expect(completed).toHaveLength(2);
      expect(completed.map((t: any) => t.title).sort()).toEqual(['A', 'C']);
    });
  });

  describe('auto-generate from request', () => {
    it('should extract numbered list items as todos', () => {
      const request = '1. Write tests\n2. Fix bugs\n3. Deploy';
      const todos = manager.autoGenerateFromRequest(request);
      expect(todos).toHaveLength(3);
      expect(todos[0].title).toBe('Write tests');
    });

    it('should extract bullet list items as todos', () => {
      const request = '- Design API\n- Implement endpoints\n- Add docs';
      const todos = manager.autoGenerateFromRequest(request);
      expect(todos).toHaveLength(3);
    });
  });
});
