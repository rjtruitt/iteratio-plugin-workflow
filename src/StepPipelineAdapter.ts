import type { IStep, StepContext, StepRegistration } from 'iteratio';
import type { WorkflowStep, WorkflowStepRegistry } from './WorkflowStepRegistry';

const POSITION_PRIORITY: Record<string, number> = {
  'before-llm': 150,
  'after-llm': 250,
  'before-tools': 280,
  'after-tools': 450,
  'end': 900,
};

function resolvePriority(position: WorkflowStep['position']): number {
  if (typeof position === 'number') return position;
  return POSITION_PRIORITY[position] ?? 500;
}

function stepContextToTurnContext(ctx: StepContext): any {
  return {
    turnNumber: ctx.turnNumber,
    turnCount: ctx.turnNumber,
    messages: ctx.messages,
    state: ctx.state,
    metadata: ctx.metadata,
  };
}

/** Adapts a WorkflowStep into an IStep for the iteratio StepPipeline. */
export class WorkflowStepIStep implements IStep {
  readonly name: string;
  readonly description: string;
  readonly priority: number;

  constructor(
    private workflowStep: WorkflowStep,
    private registry: WorkflowStepRegistry
  ) {
    this.name = `workflow:${workflowStep.id}`;
    this.description = workflowStep.description || `Workflow step: ${workflowStep.id}`;
    this.priority = resolvePriority(workflowStep.position);
  }

  shouldExecute(context: StepContext): boolean {
    const turnCtx = stepContextToTurnContext(context);
    return this.registry.shouldExecute(this.workflowStep.id, turnCtx);
  }

  async execute(context: StepContext): Promise<StepContext> {
    const turnCtx = stepContextToTurnContext(context);
    await this.registry.executeStep(this.workflowStep.id, turnCtx);
    context.state = turnCtx.state;
    return context;
  }
}

export interface StepPipelineAdapterConfig {
  autoSync?: boolean;
}

/** Bridges WorkflowStepRegistry into iteratio's StepPipeline with automatic sync. */
/** Adapts workflow steps into an IStep pipeline for sequential execution with context sharing. */
export class StepPipelineAdapter {
  private registeredNames = new Set<string>();
  private pipeline: any;
  private registry: WorkflowStepRegistry;

  constructor(registry: WorkflowStepRegistry, config?: StepPipelineAdapterConfig) {
    this.registry = registry;

    if (config?.autoSync !== false) {
      this.registry.on('step:registered', (step: WorkflowStep) => {
        if (this.pipeline) {
          this.syncStep(step);
        }
      });
    }
  }

  connect(pipeline: any): void {
    this.pipeline = pipeline;
    this.syncAll();
  }

  disconnect(): void {
    Array.from(this.registeredNames).forEach(name => {
      this.pipeline?.removeStep(name);
    });
    this.registeredNames.clear();
    this.pipeline = null;
  }

  syncAll(): void {
    if (!this.pipeline) return;

    for (const step of this.registry.getSteps()) {
      this.syncStep(step);
    }
  }

  syncStep(workflowStep: WorkflowStep): void {
    if (!this.pipeline) return;

    const adapted = new WorkflowStepIStep(workflowStep, this.registry);
    const name = adapted.name;

    if (this.registeredNames.has(name)) {
      this.pipeline.removeStep(name);
    }

    const registration: StepRegistration = {
      step: adapted,
      onError: 'continue',
    };

    this.pipeline.registerStep(registration);
    this.registeredNames.add(name);
  }

  removeStep(stepId: string): void {
    const name = `workflow:${stepId}`;
    if (this.registeredNames.has(name)) {
      this.pipeline?.removeStep(name);
      this.registeredNames.delete(name);
    }
  }

  getRegisteredCount(): number {
    return this.registeredNames.size;
  }
}
