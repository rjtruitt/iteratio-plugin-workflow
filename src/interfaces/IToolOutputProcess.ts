import { TurnContext } from 'iteratio';

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: Error;
  metadata?: Record<string, any>;
}

/** Base class for output processes that pipe tool results to external channels. */
export abstract class IToolOutputProcess {
  abstract readonly name: string;

  timeout: number = 30000;

  setTimeout(ms: number): void {
    this.timeout = ms;
  }

  /** Process a tool result and dispatch to the output channel. */
  abstract process(result: ToolResult, context: TurnContext): Promise<void>;

  /** @returns true if this process should execute for the given result. */
  shouldProcess(result: ToolResult, context: TurnContext): boolean {
    return result.success;
  }

  /** Transform the result before processing. Override for custom transformations. */
  transform(result: ToolResult): ToolResult {
    return result;
  }

  /** Handle errors during processing. Override for custom error handling. */
  async onError(error: Error, result: ToolResult, context: TurnContext): Promise<void> {
    throw error;
  }

  /** Release resources. Override if the process holds connections or handles. */
  async cleanup(): Promise<void> {}
}

export interface OutputProcessConfig {
  process: IToolOutputProcess;
  condition?: (result: ToolResult, context: TurnContext) => boolean;
  transform?: (result: ToolResult) => ToolResult;
  onError?: (error: Error, result: ToolResult, context: TurnContext) => Promise<void>;
}
