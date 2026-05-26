import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowStepBuilder } from '../WorkflowStepBuilder';

describe('WorkflowStepBuilder', () => {
  let builder: WorkflowStepBuilder;

  beforeEach(() => {
    builder = new WorkflowStepBuilder();
  });

  describe('fluent chain', () => {
    it('should return this from each method for chaining', () => {
      const result = builder
        .withId('test')
        .tool('MyTool')
        .afterTools()
        .once();
      expect(result).toBe(builder);
    });

    it('should build a complete step with all properties', () => {
      const step = builder
        .withId('complete-step')
        .withName('Complete Step')
        .withDescription('A fully configured step')
        .tool('AnalyzeTool')
        .afterLLM()
        .everyNTurns(5)
        .build();

      expect(step.id).toBe('complete-step');
      expect(step.name).toBe('Complete Step');
      expect(step.description).toBe('A fully configured step');
      expect(step.tool).toBe('AnalyzeTool');
      expect(step.position).toBe('after-llm');
      expect(step.frequency.type).toBe('turn-based');
      expect(step.frequency.interval).toBe(5);
    });
  });

  describe('validation on build', () => {
    it('should throw when id is missing', () => {
      builder.tool('SomeTool').afterTools().once();
      expect(() => builder.build()).toThrow('Step ID is required');
    });

    it('should throw when type is missing', () => {
      builder.withId('no-type').afterTools().once();
      expect(() => builder.build()).toThrow('Step type is required');
    });

    it('should throw when position is missing', () => {
      builder.withId('no-pos').tool('SomeTool').once();
      expect(() => builder.build()).toThrow('Step position is required');
    });

    it('should not throw when all required fields are present', () => {
      builder.withId('valid').tool('Tool').afterTools().once();
      expect(() => builder.build()).not.toThrow();
    });
  });

  describe('set priority / position', () => {
    it('should set position to before-llm', () => {
      const step = builder.withId('x').tool('T').beforeLLM().once().build();
      expect(step.position).toBe('before-llm');
    });

    it('should set position to after-llm', () => {
      const step = builder.withId('x').tool('T').afterLLM().once().build();
      expect(step.position).toBe('after-llm');
    });

    it('should set position to before-tools', () => {
      const step = builder.withId('x').tool('T').beforeTools().once().build();
      expect(step.position).toBe('before-tools');
    });

    it('should set position to after-tools', () => {
      const step = builder.withId('x').tool('T').afterTools().once().build();
      expect(step.position).toBe('after-tools');
    });

    it('should set position to end', () => {
      const step = builder.withId('x').tool('T').atEnd().once().build();
      expect(step.position).toBe('end');
    });

    it('should set numeric position', () => {
      const step = builder.withId('x').tool('T').atPosition(350).once().build();
      expect(step.position).toBe(350);
    });
  });

  describe('set handler function', () => {
    it('should set custom execute function', () => {
      const fn = vi.fn();
      const step = builder.withId('custom').execute(fn).afterTools().once().build();
      expect(step.type).toBe('custom');
      expect(step.execute).toBe(fn);
    });
  });

  describe('frequency configuration', () => {
    it('should configure once frequency', () => {
      const step = builder.withId('x').tool('T').afterTools().once().build();
      expect(step.frequency.type).toBe('once');
    });

    it('should configure every-turn frequency', () => {
      const step = builder.withId('x').tool('T').afterTools().everyTurn().build();
      expect(step.frequency.type).toBe('turn-based');
      expect(step.frequency.interval).toBeNull();
    });

    it('should configure every-N-turns frequency', () => {
      const step = builder.withId('x').tool('T').afterTools().every(7).build();
      expect(step.frequency.type).toBe('turn-based');
      expect(step.frequency.interval).toBe(7);
    });

    it('should configure conditional frequency', () => {
      const condition = (ctx: any) => ctx.state.ready;
      const step = builder.withId('x').tool('T').afterTools().when(condition).build();
      expect(step.frequency.type).toBe('conditional');
      expect(step.frequency.when).toBe(condition);
    });

    it('should set TTL turns', () => {
      const step = builder.withId('x').tool('T').afterTools().once().ttl(3).build();
      expect(step.frequency.ttlTurns).toBe(3);
    });

    it('should set max executions', () => {
      const step = builder.withId('x').tool('T').afterTools().everyTurn().maxExecutions(10).build();
      expect(step.frequency.maxExecutions).toBe(10);
    });
  });

  describe('build returns StepRegistration', () => {
    it('should return a WorkflowStep object', () => {
      const step = builder.withId('built').tool('BuildTool').afterTools().once().build();
      expect(step).toHaveProperty('id', 'built');
      expect(step).toHaveProperty('type', 'tool');
      expect(step).toHaveProperty('position', 'after-tools');
      expect(step).toHaveProperty('frequency');
    });

    it('should throw on register without registry context', () => {
      builder.withId('orphan').tool('T').afterTools().once();
      expect(() => builder.register()).toThrow();
    });
  });
});
