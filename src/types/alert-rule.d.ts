import { ObjectId } from 'mongodb';

export type RuleType = 'value' | 'connection' | 'bit';

export type ValueCondition = 'gt' | 'lt' | 'eq';
export type ConnectionCondition = 'disconnected' | 'connected';

export interface BaseRule {
  _id?: ObjectId;
  name: string;
  ruleType: RuleType;
  message: string;
  enabled: boolean;
  // lastTriggeredAt is no longer persisted, state is handled in-memory by AlertManager
}

export interface ValueRule extends BaseRule {
  ruleType: 'value';
  registerId: string;
  condition: ValueCondition;
  threshold: number;
}

export interface ConnectionRule extends BaseRule {
  ruleType: 'connection';
  gatewayId: string; // Changed from analyzerId
  condition: ConnectionCondition;
}

export interface BitRule extends BaseRule {
  ruleType: 'bit';
  registerId: string;
  bitPosition: number; // 0-63 for full 64-bit support
  bitValue: 0 | 1; // Expected bit value
}

export type AlertRule = ValueRule | ConnectionRule | BitRule;