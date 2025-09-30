"use client";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import TrendLogForm from "@/components/TrendLogs/TrendLogForm";
import { showAlert, showConfirmAlert, showErrorAlert, showToast } from "@/components/ui/alert";
import { Button } from "@/components/ui/button/CustomButton";
import IconButton from "@/components/ui/icon-button";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { Heading3, Paragraph, SmallText } from "@/components/ui/typography";
import { useAuth } from "@/hooks/use-auth";
import { Building, ChartLine, DoorOpen, Eye, FileText, Layers, Pencil, PlusCircle, Trash2, User } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import * as XLSX from 'xlsx';
// Window nesnesine erişen bileşenleri dinamik olarak import ediyoruz
const LogChartModal = dynamic(() => import("@/components/TrendLogs/LogChartModal"), { ssr: false });
const ShowLogsModal = dynamic(() => import("@/components/TrendLogs/ShowLogsModal"), { ssr: false });


import { Node } from "reactflow";
// Kullanıcı tipi
export interface TrendLogType {
    gateway: any;
    _id: string;
    analyzerId: string;
    registerId: string;
    isKWHCounter: boolean;
    period: string;
    interval: number;
    endDate: string;
    cleanupPeriod?: number; // onChange modunda kullanılan otomatik temizleme süresi (ay)
    percentageThreshold?: number; // onChange modunda kullanılan yüzde eşiği
    unit: any;
    analyzer: any;
    register: any;
}

export default function TrendLogPage() {
    const [trendLogs, setTrendLogs] = useState<TrendLogType[]>([]);
    const [groupedTrendLogs, setGroupedTrendLogs] = useState<Record<string, TrendLogType[]>>({});
    const [isLoading, setIsLoading] = useState(false);

    // Modal durumları
    const [isAddTrendLogModalOpen, setIsAddTrendLogModalOpen] = useState(false);
    const [isEditTrendLogModalOpen, setIsEditTrendLogModalOpen] = useState(false);
    const [selectedTrendLog, setSelectedTrendLog] = useState<TrendLogType | undefined>(undefined);
    const [analyzers, setAnalyzers] = useState<any[]>([]);
    const [gateways, setGateways] = useState<any[]>([]);
    const { user, isAdmin, isLoading: isAuthLoading } = useAuth();
    const [registers, setRegisters] = useState<any[]>([]);
    const [buildings, setBuildings] = useState<any[]>([]);
    const [isShowLogsModalOpen, setIsShowLogsModalOpen] = useState(false);
    const [isShowChartModalOpen, setIsShowChartModalOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    //console.log("isAuthLoading: ", isAuthLoading)


    const fetchBuildings = async (analyzers: any[], gateways: any[]) => {
        console.warn("fetch buildings")
        try {
            const response = await fetch('/api/units');
            const data = await response.json();
            const buildingsData = data.buildings;
            //console.log("buildingsData", buildingsData);
            const allRegisters: any[] = [];
            for (const building of buildingsData) {
                const flowData = building.flowData;
                //console.log("flowData", flowData);
                if (flowData && flowData.nodes && flowData.nodes.length > 0) {
                    for (const node of flowData.nodes) {
                        if ((node as Node).type == "registerNode") {
                            const analyzer = analyzers.find((analyzer) => analyzer._id == node.data.analyzerId);
                            const gateway = gateways.find((gateway) => gateway._id == analyzer.gateway);
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
                if (building.floors && building.floors.length > 0) {
                    for (const floor of building.floors) {
                        const flowData = floor.flowData;
                        if (flowData && flowData.nodes && flowData.nodes.length > 0) {
                            for (const node of flowData.nodes) {
                                if ((node as Node).type == "registerNode") {
                                    const analyzer = analyzers.find((analyzer) => analyzer._id == node.data.analyzerId);
                                    const gateway = gateways.find((gateway) => gateway._id == analyzer.gateway);
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
                        if (floor.rooms && floor.rooms.length > 0) {
                            for (const room of floor.rooms) {
                                const flowData = room.flowData;
                                if (flowData && flowData.nodes && flowData.nodes.length > 0) {
                                    for (const node of flowData.nodes) {
                                        if ((node as Node).type == "registerNode") {
                                            const analyzer = analyzers.find((analyzer) => analyzer._id == node.data.analyzerId);
                                            const gateway = gateways.find((gateway) => gateway._id == analyzer.gateway);
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
            //console.log("registerNodes", allRegisters);
            setRegisters(allRegisters);
            setBuildings(data.buildings);
            return allRegisters

        } catch (error) {
            console.error('Error fetching buildings:', error);
            return []
        }
    };
    const fetchAnalyzers = async () => {
        try {
            const response = await fetch('/api/analyzers');
            const data = await response.json();
            //console.log("data", data);
            setAnalyzers(data);
            return data
        } catch (error) {
            console.error('Error fetching analyzers:', error);
        }
    };

    const fetchGateways = async () => {
        try {
            const response = await fetch('/api/gateway');
            const data = await response.json();
            //console.log("data", data);
            setGateways(data);
            return data
        } catch (error) {
            console.error('Error fetching gateway:', error);
        }
    };

    const fetchData = async () => {
        const _analyzers = await fetchAnalyzers()
        const _gateways = await fetchGateways()
        const _registers = await fetchBuildings(_analyzers, _gateways)
        const _trendLogs = await fetchTrendLogs(_analyzers, _gateways, _registers)
    }
    useEffect(() => {
        if (!isAuthLoading && (isAdmin || user?.permissions?.trendLog)) {
            fetchData()
        }
    }, [isAuthLoading]);
    // Kullanıcıları getir
    const fetchTrendLogs = async (analyzers: any[], gateways: any[], registers: any[]) => {
        try {
            setIsLoading(true);
            const response = await fetch("/api/trend-logs");

            if (!response.ok) {
                throw new Error("Error fetching  trend logs");
            }
            //console.log("registers", registers)
            const data = await response.json();

            for (let i = 0; i < data.length; i++) {
                const analyzer = registers.find((register: any) => register.analyzerInfo._id === data[i].analyzerId).analyzerInfo;
                data[i].analyzer = analyzer;
                data[i].register = registers.find((register: any) => register.registerInfo.id === data[i].registerId).registerInfo;
                data[i].gateway = registers.find((register: any) => register.gatewayInfo._id === analyzer.gateway).gatewayInfo
                data[i].unit = registers.find((register: any) => register.registerInfo.id === data[i].registerId).unit
            }
            //console.log("trendlogs data: ", data)
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
            console.error("Error fetching  trend logs:", error);
            showToast("Error fetching trend logs", "error");
        } finally {
            setIsLoading(false);
        }
    };


    // Kullanıcı ekle modalını aç
    const openAddTrendLogModal = () => {
        setSelectedTrendLog(undefined);
        setIsAddTrendLogModalOpen(true);
    };

    // Kullanıcı ekle
    const handleAddTrendLog = async (TrendLogData:
        {
            period: string;
            endDate: string;
            analyzerId: string;
            registerId: string;
            isKWHCounter: boolean;
            interval: number;
            address: number;
            dataType: string;
            byteOrder: string;
            scale: number;
        }) => {
        try {
            const response = await fetch("/api/trend-logs", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(TrendLogData),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Trend log could not be added");
            }

            showToast("Trend log added successfully");
            setIsAddTrendLogModalOpen(false);
            fetchData()
        } catch (error: any) {
            showToast(error.message || "Trend log could not be added", "error");
        }
    };

    // Kullanıcı düzenle modalını aç
    const openEditTrendLogModal = (TrendLog: TrendLogType) => {
        setSelectedTrendLog(TrendLog);
        setIsEditTrendLogModalOpen(true);
    };

    // Kullanıcı düzenle
    const handleEditTrendLog = async (TrendLogData: {
        period: string;
        endDate: string;
        analyzerId: string;
        registerId: string;
        isKWHCounter: boolean;
        interval: number;
        address: number;
        dataType: string;
        byteOrder: string;
        scale: number;
        cleanupPeriod?: number;
        percentageThreshold?: number;
    }) => {
        if (!selectedTrendLog) return;

        try {
            // Eğer password boşsa, API'ye göndermiyoruz
            const dataToSend = {
                period: TrendLogData.period,
                endDate: TrendLogData.endDate,
                analyzerId: TrendLogData.analyzerId,
                registerId: TrendLogData.registerId,
                isKWHCounter: TrendLogData.isKWHCounter,
                interval: TrendLogData.interval,
                address: TrendLogData.address,
                dataType: TrendLogData.dataType,
                byteOrder: TrendLogData.byteOrder,
                scale: TrendLogData.scale,
                cleanupPeriod: TrendLogData.cleanupPeriod,
                percentageThreshold: TrendLogData.percentageThreshold,
            };
            //console.log("dataToSend", dataToSend)
            const response = await fetch(`/api/trend-logs/${selectedTrendLog._id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(dataToSend),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Trend log could not be updated");
            }

            showToast("Trend log updated successfully");
            setIsEditTrendLogModalOpen(false);
            fetchData();
        } catch (error: any) {
            showToast(error.message || "Trend log could not be updated", "error");
        }
    };
    const exportToXls = async (trendLog: TrendLogType): Promise<boolean> => {
        try {
            //önce tüm veriyi çek
            const response = await fetch(`/api/trend-logs/${trendLog._id}`);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Failed to fetch log data for export");
            }

            const responseData = await response.json();
            const logs = responseData.trendLogData;

            if (!logs || logs.length === 0) {
                showToast("No log data to export", "warning");
                return false; // Indicate that export did not happen
            }

            // XLSX formatı için veri hazırlama
            const data = logs.map((log: any) => ({
                Timestamp: new Date(log.timestamp).toLocaleString('en-US'),
                Value: Number(log.value.toFixed(4)),
            }));

            // XLSX dosyası oluşturma
            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Trend Log Data");

            // Sütun genişliklerini ayarlama
            const maxWidth = 20;
            const wscols = [
                { wch: maxWidth }, // Timestamp
                { wch: maxWidth },      // Value
            ];
            worksheet['!cols'] = wscols;

            // Dosya adı oluşturma
            const fileName = `trend_log_${trendLog.register.label}_${new Date().toLocaleString('en-US')}.xlsx`; //local saati ekle

            // XLSX dosyasını indirme
            XLSX.writeFile(workbook, fileName);
            return true; // Indicate success
        } catch (error: any) {
            console.error("Export error:", error);
            showToast(error.message || "Trend log could not be exported to Excel", "error");
            return false; // Indicate failure
        }
    };

    // Kullanıcı sil
    const handleDeleteTrendLog = async (TrendLog: TrendLogType) => {
        const result = await showConfirmAlert(
            "Delete TrendLog",
            "TrendLog will be deleted. Are you sure?",
            "Yes",
            "Cancel",
        );
        //console.log("TrendLog: ", TrendLog)
        if (result.isConfirmed) {
            setDeleting(true);
            try {
                const exportSuccess = await exportToXls(TrendLog);

                // Sadece export başarılı olduysa silme işlemine devam et.
                if (exportSuccess) {
                    const response = await fetch(`/api/trend-logs/${TrendLog._id}`, {
                        method: "DELETE",
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || "TrendLog could not be deleted after export");
                    }

                    showToast("TrendLog exported and deleted successfully");
                    fetchData();
                } else {
                    showToast("Export failed or cancelled, deletion aborted.", "warning");
                }
            } catch (error: any) {
                showErrorAlert(error.message || "An error occurred during the process");
            } finally {
                setDeleting(false);
            }
        }
    };
    // const exportToXls = async (TrendLog: TrendLogType) => {
    //     try {
    //         const response = await fetch(`/api/trend-logs/${TrendLog._id}/export-to-xls`, {
    //             method: "GET",
    //         });

    //         if (!response.ok) {
    //             const errorData = await response.json();
    //             throw new Error(errorData.error || "Trend log could not be exported to XLS");
    //         }

    //         showToast("Trend log exported to XLS successfully");
    //     } catch (error: any) {
    //         showToast(error.message || "Trend log could not be exported to XLS", "error");
    //     }
    // };

    const openShowLogsModal = (TrendLog: TrendLogType) => {
        setSelectedTrendLog(TrendLog);
        setIsShowLogsModalOpen(true);
    };
    const openShowChartModal = (TrendLog: TrendLogType) => {
        setSelectedTrendLog(TrendLog);
        setIsShowChartModalOpen(true);
    };
    // Admin değilse erişimi engelle
    if (isAuthLoading) {
        return <Spinner variant="bars" fullPage />
    } 

    return (
        <div>
            <PageBreadcrumb pageTitle="Trend Log Settings" />

            <div className="flex justify-between items-center mb-6">
                {/* "Add Trend Log" butonunu sadece admin kullanıcılar görebilir */}
                {isAdmin && (
                    <Button
                        onClick={openAddTrendLogModal}
                        leftIcon={<PlusCircle size={16} />}
                        variant="primary"
                    >
                        Add Trend Log
                    </Button>
                )}
            </div>

            {isLoading ? (
                <div className="flex justify-center py-8">
                    <Spinner variant="bars" fullPage />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Object.keys(groupedTrendLogs).length === 0 ? (
                        <div className="col-span-full text-center py-8">
                            <SmallText className="text-gray-500 dark:text-gray-400">No TrendLogs found</SmallText>
                        </div>
                    ) : (
                        Object.entries(groupedTrendLogs).map(([analyzerId, logs]) => {
                            const analyzer = logs[0].analyzer;
                            return (
                                <div key={analyzerId} className="bg-gradient-to-br from-white to-blue-50 dark:from-gray-800 dark:to-blue-900/20 rounded-xl shadow-md border border-blue-100 dark:border-blue-900/30 overflow-hidden flex flex-col h-full">
                                    {/* Analyzer başlık kısmı - Ortalanmış */}
                                    <div className="bg-blue-600/10 dark:bg-blue-800/30 px-6 py-4 border-b border-blue-100 dark:border-blue-800/30 text-center">
                                        <Heading3 className="text-lg font-semibold text-blue-700 dark:text-blue-300">
                                            {analyzer.name} <span className="text-blue-500 dark:text-blue-400 font-normal">(Slave: {analyzer.slaveId})</span>
                                        </Heading3>
                                        <div className="flex items-center justify-center mt-2">
                                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 text-sm font-medium mr-2">
                                                {logs.length}
                                            </span>
                                            <Paragraph className="text-sm text-blue-600 dark:text-blue-400">
                                                Trend Log{logs.length > 1 ? 's' : ''}
                                            </Paragraph>
                                        </div>
                                    </div>
                                    
                                    {/* İçerik kısmı */}
                                    <div className="p-6">
                                        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                                            {logs.map((TrendLog) => (
                                                <div key={TrendLog._id} className="border border-blue-100 dark:border-blue-900/30 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 bg-blue-50/80 dark:bg-blue-900/20">
                                                    {/* Trend log başlık - Ortalanmış ve Daha Belirgin */}
                                                    <div className="py-3 border-b border-blue-100 dark:border-blue-800/30 text-center bg-blue-50 dark:bg-blue-900/30">
                                                        <div className="text-center font-medium text-blue-700 dark:text-blue-400 text-base">
                                                            Register
                                                        </div>
                                                    </div>
                                                    
                                                    {/* Trend log bilgi kısmı - Daha düzenli */}
                                                    <div className="p-4">
                                                        {/* İki satır halinde bilgi etiketleri */}
                                                        <div className="grid grid-cols-2 gap-2 mb-4">
                                                            <div className="col-span-1 text-center">
                                                                <div className="bg-white dark:bg-gray-800 py-2 px-3 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 h-full flex flex-col justify-center">
                                                                    <span className="font-medium text-gray-500 dark:text-gray-400 text-xs block mb-1">Address:</span>
                                                                    <span className="font-medium text-blue-600 dark:text-blue-300 text-sm">{TrendLog.register.address}</span>
                                                                </div>
                                                            </div>
                                                            <div className="col-span-1 text-center">
                                                                <div className="bg-white dark:bg-gray-800 py-2 px-3 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 h-full flex flex-col justify-center">
                                                                    <span className="font-medium text-gray-500 dark:text-gray-400 text-xs block mb-1">Interval:</span>
                                                                    <span className="font-medium text-blue-600 dark:text-blue-300 text-sm">{TrendLog.interval} {TrendLog.period}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        
                                                        {/* Aksiyon butonları - ortalanmış ve daha modern */}
                                                        <div className="flex justify-center space-x-3">
                                                            <IconButton
                                                                size="sm"
                                                                onClick={() => openShowLogsModal(TrendLog)}
                                                                icon={<Eye size={14} />}
                                                                variant="secondary"
                                                                shape="circle"
                                                                className="p-2 shadow-sm hover:shadow transition-shadow"
                                                            />
                                                            <IconButton
                                                                size="sm"
                                                                onClick={() => openShowChartModal(TrendLog)}
                                                                icon={<ChartLine size={14} />}
                                                                variant="primary"
                                                                shape="circle"
                                                                className="p-2 shadow-sm hover:shadow transition-shadow"
                                                            />
                                                            {isAdmin && (
                                                                <IconButton
                                                                    size="sm"
                                                                    onClick={() => openEditTrendLogModal(TrendLog)}
                                                                    icon={<Pencil size={14} />}
                                                                    variant="warning"
                                                                    shape="circle"
                                                                    className="p-2 shadow-sm hover:shadow transition-shadow"
                                                                />
                                                            )}
                                                            {isAdmin && (
                                                                <IconButton
                                                                    disabled={deleting}
                                                                    size="sm"
                                                                    onClick={() => handleDeleteTrendLog(TrendLog)}
                                                                    icon={<Trash2 size={14} />}
                                                                    variant="error"
                                                                    shape="circle"
                                                                    className="p-2 shadow-sm hover:shadow transition-shadow"
                                                                />
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}
            {/* Show Logs Modal */}
            {isShowLogsModalOpen && selectedTrendLog && <ShowLogsModal
                trendLogId={selectedTrendLog._id}
                registerName={selectedTrendLog.register.label}
                onClose={() => setIsShowLogsModalOpen(false)}
                isOpen={isShowLogsModalOpen}
            />}
            {/* Show Chart Modal */}
            {isShowChartModalOpen && selectedTrendLog && <LogChartModal
                trendLogId={selectedTrendLog._id}
                registerName={selectedTrendLog.register.label}
                onClose={() => setIsShowChartModalOpen(false)}
                isOpen={isShowChartModalOpen}
            />}
            {/* Trend Log Ekle Modal */}
            <Modal
                isOpen={isAddTrendLogModalOpen}
                onClose={() => setIsAddTrendLogModalOpen(false)}
                className="max-w-2xl"
            >
                <TrendLogForm
                    onSubmit={handleAddTrendLog}
                    onCancel={() => setIsAddTrendLogModalOpen(false)}
                    usedRegisters={trendLogs.map((trendLog) => trendLog.registerId)}
                    analyzers={analyzers}
                />
            </Modal>

            {/* Kullanıcı Düzenle Modal */}
            <Modal
                isOpen={isEditTrendLogModalOpen}
                onClose={() => setIsEditTrendLogModalOpen(false)}
                className="max-w-2xl"
            >
                {selectedTrendLog && (
                    <TrendLogForm
                        trendLog={selectedTrendLog}
                        onSubmit={handleEditTrendLog}
                        onCancel={() => setIsEditTrendLogModalOpen(false)}
                        usedRegisters={trendLogs.map((trendLog) => trendLog.registerId).filter((id) => id !== selectedTrendLog.registerId)}
                        analyzers={analyzers}
                    />
                )}
            </Modal>
        </div>
    );
}
