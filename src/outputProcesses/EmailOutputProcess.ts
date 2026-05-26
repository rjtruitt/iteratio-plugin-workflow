import { IToolOutputProcess, ToolResult } from '../interfaces/IToolOutputProcess';
import { TurnContext } from 'iteratio';

export interface EmailConfig {
  to: string | string[];
  subject: string;
  from?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
}

/** Sends tool results via email. Delegates to an injected email client. */
export class EmailOutputProcess extends IToolOutputProcess {
  readonly name = 'email';

  private config: EmailConfig;
  private client: any;

  constructor(config: EmailConfig) {
    super();
    this.config = config;
  }

  setClient(client: any): void {
    this.client = client;
  }

  async process(result: ToolResult, context: TurnContext): Promise<void> {
    const body = this.formatResult(result);

    if (this.client) {
      try {
        await this.client.send({
          to: this.config.to,
          subject: this.config.subject,
          body,
          from: this.config.from,
          cc: this.config.cc,
          bcc: this.config.bcc,
          replyTo: this.config.replyTo
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

    return JSON.stringify(result.data, null, 2);
  }
}
