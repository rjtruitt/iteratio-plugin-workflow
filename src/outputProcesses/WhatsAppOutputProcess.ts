import { IToolOutputProcess, ToolResult } from '../interfaces/IToolOutputProcess';
import { TurnContext } from 'iteratio';

export interface WhatsAppConfig {
  to: string | string[];
  from?: string;
}

/** Sends tool results via WhatsApp. Delegates to an injected WhatsApp client. */
export class WhatsAppOutputProcess extends IToolOutputProcess {
  readonly name = 'whatsapp';

  private config: WhatsAppConfig;
  private client: any;

  constructor(config: WhatsAppConfig) {
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
        await this.client.sendMessage({
          to: this.config.to,
          body,
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
