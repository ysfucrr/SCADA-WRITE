"use client";
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import { AlertRule, ValueRule, ConnectionRule, BitRule, RuleType, ValueCondition, ConnectionCondition } from '@/types/alert-rule';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import { Button, OutlineButton } from '@/components/ui/button/CustomButton';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Textarea from '@/components/form/input/TextArea';
import Select from '@/components/form/Select';
import Checkbox from '@/components/form/input/Checkbox';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import IconButton from '@/components/ui/icon-button';

interface UIRegister {
    id: string;
    name: string;
    address: number;
    analyzerName: string;
}

interface UIGateway {
    _id: string;
    name: string;
}

interface UIAnalyzer {
    _id: string;
    name: string;
}

interface UINode {
    id: string;
    type: string;
    data?: {
        analyzerId: string;
        name: string;
        address: number;
    };
}

const AlertRulesPage: React.FC = () => {
    const [rules, setRules] = useState<AlertRule[]>([]);
    const [registers, setRegisters] = useState<UIRegister[]>([]);
    const [gateways, setGateways] = useState<UIGateway[]>([]);
    const [mailSettings, setMailSettings] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentRule, setCurrentRule] = useState<Partial<AlertRule>>({ ruleType: 'value' });

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [rulesRes, gatewaysRes, unitsRes, analyzersRes, mailRes] = await Promise.all([
                axios.get('/api/alert-rules'),
                axios.get('/api/gateway'),
                axios.get('/api/units'),
                axios.get('/api/analyzers'),
                axios.get('/api/mail-settings')
            ]);

            const rulesData = rulesRes.data;
            const gatewaysData = gatewaysRes.data;
            const buildingsData = unitsRes.data.buildings;
            const analyzersData = analyzersRes.data;
            const mailData = mailRes.data;

            const allRegisters: UIRegister[] = [];
            if (buildingsData) {
                for (const building of buildingsData) {
                    const processNodes = (nodes: UINode[]) => {
                        if (nodes) {
                            for (const node of nodes) {
                                if (node.type !== "registerNode" || !node.data) {
                                    continue;
                                }
                                // Force non-null assertion to override faulty TS inference
                                const analyzer = analyzersData.find((a: UIAnalyzer) => a._id === node.data!.analyzerId);
                                if(analyzer) {
                                    allRegisters.push({
                                        id: node.id,
                                        name: node.data.name,
                                        address: node.data.address,
                                        analyzerName: analyzer.name,
                                    });
                                }
                            }
                        }
                    };

                    if (building.flowData) processNodes(building.flowData.nodes);
                    if (building.floors) {
                        for (const floor of building.floors) {
                            if (floor.flowData) processNodes(floor.flowData.nodes);
                            if (floor.rooms) {
                                for (const room of floor.rooms) {
                                    if (room.flowData) processNodes(room.flowData.nodes);
                                }
                            }
                        }
                    }
                }
            }
            
            setRules(rulesData);
            setGateways(gatewaysData);
            setMailSettings(mailData);
            setRegisters(allRegisters.sort((a,b) => a.analyzerName.localeCompare(b.analyzerName) || a.address - b.address));

        } catch (error) {
            Swal.fire('Error', 'Failed to load initial data.', 'error');
            console.error("Failed to load initial data:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleOpenModal = (rule: AlertRule | null = null) => {
        if (!mailSettings || Object.keys(mailSettings).length === 0) {
            Swal.fire('Warning', 'Please add mail settings first.', 'warning');
            return;
        }
        if (rule) {
            setCurrentRule({ ...rule });
        } else {
            // Default to a new ValueRule
            setCurrentRule({
                ruleType: 'value',
                name: '',
                registerId: '',
                condition: 'gt',
                threshold: 0,
                enabled: true,
                message: ''
            });
        }
        setIsModalOpen(true);
    };
    
    const handleCloseModal = () => setIsModalOpen(false);
    
    const handleRuleTypeChange = (value: string) => {
        const newType = value as RuleType;
        setCurrentRule(prev => {
            const commonFields = {
                name: prev?.name,
                message: prev?.message,
                enabled: prev?.enabled
            };
            if (newType === 'value') {
                return { ...commonFields, ruleType: 'value', condition: 'gt', registerId: '', threshold: 0 };
            } else if (newType === 'connection') {
                return { ...commonFields, ruleType: 'connection', condition: 'disconnected', gatewayId: '' };
            } else if (newType === 'bit') {
                return { ...commonFields, ruleType: 'bit', registerId: '', bitPosition: 0, bitValue: 1 };
            } else {
                return commonFields;
            }
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await axios({
                method: currentRule._id ? 'PUT' : 'POST',
                url: `/api/alert-rules/${currentRule._id || ''}`,
                data: currentRule,
            });
            Swal.fire('Success', `Alert rule ${currentRule._id ? 'updated' : 'created'}.`, 'success');
            fetchData();
            handleCloseModal();
        } catch (error) {
           Swal.fire('Error', 'Failed to save alert rule.', 'error');
           console.error("Failed to save alert rule:", error);
        }
    };
    
    const handleDelete = (id: string) => {
        Swal.fire({ title: 'Are you sure?', text: "This action cannot be undone!", icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33' })
        .then(async (result) => {
            if (result.isConfirmed) {
                try {
                    await axios.delete(`/api/alert-rules/${id}`);
                    Swal.fire('Deleted!', 'The rule has been deleted.', 'success');
                    fetchData();
                } catch (error) {
                    Swal.fire('Error', 'Failed to delete the rule.', 'error');
                    console.error("Failed to delete alert rule:", error);
                }
            }
        });
    };
    
    const registerOptions = registers.map(reg => ({ value: reg.id, label: `${reg.analyzerName} (Addr: ${reg.address})`}));
    const gatewayOptions = gateways.map(gw => ({ value: gw._id, label: gw.name }));
    const valueConditionOptions = [ { value: 'gt', label: 'Greater Than (>)'}, { value: 'lt', label: 'Less Than (<)'}, { value: 'eq', label: 'Equals (=)'} ];
    const connectionConditionOptions = [ { value: 'disconnected', label: 'Disconnected'}, { value: 'connected', label: 'Connected'} ];
    const ruleTypeOptions = [{value: 'value', label: 'Value Based'}, {value: 'connection', label: 'Connection Based'}, {value: 'bit', label: 'Bit Based'}];

    if (loading) return <Spinner variant="bars" fullPage />;

    return (
        <div>
            <PageBreadcrumb pageTitle="Alert Rules" />
            <div className="flex justify-end mb-6">
                <Button onClick={() => handleOpenModal()} leftIcon={<Plus size={16}/>} variant="primary">Add New Rule</Button>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                <div className="overflow-x-auto w-full">
                    <table className="w-full">
                         <thead className="bg-gray-100 dark:bg-black/50">
                            <tr>
                                <th className="px-4 sm:px-6 py-3 text-left font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">Rule Name</th>
                                <th className="px-4 sm:px-6 py-3 text-left font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">Target</th>
                                <th className="px-4 sm:px-6 py-3 text-left font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">Condition</th>
                                <th className="px-4 sm:px-6 py-3 text-left font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">Enabled</th>
                                <th className="px-4 sm:px-6 py-3 text-right font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                             {rules.map((rule) => {
                                let targetName = 'N/A';
                                let conditionDisplay= 'N/A';

                                if (rule.ruleType === 'value') {
                                    const register = registers.find(r => r.id === rule.registerId);
                                    targetName = register ? `${register.analyzerName} (Addr: ${register.address})` : `Unknown Register`;
                                    conditionDisplay = `Value ${rule.condition === 'gt' ? '>' : rule.condition === 'lt' ? '<' : '='} ${rule.threshold}`;
                                } else if (rule.ruleType === 'connection') {
                                    const gateway = gateways.find(g => g._id === rule.gatewayId);
                                    targetName = gateway ? `Gateway: ${gateway.name}`: `Unknown Gateway`;
                                    conditionDisplay = `Status is ${rule.condition}`;
                                } else if (rule.ruleType === 'bit') {
                                    const register = registers.find(r => r.id === rule.registerId);
                                    targetName = register ? `${register.analyzerName} (Addr: ${register.address})` : `Unknown Register`;
                                    conditionDisplay = `Bit ${rule.bitPosition} is ${rule.bitValue ? 'Set' : 'Clear'}`;
                                }
                                return (
                                    <tr key={rule._id?.toString()} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-gray-800 dark:text-gray-300">{rule.name}</td>
                                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400">{targetName}</td>
                                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400">{conditionDisplay}</td>
                                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${rule.enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{rule.enabled ? 'Enabled' : 'Disabled'}</span>
                                        </td>
                                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right">
                                            <div className="flex justify-end items-center space-x-2">
                                                <IconButton onClick={() => handleOpenModal(rule)} icon={<Pencil size={14} />} variant="warning" />
                                                <IconButton onClick={() => handleDelete(rule._id!.toString())} icon={<Trash2 size={14} />} variant="error" />
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <Modal isOpen={isModalOpen} onClose={handleCloseModal} className="max-w-2xl">
                 {currentRule && (
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-2">
                        <h2 className="text-xl font-bold text-black dark:text-white">{currentRule._id ? 'Edit' : 'Add'} Alert Rule</h2>
                           <div className="flex flex-col gap-1">
                               <Label htmlFor="name">Rule Name</Label>
                               <Input id="name" value={currentRule.name || ''} onChange={e => setCurrentRule(p => ({...p, name: e.target.value}))} required />
                            </div>
                            <div className="flex flex-col gap-1">
                                <Label>Rule Type</Label>
                                <Select options={ruleTypeOptions} defaultValue={currentRule.ruleType} onChange={v => handleRuleTypeChange(v as RuleType)}/>
                            </div>

                        {currentRule.ruleType === 'value' && (
                           <>
                                <div className="flex flex-col gap-1">
                                    <Label>Register</Label>
                                    <Select options={registerOptions} defaultValue={(currentRule as Partial<ValueRule>).registerId} onChange={v => setCurrentRule(p => ({...p, registerId: v}))} placeholder="Select a Register"/>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="flex flex-col gap-1">
                                        <Label>Condition</Label>
                                        <Select options={valueConditionOptions} defaultValue={(currentRule as Partial<ValueRule>).condition} onChange={v => setCurrentRule(p => ({...(p as Partial<ValueRule>), condition: v as ValueCondition}))}/>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <Label htmlFor="threshold">Threshold</Label>
                                        <Input id="threshold" type="number" value={(currentRule as Partial<ValueRule>).threshold || 0} onChange={e => setCurrentRule(p => ({...p, threshold: parseFloat(e.target.value)}))} />
                                    </div>
                                </div>
                            </>
                        )}
                        
                        {currentRule.ruleType === 'connection' && (
                             <div className="flex flex-col gap-2">
                                <div className="flex flex-col gap-1">
                                    <Label>Gateway</Label>
                                    <Select options={gatewayOptions} defaultValue={(currentRule as Partial<ConnectionRule>).gatewayId} onChange={v => setCurrentRule(p => ({...p, gatewayId: v}))} placeholder="Select a Gateway"/>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <Label>Condition</Label>
                                    <Select options={connectionConditionOptions} defaultValue={(currentRule as Partial<ConnectionRule>).condition} onChange={v => setCurrentRule(p => ({...(p as Partial<ConnectionRule>), condition: v as ConnectionCondition}))}/>
                                </div>
                             </div>
                        )}

                        {currentRule.ruleType === 'bit' && (
                             <div className="flex flex-col gap-2">
                                <div className="flex flex-col gap-1">
                                    <Label>Register</Label>
                                    <Select options={registerOptions} defaultValue={(currentRule as Partial<BitRule>).registerId} onChange={v => setCurrentRule(p => ({...p, registerId: v}))} placeholder="Select a Register"/>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="flex flex-col gap-1">
                                        <Label htmlFor="bitPosition">Bit Position (0-31)</Label>
                                        <Input id="bitPosition" type="number" min="0" max="31" value={(currentRule as Partial<BitRule>).bitPosition || 0} onChange={e => setCurrentRule(p => ({...p, bitPosition: parseInt(e.target.value, 10) || 0}))} />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <Label>Expected Bit Value</Label>
                                        <Select options={[{value: '1', label: '1 (True/On/Set)'}, {value: '0', label: '0 (False/Off/Clear)'}]} defaultValue={(currentRule as Partial<BitRule>).bitValue?.toString()} onChange={v => setCurrentRule(p => ({...(p as Partial<BitRule>), bitValue: parseInt(v, 10) as 0 | 1}))}/>
                                    </div>
                                </div>
                             </div>
                        )}

                        <div className="flex flex-col gap-1">
                             <Label>Alert Message</Label>
                             <Textarea value={currentRule.message || ''} onChange={v => setCurrentRule(p => ({...p, message: v}))} rows={3}/>
                             <p className="text-xs text-gray-500 dark:text-gray-400">Placeholders: {'{ruleName}'}, {'{targetName}'}, {'{value}'}, {'{threshold}'}, {'{status}'}, {'{bitPosition}'}, {'{bitValue}'}</p>
                        </div>
                        <div className="flex items-center gap-2">
                           <Checkbox id="enabled" label="Enable this rule" checked={!!currentRule.enabled} onChange={c => setCurrentRule(p => ({...p, enabled: c}))} />
                        </div>
                        <div className="flex justify-end gap-4 mt-2">
                            <OutlineButton type="button" onClick={handleCloseModal}>Cancel</OutlineButton>
                            <Button type="submit" variant="primary">Save Rule</Button>
                        </div>
                    </form>
                 )}
            </Modal>
        </div>
    );
};

export default AlertRulesPage;