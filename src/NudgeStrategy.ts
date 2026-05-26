import { TodoItem } from './TodoManager';

export type NudgeMode = 'nudge' | 'forced' | 'scheduled' | 'disabled';

export interface NudgeConfig {
  mode: NudgeMode;
  nudgeInterval?: number;
  scheduleInterval?: number;
  requireCheckoff?: boolean;
}

export interface NudgeTiming {
  shouldNudge: boolean;
  reason?: string;
}

/** Controls when and how TODO context is injected into the LLM conversation. */
/** Computes nudge timing and content based on turn progress, time elapsed, and configurable modes. */
export class NudgeStrategy {
  private turnCount: number = 0;
  private lastNudgeTurn: number = 0;

  constructor(private config: NudgeConfig) {}

  shouldNudgeOnTurn(turnNumber: number, hasIncompleteTodos: boolean): NudgeTiming {
    this.turnCount = turnNumber;

    if (!hasIncompleteTodos) {
      return { shouldNudge: false };
    }

    switch (this.config.mode) {
      case 'disabled':
        return { shouldNudge: false };

      case 'nudge':
        return this.handleNudgeMode();

      case 'forced':
        return {
          shouldNudge: true,
          reason: 'forced mode - todos always visible'
        };

      case 'scheduled':
        return this.handleScheduledMode();

      default:
        return { shouldNudge: false };
    }
  }

  private handleNudgeMode(): NudgeTiming {
    const interval = this.config.nudgeInterval || 3;
    const turnsSinceLastNudge = this.turnCount - this.lastNudgeTurn;

    if (turnsSinceLastNudge >= interval) {
      this.lastNudgeTurn = this.turnCount;
      return {
        shouldNudge: true,
        reason: `nudge interval reached (every ${interval} turns)`
      };
    }

    return { shouldNudge: false };
  }

  private handleScheduledMode(): NudgeTiming {
    const interval = this.config.scheduleInterval || 5;
    const turnsSinceLastNudge = this.turnCount - this.lastNudgeTurn;

    if (turnsSinceLastNudge >= interval) {
      this.lastNudgeTurn = this.turnCount;
      return {
        shouldNudge: true,
        reason: `scheduled interval reached (every ${interval} turns)`
      };
    }

    return { shouldNudge: false };
  }

  /** Detect TODO checkoff patterns in assistant messages (forced mode). */
  detectCheckoff(message: string): {
    detected: boolean;
    todoId?: string;
    todoTitle?: string;
  } {
    if (!this.config.requireCheckoff) {
      return { detected: false };
    }

    const patterns = [
      /✓\s*(.+)/,
      /completed:\s*(.+)/i,
      /done:\s*(.+)/i,
      /finished:\s*(.+)/i,
      /\[x\]\s*(.+)/i,
      /marked.*completed:\s*(.+)/i
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        return {
          detected: true,
          todoTitle: match[1]?.trim()
        };
      }
    }

    return { detected: false };
  }

  generateNudgeMessage(todos: TodoItem[], currentTodo: TodoItem | null): string {
    switch (this.config.mode) {
      case 'forced':
        return this.generateForcedMessage(todos, currentTodo);

      case 'nudge':
      case 'scheduled':
        return this.generateReminderMessage(todos, currentTodo);

      default:
        return '';
    }
  }

  private generateForcedMessage(todos: TodoItem[], currentTodo: TodoItem | null): string {
    const incomplete = todos.filter(t => !t.completed);
    const completed = todos.filter(t => t.completed);

    let message = '\n\n--- TASK TRACKER (REQUIRED) ---\n';

    if (currentTodo) {
      message += `\nCURRENT TASK: ${currentTodo.title}\n`;
      if (currentTodo.description) {
        message += `Description: ${currentTodo.description}\n`;
      }
      message += '\n⚠️  You MUST explicitly mark this task as completed before moving on.\n';
      message += 'Use: "✓ [task name]" or "Completed: [task name]"\n';
    }

    message += '\nREMAINING TASKS:\n';
    incomplete.forEach((todo, idx) => {
      const marker = todo.id === currentTodo?.id ? '→' : ' ';
      message += `${marker} ☐ ${todo.title}\n`;
    });

    if (completed.length > 0) {
      message += '\nCOMPLETED:\n';
      completed.forEach(todo => {
        message += `  ✓ ${todo.title}\n`;
      });
    }

    message += '\n--- END TASK TRACKER ---\n';

    return message;
  }

  private generateReminderMessage(todos: TodoItem[], currentTodo: TodoItem | null): string {
    const incomplete = todos.filter(t => !t.completed);
    const progress = todos.length > 0
      ? Math.round((todos.filter(t => t.completed).length / todos.length) * 100)
      : 0;

    let message = `\n\n📋 Task Progress: ${progress}% complete\n`;

    if (currentTodo) {
      message += `\nFocus: ${currentTodo.title}\n`;
    }

    if (incomplete.length > 0) {
      message += `Remaining: ${incomplete.length} task${incomplete.length > 1 ? 's' : ''}\n`;
    }

    return message;
  }

  shouldEscalate(nudgesSent: number, tasksCompletedSinceStart: number): boolean {
    return nudgesSent > 0 && tasksCompletedSinceStart === 0;
  }

  suppressIfProgress(context: { recentlyCompleted: boolean }): boolean {
    return context.recentlyCompleted;
  }

  addCondition(condition: (...args: any[]) => boolean): void {
    // Extensibility hook for custom nudge conditions
  }

  reset(): void {
    this.turnCount = 0;
    this.lastNudgeTurn = 0;
  }
}
