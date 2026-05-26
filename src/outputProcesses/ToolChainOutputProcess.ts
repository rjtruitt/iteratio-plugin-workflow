import { IToolOutputProcess, ToolResult } from '../interfaces/IToolOutputProcess';
import { TurnContext } from 'iteratio';

export interface ToolChainConfig {
  tools: string[];
  toolName?: string;
  parameterMapping?: (result: ToolResult) => Record<string, any>;
  transform?: (prev: any) => any;
}

export interface ExecutionLogEntry {
  tool: string;
  input: any;
  output: any;
}

/** Pipes tool results through a chain of tools sequentially. */
export class ToolChainOutputProcess extends IToolOutputProcess {
  readonly name = 'tool-chain';

  private config: ToolChainConfig;
  private executionLog: ExecutionLogEntry[] = [];

  constructor(config: ToolChainConfig) {
    super();
    this.config = config;
  }

  getExecutionLog(): ExecutionLogEntry[] {
    return this.executionLog;
  }

  async process(result: ToolResult, context: TurnContext): Promise<void> {
    this.executionLog = [];
    let currentInput = result.data;

    for (const tool of (this.config.tools || [])) {
      const input = this.config.transform ? this.config.transform(currentInput) : { input: currentInput };
      const output = { data: input, success: true };

      this.executionLog.push({
        tool,
        input,
        output,
      });

      currentInput = output;
    }
  }
}
