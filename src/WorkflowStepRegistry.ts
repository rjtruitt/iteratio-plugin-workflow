import { TurnContext } from 'iteratio';
import { OutputProcessDispatcher } from './OutputProcessDispatcher';
import type {
  WorkflowStepType,
  StepFrequency,
  DynamicParameter,
  ConditionalParameter,
  ToolOutputProcess,
  WorkflowStep
} from './WorkflowStepTypes';

// Re-export all types so existing consumers continue to work
export type {
  WorkflowStepType,
  StepFrequency,
  DynamicParameter,
  ConditionalParameter,
  ToolOutputProcess,
  WorkflowStep
} from './WorkflowStepTypes';

/** Manages workflow step lifecycle, execution gating, and output dispatching. */
/** Registry for storing, querying, and scheduling workflow steps by type and frequency. */
export class WorkflowStepRegistry {
  private steps = new Map<string, WorkflowStep>();
  private executionCounts = new Map<string, number>();
  private currentTurn: number = 0;
  private listeners = new Map<string, Set<(...args: any[]) => void>>();
  private connectedLoops = new Map<string, { pause: (...args: any[]) => void; resume?: (...args: any[]) => void; stepIds?: string[] }>();
  private outputDispatcher: OutputProcessDispatcher;
  private static readonly MAX_STEPS = 1000;
  private static readonly MAX_ID_LENGTH = 256;

  constructor() {
    this.outputDispatcher = new OutputProcessDispatcher(
      (event, data) => this.emit(event, data)
    );
  }

  on(event: string, handler: (...args: any[]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  private emit(event: string, data: any): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(data);
      }
    }
  }

  connectLoop(loopId: string, pause: (...args: any[]) => void, resumeOrStepIds?: ((...args: any[]) => void) | string[], stepIds?: string[]): void {
    if (Array.isArray(resumeOrStepIds)) {
      this.connectedLoops.set(loopId, { pause, stepIds: resumeOrStepIds });
    } else {
      this.connectedLoops.set(loopId, { pause, resume: resumeOrStepIds, stepIds });
    }
  }

  setCurrentTurn(turn: number): void {
    this.currentTurn = turn;
  }

  /** Fluent builder API for constructing steps inline. */
  step(): any {
    const builder = {
      _step: {} as any,
      _registry: this,

      withId: function(id: string) { this._step.id = id; return this; },
      id: function(id: string) { return this.withId(id); },

      tool: function(name: string) {
        this._step.type = 'tool';
        this._step.tool = name;
        return this;
      },

      afterTools: function() { this._step.position = 'after-tools'; return this; },
      beforeLLM: function() { this._step.position = 'before-llm'; return this; },
      afterLLM: function() { this._step.position = 'after-llm'; return this; },
      atEnd: function() { this._step.position = 'end'; return this; },

      once: function() { this._step.frequency = { type: 'once' }; return this; },
      everyTurn: function() { this._step.frequency = { type: 'turn-based', interval: null }; return this; },
      every: function(n: number) { this._step.frequency = { type: 'turn-based', interval: n }; return this; },
      when: function(fn: any) { this._step.frequency = { type: 'conditional', when: fn }; return this; },

      ttl: function(turns: number) {
        if (!this._step.frequency) this._step.frequency = {};
        this._step.frequency.ttlTurns = turns;
        return this;
      },

      outputProcess: function(process: any) {
        this._step.outputProcess = { process };
        return this;
      },

      params: function(params: any) { this._step.parameters = params; return this; },
      param: function(key: string, value: any) {
        if (!this._step.parameters) this._step.parameters = {};
        this._step.parameters[key] = value;
        return this;
      },

      prompt: function(text: any) { this._step.prompt = text; return this; },
      injectTool: function(name: string) { this._step.injectTool = name; return this; },

      register: function() {
        this._registry.registerStep(this._step, this._registry.currentTurn);
        return this._step;
      }
    };

    return builder;
  }

  registerStep(step: WorkflowStep, currentTurn?: number): void {
    if (step.id && step.id.length > WorkflowStepRegistry.MAX_ID_LENGTH) {
      throw new Error(`Step ID exceeds maximum length of ${WorkflowStepRegistry.MAX_ID_LENGTH} characters`);
    }

    if (!this.steps.has(step.id) && this.steps.size >= WorkflowStepRegistry.MAX_STEPS) {
      return;
    }

    const isUpdate = this.steps.has(step.id);

    if (currentTurn !== undefined) {
      step._createdTurn = currentTurn;
    }

    this.steps.set(step.id, step);
    this.executionCounts.set(step.id, 0);

    this.emit('step:registered', step);

    if (isUpdate) {
      for (const [, loop] of this.connectedLoops) {
        if (!loop.stepIds || loop.stepIds.includes(step.id)) {
          loop.pause();
        }
      }
    }

    for (const [, loop] of this.connectedLoops) {
      if (loop.resume) {
        loop.resume();
      }
    }
  }

  unregisterStep(stepId: string): void {
    this.steps.delete(stepId);
    this.executionCounts.delete(stepId);
    this.emit('step:removed', stepId);
  }

  getSteps(): WorkflowStep[] {
    return Array.from(this.steps.values());
  }

  shouldExecute(stepId: string, context: TurnContext): boolean {
    const step = this.steps.get(stepId);
    if (!step || step.enabled === false) return false;

    const execCount = this.executionCounts.get(stepId) || 0;
    const freq = step.frequency;

    if (freq.ttlTurns !== undefined && step._createdTurn !== undefined) {
      const turnsAlive = context.turnNumber - step._createdTurn;
      if (turnsAlive > freq.ttlTurns) {
        this.unregisterStep(stepId);
        return false;
      }
    }

    if (freq.maxExecutions && execCount >= freq.maxExecutions) {
      return false;
    }

    if (freq.startAfterTurn && context.turnNumber < freq.startAfterTurn) {
      return false;
    }
    if (freq.stopAfterTurn && context.turnNumber > freq.stopAfterTurn) {
      return false;
    }

    if (freq.skipIf && freq.skipIf(context)) {
      return false;
    }

    switch (freq.type) {
      case 'once':
        if (execCount > 0) {
          this.unregisterStep(stepId);
          return false;
        }
        return true;

      case 'turn-based':
        if (!freq.interval) return true;
        return context.turnNumber % freq.interval === 0;

      case 'token-based':
        return false;

      case 'conditional':
        if (!freq.when) return false;
        try {
          const condStart = performance.now();
          const condResult = freq.when(context);
          const condElapsed = performance.now() - condStart;
          // Abort if condition evaluation is unreasonably slow
          if (condElapsed > 50) {
            return false;
          }
          return condResult;
        } catch { /* silent: error intentionally swallowed per design */
          return false;
        }

      case 'manual':
        return false;

      default:
        return false;
    }
  }

  resolveParameters(
    params: Record<string, DynamicParameter>,
    context: TurnContext
  ): Record<string, any> {
    const resolved: Record<string, any> = {};

    for (const [key, param] of Object.entries(params)) {
      resolved[key] = this.resolveParameter(param, context);
    }

    return resolved;
  }

  private resolveParameter(param: DynamicParameter, context: TurnContext): any {
    if (typeof param === 'function') {
      return param(context);
    }

    if (param && typeof param === 'object' && 'when' in param) {
      const cond = param as ConditionalParameter;
      return cond.when(context) ? cond.value : cond.else;
    }

    if (typeof param === 'string' && param.includes('${')) {
      return this.resolveTemplate(param, context);
    }

    return param;
  }

  private resolveTemplate(template: string, context: TurnContext): any {
    const match = template.match(/\$\{([^}]+)\}/);
    if (!match) return template;

    const path = match[1];
    return this.getValueByPath(context, path);
  }

  private getValueByPath(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current == null) return undefined;
      current = current[part];
    }

    return current;
  }

  async executeStep(stepId: string, context: TurnContext): Promise<void> {
    const step = this.steps.get(stepId);
    if (!step) throw new Error(`Step not found: ${stepId}`);

    const count = this.executionCounts.get(stepId) || 0;
    this.executionCounts.set(stepId, count + 1);

    switch (step.type) {
      case 'tool':
        await this.executeTool(step, context);
        break;

      case 'checkpoint':
        break;

      case 'inject':
        break;

      case 'meta':
        break;

      case 'custom':
        if (step.execute) {
          await step.execute(context);
        }
        break;
    }
  }

  private async executeTool(step: WorkflowStep, context: TurnContext): Promise<void> {
    if (!step.tool) throw new Error('Tool name not specified');

    const params = step.parameters
      ? this.resolveParameters(step.parameters, context)
      : {};

    this.emit('step:tool:execute', { tool: step.tool, params });

    const result = undefined;

    if (step.outputProcess && 'type' in step.outputProcess && result !== undefined) {
      await this.outputDispatcher.dispatch(
        step.outputProcess as ToolOutputProcess,
        result,
        context
      );
    }
  }

  async triggerStep(stepId: string, context: TurnContext): Promise<void> {
    await this.executeStep(stepId, context);
  }

  validateDependencies(): void {
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const visit = (stepId: string): void => {
      if (inStack.has(stepId)) {
        throw new Error(`Circular dependency detected involving step: ${stepId}`);
      }
      if (visited.has(stepId)) return;

      inStack.add(stepId);
      visited.add(stepId);

      const step = this.steps.get(stepId) as any;
      if (step?.dependencies) {
        for (const dep of step.dependencies) {
          visit(dep);
        }
      }

      inStack.delete(stepId);
    };

    for (const stepId of this.steps.keys()) {
      visit(stepId);
    }
  }
}
