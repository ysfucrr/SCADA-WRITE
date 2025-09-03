import { ObjectId } from 'mongodb';

export type RuleType = 'value' | 'connection';

export type ValueCondition = 'gt' | 'lt';
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

export type AlertRule = ValueRule | ConnectionRule;