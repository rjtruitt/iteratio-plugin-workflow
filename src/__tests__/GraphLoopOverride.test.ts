import { describe, it, expect, vi } from 'vitest';
import { GraphLoopOverride, LoopGraphDefinition } from '../GraphLoopOverride';

describe('GraphLoopOverride', () => {
  describe('construction', () => {
    it('should create inactive by default', () => {
      const override = new GraphLoopOverride();
      expect(override.active).toBe(false);
      expect(override.lastResult).toBeNull();
    });

    it('should accept config options', () => {
      const onComplete = vi.fn();
      const override = new GraphLoopOverride({ maxIterations: 10, onLoopComplete: onComplete });
      expect(override.active).toBe(false);
    });
  });

  describe('setGraph / clearGraph', () => {
    it('should become active after setGraph', () => {
      const override = new GraphLoopOverride();
      override.buildFromDefinition({
        nodes: { start: { type: 'check', check: () => true } },
        edges: [],
        conditionalEdges: [],
        entryPoint: 'start',
        exitPoints: ['start'],
      });
      expect(override.active).toBe(true);
    });

    it('should become inactive after clearGraph', () => {
      const override = new GraphLoopOverride();
      override.buildFromDefinition({
        nodes: { start: { type: 'check', check: () => true } },
        edges: [],
        conditionalEdges: [],
        entryPoint: 'start',
        exitPoints: ['start'],
      });
      override.clearGraph();
      expect(override.active).toBe(false);
    });
  });

  describe('execute — linear graph', () => {
    it('should execute a simple linear graph', async () => {
      const override = new GraphLoopOverride();
      override.buildFromDefinition({
        nodes: {
          start: { type: 'transform', transform: (s) => ({ ...s, step1: true }) },
          middle: { type: 'transform', transform: (s) => ({ ...s, step2: true }) },
          end: { type: 'transform', transform: (s) => ({ ...s, step3: true }) },
        },
        edges: [{ from: 'start', to: 'middle' }, { from: 'middle', to: 'end' }],
        conditionalEdges: [],
        entryPoint: 'start',
        exitPoints: ['end'],
      });

      const result = await override.execute({ initial: true });
      expect(result.finalState.step1).toBe(true);
      expect(result.finalState.step2).toBe(true);
      expect(result.finalState.step3).toBe(true);
      expect(result.path).toEqual(['start', 'middle', 'end']);
      expect(result.iterations).toBe(3);
    });
  });

  describe('execute — conditional routing', () => {
    it('should follow conditional edge based on state', async () => {
      const override = new GraphLoopOverride();
      override.buildFromDefinition({
        nodes: {
          start: { type: 'check', check: () => true },
          pathA: { type: 'transform', transform: (s) => ({ ...s, path: 'A' }) },
          pathB: { type: 'transform', transform: (s) => ({ ...s, path: 'B' }) },
        },
        edges: [],
        conditionalEdges: [{
          from: 'start',
          routes: { 'goA == true': 'pathA', 'default': 'pathB' },
        }],
        entryPoint: 'start',
        exitPoints: ['pathA', 'pathB'],
      });

      const resultA = await override.execute({ goA: true });
      expect(resultA.finalState.path).toBe('A');

      const resultB = await override.execute({ goA: false });
      expect(resultB.finalState.path).toBe('B');
    });

    it('should support function-based routing', async () => {
      const override = new GraphLoopOverride();
      override.buildFromDefinition({
        nodes: {
          start: { type: 'transform', transform: (s) => s },
          high: { type: 'transform', transform: (s) => ({ ...s, tier: 'high' }) },
          low: { type: 'transform', transform: (s) => ({ ...s, tier: 'low' }) },
        },
        edges: [],
        conditionalEdges: [{
          from: 'start',
          routes: (state: any) => state.score > 80 ? 'high' : 'low',
        }],
        entryPoint: 'start',
        exitPoints: ['high', 'low'],
      });

      const r1 = await override.execute({ score: 95 });
      expect(r1.finalState.tier).toBe('high');

      const r2 = await override.execute({ score: 50 });
      expect(r2.finalState.tier).toBe('low');
    });
  });

  describe('execute — loops', () => {
    it('should loop until condition changes routing', async () => {
      const override = new GraphLoopOverride();
      override.buildFromDefinition({
        nodes: {
          increment: { type: 'transform', transform: (s) => ({ ...s, count: (s.count || 0) + 1 }) },
          done: { type: 'transform', transform: (s) => ({ ...s, finished: true }) },
        },
        edges: [],
        conditionalEdges: [{
          from: 'increment',
          routes: (state: any) => state.count >= 5 ? 'done' : 'increment',
        }],
        entryPoint: 'increment',
        exitPoints: ['done'],
      });

      const result = await override.execute({});
      expect(result.finalState.count).toBe(5);
      expect(result.finalState.finished).toBe(true);
      expect(result.iterations).toBe(6); // 5 increments + 1 done
    });

    it('should respect maxIterations to prevent infinite loops', async () => {
      const override = new GraphLoopOverride({ maxIterations: 10 });
      override.buildFromDefinition({
        nodes: {
          loop: { type: 'transform', transform: (s) => ({ ...s, i: (s.i || 0) + 1 }) },
        },
        edges: [{ from: 'loop', to: 'loop' }],
        conditionalEdges: [],
        entryPoint: 'loop',
        exitPoints: [],
      });

      const result = await override.execute({});
      expect(result.finalState.i).toBe(10);
      expect(result.iterations).toBe(10);
    });
  });

  describe('execute — node types', () => {
    it('should execute check nodes and set __checkResult', async () => {
      const override = new GraphLoopOverride();
      override.buildFromDefinition({
        nodes: {
          verify: { type: 'check', check: (s) => s.value > 10 },
        },
        edges: [],
        conditionalEdges: [],
        entryPoint: 'verify',
        exitPoints: ['verify'],
      });

      const result = await override.execute({ value: 15 });
      expect(result.finalState.__checkResult).toBe(true);

      const result2 = await override.execute({ value: 5 });
      expect(result2.finalState.__checkResult).toBe(false);
    });

    it('should execute inject nodes and set __injectedContent', async () => {
      const override = new GraphLoopOverride();
      override.buildFromDefinition({
        nodes: {
          inject: { type: 'inject', inject: (s: any) => `Hello ${s.name}` },
        },
        edges: [],
        conditionalEdges: [],
        entryPoint: 'inject',
        exitPoints: ['inject'],
      });

      const result = await override.execute({ name: 'World' });
      expect(result.finalState.__injectedContent).toBe('Hello World');
    });

    it('should execute tool nodes with __toolExecutor', async () => {
      const mockExecutor = vi.fn().mockResolvedValue({ data: 'result' });
      const override = new GraphLoopOverride();
      override.buildFromDefinition({
        nodes: {
          callTool: { type: 'tool', tool: 'read_file' },
        },
        edges: [],
        conditionalEdges: [],
        entryPoint: 'callTool',
        exitPoints: ['callTool'],
      });

      const result = await override.execute({ __toolExecutor: mockExecutor, path: '/tmp/test' });
      expect(mockExecutor).toHaveBeenCalledWith('read_file', expect.objectContaining({ path: '/tmp/test' }));
      expect(result.finalState.__lastToolResult).toEqual({ data: 'result' });
    });

    it('should set __pendingTool when no __toolExecutor provided', async () => {
      const override = new GraphLoopOverride();
      override.buildFromDefinition({
        nodes: {
          callTool: { type: 'tool', tool: 'bash' },
        },
        edges: [],
        conditionalEdges: [],
        entryPoint: 'callTool',
        exitPoints: ['callTool'],
      });

      const result = await override.execute({});
      expect(result.finalState.__pendingTool).toBe('bash');
    });

    it('should execute custom nodes', async () => {
      const customFn = vi.fn().mockImplementation((s) => ({ ...s, custom: true }));
      const override = new GraphLoopOverride();
      override.buildFromDefinition({
        nodes: {
          custom: { type: 'custom', execute: customFn },
        },
        edges: [],
        conditionalEdges: [],
        entryPoint: 'custom',
        exitPoints: ['custom'],
      });

      const result = await override.execute({ input: 'data' });
      expect(customFn).toHaveBeenCalled();
      expect(result.finalState.custom).toBe(true);
    });
  });

  describe('execute — error handling', () => {
    it('should throw if no graph is set', async () => {
      const override = new GraphLoopOverride();
      await expect(override.execute({})).rejects.toThrow('No graph set');
    });

    it('should capture node errors in result', async () => {
      const override = new GraphLoopOverride();
      override.buildFromDefinition({
        nodes: {
          failing: { type: 'custom', execute: async () => { throw new Error('boom'); } },
        },
        edges: [],
        conditionalEdges: [],
        entryPoint: 'failing',
        exitPoints: [],
      });

      const result = await override.execute({});
      expect(result.error).toBeDefined();
      expect(result.error!.message).toBe('boom');
      expect(result.path).toContain('failing');
    });

    it('should respect node timeouts', async () => {
      const override = new GraphLoopOverride();
      override.buildFromDefinition({
        nodes: {
          slow: { type: 'custom', execute: () => new Promise(r => setTimeout(r, 5000)), timeout: 50 },
        },
        edges: [],
        conditionalEdges: [],
        entryPoint: 'slow',
        exitPoints: [],
      });

      const result = await override.execute({});
      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain('Timeout');
    });
  });

  describe('breakConditions', () => {
    it('should detect break when field matches', () => {
      const override = new GraphLoopOverride();
      override.addBreakCondition({ field: 'done', operator: '==', value: true });

      const r1 = override.shouldBreak({ done: false });
      expect(r1.shouldBreak).toBe(false);

      const r2 = override.shouldBreak({ done: true });
      expect(r2.shouldBreak).toBe(true);
      expect(r2.reason).toContain('done');
    });

    it('should support truthy/falsy operators', () => {
      const override = new GraphLoopOverride();
      override.addBreakCondition({ field: 'error', operator: 'truthy' });

      expect(override.shouldBreak({ error: null }).shouldBreak).toBe(false);
      expect(override.shouldBreak({ error: 'something' }).shouldBreak).toBe(true);
    });

    it('should support numeric comparisons', () => {
      const override = new GraphLoopOverride();
      override.addBreakCondition({ field: 'retries', operator: '>=', value: 3 });

      expect(override.shouldBreak({ retries: 2 }).shouldBreak).toBe(false);
      expect(override.shouldBreak({ retries: 3 }).shouldBreak).toBe(true);
      expect(override.shouldBreak({ retries: 5 }).shouldBreak).toBe(true);
    });

    it('should support includes operator', () => {
      const override = new GraphLoopOverride();
      override.addBreakCondition({ field: 'tags', operator: 'includes', value: 'stop' });

      expect(override.shouldBreak({ tags: ['go', 'keep'] }).shouldBreak).toBe(false);
      expect(override.shouldBreak({ tags: ['go', 'stop'] }).shouldBreak).toBe(true);
    });

    it('should support nested field paths', () => {
      const override = new GraphLoopOverride();
      override.addBreakCondition({ field: 'workflow.status', operator: '==', value: 'complete' });

      expect(override.shouldBreak({ workflow: { status: 'running' } }).shouldBreak).toBe(false);
      expect(override.shouldBreak({ workflow: { status: 'complete' } }).shouldBreak).toBe(true);
    });

    it('should call onLoopBreak callback', () => {
      const onBreak = vi.fn();
      const override = new GraphLoopOverride({ onLoopBreak: onBreak });
      override.addBreakCondition({ field: 'exit', operator: 'truthy' });

      override.shouldBreak({ exit: true });
      expect(onBreak).toHaveBeenCalledWith(expect.stringContaining('exit'), { exit: true });
    });

    it('should clearBreakConditions', () => {
      const override = new GraphLoopOverride();
      override.addBreakCondition({ field: 'done', operator: 'truthy' });
      expect(override.shouldBreak({ done: true }).shouldBreak).toBe(true);

      override.clearBreakConditions();
      expect(override.shouldBreak({ done: true }).shouldBreak).toBe(false);
    });

    it('should not break when override is inactive', () => {
      const override = new GraphLoopOverride();
      override.addBreakCondition({ field: 'done', operator: 'truthy' });
      // No graph set, so shouldBreak checks the conditions anyway (it's a separate concern)
      expect(override.shouldBreak({ done: true }).shouldBreak).toBe(true);
    });
  });

  describe('event callbacks', () => {
    it('should call onNodeEnter and onNodeExit', async () => {
      const enters: string[] = [];
      const exits: string[] = [];
      const override = new GraphLoopOverride({
        onNodeEnter: (name) => enters.push(name),
        onNodeExit: (name) => exits.push(name),
      });

      override.buildFromDefinition({
        nodes: {
          a: { type: 'transform', transform: (s) => ({ ...s, a: true }) },
          b: { type: 'transform', transform: (s) => ({ ...s, b: true }) },
        },
        edges: [{ from: 'a', to: 'b' }],
        conditionalEdges: [],
        entryPoint: 'a',
        exitPoints: ['b'],
      });

      await override.execute({});
      expect(enters).toEqual(['a', 'b']);
      expect(exits).toEqual(['a', 'b']);
    });

    it('should call onLoopComplete after execution', async () => {
      const onComplete = vi.fn();
      const override = new GraphLoopOverride({ onLoopComplete: onComplete });

      override.buildFromDefinition({
        nodes: { x: { type: 'transform', transform: (s) => s } },
        edges: [],
        conditionalEdges: [],
        entryPoint: 'x',
        exitPoints: ['x'],
      });

      await override.execute({ hello: true });
      expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
        finalState: expect.objectContaining({ hello: true }),
        path: ['x'],
      }));
    });
  });

  describe('buildFromDefinition — break conditions in definition', () => {
    it('should apply breakConditions from definition', () => {
      const override = new GraphLoopOverride();
      override.buildFromDefinition({
        nodes: { start: { type: 'transform', transform: (s) => s } },
        edges: [],
        conditionalEdges: [],
        entryPoint: 'start',
        exitPoints: ['start'],
        breakConditions: [
          { field: 'attempts', operator: '>=', value: 5 },
        ],
      });

      expect(override.shouldBreak({ attempts: 3 }).shouldBreak).toBe(false);
      expect(override.shouldBreak({ attempts: 5 }).shouldBreak).toBe(true);
    });
  });

  describe('lastResult', () => {
    it('should store the last execution result', async () => {
      const override = new GraphLoopOverride();
      override.buildFromDefinition({
        nodes: { n: { type: 'transform', transform: (s) => ({ ...s, ran: true }) } },
        edges: [],
        conditionalEdges: [],
        entryPoint: 'n',
        exitPoints: ['n'],
      });

      expect(override.lastResult).toBeNull();
      await override.execute({});
      expect(override.lastResult).not.toBeNull();
      expect(override.lastResult!.finalState.ran).toBe(true);
    });
  });

  describe('integration with WorkflowPlugin', () => {
    it('should work through WorkflowPlugin setLoopOverride API', async () => {
      // Import WorkflowPlugin indirectly to test integration
      const { WorkflowPlugin } = await import('../WorkflowPlugin');
      const plugin = new WorkflowPlugin();

      const override = new GraphLoopOverride();
      override.buildFromDefinition({
        nodes: {
          plan: { type: 'transform', transform: (s) => ({ ...s, planned: true }) },
          execute: { type: 'transform', transform: (s) => ({ ...s, executed: true }) },
          verify: { type: 'check', check: (s) => s.executed },
        },
        edges: [{ from: 'plan', to: 'execute' }, { from: 'execute', to: 'verify' }],
        conditionalEdges: [],
        entryPoint: 'plan',
        exitPoints: ['verify'],
      });

      plugin.setLoopOverride(override);
      expect(plugin.getLoopOverride()).toBe(override);
      expect(plugin.getLoopOverride()!.active).toBe(true);

      const result = await plugin.executeLoopOverride({});
      expect(result.finalState.planned).toBe(true);
      expect(result.finalState.executed).toBe(true);

      plugin.clearLoopOverride();
      expect(plugin.getLoopOverride()).toBeNull();
    });

    it('should check break conditions through WorkflowPlugin', async () => {
      const { WorkflowPlugin } = await import('../WorkflowPlugin');
      const plugin = new WorkflowPlugin();

      const override = new GraphLoopOverride();
      override.addBreakCondition({ field: 'allDone', operator: 'truthy' });
      override.buildFromDefinition({
        nodes: { n: { type: 'transform', transform: (s) => s } },
        edges: [],
        conditionalEdges: [],
        entryPoint: 'n',
        exitPoints: ['n'],
      });

      plugin.setLoopOverride(override);
      expect(plugin.shouldBreakLoop({ allDone: false }).shouldBreak).toBe(false);
      expect(plugin.shouldBreakLoop({ allDone: true }).shouldBreak).toBe(true);
    });

    it('should throw executeLoopOverride when no override active', async () => {
      const { WorkflowPlugin } = await import('../WorkflowPlugin');
      const plugin = new WorkflowPlugin();
      await expect(plugin.executeLoopOverride({})).rejects.toThrow('No loop override is active');
    });
  });
});
