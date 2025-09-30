"use client";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { showToast } from "@/components/ui/alert";
import { Button } from "@/components/ui/button/CustomButton";
import { Spinner } from "@/components/ui/spinner";
import { Heading3, Paragraph, SmallText } from "@/components/ui/typography";
import { useAuth } from "@/hooks/use-auth";
import { BarChart2, Building, ChartLine, DoorOpen, Eye, Layers, ListFilter, PlusCircle, Save, Settings } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { TrendLogType } from "../trend-log/page";
import { ApexOptions } from "apexcharts";
import TrendLogSelectionModal from "@/components/TrendLogs/TrendLogSelectionModal";

// Dynamic import of chart component to prevent SSR issues
const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

// Types for configurations
interface MultiLogConfig {
    _id: string;
    name: string;
    trendLogIds: string[];
    logLimit: number;
    refreshRate: number;
    userId: string;
    createdAt: string;
    updatedAt: string;
}

export default function MultiLogPage() {
    // Data state
    const [trendLogs, setTrendLogs] = useState<TrendLogType[]>([]);
    const [groupedTrendLogs, setGroupedTrendLogs] = useState<Record<string, TrendLogType[]>>({});
    const [selectedLogs, setSelectedLogs] = useState<TrendLogType[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [chartData, setChartData] = useState<{
        series: { name: string; data: number[] }[];
        categories: string[];
    }>({ series: [], categories: [] });
    const [updateInterval, setUpdateInterval] = useState<NodeJS.Timeout | null>(null);
    const [refreshRate, setRefreshRate] = useState(30); // seconds
    const [analyzers, setAnalyzers] = useState<any[]>([]);
    const [gateways, setGateways] = useState<any[]>([]);
    const [registers, setRegisters] = useState<any[]>([]);
    const [logLimit, setLogLimit] = useState<number>(100); // Default to last 100 logs
    
    // Configuration state
    const [configurations, setConfigurations] = useState<MultiLogConfig[]>([]);
    const [activeConfig, setActiveConfig] = useState<MultiLogConfig | null>(null);
    const [isLoadingConfigs, setIsLoadingConfigs] = useState(false);
    
    // Modal state
    const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);
    
    const { user, isAdmin, isLoading: isAuthLoading } = useAuth();

    // Fetch all necessary data
    useEffect(() => {
        if (!isAuthLoading && (isAdmin || user?.permissions?.trendLog)) {
            // Fetch all data first, then load configuration
            fetchData().then(() => {
                fetchConfigurations();
            });
        }
    }, [isAuthLoading]);
    
    // Fetch user configurations
    const fetchConfigurations = async () => {
        try {
            // Wait for trend logs data to be available first
            if (trendLogs.length === 0) {
                console.log("Waiting for trend log data before loading configurations...");
                return;
            }
            
            setIsLoadingConfigs(true);
            const response = await fetch('/api/multi-log-configs');
            
            if (!response.ok) {
                throw new Error('Failed to fetch configurations');
            }
            
            const configs = await response.json();
            setConfigurations(configs);
            
            // If there are configurations, activate and load the most recent one
            if (configs.length > 0) {
                const mostRecent = configs.sort(
                    (a: MultiLogConfig, b: MultiLogConfig) =>
                        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
                )[0];
                setActiveConfig(mostRecent);
                
                // Auto-load the most recent configuration to ensure data is shown on page reload
                await loadConfiguration(mostRecent);
            }
        } catch (error) {
            console.error('Error fetching configurations:', error);
        } finally {
            setIsLoadingConfigs(false);
        }
    };
    
    // Load a specific configuration
    const loadConfiguration = async (config: MultiLogConfig) => {
        try {
            // Ensure we have trendLogs data before proceeding
            if (trendLogs.length === 0) {
                console.log("No trend logs available yet, waiting for data...");
                return;
            }

            // Set the configuration parameters
            setLogLimit(config.logLimit);
            setRefreshRate(config.refreshRate);
            
            // Find the trend logs that match the IDs in the configuration
            const logsToSelect = trendLogs.filter(log =>
                config.trendLogIds.includes(log._id)
            );
            
            // If logs are found in the configuration, select them
            if (logsToSelect.length > 0) {
                setSelectedLogs(logsToSelect);
                showToast(`Loaded configuration: ${config.name}`, 'success');
                
                // Force the dropdown to show the selected config
                document.querySelector(`select[name="configSelect"]`)?.setAttribute('value', config._id);
                
                // Make sure the graph data is fetched immediately
                setTimeout(() => {
                    fetchSelectedLogsData();
                }, 100);
            } else if (config.trendLogIds.length > 0) {
                // If IDs were found but no matching logs, show warning
                showToast('Some trend logs in this configuration are no longer available', 'warning');
                // Still set the available logs if any
                setSelectedLogs(logsToSelect);
            }
        } catch (error) {
            console.error('Error loading configuration:', error);
            showToast('Failed to load configuration', 'error');
        }
    };
    
    // Save current selection as a configuration
    const saveConfiguration = async (trendLogIds: string[], configName: string, customRefreshRate?: number, customLogLimit?: number) => {
        try {
            const response = await fetch('/api/multi-log-configs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: configName,
                    trendLogIds,
                    logLimit: customLogLimit !== undefined ? customLogLimit : logLimit,
                    refreshRate: customRefreshRate !== undefined ? customRefreshRate : refreshRate
                }),
            });
            
            if (!response.ok) {
                throw new Error('Failed to save configuration');
            }
            
            const result = await response.json();
            showToast(`Configuration "${configName}" saved successfully`, 'success');
            
            // Refresh configurations
            fetchConfigurations();
            
        } catch (error) {
            console.error('Error saving configuration:', error);
            showToast('Failed to save configuration', 'error');
        }
    };
    
    // Delete a configuration
    const deleteConfiguration = async (configId: string) => {
        try {
            const response = await fetch(`/api/multi-log-configs/${configId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                throw new Error('Failed to delete configuration');
            }
            
            showToast('Configuration deleted', 'success');
            
            // If the active config was deleted, clear it
            if (activeConfig && activeConfig._id === configId) {
                setActiveConfig(null);
            }
            
            // Refresh configurations list
            fetchConfigurations();
            
        } catch (error) {
            console.error('Error deleting configuration:', error);
            showToast('Failed to delete configuration', 'error');
        }
    };

    // Silinmiş log ID'lerini takip etmek için state
    const [deletedLogIds, setDeletedLogIds] = useState<string[]>([]);

    // Silinen logların ref'i, state update async sorunlarını önlemek için
    const deletedLogsRef = useRef<string[]>([]);

    // Silinmiş log listesi değiştiğinde ref'i güncelle
    useEffect(() => {
        deletedLogsRef.current = deletedLogIds;
    }, [deletedLogIds]);

    // Interval durumunu takip eden ref
    const isIntervalActiveRef = useRef<boolean>(false);

    // Setup interval for real-time updates when logs are selected
    useEffect(() => {
        console.log(`Setting up interval effect: selectedLogs=${selectedLogs.length}, refreshRate=${refreshRate}s`);
        
        // Always clean up any existing interval first
        if (updateInterval) {
            console.log('Clearing existing interval');
            clearInterval(updateInterval);
            setUpdateInterval(null);
            isIntervalActiveRef.current = false;
        }

        // Takip edilen log kalmadıysa interval başlatma
        if (selectedLogs.length === 0) {
            console.log('No logs selected, not setting up interval');
            setChartData({ series: [], categories: [] });
            return;
        }

        // Silinen logları filtrele
        const actualLogsToFetch = selectedLogs.filter(log => !deletedLogsRef.current.includes(log._id));
        
        // Tüm loglar silinmişse interval başlatma
        if (actualLogsToFetch.length === 0) {
            console.log('All selected logs have been deleted, not setting up interval');
            setChartData({ series: [], categories: [] });
            return;
        }

        console.log('Setting up new interval for data fetching');
        
        // Initialize with initial data
        fetchSelectedLogsData();
        isIntervalActiveRef.current = true;

        // Create new interval with a function that checks current ref values
        const interval = setInterval(() => {
            console.log(`Interval triggered, checking if logs still available...`);
            
            // State değil ref kullanarak check et - asenkron sorunları önlemek için
            if (!isIntervalActiveRef.current) {
                console.log('Interval marked inactive, clearing');
                clearInterval(interval);
                setUpdateInterval(null);
                return;
            }
            
            // Silinenleri filtrele
            const currentLogsToFetch = selectedLogs.filter(log => !deletedLogsRef.current.includes(log._id));
            
            if (currentLogsToFetch.length === 0) {
                console.log('No logs available anymore, clearing interval');
                clearInterval(interval);
                setUpdateInterval(null);
                isIntervalActiveRef.current = false;
                return;
            }
            
            console.log(`Fetching data for ${currentLogsToFetch.length} logs...`);
            fetchSelectedLogsData();
        }, refreshRate * 1000);

        setUpdateInterval(interval as any);

        // Clean up interval when component unmounts or selectedLogs/refreshRate changes
        return () => {
            if (interval) {
                console.log('Cleanup: clearing interval on effect cleanup');
                clearInterval(interval);
                isIntervalActiveRef.current = false;
            }
        };
    }, [selectedLogs, refreshRate, logLimit]);
    
    // Monitor trendLogs changes to load configuration when data is ready
    useEffect(() => {
        if (trendLogs.length > 0 && configurations.length === 0) {
            // Trend logs are now available, fetch configurations if not done yet
            fetchConfigurations();
        }
    }, [trendLogs]);
    
    // Additional effect to monitor selectedLogs count changes
    // This helps ensure interval is properly managed when logs are deleted or removed
    useEffect(() => {
        console.log(`selectedLogs count changed to ${selectedLogs.length}`);
        
        // If all logs were removed, make sure interval is stopped
        if (selectedLogs.length === 0 && updateInterval) {
            console.log('All logs removed, ensuring interval is cleared');
            clearInterval(updateInterval);
            setUpdateInterval(null);
            setChartData({ series: [], categories: [] });
        }
    }, [selectedLogs.length]);

    const fetchData = async () => {
        const _analyzers = await fetchAnalyzers();
        const _gateways = await fetchGateways();
        const _registers = await fetchBuildings(_analyzers, _gateways);
        await fetchTrendLogs(_analyzers, _gateways, _registers);
    };

    const fetchAnalyzers = async () => {
        try {
            const response = await fetch('/api/analyzers');
            const data = await response.json();
            setAnalyzers(data);
            return data;
        } catch (error) {
            console.error('Error fetching analyzers:', error);
            return [];
        }
    };

    const fetchGateways = async () => {
        try {
            const response = await fetch('/api/gateway');
            const data = await response.json();
            setGateways(data);
            return data;
        } catch (error) {
            console.error('Error fetching gateway:', error);
            return [];
        }
    };

    const fetchBuildings = async (analyzers: any[], gateways: any[]) => {
        try {
            const response = await fetch('/api/units');
            const data = await response.json();
            const buildingsData = data.buildings;
            
            const allRegisters: any[] = [];
            for (const building of buildingsData) {
                const flowData = building.flowData;
                if (flowData && flowData.nodes && flowData.nodes.length > 0) {
                    for (const node of flowData.nodes) {
                        if (node.type === "registerNode") {
                            const analyzer = analyzers.find((a) => a._id === node.data.analyzerId);
                            if (analyzer) {
                                const gateway = gateways.find((g) => g._id === analyzer.gateway);
                                allRegisters.push({
                                    registerInfo: { id: node.id, ...node.data },
                                    analyzerInfo: analyzer,
                                    gatewayInfo: gateway,
                                    unit: <div className="flex items-center gap-1">
                                        {building.icon ? <div className="relative h-4 w-4">
                                            <img src={building.icon} alt={building.name} className="h-full w-full object-contain" />
                                        </div> : <Building className="h-4 w-4" />}
                                        <span>{building.name}</span>
                                    </div>,
                                });
                            }
                        }
                    }
                }

                // Process floors
                if (building.floors && building.floors.length > 0) {
                    for (const floor of building.floors) {
                        const flowData = floor.flowData;
                        if (flowData && flowData.nodes && flowData.nodes.length > 0) {
                            for (const node of flowData.nodes) {
                                if (node.type === "registerNode") {
                                    const analyzer = analyzers.find((a) => a._id === node.data.analyzerId);
                                    if (analyzer) {
                                        const gateway = gateways.find((g) => g._id === analyzer.gateway);
                                        allRegisters.push({
                                            registerInfo: { id: node.id, ...node.data },
                                            analyzerInfo: analyzer,
                                            gatewayInfo: gateway,
                                            unit: <div className="flex items-center gap-1">
                                                {building.icon ? <div className="relative h-4 w-4">
                                                    <img src={building.icon} alt={building.name} className="h-full w-full object-contain" />
                                                </div> : <Building className="h-4 w-4" />}
                                                <span>{building.name}</span>
                                                {floor.icon ? <div className="relative h-4 w-4">
                                                    <img src={floor.icon} alt={floor.name} className="h-full w-full object-contain" />
                                                </div> : <Layers className="h-4 w-4" />}
                                                {` > `}<span>{floor.name}</span>
                                            </div>,
                                        });
                                    }
                                }
                            }
                        }

                        // Process rooms
                        if (floor.rooms && floor.rooms.length > 0) {
                            for (const room of floor.rooms) {
                                const flowData = room.flowData;
                                if (flowData && flowData.nodes && flowData.nodes.length > 0) {
                                    for (const node of flowData.nodes) {
                                        if (node.type === "registerNode") {
                                            const analyzer = analyzers.find((a) => a._id === node.data.analyzerId);
                                            if (analyzer) {
                                                const gateway = gateways.find((g) => g._id === analyzer.gateway);
                                                allRegisters.push({
                                                    registerInfo: { id: node.id, ...node.data },
                                                    analyzerInfo: analyzer,
                                                    gatewayInfo: gateway,
                                                    unit: <div className="flex items-center gap-1">
                                                        {building.icon ? <div className="relative h-4 w-4">
                                                            <img src={building.icon} alt={building.name} className="h-full w-full object-contain" />
                                                        </div> : <Building className="h-4 w-4" />}
                                                        <span>{building.name}</span>
                                                        {floor.icon ? <div className="relative h-4 w-4">
                                                            <img src={floor.icon} alt={floor.name} className="h-full w-full object-contain" />
                                                        </div> : <Layers className="h-4 w-4" />}
                                                        {` > `}<span>{floor.name}</span>
                                                        {room.icon ? <div className="relative h-4 w-4">
                                                            <img src={room.icon} alt={room.name} className="h-full w-full object-contain" />
                                                        </div> : <DoorOpen className="h-4 w-4" />}
                                                        {` > `}<span>{room.name}</span>
                                                    </div>,
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            setRegisters(allRegisters);
            return allRegisters;
        } catch (error) {
            console.error('Error fetching buildings:', error);
            return [];
        }
    };

    const fetchTrendLogs = async (analyzers: any[], gateways: any[], registers: any[]) => {
        try {
            setIsLoading(true);
            const response = await fetch("/api/trend-logs");

            if (!response.ok) {
                throw new Error("Error fetching trend logs");
            }
            
            const data = await response.json();

            // Enrich trend logs with additional information
            for (let i = 0; i < data.length; i++) {
                try {
                    const register = registers.find((r) => r.registerInfo.id === data[i].registerId);
                    if (register) {
                        data[i].analyzer = register.analyzerInfo;
                        data[i].register = register.registerInfo;
                        data[i].gateway = register.gatewayInfo;
                        data[i].unit = register.unit;
                    }
                } catch (e) {
                    console.error(`Error enriching trend log #${i}:`, e);
                }
            }
            
            setTrendLogs(data);

            // Group by analyzerId
            const grouped = data.reduce((acc: Record<string, TrendLogType[]>, log: TrendLogType) => {
                const analyzerId = log.analyzerId;
                if (!acc[analyzerId]) {
                    acc[analyzerId] = [];
                }
                acc[analyzerId].push(log);
                return acc;
            }, {});
            
            setGroupedTrendLogs(grouped);
        } catch (error) {
            console.error("Error fetching trend logs:", error);
            showToast("Error fetching trend logs", "error");
        } finally {
            setIsLoading(false);
        }
    };

    // Fetch data for selected logs
    const fetchSelectedLogsData = async () => {
        console.log(`fetchSelectedLogsData called with ${selectedLogs.length} logs`);
        
        // Safety check - if there are no logs selected, don't try to fetch anything
        if (selectedLogs.length === 0) {
            console.log("No logs selected, clearing chart data");
            setChartData({ series: [], categories: [] });
            
            // Ensure interval is stopped when no logs are selected
            if (updateInterval) {
                console.log('No logs selected anymore, clearing interval');
                clearInterval(updateInterval);
                setUpdateInterval(null);
            }
            return;
        }
        
        // Önceden silinen logları seçili listeden çıkar - ref kullanarak güncel durumu al
        const logsToFetch = selectedLogs.filter(log => !deletedLogsRef.current.includes(log._id));
        
        // Eğer filtrelenmiş liste boşsa ve deletedLogIds listemizde log varsa, tüm loglar silinmiş demektir
        if (logsToFetch.length === 0 && deletedLogIds.length > 0) {
            console.log("All selected logs were previously deleted, clearing chart and stopping interval");
            setChartData({ series: [], categories: [] });
            
            // Seçili logları güncelleyelim - UI'da da gösterilmemesi için
            if (selectedLogs.length > 0) {
                setSelectedLogs([]);
                // Toast mesajı kaldırıldı - kullanıcı tarafından gereksiz bulundu
            }
            
            if (updateInterval) {
                clearInterval(updateInterval);
                setUpdateInterval(null);
            }
            return;
        }

        try {
            const allLogData: {
                id: string;
                name: string;
                data: { x: Date; y: number }[];
            }[] = [];

            // Silinen logları takip etmek için yeni bir array
            const newlyDeletedLogIds: string[] = [];
            console.log(`Fetching data for ${logsToFetch.length} logs with limit=${logLimit}`);
            
            // Fetch data for each selected log with limit parameter
            for (const log of logsToFetch) {
                try {
                    // Append limit parameter to fetch only the last N logs
                    const limitQuery = `?limit=${logLimit}`;
                    console.log(`Fetching data for log ${log._id}`);
                    
                    try {
                        const response = await fetch(`/api/trend-logs/${log._id}${limitQuery}`);
                        
                        if (response.status === 404) {
                            // This trend log has been deleted
                            console.log(`Trend log ${log._id} not found (404). It may have been deleted.`);
                            deletedLogIds.push(log._id);
                            continue;
                        }
                        
                        if (!response.ok) {
                            console.error(`Failed to fetch data for log ${log._id}: ${response.status}`);
                            continue;
                        }
                        
                        const data = await response.json();
                        const entries = data.trendLogData || [];
                        
                        if (entries.length > 0) {
                            console.log(`Received ${entries.length} entries for log ${log._id}`);
                            allLogData.push({
                                id: log._id,
                                name: `${log.register.label} (${log.analyzer.name})`,
                                data: entries.map((entry: any) => ({
                                    x: new Date(entry.timestamp),
                                    y: entry.value
                                }))
                            });
                        } else {
                            console.log(`No entries found for log ${log._id}`);
                        }
                    } catch (error) {
                        console.error(`Error fetching data for log ${log._id}:`, error);
                        // Ağ hatası veya diğer hata durumlarında, logu silinmiş olarak işaretleyelim
                        // Bu, tekrar denemeler sırasında gereksiz istekleri önler
                        console.warn(`Marking log ${log._id} as potentially deleted due to fetch error`);
                        newlyDeletedLogIds.push(log._id);
                    }
                } catch (error) {
                    console.error(`Error fetching data for log ${log._id}:`, error);
                }
            }

            // Yeni silinen logları kalıcı listeye ekle
            if (newlyDeletedLogIds.length > 0) {
                console.log(`${newlyDeletedLogIds.length} logs were newly found to be deleted`);
                setDeletedLogIds(prevIds => {
                    // Tekrarlardan kaçınmak için benzersiz liste oluştur
                    const combinedIds = [...prevIds, ...newlyDeletedLogIds];
                    return [...new Set(combinedIds)]; // Benzersiz değerler
                });
            }

            // Hem önceden silinmiş hem de yeni silinen logları birleştir
            const allDeletedIds = [...deletedLogIds, ...newlyDeletedLogIds];
            
            // Handle all deleted logs (both previously known and newly discovered)
            if (allDeletedIds.length > 0) {
                console.log(`${allDeletedIds.length} total deleted logs, removing them from selection`);
                // Remove deleted logs from selected logs
                const updatedSelectedLogs = selectedLogs.filter(log => !allDeletedIds.includes(log._id));
                
                // If the selected logs array actually changed (to prevent unnecessary rerenders)
                if (updatedSelectedLogs.length !== selectedLogs.length) {
                    // Hemen yeni state değerleriyle UI'ı güncelleyelim, böylece gereksiz yere istek yapmayız
                    setSelectedLogs(updatedSelectedLogs);
                    
                    // Show notification to the user
                    showToast(`${allDeletedIds.length} trend log(s) have been removed from selection because they no longer exist`, "warning");
                    
                    // If we have an active configuration, update it
                    if (activeConfig) {
                        // Tüm silinen log ID'lerini filtreleme
                        const updatedLogIds = activeConfig.trendLogIds.filter(id => !allDeletedIds.includes(id));
                        
                        if (updatedLogIds.length === 0) {
                            // If no logs left, delete the configuration
                            console.log(`All logs in configuration "${activeConfig.name}" were deleted, removing configuration`);
                            
                            // Immediately set active config to null to avoid further requests
                            const configToDelete = activeConfig._id;
                            const configName = activeConfig.name;
                            setActiveConfig(null);
                            
                            // İnterval işlemine devam etmeden önce konfigürasyonu sil
                            try {
                                await deleteConfiguration(configToDelete);
                                showToast(`Configuration "${configName}" was deleted because all its trend logs were deleted`, "info");
                            } catch (error) {
                                console.error(`Failed to delete configuration ${configName}:`, error);
                                // Başarısız olsa bile bu konfigürasyon için tekrar istek yapılmasını önle
                            }
                        } else if (updatedLogIds.length !== activeConfig.trendLogIds.length) {
                            // Update the configuration with remaining logs
                            console.log(`Updating configuration "${activeConfig.name}" to remove deleted logs`);
                            
                            // Immediately update local activeConfig to avoid errors before API call completes
                            const updatedConfig = {
                                ...activeConfig,
                                trendLogIds: updatedLogIds
                            };
                            setActiveConfig(updatedConfig);
                            
                            try {
                                // Mevcut refresh rate ve log limit değerlerini koru
                                await saveConfiguration(
                                    updatedLogIds,
                                    activeConfig.name,
                                    activeConfig.refreshRate,
                                    activeConfig.logLimit
                                );
                                showToast(`Configuration "${activeConfig.name}" was updated to remove deleted trend logs`, "info");
                            } catch (error) {
                                console.error(`Failed to update configuration ${activeConfig.name}:`, error);
                                // Başarısız olsa bile UI zaten güncel, tekrar denenebilir
                            }
                        }
                    }
                    
                    // If no logs left at all, clear the chart data and interval immediately
                    if (updatedSelectedLogs.length === 0) {
                        console.log("No logs left after removing deleted ones, clearing chart and interval");
                        setChartData({ series: [], categories: [] });
                        
                        // Clear any existing refresh interval
                        if (updateInterval) {
                            console.log('Clearing interval due to all logs being deleted');
                            clearInterval(updateInterval);
                            setUpdateInterval(null);
                            isIntervalActiveRef.current = false;
                        }
                        
                        return;
                    }
                }
            }

            // Process data for the chart
            if (allLogData.length > 0) {
                console.log(`Processing chart data for ${allLogData.length} logs`);
                const series = allLogData.map(logData => ({
                    name: logData.name,
                    data: logData.data.map(point => point.y)
                }));
                
                // Use timestamps from the first log for categories
                const categories = allLogData[0].data.map(point =>
                    new Date(point.x).toLocaleString('en-US')
                );
                
                setChartData({ series, categories });
            } else if (selectedLogs.length > 0 && deletedLogIds.length === 0) {
                // Only keep previous chart data if no logs were deleted and we still have selected logs
                console.log("No log data received but logs are selected, keeping previous chart data");
            } else {
                // Clear chart data if either:
                // 1. No logs are selected
                // 2. Some logs were deleted but we didn't get data for any remaining logs
                console.log("No logs selected or all selected logs were deleted, clearing chart");
                setChartData({ series: [], categories: [] });
                
                // If all selected logs were deleted, also stop the interval
                if (deletedLogIds.length > 0 && deletedLogIds.length === selectedLogs.length) {
                    console.log("All selected logs were deleted, stopping interval");
                    if (updateInterval) {
                        clearInterval(updateInterval);
                        setUpdateInterval(null);
                    }
                }
            }
        } catch (error) {
            console.error("Error fetching log data:", error);
        }
    };

    // Toggle log selection
    const toggleLogSelection = (log: TrendLogType) => {
        if (selectedLogs.some(selected => selected._id === log._id)) {
            setSelectedLogs(selectedLogs.filter(selected => selected._id !== log._id));
        } else {
            setSelectedLogs([...selectedLogs, log]);
        }
    };

    const isLogSelected = (logId: string) => {
        return selectedLogs.some(log => log._id === logId);
    };

    // Clear all selected logs and ensure interval is stopped
    const clearSelection = useCallback(() => {
        console.log('Manually clearing all selected logs');
        setSelectedLogs([]);
        
        // Explicitly clear any interval when logs are manually cleared
        if (updateInterval) {
            console.log('Clearing interval due to manual selection clear');
            clearInterval(updateInterval);
            setUpdateInterval(null);
        }
        
        // Clear chart data
        setChartData({ series: [], categories: [] });
    }, [updateInterval]);

    // Chart options
    const chartOptions: ApexOptions = {
        chart: {
            height: 500,
            type: "line",
            zoom: {
                enabled: true
            },
            toolbar: {
                show: true,
                tools: {
                    download: true,
                    selection: true,
                    zoom: true,
                    zoomin: true,
                    zoomout: true,
                    pan: true,
                    reset: true
                },
            },
            animations: {
                enabled: true,
            }
        },
        dataLabels: {
            enabled: false
        },
        stroke: {
            curve: "smooth",
            width: 3
        },
        colors: ["#008FFB", "#00E396", "#FEB019", "#FF4560", "#775DD0", "#546E7A", "#26a69a", "#D10CE8"],
        title: {
            text: "Multiple Trend Logs Visualization",
            align: "left"
        },
        grid: {
            borderColor: "#e0e0e0",
            row: {
                colors: ["#f3f3f3", "transparent"], // takes an array which will be repeated on rows
                opacity: 0.5
            }
        },
        markers: {
            size: 4
        },
        xaxis: {
            categories: chartData.categories,
            title: {
                text: "Time"
            },
            labels: {
                rotate: -45,
                rotateAlways: false,
                formatter: function(value) {
                    // Format timestamps for better readability
                    return value;
                }
            }
        },
        yaxis: {
            title: {
                text: "Value"
            },
            labels: {
                formatter: function(value) {
                    // Format y-axis values with fixed precision
                    return value.toFixed(4);
                }
            }
        },
        legend: {
            position: "top",
            horizontalAlign: "right",
            floating: false,
            offsetY: -25,
            offsetX: -5
        },
        tooltip: {
            shared: true,
            intersect: false,
            y: {
                formatter: function(value) {
                    return value.toFixed(4);
                }
            }
        }
    };

    // If loading auth, show spinner
    if (isAuthLoading) {
        return <Spinner variant="bars" fullPage />;
    }

    return (
        <div className="h-full">
            <PageBreadcrumb pageTitle="Multi Log Viewer" />
            
            <div className="mb-6 flex flex-wrap justify-between items-center gap-4">
                <div className="flex items-center">
                    <BarChart2 size={24} className="mr-2 text-blue-600" />
                    <Heading3>Multi Log Visualization</Heading3>
                </div>
                
                <div className="flex flex-wrap gap-3">
                    {/* Configuration Management */}
                    {configurations.length > 0 && (
                        <div className="flex items-center gap-2">
                            <select
                                name="configSelect"
                                className="form-select rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                                value={activeConfig?._id || ''}
                                onChange={(e) => {
                                    const configId = e.target.value;
                                    if (configId) {
                                        const config = configurations.find(c => c._id === configId);
                                        if (config) {
                                            setActiveConfig(config);
                                            loadConfiguration(config);
                                        }
                                    } else {
                                        setActiveConfig(null);
                                    }
                                }}
                            >
                                <option value="">Select Configuration</option>
                                {configurations.map(config => (
                                    <option key={config._id} value={config._id}>
                                        {config.name} ({config.trendLogIds.length} logs)
                                    </option>
                                ))}
                            </select>
                            
                            {activeConfig && (
                                <Button
                                    onClick={() => deleteConfiguration(activeConfig._id)}
                                    variant="error"
                                    size="sm"
                                >
                                    Delete
                                </Button>
                            )}
                        </div>
                    )}
                    
                    {/* Select Logs Button */}
                    <Button
                        onClick={() => setIsSelectionModalOpen(true)}
                        variant="primary"
                        leftIcon={<ListFilter size={16} />}
                    >
                        Select Logs {selectedLogs.length > 0 ? `(${selectedLogs.length})` : ''}
                    </Button>
                    
                    {/* Log Limit Selector - Always visible */}
                    <select
                        className="form-select rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                        value={logLimit}
                        onChange={(e) => {
                            const newLimit = Number(e.target.value);
                            setLogLimit(newLimit);
                            
                            // Aktif konfigürasyon varsa hemen güncelle
                            if (activeConfig) {
                                // Lokal state'i anında güncelle
                                setActiveConfig({
                                    ...activeConfig,
                                    logLimit: newLimit
                                });
                                
                                // Veritabanında da güncelle
                                saveConfiguration(
                                    activeConfig.trendLogIds,
                                    activeConfig.name,
                                    activeConfig.refreshRate, // Mevcut refresh rate'i koru
                                    newLimit // Yeni log limit değerini gönder
                                );
                                console.log(`Configuration ${activeConfig.name} logLimit updated to ${newLimit}`);
                            }
                        }}
                    >
                        <option value={50}>Last 50 Logs</option>
                        <option value={100}>Last 100 Logs</option>
                        <option value={200}>Last 200 Logs</option>
                        <option value={500}>Last 500 Logs</option>
                        <option value={1000}>Last 1000 Logs</option>
                    </select>
                    
                    {selectedLogs.length > 0 && (
                        <>
                            <Button
                                onClick={clearSelection}
                                variant="secondary"
                            >
                                Clear Selection
                            </Button>
                            <select
                                className="form-select rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                                value={refreshRate}
                                onChange={async (e) => {
                                    const newRate = Number(e.target.value);
                                    setRefreshRate(newRate);
                                    
                                    // Aktif konfigürasyon varsa hemen güncelle
                                    if (activeConfig) {
                                        try {
                                            console.log(`Updating configuration ${activeConfig.name} refreshRate to ${newRate}s`);
                                            
                                            // Önce lokal state'i güncelle ki UI hemen değişsin
                                            setActiveConfig({
                                                ...activeConfig,
                                                refreshRate: newRate
                                            });
                                            
                                            // Sonra veritabanında güncelle
                                            await saveConfiguration(
                                                activeConfig.trendLogIds,
                                                activeConfig.name,
                                                newRate,  // Yeni refresh rate değerini doğrudan geçir
                                                activeConfig.logLimit // Mevcut log limit değerini kullan
                                            );
                                            
                                            showToast(`Refresh rate updated to ${newRate}s`, 'success');
                                        } catch (error) {
                                            console.error("Error updating refresh rate:", error);
                                            showToast("Failed to update refresh rate", "error");
                                            
                                            // Hata durumunda UI'ı eski değere geri al
                                            setRefreshRate(activeConfig.refreshRate);
                                        }
                                    }
                                }}
                            >
                                <option value={5}>Refresh: 5s</option>
                                <option value={10}>Refresh: 10s</option>
                                <option value={30}>Refresh: 30s</option>
                                <option value={60}>Refresh: 1m</option>
                                <option value={300}>Refresh: 5m</option>
                            </select>
                        </>
                    )}
                </div>
            </div>
            
            {/* Selection Modal */}
            <TrendLogSelectionModal
                isOpen={isSelectionModalOpen}
                onClose={() => setIsSelectionModalOpen(false)}
                trendLogs={trendLogs}
                groupedTrendLogs={groupedTrendLogs}
                selectedLogs={selectedLogs}
                onSave={async (selectedLogIds, name) => {
                    // Mevcut logLimit ve refreshRate değerlerini kullan
                    await saveConfiguration(selectedLogIds, name, refreshRate, logLimit);
                    // Update selected logs based on selection from modal
                    const selectedTrendLogs = trendLogs.filter(log =>
                        selectedLogIds.includes(log._id)
                    );
                    setSelectedLogs(selectedTrendLogs);
                    
                    // Yeni bir konfigürasyon kaydettikten sonra fetchConfigurations ile güncel listeyi al
                    // Bu, yeni oluşturulan konfigürasyonun UI'da görünmesini sağlar
                    await fetchConfigurations();
                }}
                isLoading={isLoading}
            />
            
            {/* Selected Trend Logs Summary */}
            <div className="mb-6">
                {selectedLogs.length > 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                        <div className="font-medium text-gray-800 dark:text-gray-200 mb-3 flex justify-between items-center">
                            <span>Selected Trend Logs</span>
                            <span className="text-sm text-blue-600 dark:text-blue-400">{selectedLogs.length} logs selected</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {selectedLogs.map(log => (
                                <div
                                    key={log._id}
                                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full text-sm"
                                >
                                    <ChartLine size={14} />
                                    <span>{log.register.label}</span>
                                    <button
                                        onClick={() => toggleLogSelection(log)}
                                        className="ml-1 text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100"
                                    >
                                        &times;
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 text-center">
                        <SmallText className="text-gray-500 dark:text-gray-400">
                            No trend logs selected. Click 'Select Logs' to choose logs for visualization.
                        </SmallText>
                    </div>
                )}
            </div>
            
            {/* Chart Section */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4" style={{ height: "calc(100vh - 250px)", minHeight: "500px" }}>
                <div className="text-sm text-gray-500 mb-2 flex justify-between items-center">
                    <span>Showing the last {logLimit} log entries per trend (most recent data)</span>
                    <div className="flex items-center gap-2">
                        {activeConfig && (
                            <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 px-2 py-1 rounded text-xs">
                                Config: {activeConfig.name}
                            </span>
                        )}
                        {chartData.series.length > 0 && (
                            <span>Data points: {chartData.series.reduce((sum, series) => sum + series.data.length, 0)}</span>
                        )}
                    </div>
                </div>
                {selectedLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full">
                        <BarChart2 size={48} className="text-gray-300 dark:text-gray-600 mb-4" />
                        <p className="text-gray-500 dark:text-gray-400">Select trend logs to display chart</p>
                    </div>
                ) : (
                    chartData.series.length > 0 ? (
                        <ReactApexChart 
                            options={chartOptions}
                            series={chartData.series}
                            type="line"
                            height="100%"
                            width="100%"
                        />
                    ) : (
                        <div className="flex justify-center items-center h-full">
                            <Spinner variant="bars" />
                        </div>
                    )
                )}
            </div>
        </div>
    );
}