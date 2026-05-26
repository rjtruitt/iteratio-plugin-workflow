import { WorkflowStep, WorkflowStepType, StepFrequency, DynamicParameter } from './WorkflowStepRegistry';
import { IToolOutputProcess, OutputProcessConfig } from './interfaces/IToolOutputProcess';
import { TurnContext } from 'iteratio';

/** Fluent builder for constructing WorkflowStep instances. */
/** Builder pattern for constructing workflow steps with fluent configuration. */
export class WorkflowStepBuilder {
  private step: Partial<WorkflowStep> = {
    enabled: true
  };
  private currentTurn?: number;
  private registry?: any;

  constructor() {
    this.step.frequency = { type: 'manual' };
  }

  withId(id: string): this {
    this.step.id = id;
    return this;
  }

  id(id: string): this {
    return this.withId(id);
  }

  withName(name: string): this {
    this.step.name = name;
    return this;
  }

  name(name: string): this {
    return this.withName(name);
  }

  withDescription(description: string): this {
    this.step.description = description;
    return this;
  }

  description(description: string): this {
    return this.withDescription(description);
  }

  ofType(type: WorkflowStepType): this {
    this.step.type = type;
    return this;
  }

  tool(toolName: string): this {
    this.step.type = 'tool';
    this.step.tool = toolName;
    return this;
  }

  withParams(params: Record<string, DynamicParameter>): this {
    this.step.parameters = params;
    return this;
  }

  params(params: Record<string, DynamicParameter>): this {
    return this.withParams(params);
  }

  param(key: string, value: DynamicParameter): this {
    if (!this.step.parameters) {
      this.step.parameters = {};
    }
    this.step.parameters[key] = value;
    return this;
  }

  atPosition(position: number | 'before-llm' | 'after-llm' | 'before-tools' | 'after-tools' | 'end'): this {
    this.step.position = position;
    return this;
  }

  beforeLLM(): this {
    return this.atPosition('before-llm');
  }

  afterLLM(): this {
    return this.atPosition('after-llm');
  }

  beforeTools(): this {
    return this.atPosition('before-tools');
  }

  afterTools(): this {
    return this.atPosition('after-tools');
  }

  atEnd(): this {
    return this.atPosition('end');
  }

  withFrequency(frequency: StepFrequency): this {
    this.step.frequency = frequency;
    return this;
  }

  once(): this {
    this.step.frequency = { type: 'once' };
    return this;
  }

  everyTurn(): this {
    this.step.frequency = { type: 'turn-based', interval: null };
    return this;
  }

  everyNTurns(n: number): this {
    this.step.frequency = { type: 'turn-based', interval: n };
    return this;
  }

  every(n: number): this {
    return this.everyNTurns(n);
  }

  when(condition: (context: TurnContext) => boolean): this {
    this.step.frequency = { type: 'conditional', when: condition };
    return this;
  }

  manual(): this {
    this.step.frequency = { type: 'manual' };
    return this;
  }

  ttl(turns: number): this {
    if (!this.step.frequency) {
      this.step.frequency = { type: 'manual' };
    }
    this.step.frequency.ttlTurns = turns;
    return this;
  }

  maxExecutions(count: number): this {
    if (!this.step.frequency) {
      this.step.frequency = { type: 'manual' };
    }
    this.step.frequency.maxExecutions = count;
    return this;
  }

  startAfterTurn(turn: number): this {
    if (!this.step.frequency) {
      this.step.frequency = { type: 'manual' };
    }
    this.step.frequency.startAfterTurn = turn;
    return this;
  }

  stopAfterTurn(turn: number): this {
    if (!this.step.frequency) {
      this.step.frequency = { type: 'manual' };
    }
    this.step.frequency.stopAfterTurn = turn;
    return this;
  }

  skipIf(condition: (context: TurnContext) => boolean): this {
    if (!this.step.frequency) {
      this.step.frequency = { type: 'manual' };
    }
    this.step.frequency.skipIf = condition;
    return this;
  }

  withOutputProcess(config: OutputProcessConfig): this {
    this.step.outputProcess = config;
    return this;
  }

  outputProcess(process: IToolOutputProcess): this {
    this.step.outputProcess = { process };
    return this;
  }

  outputProcessWhen(
    process: IToolOutputProcess,
    condition: (result: any, context: TurnContext) => boolean
  ): this {
    this.step.outputProcess = { process, condition };
    return this;
  }

  withPrompt(prompt: string | ((context: TurnContext) => string)): this {
    this.step.prompt = prompt;
    return this;
  }

  prompt(prompt: string | ((context: TurnContext) => string)): this {
    return this.withPrompt(prompt);
  }

  injectTool(toolName: string): this {
    this.step.injectTool = toolName;
    return this;
  }

  execute(fn: (context: TurnContext) => Promise<void> | void): this {
    this.step.type = 'custom';
    this.step.execute = fn;
    return this;
  }

  metaAction(action: string, target?: string): this {
    this.step.type = 'meta';
    this.step.action = action;
    this.step.target = target;
    return this;
  }

  forkContext(target?: string): this {
    return this.metaAction('fork-context', target);
  }

  sendToFederation(target: string): this {
    return this.metaAction('send-federation', target);
  }

  duplicateLoop(target?: string): this {
    return this.metaAction('duplicate-loop', target);
  }

  injectContent(content: string | ((context: TurnContext) => string)): this {
    this.step.type = 'inject';
    this.step.content = content;
    return this;
  }

  disabled(): this {
    this.step.enabled = false;
    return this;
  }

  enabled(): this {
    this.step.enabled = true;
    return this;
  }

  /** @internal Called by WorkflowStepRegistry.step() to bind context. */
  _setContext(registry: any, currentTurn?: number): this {
    this.registry = registry;
    this.currentTurn = currentTurn;
    return this;
  }

  build(): WorkflowStep {
    if (!this.step.id) {
      throw new Error('Step ID is required');
    }
    if (!this.step.type) {
      throw new Error('Step type is required');
    }
    if (!this.step.position) {
      throw new Error('Step position is required');
    }
    if (!this.step.frequency) {
      throw new Error('Step frequency is required');
    }

    return this.step as WorkflowStep;
  }

  register(): WorkflowStep {
    const step = this.build();

    if (!this.registry) {
      throw new Error('Cannot register step without registry context. Use registry.step() instead of new WorkflowStepBuilder()');
    }

    this.registry.registerStep(step, this.currentTurn);
    return step;
  }
}
