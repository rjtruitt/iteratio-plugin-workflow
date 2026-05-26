/** Result of executing a graph loop, including final state and path taken. */
export interface ExecutionResult {
  finalState: any;
  path: string[];
  error?: Error;
  iterations: number;
}

interface InternalGraphBuilder {
  addNode(name: string, handler: (state: any) => Promise<any>): InternalGraphBuilder;
  addEdge(from: string, to: string): InternalGraphBuilder;
  addConditionalEdge(from: string, router: (state: any) => string): InternalGraphBuilder;
  setEntryPoint(name: string): InternalGraphBuilder;
  setExitPoint(name: string): InternalGraphBuilder;
  setMaxIterations(n: number): InternalGraphBuilder;
  setNodeTimeout(name: string, ms: number): InternalGraphBuilder;
  build(): any;
}

interface InternalGraphExecutor {
  execute(graph: any, initialState: any): Promise<ExecutionResult>;
}

let _createGraphBuilder: (() => InternalGraphBuilder) | null = null;
let _createGraphExecutor: (() => InternalGraphExecutor) | null = null;

function getGraphBuilder(): InternalGraphBuilder {
  if (!_createGraphBuilder) {
    try {
      const mod = require('iteratio-plugin-graph');
      _createGraphBuilder = mod.createGraphBuilder;
      _createGraphExecutor = mod.createGraphExecutor;
    } catch { /* silent: error intentionally swallowed per design */\n      // Silently ignore error -- graph can fall back to default execution\n      console?.debug?.("GraphLoopOverride fallback failed");
      _createGraphBuilder = createInlineGraphBuilder;
      _createGraphExecutor = createInlineGraphExecutor;
    }
  }
  return _createGraphBuilder!();
}

function getGraphExecutor(): InternalGraphExecutor {
  if (!_createGraphExecutor) {
    getGraphBuilder();
  }
  return _createGraphExecutor!();
}

function createInlineGraphBuilder(): InternalGraphBuilder {
  const nodes = new Map<string, { name: string; handler: (state: any) => Promise<any> }>();
  const edges: Array<{ from: string; to: string }> = [];
  const conditionalEdges: Array<{ from: string; router: (state: any) => string }> = [];
  const entryPoints: string[] = [];
  const exitPoints: string[] = [];
  let maxIterations = 100;
  const nodeTimeouts = new Map<string, number>();

  const builder: InternalGraphBuilder = {
    addNode(name, handler) { nodes.set(name, { name, handler }); return builder; },
    addEdge(from, to) { edges.push({ from, to }); return builder; },
    addConditionalEdge(from, router) { conditionalEdges.push({ from, router }); return builder; },
    setEntryPoint(name) { if (!entryPoints.includes(name)) entryPoints.push(name); return builder; },
    setExitPoint(name) { if (!exitPoints.includes(name)) exitPoints.push(name); return builder; },
    setMaxIterations(n) { maxIterations = n; return builder; },
    setNodeTimeout(name, ms) { nodeTimeouts.set(name, ms); return builder; },
    build() {
      return { nodes: new Map(nodes), edges: [...edges], conditionalEdges: [...conditionalEdges], entryPoints: [...entryPoints], exitPoints: [...exitPoints], maxIterations, nodeTimeouts: new Map(nodeTimeouts) };
    },
  };
  return builder;
}

function createInlineGraphExecutor(): InternalGraphExecutor {
  return {
    async execute(graph: any, initialState: any): Promise<ExecutionResult> {
      let state = { ...initialState };
      let iterations = 0;
      const maxIter = graph.maxIterations || 100;
      const path: string[] = [];
      const entryPoint = graph.entryPoints[0];

      const outgoingEdges = new Map<string, string[]>();
      for (const edge of graph.edges) {
        if (!outgoingEdges.has(edge.from)) outgoingEdges.set(edge.from, []);
        outgoingEdges.get(edge.from)!.push(edge.to);
      }

      let current = entryPoint;
      while (current && iterations < maxIter) {
        iterations++;
        const nodeEntry = graph.nodes.get(current);
        if (!nodeEntry) break;

        const timeout = graph.nodeTimeouts?.get(current);
        try {
          if (timeout) {
            state = await Promise.race([
              nodeEntry.handler(state),
              new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`Timeout: ${current} exceeded ${timeout}ms`)), timeout)),
            ]);
          } else {
            state = await nodeEntry.handler(state);
          }
        } catch (err: any) {
          path.push(current);
          return { finalState: state, path, error: err, iterations };
        }
        path.push(current);

        if (graph.exitPoints.includes(current)) break;

        const condEdge = graph.conditionalEdges.find((ce: any) => ce.from === current);
        if (condEdge) {
          const next = condEdge.router(state);
          if (!next || next === '__END__') break;
          current = next;
        } else {
          const out = outgoingEdges.get(current) || [];
          if (out.length === 1) { current = out[0]; }
          else break;
        }
      }

      return { finalState: state, path, iterations };
    },
  };
}

export interface LoopOverrideConfig {
  maxIterations?: number;
  onNodeEnter?: (nodeName: string, state: any) => void;
  onNodeExit?: (nodeName: string, state: any) => void;
  onLoopComplete?: (result: ExecutionResult) => void;
  onLoopBreak?: (reason: string, state: any) => void;
}

export interface LoopBreakCondition {
  field: string;
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'truthy' | 'falsy' | 'includes';
  value?: any;
}

export interface LoopGraphDefinition {
  nodes: Record<string, LoopNodeDef>;
  edges: Array<{ from: string; to: string }>;
  conditionalEdges: Array<{ from: string; routes: Record<string, string> | ((state: any) => string) }>;
  entryPoint: string;
  exitPoints: string[];
  breakConditions?: LoopBreakCondition[];
}

export type LoopNodeType = 'llm' | 'tool' | 'check' | 'transform' | 'inject' | 'custom';

export interface LoopNodeDef {
  type: LoopNodeType;
  tool?: string;
  prompt?: string;
  check?: (state: any) => boolean;
  transform?: (state: any) => any;
  inject?: string | ((state: any) => string);
  execute?: (state: any) => Promise<any>;
  timeout?: number;
}

/**
 * Replaces the linear step pipeline with graph-based execution.
 * Supports conditional exits, retry loops, and dynamic routing based on state.
 */
export class GraphLoopOverride {
  private _graph: any = null;
  private _config: LoopOverrideConfig;
  private _breakConditions: LoopBreakCondition[] = [];
  private _lastResult: ExecutionResult | null = null;
  private _active = false;

  constructor(config: LoopOverrideConfig = {}) {
    this._config = {
      maxIterations: config.maxIterations ?? 50,
      ...config,
    };
  }

  get active(): boolean { return this._active; }
  get lastResult(): ExecutionResult | null { return this._lastResult; }

  setGraph(graph: any): void {
    this._graph = graph;
    this._active = true;
  }

  clearGraph(): void {
    this._graph = null;
    this._active = false;
    this._lastResult = null;
  }

  addBreakCondition(condition: LoopBreakCondition): void {
    this._breakConditions.push(condition);
  }

  clearBreakConditions(): void {
    this._breakConditions = [];
  }

  buildFromDefinition(def: LoopGraphDefinition): void {
    const builder = getGraphBuilder();

    for (const [name, nodeDef] of Object.entries(def.nodes)) {
      builder.addNode(name, this.createNodeHandler(name, nodeDef));
      if (nodeDef.timeout) {
        builder.setNodeTimeout(name, nodeDef.timeout);
      }
    }

    for (const edge of def.edges) {
      builder.addEdge(edge.from, edge.to);
    }

    for (const condEdge of def.conditionalEdges) {
      if (typeof condEdge.routes === 'function') {
        builder.addConditionalEdge(condEdge.from, condEdge.routes);
      } else {
        const routeMap = condEdge.routes;
        builder.addConditionalEdge(condEdge.from, (state: any) => {
          for (const [condition, target] of Object.entries(routeMap)) {
            if (this.evaluateRouteCondition(condition, state)) {
              return target;
            }
          }
          return '__END__';
        });
      }
    }

    builder.setEntryPoint(def.entryPoint);
    for (const exit of def.exitPoints) {
      builder.setExitPoint(exit);
    }
    builder.setMaxIterations(this._config.maxIterations ?? 50);

    if (def.breakConditions) {
      this._breakConditions = [...def.breakConditions];
    }

    this.setGraph(builder.build());
  }

  async execute(initialState: any): Promise<ExecutionResult> {
    if (!this._graph) {
      throw new Error('No graph set — call setGraph() or buildFromDefinition() first');
    }

    const executor = getGraphExecutor();
    const result = await executor.execute(this._graph, initialState);
    this._lastResult = result;
    this._config.onLoopComplete?.(result);
    return result;
  }

  shouldBreak(state: any): { shouldBreak: boolean; reason?: string } {
    for (const cond of this._breakConditions) {
      const value = this.getFieldValue(state, cond.field);
      const matched = this.evaluateCondition(value, cond.operator, cond.value);
      if (matched) {
        const reason = `Break condition met: ${cond.field} ${cond.operator} ${cond.value ?? ''}`;
        this._config.onLoopBreak?.(reason, state);
        return { shouldBreak: true, reason };
      }
    }
    return { shouldBreak: false };
  }

  private createNodeHandler(name: string, def: LoopNodeDef): (state: any) => Promise<any> {
    return async (state: any) => {
      this._config.onNodeEnter?.(name, state);

      let result = state;

      switch (def.type) {
        case 'check':
          if (def.check) {
            result = { ...state, __checkResult: def.check(state) };
          }
          break;

        case 'transform':
          if (def.transform) {
            result = def.transform(state);
          }
          break;

        case 'inject':
          if (def.inject) {
            const content = typeof def.inject === 'function' ? def.inject(state) : def.inject;
            result = { ...state, __injectedContent: content };
          }
          break;

        case 'tool':
          if (state.__toolExecutor && def.tool) {
            const toolResult = await state.__toolExecutor(def.tool, state);
            result = { ...state, __lastToolResult: toolResult };
          } else {
            result = { ...state, __pendingTool: def.tool };
          }
          break;

        case 'llm':
          if (state.__llmExecutor) {
            const llmResult = await state.__llmExecutor(def.prompt || '', state);
            result = { ...state, __lastLLMResult: llmResult };
          } else {
            result = { ...state, __pendingLLM: def.prompt };
          }
          break;

        case 'custom':
          if (def.execute) {
            result = await def.execute(state);
          }
          break;
      }

      this._config.onNodeExit?.(name, result);
      return result;
    };
  }

  private evaluateRouteCondition(condition: string, state: any): boolean {
    if (condition === 'default' || condition === '*') return true;

    const match = condition.match(/^(\S+)\s*(==|!=|>|<|>=|<=)\s*(.+)$/);
    if (!match) {
      return !!this.getFieldValue(state, condition);
    }

    const [, field, op, rawValue] = match;
    const fieldValue = this.getFieldValue(state, field);
    const compareValue = this.parseValue(rawValue.trim());
    return this.evaluateCondition(fieldValue, op as any, compareValue);
  }

  private evaluateCondition(fieldValue: any, operator: string, compareValue?: any): boolean {
    switch (operator) {
      case '==': return fieldValue == compareValue;
      case '!=': return fieldValue != compareValue;
      case '>': return fieldValue > compareValue;
      case '<': return fieldValue < compareValue;
      case '>=': return fieldValue >= compareValue;
      case '<=': return fieldValue <= compareValue;
      case 'truthy': return !!fieldValue;
      case 'falsy': return !fieldValue;
      case 'includes':
        if (Array.isArray(fieldValue)) return fieldValue.includes(compareValue);
        if (typeof fieldValue === 'string') return fieldValue.includes(String(compareValue));
        return false;
      default: return false;
    }
  }

  private getFieldValue(state: any, path: string): any {
    const parts = path.split('.');
    let current = state;
    for (const part of parts) {
      if (current == null) return undefined;
      current = current[part];
    }
    return current;
  }

  private parseValue(raw: string): any {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (raw === 'null') return null;
    if (raw === 'undefined') return undefined;
    if (/^\d+$/.test(raw)) return parseInt(raw, 10);
    if (/^\d+\.\d+$/.test(raw)) return parseFloat(raw);
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      return raw.slice(1, -1);
    }
    return raw;
  }
}
