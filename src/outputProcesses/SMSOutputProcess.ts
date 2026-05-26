import { IToolOutputProcess, ToolResult } from '../interfaces/IToolOutputProcess';
import { TurnContext } from 'iteratio';

export interface SMSConfig {
  to: string | string[];
  from?: string;
  /** SMS character limit. @default 160 */
  maxLength?: number;
}

/** Sends tool results via SMS. Delegates to an injected SMS client. */
export class SMSOutputProcess extends IToolOutputProcess {
  readonly name = 'sms';

  private config: SMSConfig;
  private client: any;

  constructor(config: SMSConfig) {
    super();
    this.config = config;
  }

  setClient(client: any): void {
    this.client = client;
  }

  async process(result: ToolResult, context: TurnContext): Promise<void> {
    const body = this.formatResult(result);
    const truncated = this.truncateMessage(body, this.config.maxLength || 160);

    if (this.client) {
      try {
        await this.client.send({
          to: this.config.to,
          body: truncated,
          from: this.config.from
        });
      } catch { /* silent: error intentionally swallowed per design */
        // Graceful failure — events handle observability
      }
    }
  }

  protected formatResult(result: ToolResult): string {
    if (typeof result.data === 'string') {
      return result.data;
    }

    return JSON.stringify(result.data);
  }

  protected truncateMessage(message: string, maxLength: number): string {
    if (message.length <= maxLength) {
      return message;
    }

    return message.substring(0, maxLength - 3) + '...';
  }
}
