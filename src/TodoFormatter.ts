import { TodoItem } from './TodoManager';

export interface FormatterConfig {
  template?: string;
  showProgress?: boolean;
  showPriority?: boolean;
  showTags?: boolean;
  showTimestamps?: boolean;
  highlightCurrent?: boolean;
  maxDescriptionLength?: number;
}

/** Formats TODO items for injection into system prompts. */
/** Formats TODO lists into human-readable strings for injection into agent prompts. */
export class TodoFormatter {
  private config: FormatterConfig;

  constructor(config: FormatterConfig = {}) {
    this.config = {
      showProgress: true,
      showPriority: false,
      showTags: false,
      showTimestamps: false,
      highlightCurrent: true,
      maxDescriptionLength: 100,
      ...config
    };
  }

  format(todos: TodoItem[], currentTodo: TodoItem | null): string {
    if (this.config.template) {
      return this.formatWithTemplate(todos, currentTodo);
    }

    return this.formatDefault(todos, currentTodo);
  }

  private formatWithTemplate(todos: TodoItem[], currentTodo: TodoItem | null): string {
    if (!this.config.template) return '';

    let output = this.config.template;

    const completed = todos.filter(t => t.completed).length;
    const total = todos.length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    output = output.replace(/\{\{progress\.completed\}\}/g, completed.toString());
    output = output.replace(/\{\{progress\.total\}\}/g, total.toString());
    output = output.replace(/\{\{progress\.percent\}\}/g, percent.toString());

    if (currentTodo) {
      output = output.replace(/\{\{currentTodo\.title\}\}/g, currentTodo.title);
      output = output.replace(/\{\{currentTodo\.description\}\}/g, currentTodo.description || '');
      output = output.replace(/\{\{currentTodo\.priority\}\}/g, currentTodo.priority || 'medium');
    }

    const eachMatch = output.match(/\{\{#each todos\}\}([\s\S]*?)\{\{\/each\}\}/);
    if (eachMatch) {
      const itemTemplate = eachMatch[1];
      const items = todos.map(todo => {
        let itemOutput = itemTemplate;

        const ifCompletedMatch = itemOutput.match(/\{\{#if completed\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/);
        if (ifCompletedMatch) {
          const completedContent = ifCompletedMatch[1];
          const incompletedContent = ifCompletedMatch[2];
          itemOutput = itemOutput.replace(
            ifCompletedMatch[0],
            todo.completed ? completedContent : incompletedContent
          );
        }

        itemOutput = itemOutput.replace(/\{\{title\}\}/g, todo.title);
        itemOutput = itemOutput.replace(/\{\{description\}\}/g, todo.description || '');
        itemOutput = itemOutput.replace(/\{\{priority\}\}/g, todo.priority || 'medium');

        return itemOutput;
      }).join('');

      output = output.replace(eachMatch[0], items);
    }

    return output;
  }

  private formatDefault(todos: TodoItem[], currentTodo: TodoItem | null): string {
    const lines: string[] = [];

    lines.push('');
    lines.push('═══════════════════════════════════════');
    lines.push('           TASK CHECKLIST');
    lines.push('═══════════════════════════════════════');
    lines.push('');

    if (this.config.showProgress && todos.length > 0) {
      const completed = todos.filter(t => t.completed).length;
      const total = todos.length;
      const percent = Math.round((completed / total) * 100);

      lines.push(this.formatProgressBar(percent, completed, total));
      lines.push('');
    }

    if (currentTodo && this.config.highlightCurrent) {
      lines.push('┌─ CURRENT FOCUS ────────────────────┐');
      lines.push(`│ ▶ ${currentTodo.title}`);

      if (currentTodo.description) {
        const desc = this.truncateDescription(currentTodo.description);
        lines.push(`│   ${desc}`);
      }

      if (this.config.showPriority && currentTodo.priority) {
        lines.push(`│   Priority: ${this.formatPriority(currentTodo.priority)}`);
      }

      lines.push('└────────────────────────────────────┘');
      lines.push('');
    }

    const incomplete = todos.filter(t => !t.completed);
    if (incomplete.length > 0) {
      lines.push('PENDING TASKS:');
      incomplete.forEach((todo, idx) => {
        const isCurrent = todo.id === currentTodo?.id;
        lines.push(this.formatTodoItem(todo, isCurrent, '☐'));
      });
      lines.push('');
    }

    const completed = todos.filter(t => t.completed);
    if (completed.length > 0) {
      lines.push('COMPLETED:');
      completed.forEach(todo => {
        lines.push(this.formatTodoItem(todo, false, '✓'));
      });
      lines.push('');
    }

    lines.push('═══════════════════════════════════════');
    lines.push('');

    return lines.join('\n');
  }

  private formatTodoItem(todo: TodoItem, isCurrent: boolean, marker: string): string {
    const prefix = isCurrent ? '→' : ' ';
    let line = `${prefix} ${marker} ${todo.title}`;

    if (this.config.showPriority && todo.priority && todo.priority !== 'medium') {
      line += ` [${this.formatPriority(todo.priority)}]`;
    }

    if (this.config.showTags && todo.tags && todo.tags.length > 0) {
      line += ` #${todo.tags.join(' #')}`;
    }

    if (this.config.showTimestamps && todo.completedAt) {
      const time = new Date(todo.completedAt).toLocaleTimeString();
      line += ` (${time})`;
    }

    return line;
  }

  private formatPriority(priority: string): string {
    switch (priority) {
      case 'high':
        return '🔴 HIGH';
      case 'medium':
        return '🟡 MED';
      case 'low':
        return '🟢 LOW';
      default:
        return priority.toUpperCase();
    }
  }

  private formatProgressBar(percent: number, completed: number, total: number): string {
    const barWidth = 30;
    const filled = Math.round((percent / 100) * barWidth);
    const empty = barWidth - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    return `Progress: [${bar}] ${percent}% (${completed}/${total})`;
  }

  private truncateDescription(description: string): string {
    const maxLen = this.config.maxDescriptionLength || 100;
    if (description.length <= maxLen) return description;

    return description.substring(0, maxLen - 3) + '...';
  }

  formatCompact(todos: TodoItem[]): string {
    const completed = todos.filter(t => t.completed).length;
    const total = todos.length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    return `📋 Tasks: ${completed}/${total} (${percent}%)`;
  }

  formatJSON(todos: TodoItem[], currentTodo: TodoItem | null): string {
    return JSON.stringify({
      todos: todos.map(t => ({
        id: t.id,
        title: t.title,
        completed: t.completed,
        priority: t.priority,
        tags: t.tags
      })),
      currentTodoId: currentTodo?.id,
      progress: {
        completed: todos.filter(t => t.completed).length,
        total: todos.length,
        percent: todos.length > 0
          ? Math.round((todos.filter(t => t.completed).length / todos.length) * 100)
          : 0
      }
    }, null, 2);
  }
}
