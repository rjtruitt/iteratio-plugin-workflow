import { Container } from 'inversify';
import { IPlugin, TurnContext, ILogger, IEventBus, TOKENS } from 'iteratio';
import { TodoManager, TodoItem } from './TodoManager';
import { NudgeStrategy, NudgeMode } from './NudgeStrategy';
import { TodoFormatter, FormatterConfig } from './TodoFormatter';
import { GraphLoopOverride, LoopGraphDefinition, LoopOverrideConfig } from './GraphLoopOverride';
import { StepPipelineAdapter } from './StepPipelineAdapter';
import { WorkflowStepRegistry } from './WorkflowStepRegistry';

export interface WorkflowPluginConfig {
  /** @default 'nudge' */
  mode?: NudgeMode;
  /** Auto-generate TODO list from user request. */
  autoGenerate?: boolean;
  /** Interval for nudge mode (every N turns). */
  nudgeInterval?: number;
  /** Interval for scheduled mode (every N turns). */
  scheduleInterval?: number;
  /** Require LLM to explicitly check off items (forced mode only). */
  requireCheckoff?: boolean;
  /** Custom Handlebars-style template for formatting TODOs. */
  template?: string;
  /** Formatter configuration. */
  formatter?: FormatterConfig;
  /** Custom TODO injection function; overrides default formatting. */
  customFormatter?: (todos: TodoItem[], currentTodo: TodoItem | null) => string;
  /** Graph-based loop override for conditional exits, retries, and parallel branches. */
  loopOverride?: LoopGraphDefinition | LoopOverrideConfig;
}

/**
 * Orchestrates TODO-driven workflow execution within the agent loop.
 * Injects task context into messages via configurable nudge strategies,
 * auto-generates TODOs from user requests, and supports graph-based loop
 * overrides for conditional exit and retry logic.
 */
export class WorkflowPlugin implements IPlugin {
  readonly name = 'workflow';
  readonly version = '0.1.0';

  private todoManager: TodoManager;
  private nudgeStrategy: NudgeStrategy;
  private formatter: TodoFormatter;
  private config: WorkflowPluginConfig;
  private initialized = false;
  private _loopOverride: GraphLoopOverride | null = null;
  private logger: ILogger | null = null;
  private eventBus: IEventBus | null = null;
  private stepRegistry: WorkflowStepRegistry;
  private pipelineAdapter: StepPipelineAdapter;

  constructor(config: WorkflowPluginConfig = {}) {
    this.config = {
      mode: 'nudge',
      autoGenerate: true,
      nudgeInterval: 3,
      scheduleInterval: 5,
      requireCheckoff: false,
      ...config
    };

    this.todoManager = new TodoManager();
    this.nudgeStrategy = new NudgeStrategy({
      mode: this.config.mode || 'nudge',
      nudgeInterval: this.config.nudgeInterval,
      scheduleInterval: this.config.scheduleInterval,
      requireCheckoff: this.config.requireCheckoff
    });
    this.formatter = new TodoFormatter({
      template: this.config.template,
      ...this.config.formatter
    });
    this.stepRegistry = new WorkflowStepRegistry();
    this.pipelineAdapter = new StepPipelineAdapter(this.stepRegistry);

    if (this.config.loopOverride) {
      if ('nodes' in this.config.loopOverride) {
        this._loopOverride = new GraphLoopOverride();
        this._loopOverride.buildFromDefinition(this.config.loopOverride as LoopGraphDefinition);
      } else {
        this._loopOverride = new GraphLoopOverride(this.config.loopOverride as LoopOverrideConfig);
      }
    }
  }

  /** Bind internal services into the DI container and connect the step pipeline. */
  async initialize(container: Container): Promise<void> {
    this.logger = container.get<ILogger>(TOKENS.ILogger);
    this.eventBus = container.get<IEventBus>(TOKENS.IEventBus);

    const pipeline = container.get(TOKENS.IStepPipeline);
    this.pipelineAdapter.connect(pipeline);

    container.bind<TodoManager>('WorkflowPlugin.TodoManager').toConstantValue(this.todoManager);
    container.bind<NudgeStrategy>('WorkflowPlugin.NudgeStrategy').toConstantValue(this.nudgeStrategy);
    container.bind<TodoFormatter>('WorkflowPlugin.TodoFormatter').toConstantValue(this.formatter);
    container.bind<WorkflowStepRegistry>('WorkflowPlugin.StepRegistry').toConstantValue(this.stepRegistry);

    this.initialized = true;
    this.logger.info('[WorkflowPlugin] Initialized', { steps: this.pipelineAdapter.getRegisteredCount() });
  }

  /** Apply runtime configuration changes, rebuilding nudge strategy and formatter as needed. */
  configure(config: WorkflowPluginConfig): void {
    this.config = { ...this.config, ...config };

    if (config.mode || config.nudgeInterval || config.scheduleInterval || config.requireCheckoff) {
      this.nudgeStrategy = new NudgeStrategy({
        mode: this.config.mode || 'nudge',
        nudgeInterval: this.config.nudgeInterval,
        scheduleInterval: this.config.scheduleInterval,
        requireCheckoff: this.config.requireCheckoff
      });
    }

    if (config.template || config.formatter) {
      this.formatter = new TodoFormatter({
        template: this.config.template,
        ...this.config.formatter
      });
    }
  }

  /** Auto-generate TODOs on first turn, inject task context based on nudge strategy, and detect check-offs. */
  async beforeTurn(context: TurnContext): Promise<void> {
    if (!context) return;
    const { turnNumber, messages, state } = context;

    if (turnNumber === 1 && this.config.autoGenerate) {
      const firstUserMessage = messages.find(m => m.role === 'user');
      if (firstUserMessage?.content) {
        const todos = this.todoManager.autoGenerateFromRequest(firstUserMessage.content);
        state.workflowTodos = todos.map(t => t.id);
        this.logger?.info('[WorkflowPlugin] Auto-generated TODOs', { count: todos.length });
      }
    }

    const allTodos = this.todoManager.getAllTodos();
    const incompleteTodos = this.todoManager.getIncompleteTodos();
    const currentTodo = this.todoManager.getCurrentTodo();

    const { shouldNudge, reason } = this.nudgeStrategy.shouldNudgeOnTurn(
      turnNumber,
      incompleteTodos.length > 0
    );

    if (shouldNudge) {
      this.logger?.debug('[WorkflowPlugin] Injecting TODO context', { reason });

      const todoContent = this.config.customFormatter
        ? this.config.customFormatter(allTodos, currentTodo)
        : this.formatter.format(allTodos, currentTodo);

      this.injectTodoContext(messages, todoContent);
    }

    if (this.config.requireCheckoff && turnNumber > 1) {
      const lastAssistantMessage = this.findLastAssistantMessage(messages);
      if (lastAssistantMessage?.content) {
        const checkoff = this.nudgeStrategy.detectCheckoff(lastAssistantMessage.content);

        if (checkoff.detected && checkoff.todoTitle) {
          const matchingTodo = incompleteTodos.find(t =>
            t.title.toLowerCase().includes(checkoff.todoTitle!.toLowerCase())
          );

          if (matchingTodo) {
            this.todoManager.completeTodo(matchingTodo.id);
            this.logger?.info('[WorkflowPlugin] TODO completed', { title: matchingTodo.title });
          }
        }
      }
    }
  }

  /** Record progress into turn state and emit workflow:complete when all tasks are done. */
  async afterTurn(context: TurnContext): Promise<void> {
    const progress = this.todoManager.getProgress();

    if (progress.total > 0) {
      this.logger?.debug('[WorkflowPlugin] Progress', {
        completed: progress.completed,
        total: progress.total,
        percent: progress.percentComplete,
      });
    }

    context.state.workflowProgress = progress;

    if (progress.remaining === 0 && progress.total > 0) {
      this.logger?.info('[WorkflowPlugin] All tasks completed');
      this.eventBus?.emit('workflow:complete', { progress });
    }
  }

  /** Disconnect the step pipeline and clear all TODO state. */
  async shutdown(): Promise<void> {
    this.logger?.info('[WorkflowPlugin] Shutting down');
    this.pipelineAdapter.disconnect();
    this.todoManager.clear();
  }

  private injectTodoContext(messages: any[], todoContent: string): void {
    const systemMessageIndex = messages.findIndex(m => m.role === 'system');

    if (systemMessageIndex !== -1) {
      const existingContent = messages[systemMessageIndex].content || '';
      messages[systemMessageIndex].content = existingContent + '\n' + todoContent;
    } else {
      messages.unshift({
        role: 'system',
        content: todoContent
      });
    }
  }

  private findLastAssistantMessage(messages: any[]): any | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        return messages[i];
      }
    }
    return null;
  }

  /** Create a new TODO item with optional priority and tags. */
  addTodo(title: string, options?: {
    description?: string;
    priority?: 'low' | 'medium' | 'high';
    tags?: string[];
  }): TodoItem {
    return this.todoManager.createTodo(title, options);
  }

  /** Mark a TODO item as completed by its identifier. */
  completeTodo(id: string): TodoItem | null {
    return this.todoManager.completeTodo(id);
  }

  getTodos(): TodoItem[] {
    return this.todoManager.getAllTodos();
  }

  getCurrentTodo(): TodoItem | null {
    return this.todoManager.getCurrentTodo();
  }

  getProgress() {
    return this.todoManager.getProgress();
  }

  clearTodos(): void {
    this.todoManager.clear();
  }

  /** Serialize all TODOs and current progress to a JSON string for external consumption. */
  exportTodos(): string {
    return this.formatter.formatJSON(
      this.todoManager.getAllTodos(),
      this.todoManager.getCurrentTodo()
    );
  }

  /** Attach a pre-built graph loop override to control conditional exit/retry logic. */
  setLoopOverride(override: GraphLoopOverride): void {
    this._loopOverride = override;
  }

  /** Build and attach a loop override from a declarative graph definition. */
  setLoopOverrideFromDefinition(def: LoopGraphDefinition): void {
    this._loopOverride = new GraphLoopOverride();
    this._loopOverride.buildFromDefinition(def);
  }

  clearLoopOverride(): void {
    if (this._loopOverride) {
      this._loopOverride.clearGraph();
      this._loopOverride = null;
    }
  }

  getLoopOverride(): GraphLoopOverride | null {
    return this._loopOverride;
  }

  /** Evaluate the loop override graph to determine if the agent loop should terminate early. */
  shouldBreakLoop(state: any): { shouldBreak: boolean; reason?: string } {
    if (!this._loopOverride?.active) {
      return { shouldBreak: false };
    }
    return this._loopOverride.shouldBreak(state);
  }

  /** Run the loop override graph to completion, returning the final traversal state. */
  async executeLoopOverride(initialState: any): Promise<any> {
    if (!this._loopOverride?.active) {
      throw new Error('No loop override is active');
    }
    return this._loopOverride.execute(initialState);
  }

  getStepRegistry(): WorkflowStepRegistry {
    return this.stepRegistry;
  }

  getPipelineAdapter(): StepPipelineAdapter {
    return this.pipelineAdapter;
  }
}
