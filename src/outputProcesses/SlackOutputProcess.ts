import { IToolOutputProcess, ToolResult } from '../interfaces/IToolOutputProcess';
import { TurnContext } from 'iteratio';

export interface SlackConfig {
  channel: string;
  username?: string;
  iconEmoji?: string;
  iconUrl?: string;
  threadTs?: string;
}

/** Sends tool results to a Slack channel. Delegates to an injected Slack client. */
export class SlackOutputProcess extends IToolOutputProcess {
  readonly name = 'slack';

  private config: SlackConfig & { text?: string; blocks?: any[] };
  private client: any;

  constructor(config: SlackConfig & { text?: string; blocks?: any[] }) {
    super();
    this.config = config;
  }

  setClient(client: any): void {
    this.client = client;
  }

  async process(result: ToolResult, context: TurnContext): Promise<void> {
    const text = this.config.text || this.formatResult(result);
    const blocks = this.config.blocks || this.buildBlocks(result);

    if (this.client) {
      try {
        await this.client.postMessage({
          channel: this.config.channel,
          text,
          blocks,
          username: this.config.username,
          icon_emoji: this.config.iconEmoji,
          icon_url: this.config.iconUrl,
          thread_ts: this.config.threadTs
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

    return `\`\`\`\n${JSON.stringify(result.data, null, 2)}\n\`\`\``;
  }

  protected buildBlocks(result: ToolResult): any[] {
    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: this.formatResult(result)
        }
      }
    ];
  }
}
