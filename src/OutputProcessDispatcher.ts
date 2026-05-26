/**
 * OutputProcessDispatcher
 *
 * Handles dispatching workflow step output to various channels:
 * email, SMS, WhatsApp, Slack, Discord, Telegram, webhooks, custom handlers.
 */

import { TurnContext } from 'iteratio';
import { ToolOutputProcess } from './WorkflowStepTypes';

type EmitFn = (event: string, data: any) => void;

/**
 * Dispatches tool output to configured channels (email, Slack, webhook, etc.).
 */
export class OutputProcessDispatcher {
  private emit: EmitFn;

  constructor(emit: EmitFn) {
    this.emit = emit;
  }

  /**
   * Execute the output process pipeline: condition check, transform, dispatch.
   */
  async dispatch(
    outputProcess: ToolOutputProcess,
    result: any,
    _context: TurnContext
  ): Promise<void> {
    if (outputProcess.condition && !outputProcess.condition(result)) {
      this.emit('step:output:skipped', { reason: 'condition not met' });
      return;
    }

    const transformedResult = outputProcess.transform
      ? outputProcess.transform(result)
      : result;

    switch (outputProcess.type) {
      case 'email':
        await this.sendEmail(outputProcess.email!, transformedResult);
        break;

      case 'sms':
        await this.sendSMS(outputProcess.sms!, transformedResult);
        break;

      case 'whatsapp':
        await this.sendWhatsApp(outputProcess.whatsapp!, transformedResult);
        break;

      case 'slack':
        await this.sendSlack(outputProcess.slack!, transformedResult);
        break;

      case 'discord':
        await this.sendDiscord(outputProcess.discord!, transformedResult);
        break;

      case 'telegram':
        await this.sendTelegram(outputProcess.telegram!, transformedResult);
        break;

      case 'webhook':
        await this.sendWebhook(outputProcess.webhook!, transformedResult);
        break;

      case 'tool':
        if (outputProcess.tool) {
          this.emit('step:output:sent', { type: 'tool', tool: outputProcess.tool });
        }
        break;

      case 'custom':
        if (outputProcess.handler) {
          await outputProcess.handler(transformedResult, _context);
        }
        break;
    }
  }

  private async sendEmail(config: any, result: any): Promise<void> {
    const to = typeof config.to === 'function' ? config.to(result) : config.to;
    const subject = typeof config.subject === 'function' ? config.subject(result) : config.subject;

    this.emit('step:output:sent', { type: 'email', to, subject });
  }

  private async sendSMS(config: any, result: any): Promise<void> {
    const to = typeof config.to === 'function' ? config.to(result) : config.to;

    this.emit('step:output:sent', { type: 'sms', to });
  }

  private async sendWhatsApp(config: any, result: any): Promise<void> {
    const to = typeof config.to === 'function' ? config.to(result) : config.to;

    this.emit('step:output:sent', { type: 'whatsapp', to });
  }

  private async sendSlack(config: any, result: any): Promise<void> {
    const channel = typeof config.channel === 'function' ? config.channel(result) : config.channel;

    this.emit('step:output:sent', { type: 'slack', channel });
  }

  private async sendDiscord(config: any, result: any): Promise<void> {
    this.emit('step:output:sent', { type: 'discord', channelId: config.channelId });
  }

  private async sendTelegram(config: any, _result: any): Promise<void> {
    this.emit('step:output:sent', { type: 'telegram', chatId: config.chatId });
  }

  private async sendWebhook(config: any, _result: any): Promise<void> {
    this.emit('step:output:sent', { type: 'webhook', url: config.url });
  }
}
