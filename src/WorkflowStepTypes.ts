/**
 * WorkflowStep type definitions
 *
 * Core interfaces for workflow steps: types, frequencies,
 * dynamic parameters, output processes, and step shape.
 */

import { TurnContext } from 'iteratio';
import { OutputProcessConfig } from './interfaces/IToolOutputProcess';

export type WorkflowStepType =
  | 'tool'
  | 'checkpoint'
  | 'inject'
  | 'meta'
  | 'custom';

export interface StepFrequency {
  type: 'turn-based' | 'token-based' | 'conditional' | 'manual' | 'once';
  interval?: number | null;
  tokenThreshold?: number;
  when?: (context: TurnContext) => boolean;
  skipIf?: (context: TurnContext) => boolean;
  maxExecutions?: number;
  startAfterTurn?: number;
  stopAfterTurn?: number;
  /** Remove step after N turns since creation. */
  ttlTurns?: number;
}

/**
 * Dynamic parameter: static value, template string (`${...}`), function, or conditional.
 */
export type DynamicParameter =
  | string
  | number
  | boolean
  | ((context: TurnContext) => unknown)
  | ConditionalParameter;

export interface ConditionalParameter {
  when: (context: TurnContext) => boolean;
  value: unknown;
  else?: unknown;
}

/** Configuration for dispatching workflow step output to a notification channel. */
export interface ToolOutputProcess {
  type: 'email' | 'sms' | 'whatsapp' | 'slack' | 'discord' | 'telegram' | 'webhook' | 'tool' | 'custom';
  tool?: string;
  email?: {
    to: string | string[] | ((result: any) => string | string[]);
    subject?: string | ((result: any) => string);
    body?: string | ((result: any) => string);
  };
  sms?: {
    to: string | string[] | ((result: any) => string | string[]);
    body?: string | ((result: any) => string);
  };
  whatsapp?: {
    to: string | string[] | ((result: any) => string | string[]);
    body?: string | ((result: any) => string);
  };
  slack?: {
    channel: string | ((result: any) => string);
    text?: string | ((result: any) => string);
    blocks?: any[] | ((result: any) => any[]);
  };
  discord?: {
    channelId: string;
    content?: string | ((result: any) => string);
    embeds?: any[] | ((result: any) => any[]);
  };
  telegram?: {
    chatId: string | number;
    text?: string | ((result: any) => string);
  };
  webhook?: {
    url: string;
    method?: 'GET' | 'POST' | 'PUT';
    headers?: Record<string, string>;
    body?: any | ((result: any) => any);
  };
  handler?: (result: any, context: TurnContext) => Promise<void> | void;
  transform?: (result: any) => any;
  condition?: (result: any, context?: TurnContext) => boolean;
}

export interface WorkflowStep {
  id: string;
  type: WorkflowStepType;
  position: number | 'before-llm' | 'after-llm' | 'before-tools' | 'after-tools' | 'end';
  frequency: StepFrequency;
  tool?: string;
  parameters?: Record<string, DynamicParameter>;
  outputProcess?: ToolOutputProcess | OutputProcessConfig;
  prompt?: string | ((context: TurnContext) => string);
  injectTool?: string;
  execute?: (context: TurnContext) => Promise<void> | void;
  action?: 'fork-context' | 'send-federation' | 'duplicate-loop' | string;
  target?: string;
  content?: string | ((context: TurnContext) => string);
  name?: string;
  description?: string;
  enabled?: boolean;
  /** @internal Managed by registry for TTL tracking. */
  _createdTurn?: number;
}
