export interface TodoItem {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  createdAt: number;
  completedAt?: number;
  priority?: 'low' | 'medium' | 'high';
  tags?: string[];
}

export interface TodoList {
  items: TodoItem[];
  currentIndex: number;
}

/** Manages TODO items with creation, completion tracking, and auto-generation from requests. */
/** Manages a TODO list for agent workflows with add, update, complete, and filtering operations. */
export class TodoManager {
  private todos: Map<string, TodoItem> = new Map();
  private currentIndex: number = 0;

  createTodo(title: string, options?: {
    description?: string;
    priority?: 'low' | 'medium' | 'high';
    tags?: string[];
  }): TodoItem {
    const todo: TodoItem = {
      id: this.generateId(),
      title,
      description: options?.description,
      completed: false,
      createdAt: Date.now(),
      priority: options?.priority || 'medium',
      tags: options?.tags || []
    };

    this.todos.set(todo.id, todo);
    return todo;
  }

  /** Extract tasks from a user request using heuristics (numbered lists, bullets, separators). */
  autoGenerateFromRequest(request: string): TodoItem[] {
    const tasks: string[] = [];

    const lines = request.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      const numberedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
      if (numberedMatch) {
        tasks.push(numberedMatch[1]);
        continue;
      }

      const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
      if (bulletMatch) {
        tasks.push(bulletMatch[1]);
        continue;
      }
    }

    if (tasks.length === 0) {
      const separators = /\b(then|after that|next|finally|and then)\b/gi;
      const parts = request.split(separators).filter(p => p.trim().length > 10);

      if (parts.length > 1) {
        tasks.push(...parts.map(p => p.trim()));
      } else {
        tasks.push(request.trim());
      }
    }

    return tasks.map(task => this.createTodo(task));
  }

  updateTodo(id: string, updates: Partial<TodoItem>): TodoItem | null {
    const todo = this.todos.get(id);
    if (!todo) return null;

    const updated = { ...todo, ...updates };
    this.todos.set(id, updated);
    return updated;
  }

  completeTodo(id: string): TodoItem | null {
    const todo = this.todos.get(id);
    if (!todo) return null;

    todo.completed = true;
    todo.completedAt = Date.now();
    this.todos.set(id, todo);

    this.advanceToNextIncomplete();

    return todo;
  }

  getAllTodos(): TodoItem[] {
    return Array.from(this.todos.values());
  }

  getIncompleteTodos(): TodoItem[] {
    return this.getAllTodos().filter(t => !t.completed);
  }

  getCompletedTodos(): TodoItem[] {
    return this.getAllTodos().filter(t => t.completed);
  }

  getCurrentTodo(): TodoItem | null {
    const incomplete = this.getIncompleteTodos();
    if (this.currentIndex >= incomplete.length) return null;
    return incomplete[this.currentIndex];
  }

  advanceToNextIncomplete(): void {
    this.currentIndex = 0;
  }

  getProgress(): {
    total: number;
    completed: number;
    remaining: number;
    percentComplete: number;
  } {
    const total = this.todos.size;
    const completed = this.getCompletedTodos().length;
    const remaining = total - completed;
    const percentComplete = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, remaining, percentComplete };
  }

  clear(): void {
    this.todos.clear();
    this.currentIndex = 0;
  }

  deleteTodo(id: string): boolean {
    return this.todos.delete(id);
  }

  reorderTodos(ids: string[]): void {
    const reordered = new Map<string, TodoItem>();
    for (const id of ids) {
      const todo = this.todos.get(id);
      if (todo) {
        reordered.set(id, todo);
      }
    }
    for (const [id, todo] of this.todos) {
      if (!reordered.has(id)) {
        reordered.set(id, todo);
      }
    }
    this.todos = reordered;
  }

  restoreFromSerialized(items: TodoItem[]): void {
    this.todos.clear();
    this.currentIndex = 0;
    for (const item of items) {
      this.todos.set(item.id, item);
    }
  }

  private generateId(): string {
    return `todo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
