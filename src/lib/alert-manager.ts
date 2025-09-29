import { connectToDatabase } from './mongodb';
import { AlertRule, ConnectionRule, ValueRule, BitRule } from '@/types/alert-rule';
import { mailService } from './mail-service';
import { backendLogger } from './logger/BackendLogger';
import { ModbusPoller } from './modbus/ModbusPoller'; // We need the type

type GatewayStatus = 'connected' | 'disconnected' | 'unknown';
interface ConnectionState {
    status: GatewayStatus;
    lastNotification: Date;
    isFirstDisconnect: boolean;
}

class AlertManager {
  private valueRules: Map<string, ValueRule[]> = new Map();
  private connectionRules: Map<string, ConnectionRule[]> = new Map();
  private bitRules: Map<string, BitRule[]> = new Map();
  private monitoredRegisters: Set<string> = new Set();
  private connectionStates: Map<string, ConnectionState> = new Map(); // Tracks the state of each gateway
  private processingRules: Set<string> = new Set(); // Tracks rule IDs currently being processed to prevent race conditions
  private valueRuleCooldowns: Map<string, Date> = new Map(); // In-memory cooldowns for value rules
  private configUpdateTimeout: number | null = null;

  constructor() {
    this.loadRules();
    // listenForUpdates will now be called from service_new.ts
    this.listenForDbChanges();

    // HACK: To mitigate startup race conditions where the poller might not be fully ready
    // when the alert manager loads its rules, we schedule a reload after a short delay.
    setTimeout(() => {
        //backendLogger.info('Performing delayed rule reload to ensure synchronization.', 'AlertManager');
        this.reloadRules();
    }, 15000); // 15-second delay to be safe
  }

  private async loadRules() {
    try {
      const { db } = await connectToDatabase();
      const rules = await db.collection('alert_rules').find<AlertRule>({ enabled: true }).toArray();
      this.valueRules.clear();
      this.connectionRules.clear();
      this.bitRules.clear();
      this.monitoredRegisters.clear();

      rules.forEach(rule => {
        if (rule.ruleType === 'value') {
          if (!this.valueRules.has(rule.registerId)) {
            this.valueRules.set(rule.registerId, []);
          }
          this.valueRules.get(rule.registerId)!.push(rule);
        } else if (rule.ruleType === 'connection') {
          if (!this.connectionRules.has(rule.gatewayId)) {
            this.connectionRules.set(rule.gatewayId, []);
          }
          this.connectionRules.get(rule.gatewayId)!.push(rule);
        } else if (rule.ruleType === 'bit') {
          if (!this.bitRules.has(rule.registerId)) {
            this.bitRules.set(rule.registerId, []);
          }
          this.bitRules.get(rule.registerId)!.push(rule);
          this.monitoredRegisters.add(rule.registerId);
          backendLogger.info(`Loaded bit rule: ${rule.name} for register ${rule.registerId}, bit ${rule.bitPosition}, value ${rule.bitValue}`, 'AlertManager');
        }
      });

      // Add value rule registers
      for (const registerId of this.valueRules.keys()) {
        this.monitoredRegisters.add(registerId);
      }
      // Bit rules already added
      //backendLogger.info(`${rules.length} alert rules loaded.`, 'AlertManager');
    } catch (error) {
      backendLogger.error('Failed to load alert rules.', 'AlertManager', { error: (error as Error).message });
    }
  }

  public async reloadRules() {
    await this.loadRules();
  }

  public listenForUpdates(poller: ModbusPoller) {
    poller.on('registerUpdated', (data: { id: string; value: any }) => {
      if (!this.monitoredRegisters.has(data.id)) return;
      //backendLogger.info(`[ALERT-DEBUG] Register updated: ${data.id} = ${data.value}`, 'AlertManager');
      this.checkValueRules(data.id, data.value);
      this.checkBitRules(data.id, data.value);
    });

    poller.on('connectionStatusChanged', (data: { gatewayId: string; status: GatewayStatus; connectionId?: string }) => {
      //backendLogger.info(`[ALERT-DEBUG] Connection status changed: ${data.gatewayId} → ${data.status}`, 'AlertManager', { connectionId: data.connectionId });
      this.checkConnectionRules(data.gatewayId, data.status);
    });
  }

  private async listenForDbChanges() {
    try {
        const { db } = await connectToDatabase();
        const changeStream = db.collection('alert_rules').watch();

        changeStream.on('change', (change) => {
            //backendLogger.info('Change detected in alert_rules collection, reloading rules.', 'AlertManager', { changeType: change.operationType });
            // Debounce the reload to handle multiple quick changes
            if (this.configUpdateTimeout) {
                clearTimeout(this.configUpdateTimeout);
            }
            this.configUpdateTimeout = setTimeout(() => {
                this.reloadRules();
            }, 500) as any; // 500ms debounce window
        });
        //backendLogger.info('Watching alert_rules collection for changes.', 'AlertManager');
    } catch (error) {
        backendLogger.error('Failed to set up watch on alert_rules collection.', 'AlertManager', { error: (error as Error).message });
    }
  }

  private async checkBitRules(registerId: string, value: any) {
    const rulesForRegister = this.bitRules.get(registerId);
    if (!rulesForRegister) return;

    // Convert value to number for bit operations
    let numValue: number;
    if (typeof value === 'boolean') {
      numValue = value ? 1 : 0;
    } else if (typeof value === 'string') {
      const lower = value.toLowerCase();
      numValue = (lower === 'true' || lower === 'on' || lower === '1') ? 1 : 0;
    } else {
      numValue = Number(value) || 0;
    }

    backendLogger.info(`[BIT-DEBUG] Checking bit rules for register ${registerId}, value: ${value} (${typeof value}), numValue: ${numValue}`, 'AlertManager');

    for (const rule of rulesForRegister) {
      const ruleId = rule._id!.toString();
      const bitValue = (numValue >> rule.bitPosition) & 1;
      const triggered = bitValue === rule.bitValue;

      backendLogger.info(`[BIT-DEBUG] Rule ${rule.name}: bitPosition ${rule.bitPosition}, expected ${rule.bitValue}, got ${bitValue}, triggered: ${triggered}`, 'AlertManager');

      if (!triggered) {
        // Reset cooldown if not triggered
        this.valueRuleCooldowns.delete(ruleId);
        continue;
      }

      if (this.processingRules.has(ruleId)) {
        continue;
      }

      const lastSent = this.valueRuleCooldowns.get(ruleId);
      const cooldown = 10 * 60 * 1000; // 10 minutes
      if (lastSent && new Date().getTime() - lastSent.getTime() < cooldown) {
        continue;
      }

      this.processingRules.add(ruleId);
      try {
        backendLogger.info(`Bit rule triggered: ${rule.name}`, 'AlertManager', { registerId, value: numValue, bitPosition: rule.bitPosition, bitValue });
        const subject = `Alert: ${rule.name}`;
        const text = rule.message.replace('{value}', String(numValue)).replace('{ruleName}', rule.name).replace('{bitPosition}', String(rule.bitPosition)).replace('{bitValue}', String(rule.bitValue));

        const mailSent = await mailService.sendMail(subject, text);

        if (mailSent) {
          this.valueRuleCooldowns.set(ruleId, new Date());
        }
      } finally {
        this.processingRules.delete(ruleId);
      }
    }
  }

  private async checkValueRules(registerId: string, value: any) {
    const rulesForRegister = this.valueRules.get(registerId);
    if (!rulesForRegister) return;

    // Convert value to number for comparisons
    let numValue: number;
    if (typeof value === 'boolean') {
      numValue = value ? 1 : 0;
    } else if (typeof value === 'string') {
      const lower = value.toLowerCase();
      numValue = (lower === 'true' || lower === 'on' || lower === '1') ? 1 : 0;
    } else {
      numValue = Number(value) || 0;
    }

    for (const rule of rulesForRegister) {
      const ruleId = rule._id!.toString();
      const triggered = (rule.condition === 'gt' && numValue > rule.threshold) || (rule.condition === 'lt' && numValue < rule.threshold) || (rule.condition === 'eq' && numValue === rule.threshold);
      
      if (!triggered) {
        // Condition is not met, so reset the cooldown for this rule.
        // This allows it to fire immediately if it triggers again.
        this.valueRuleCooldowns.delete(ruleId);
        continue;
      }

      // --- Condition is triggered from this point on ---

      // Lock first to prevent any race conditions.
      if (this.processingRules.has(ruleId)) {
        continue;
      }

      // Check in-memory cooldown.
      const lastSent = this.valueRuleCooldowns.get(ruleId);
      const cooldown = 10 * 60 * 1000; // 10 minutes
      if (lastSent && new Date().getTime() - lastSent.getTime() < cooldown) {
        continue; // Cooldown is active.
      }

      this.processingRules.add(ruleId);
      try {
        backendLogger.info(`Value rule triggered: ${rule.name}`, 'AlertManager', { registerId, value: numValue });
        const subject = `Alert: ${rule.name}`;
        const text = rule.message.replace('{value}', String(numValue)).replace('{ruleName}', rule.name).replace('{threshold}', String(rule.threshold));
        
        await mailService.reloadSettings();
        const mailSent = await mailService.sendMail(subject, text);
        
        if (mailSent) {
          // If mail was sent successfully, update the in-memory cooldown time.
          this.valueRuleCooldowns.set(ruleId, new Date());
          // We no longer need to update the database for this.
          // await this.updateLastTriggered(rule._id!);
        }
      } finally {
        // Always unlock the rule after processing.
        this.processingRules.delete(ruleId);
      }
    }
  }
  
  private checkConnectionRules(gatewayId: string, newStatus: GatewayStatus) {
      //backendLogger.info(`[ALERT-DEBUG] Checking rules for gateway: ${gatewayId}, status: ${newStatus}`, 'AlertManager');
      
      const rulesForGateway = this.connectionRules.get(gatewayId);
      if(!rulesForGateway) {
          //backendLogger.info(`[ALERT-DEBUG] No rules found for gateway: ${gatewayId}. Available gateways: ${Array.from(this.connectionRules.keys()).join(', ')}`, 'AlertManager');
          return;
      }

      //backendLogger.info(`[ALERT-DEBUG] Found ${rulesForGateway.length} rules for gateway: ${gatewayId}`, 'AlertManager');

      const currentState = this.connectionStates.get(gatewayId) || { status: 'unknown', lastNotification: new Date(0), isFirstDisconnect: true };

      //backendLogger.info(`[ALERT-DEBUG] Current state: ${currentState.status}, New status: ${newStatus}`, 'AlertManager');

      // Durum değişmediyse (örneğin, zaten 'disconnected' iken başka bir paralel bağlantıdan 'disconnected' geldiyse)
      // hiçbir işlem yapma ve mükerrer mail gönderimini engelle.
      // DÜZELTME: İlk bağlantı durumunda (unknown → connected/disconnected) da alert gönder
      if (currentState.status === newStatus && currentState.status !== 'unknown') {
          //backendLogger.info(`[ALERT-DEBUG] Status unchanged for gateway: ${gatewayId} (${newStatus}), skipping`, 'AlertManager');
          return;
      }
 
      //backendLogger.info(`[ALERT-DEBUG] Status changed for gateway: ${gatewayId} from ${currentState.status} to ${newStatus}`, 'AlertManager');
      this.connectionStates.set(gatewayId, { ...currentState, status: newStatus });

      rulesForGateway.forEach(async (rule) => {
          if(rule.condition === newStatus){
              const now = new Date();
              const tenMinutes = 10 * 60 * 1000;

              // Logic for 'disconnected'
              if (newStatus === 'disconnected') {
                  if (currentState.isFirstDisconnect) {
                      // Send immediately on first disconnect
                      this.sendConnectionMail(rule, gatewayId, newStatus);
                      this.connectionStates.set(gatewayId, { status: 'disconnected', lastNotification: now, isFirstDisconnect: false });
                  } else {
                      // If not the first, check if 10 minutes have passed
                      if (now.getTime() - currentState.lastNotification.getTime() >= tenMinutes) {
                           this.sendConnectionMail(rule, gatewayId, newStatus);
                           this.connectionStates.set(gatewayId, { ...currentState, lastNotification: now });
                      }
                  }
              }
              // Logic for 'connected'
              else if (newStatus === 'connected') {
                  this.sendConnectionMail(rule, gatewayId, newStatus);
                  // Reset state on reconnection
                  this.connectionStates.set(gatewayId, { status: 'connected', lastNotification: now, isFirstDisconnect: true });
              }
          }
      });
  }

  private async sendConnectionMail(rule: ConnectionRule, gatewayId: string, status: GatewayStatus) {
    backendLogger.info(`Connection rule triggered: ${rule.name}`, 'AlertManager', { gatewayId, status });
    const subject = `Alert: ${rule.name}`;
    const text = rule.message.replace('{status}', status).replace('{ruleName}', rule.name);
    await mailService.reloadSettings();
    await mailService.sendMail(subject, text);
    // this.updateLastTriggered(rule._id!); // This is no longer needed as state is in-memory
  }

}

export const alertManager = new AlertManager();