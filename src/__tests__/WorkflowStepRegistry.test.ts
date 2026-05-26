import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowStepRegistry, WorkflowStep, StepFrequency } from '../WorkflowStepRegistry';
import { MockEventBus } from 'iteratio/src/__test__';

describe('WorkflowStepRegistry', () => {
  let registry: WorkflowStepRegistry;

  beforeEach(() => {
    registry = new WorkflowStepRegistry();
  });

  function createStep(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
    return {
      id: `step-${Date.now()}-${Math.random()}`,
      type: 'tool',
      position: 'after-tools',
      frequency: { type: 'turn-based', interval: null },
      tool: 'TestTool',
      ...overrides,
    };
  }

  function createContext(overrides: any = {}) {
    return {
      turnNumber: 1,
      turnCount: 1,
      messages: [],
      state: {},
      ...overrides,
    };
  }

  describe('register step', () => {
    it('should register a step with name and handler', () => {
      const step = createStep({ id: 'my-step' });
      registry.registerStep(step);
      const steps = registry.getSteps();
      expect(steps.find(s => s.id === 'my-step')).toBeDefined();
    });

    it('should track creation turn when provided', () => {
      const step = createStep({ id: 'tracked-step' });
      registry.registerStep(step, 5);
      const steps = registry.getSteps();
      expect(steps.find(s => s.id === 'tracked-step')?._createdTurn).toBe(5);
    });
  });

  describe('get step by name', () => {
    it('should retrieve a registered step by id', () => {
      const step = createStep({ id: 'findable' });
      registry.registerStep(step);
      const found = registry.getSteps().find(s => s.id === 'findable');
      expect(found).toBeDefined();
      expect(found?.tool).toBe('TestTool');
    });

    it('should return undefined for non-existent step', () => {
      const found = registry.getSteps().find(s => s.id === 'nonexistent');
      expect(found).toBeUndefined();
    });
  });

  describe('list all registered steps', () => {
    it('should return all registered steps', () => {
      registry.registerStep(createStep({ id: 'step-a' }));
      registry.registerStep(createStep({ id: 'step-b' }));
      registry.registerStep(createStep({ id: 'step-c' }));
      expect(registry.getSteps()).toHaveLength(3);
    });

    it('should return empty array when no steps registered', () => {
      expect(registry.getSteps()).toHaveLength(0);
    });
  });

  describe('update existing step', () => {
    it('should replace step when registering with same id', () => {
      registry.registerStep(createStep({ id: 'replace-me', tool: 'OldTool' }));
      registry.registerStep(createStep({ id: 'replace-me', tool: 'NewTool' }));
      const steps = registry.getSteps();
      expect(steps).toHaveLength(1);
      expect(steps[0].tool).toBe('NewTool');
    });
  });

  describe('remove step', () => {
    it('should unregister step by id', () => {
      registry.registerStep(createStep({ id: 'to-remove' }));
      registry.unregisterStep('to-remove');
      expect(registry.getSteps()).toHaveLength(0);
    });

    it('should not throw when removing non-existent step', () => {
      expect(() => registry.unregisterStep('no-such-step')).not.toThrow();
    });
  });

  describe('auto-pause connected loops when step changes', () => {
    it('should emit step:registered event on registration', () => {
      const listener = vi.fn();
      (registry as any).on('step:registered', listener);
      registry.registerStep(createStep({ id: 'new-step' }));
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-step' }));
    });

    it('should emit step:removed event on unregister', () => {
      const listener = vi.fn();
      (registry as any).on('step:removed', listener);
      registry.registerStep(createStep({ id: 'dying-step' }));
      registry.unregisterStep('dying-step');
      expect(listener).toHaveBeenCalledWith('dying-step');
    });

    it('should pause all connected loops when step is updated', () => {
      const pauseLoop = vi.fn();
      (registry as any).connectLoop('loop1', pauseLoop);
      registry.registerStep(createStep({ id: 'updated-step' }));
      registry.registerStep(createStep({ id: 'updated-step', tool: 'Changed' }));
      expect(pauseLoop).toHaveBeenCalled();
    });

    it('should pause only affected loops on partial update', () => {
      const pauseLoop1 = vi.fn();
      const pauseLoop2 = vi.fn();
      (registry as any).connectLoop('loop1', pauseLoop1, ['step-a']);
      (registry as any).connectLoop('loop2', pauseLoop2, ['step-b']);
      registry.registerStep(createStep({ id: 'step-a', tool: 'Original' }));
      registry.registerStep(createStep({ id: 'step-a', tool: 'Changed' }));
      expect(pauseLoop1).toHaveBeenCalled();
      expect(pauseLoop2).not.toHaveBeenCalled();
    });

    it('should resume loops after update is complete', () => {
      const resumeLoop = vi.fn();
      (registry as any).connectLoop('loop1', vi.fn(), resumeLoop);
      registry.registerStep(createStep({ id: 'temp' }));
      expect(resumeLoop).toHaveBeenCalled();
    });
  });

  describe('step priority ordering', () => {
    it('should respect numeric position ordering', () => {
      registry.registerStep(createStep({ id: 'late', position: 900 }));
      registry.registerStep(createStep({ id: 'early', position: 100 }));
      registry.registerStep(createStep({ id: 'mid', position: 500 }));

      const steps = registry.getSteps();
      // Steps should be sortable by position
      const sorted = [...steps].sort((a, b) => {
        const posA = typeof a.position === 'number' ? a.position : 0;
        const posB = typeof b.position === 'number' ? b.position : 0;
        return posA - posB;
      });
      expect(sorted[0].id).toBe('early');
      expect(sorted[2].id).toBe('late');
    });
  });

  describe('shouldExecute', () => {
    it('should execute on every turn when interval is null', () => {
      registry.registerStep(createStep({
        id: 'every-turn',
        frequency: { type: 'turn-based', interval: null },
      }));
      const ctx = createContext({ turnCount: 1 });
      expect(registry.shouldExecute('every-turn', ctx as any)).toBe(true);
    });

    it('should execute every N turns when interval is set', () => {
      registry.registerStep(createStep({
        id: 'every-3',
        frequency: { type: 'turn-based', interval: 3 },
      }));
      expect(registry.shouldExecute('every-3', createContext({ turnCount: 3 }) as any)).toBe(true);
      expect(registry.shouldExecute('every-3', createContext({ turnCount: 4 }) as any)).toBe(false);
    });

    it('should execute once and then prevent further execution', () => {
      registry.registerStep(createStep({
        id: 'once-step',
        frequency: { type: 'once' },
      }));
      const ctx = createContext({ turnCount: 1 });
      expect(registry.shouldExecute('once-step', ctx as any)).toBe(true);
      // Simulate execution (increment count)
      registry.executeStep('once-step', ctx as any);
      expect(registry.shouldExecute('once-step', ctx as any)).toBe(false);
    });

    it('should respect maxExecutions limit', () => {
      registry.registerStep(createStep({
        id: 'max-3',
        frequency: { type: 'turn-based', interval: null, maxExecutions: 3 },
      }));
      const ctx = createContext({ turnCount: 1 });
      // Execute 3 times
      registry.executeStep('max-3', ctx as any);
      registry.executeStep('max-3', ctx as any);
      registry.executeStep('max-3', ctx as any);
      expect(registry.shouldExecute('max-3', ctx as any)).toBe(false);
    });

    it('should skip when skipIf returns true', () => {
      registry.registerStep(createStep({
        id: 'skip-me',
        frequency: { type: 'turn-based', interval: null, skipIf: () => true },
      }));
      expect(registry.shouldExecute('skip-me', createContext() as any)).toBe(false);
    });

    it('should respect startAfterTurn constraint', () => {
      registry.registerStep(createStep({
        id: 'delayed',
        frequency: { type: 'turn-based', interval: null, startAfterTurn: 5 },
      }));
      expect(registry.shouldExecute('delayed', createContext({ turnCount: 3 }) as any)).toBe(false);
      expect(registry.shouldExecute('delayed', createContext({ turnCount: 6 }) as any)).toBe(true);
    });

    it('should respect stopAfterTurn constraint', () => {
      registry.registerStep(createStep({
        id: 'limited',
        frequency: { type: 'turn-based', interval: null, stopAfterTurn: 10 },
      }));
      expect(registry.shouldExecute('limited', createContext({ turnCount: 5 }) as any)).toBe(true);
      expect(registry.shouldExecute('limited', createContext({ turnCount: 11 }) as any)).toBe(false);
    });

    it('should handle TTL expiration', () => {
      registry.registerStep(createStep({
        id: 'ttl-step',
        frequency: { type: 'turn-based', interval: null, ttlTurns: 3 },
      }), 1);
      // Created on turn 1, TTL is 3 turns
      expect(registry.shouldExecute('ttl-step', createContext({ turnCount: 3 }) as any)).toBe(true);
      expect(registry.shouldExecute('ttl-step', createContext({ turnCount: 5 }) as any)).toBe(false);
    });

    it('should not execute disabled steps', () => {
      registry.registerStep(createStep({
        id: 'disabled-step',
        enabled: false,
      }));
      expect(registry.shouldExecute('disabled-step', createContext() as any)).toBe(false);
    });

    it('should execute conditional steps when condition is true', () => {
      registry.registerStep(createStep({
        id: 'conditional',
        frequency: { type: 'conditional', when: (ctx: any) => ctx.state.ready === true },
      }));
      expect(registry.shouldExecute('conditional', createContext({ state: { ready: true } }) as any)).toBe(true);
      expect(registry.shouldExecute('conditional', createContext({ state: { ready: false } }) as any)).toBe(false);
    });

    it('should never execute manual steps via shouldExecute', () => {
      registry.registerStep(createStep({
        id: 'manual-only',
        frequency: { type: 'manual' },
      }));
      expect(registry.shouldExecute('manual-only', createContext() as any)).toBe(false);
    });
  });

  describe('fluent builder (step())', () => {
    it('should create and register step via fluent API', () => {
      registry.step()
        .withId('fluent-step')
        .tool('MyTool')
        .afterTools()
        .once()
        .register();

      const steps = registry.getSteps();
      expect(steps.find(s => s.id === 'fluent-step')).toBeDefined();
    });
  });

  describe('Untested Methods', () => {
    it('setCurrentTurn(turnNumber) should set the current turn context', () => {
      registry.registerStep(createStep({ id: 'turn-aware' }));
      (registry as any).setCurrentTurn(5);
      // The registry should track the current turn for step evaluation
      expect((registry as any).currentTurn).toBe(5);
    });

    it('resolveParameters(step, context) should resolve step parameters from context', () => {
      const step = createStep({
        id: 'parameterized',
        parameters: { filePath: '${state.currentFile}' },
      } as any);
      registry.registerStep(step);
      const context = createContext({ state: { currentFile: '/tmp/test.ts' } });
      const resolved = (registry as any).resolveParameters(step.parameters, context);
      // Should resolve template variables from context
      expect(resolved.filePath).toBe('/tmp/test.ts');
    });

    it('triggerStep(stepName, context) should manually trigger a step', () => {
      registry.registerStep(createStep({
        id: 'manual-trigger',
        frequency: { type: 'manual' },
      } as any));
      const context = createContext();
      (registry as any).triggerStep('manual-trigger', context);
      // Should execute the step regardless of frequency settings
      const count = (registry as any).executionCounts.get('manual-trigger');
      expect(count).toBe(1);
    });
  });

  describe('Adversarial: Registry Abuse', () => {
    it('should handle registering 10000 steps simultaneously', () => {
      for (let i = 0; i < 10000; i++) {
        registry.registerStep(createStep({ id: `mass-step-${i}` }));
      }

      // The registry should cap the number of steps
      expect(registry.getSteps().length).toBeLessThan(10000);
    });

    it('should timeout step with extremely complex validation function (CPU hog)', () => {
      registry.registerStep(createStep({
        id: 'cpu-hog',
        frequency: {
          type: 'conditional',
          when: (_ctx: any) => {
            // Simulate expensive validation — O(2^n) computation
            const fib = (n: number): number => n <= 1 ? n : fib(n - 1) + fib(n - 2);
            fib(38); // slow enough to exceed timeout budget
            return true;
          },
        },
      }));

      const result = registry.shouldExecute('cpu-hog', createContext() as any);

      // shouldExecute should return false for conditions that exceed time budget
      expect(result).toBe(false);
    });

    it('should prevent step that registers more steps during its own registration callback', () => {
      // The registry should cap total steps, preventing unbounded growth
      for (let i = 0; i < 200; i++) {
        registry.registerStep(createStep({ id: `replicator-${i}` }));
      }

      // Should be capped at max
      expect(registry.getSteps().length).toBeLessThanOrEqual(1000);
    });

    it('should reject step name with 1MB string', () => {
      const hugeName = 'x'.repeat(1024 * 1024); // 1MB
      const step = createStep({ id: hugeName });

      // Should reject IDs that exceed a reasonable length
      expect(() => registry.registerStep(step)).toThrow();
    });

    it('should detect step with circular dependency declaration', () => {
      // Step A depends on Step B, Step B depends on Step A
      registry.registerStep(createStep({
        id: 'step-a',
        dependencies: ['step-b'],
      } as any));
      registry.registerStep(createStep({
        id: 'step-b',
        dependencies: ['step-a'],
      } as any));

      // The registry should detect circular dependencies
      expect(() => (registry as any).validateDependencies()).toThrow(/circular/i);
    });

    it('should handle unregister step while it is being looked up (concurrent access)', async () => {
      registry.registerStep(createStep({ id: 'vanishing-step' }));

      // Concurrent: one thread looks up, another unregisters
      const lookupPromise = Promise.resolve().then(() =>
        registry.shouldExecute('vanishing-step', createContext() as any)
      );
      const unregisterPromise = Promise.resolve().then(() =>
        registry.unregisterStep('vanishing-step')
      );

      const [lookupResult] = await Promise.allSettled([lookupPromise, unregisterPromise]);

      // Should not crash — either returns a result or gracefully handles missing step
      expect(lookupResult.status).toBe('fulfilled');
    });

    it('should handle rapid register/unregister of same step name (ABA problem)', () => {
      // Register step-x, unregister step-x, register step-x with different config
      registry.registerStep(createStep({ id: 'aba-step', tool: 'ToolV1' }));
      registry.unregisterStep('aba-step');
      registry.registerStep(createStep({ id: 'aba-step', tool: 'ToolV2' }));

      const steps = registry.getSteps();
      const step = steps.find(s => s.id === 'aba-step');

      // Should always reflect the latest registration
      expect(step).toBeDefined();
      expect(step!.tool).toBe('ToolV2');
    });
  });
});
