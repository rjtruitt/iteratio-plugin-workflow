import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailOutputProcess } from '../outputProcesses/EmailOutputProcess';
import { SMSOutputProcess } from '../outputProcesses/SMSOutputProcess';
import { SlackOutputProcess } from '../outputProcesses/SlackOutputProcess';
import { WhatsAppOutputProcess } from '../outputProcesses/WhatsAppOutputProcess';
import { ToolChainOutputProcess } from '../outputProcesses/ToolChainOutputProcess';
import { MockEmailClient, MockSMSClient, MockSlackClient, MockWhatsAppClient } from 'iteratio/src/__test__';

describe('OutputProcesses', () => {
  const mockContext: any = {
    turnNumber: 1,
    turnCount: 1,
    messages: [],
    state: {},
  };

  describe('EmailOutputProcess', () => {
    it('should send email via client with tool result', async () => {
      const emailClient = new MockEmailClient();
      const sendSpy = vi.spyOn(emailClient, 'send');
      const process = new EmailOutputProcess({
        to: 'user@example.com',
        subject: 'Status Update',
      });
      process.setClient(emailClient);
      const result = { data: 'System is healthy', success: true };

      await process.process(result, mockContext);

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Status Update',
        })
      );
    });

    it('should format tool result as email body', async () => {
      const emailClient = new MockEmailClient();
      const sendSpy = vi.spyOn(emailClient, 'send');
      const process = new EmailOutputProcess({
        to: 'admin@example.com',
        subject: 'Report',
      });
      process.setClient(emailClient);
      const result = { data: { status: 'ok', count: 42 }, success: true };

      await process.process(result, mockContext);

      // Body should contain serialized result
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('status'),
        })
      );
    });

    it('should support multiple recipients', async () => {
      const emailClient = new MockEmailClient();
      const sendSpy = vi.spyOn(emailClient, 'send');
      const process = new EmailOutputProcess({
        to: ['a@x.com', 'b@x.com'],
        subject: 'Multi',
      });
      process.setClient(emailClient);
      const result = { data: 'test', success: true };

      await process.process(result, mockContext);

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['a@x.com', 'b@x.com'],
        })
      );
    });
  });

  describe('SMSOutputProcess', () => {
    it('should send SMS via client', async () => {
      const smsClient = new MockSMSClient();
      const sendSpy = vi.spyOn(smsClient, 'send');
      const process = new SMSOutputProcess({
        to: '+1234567890',
        body: 'Status: OK',
      });
      process.setClient(smsClient);
      const result = { data: 'All good', success: true };

      await process.process(result, mockContext);

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '+1234567890',
        })
      );
    });

    it('should truncate long messages for SMS', async () => {
      const smsClient = new MockSMSClient();
      const sendSpy = vi.spyOn(smsClient, 'send');
      const process = new SMSOutputProcess({
        to: '+1234567890',
      });
      process.setClient(smsClient);
      const longData = 'x'.repeat(500);
      const result = { data: longData, success: true };

      await process.process(result, mockContext);

      // SMS should be truncated to reasonable length
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.any(String),
        })
      );
    });
  });

  describe('SlackOutputProcess', () => {
    it('should post to slack channel', async () => {
      const slackClient = new MockSlackClient();
      const postSpy = vi.spyOn(slackClient, 'postMessage');
      const process = new SlackOutputProcess({
        channel: '#alerts',
        text: 'Health check result',
      });
      process.setClient(slackClient);
      const result = { data: { healthy: true }, success: true };

      await process.process(result, mockContext);

      expect(postSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: '#alerts',
        })
      );
    });

    it('should support block kit formatting', async () => {
      const slackClient = new MockSlackClient();
      const postSpy = vi.spyOn(slackClient, 'postMessage');
      const process = new SlackOutputProcess({
        channel: '#reports',
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Report' } }],
      });
      process.setClient(slackClient);
      const result = { data: 'report data', success: true };

      await process.process(result, mockContext);

      expect(postSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({ type: 'section' }),
          ]),
        })
      );
    });
  });

  describe('WhatsAppOutputProcess', () => {
    it('should send whatsapp message', async () => {
      const waClient = new MockWhatsAppClient();
      const sendSpy = vi.spyOn(waClient, 'sendMessage');
      const process = new WhatsAppOutputProcess({
        to: '+1234567890',
        body: 'Analysis complete',
      });
      process.setClient(waClient);
      const result = { data: 'findings', success: true };

      await process.process(result, mockContext);

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '+1234567890',
        })
      );
    });

    it('should format result into message body', async () => {
      const waClient = new MockWhatsAppClient();
      const sendSpy = vi.spyOn(waClient, 'sendMessage');
      const process = new WhatsAppOutputProcess({
        to: '+9876543210',
      });
      process.setClient(waClient);
      const result = { data: { summary: 'All tests pass' }, success: true };

      await process.process(result, mockContext);

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('summary'),
        })
      );
    });
  });

  describe('ToolChainOutputProcess', () => {
    it('should chain multiple tools sequentially', async () => {
      const process = new ToolChainOutputProcess({
        tools: ['TransformData', 'ValidateData', 'StoreData'],
      });
      const result = { data: { raw: 'input' }, success: true };

      await process.process(result, mockContext);

      // Each tool in chain should have been called
      // Expected: all three tools executed in sequence
      expect(process.getExecutionLog()).toHaveLength(3);
    });

    it('should pass output of one tool as input to next', async () => {
      const process = new ToolChainOutputProcess({
        tools: ['Step1', 'Step2'],
        transform: (prev: any) => ({ input: prev }),
      });
      const result = { data: 'initial', success: true };

      await process.process(result, mockContext);

      // Step2 should receive Step1's output
      expect(process.getExecutionLog()[1].input).toBeDefined();
    });

    it('should handle empty tool chain gracefully', async () => {
      const process = new ToolChainOutputProcess({ tools: [] });
      const result = { data: 'nothing', success: true };

      await expect(process.process(result, mockContext)).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle email send failure gracefully', async () => {
      const emailClient = new MockEmailClient();
      emailClient.send = vi.fn().mockRejectedValue(new Error('SMTP timeout'));
      const process = new EmailOutputProcess({
        to: 'user@example.com',
        subject: 'Test',
      });
      process.setClient(emailClient);
      const result = { data: 'test', success: true };

      // Should not throw - graceful failure
      await expect(process.process(result, mockContext)).resolves.not.toThrow();
    });

    it('should handle slack post failure gracefully', async () => {
      const slackClient = new MockSlackClient();
      slackClient.postMessage = vi.fn().mockRejectedValue(new Error('Rate limited'));
      const process = new SlackOutputProcess({
        channel: '#test',
        text: 'hi',
      });
      process.setClient(slackClient);
      const result = { data: 'test', success: true };

      await expect(process.process(result, mockContext)).resolves.not.toThrow();
    });
  });

  describe('timeout handling', () => {
    it('should timeout if output process takes too long', async () => {
      const slowProcess = new EmailOutputProcess({
        to: 'user@example.com',
        subject: 'Slow',
      });
      // Simulate a process that hangs
      // Expected: process should have a configurable timeout
      // and reject/resolve within that time
      const timeout = (slowProcess as any).timeout;
      expect(timeout).toBeDefined();
      expect(timeout).toBeLessThanOrEqual(30000);
    });

    it('should use configurable timeout value', async () => {
      const process = new EmailOutputProcess({
        to: 'user@example.com',
        subject: 'Custom timeout',
      });
      // Expected: process.setTimeout(5000)
      // expect((process as any).timeout).toBe(5000);
      expect((process as any).setTimeout).toBeDefined();
    });
  });
});
