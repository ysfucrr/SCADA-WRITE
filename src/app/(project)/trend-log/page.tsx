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
    rtu: any;
    _id: string;
    analyzerId: string;
    registerId: string;
    isKWHCounter: boolean;
    period: string;
    interval: number;
    endDate: string;
    unit: any;
    analyzer: any;
    register: any;
}

export default function TrendLogPage() {
    const [trendLogs, setTrendLogs] = useState<TrendLogType[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Modal durumları
    const [isAddTrendLogModalOpen, setIsAddTrendLogModalOpen] = useState(false);
    const [isEditTrendLogModalOpen, setIsEditTrendLogModalOpen] = useState(false);
    const [selectedTrendLog, setSelectedTrendLog] = useState<TrendLogType | undefined>(undefined);
    const [analyzers, setAnalyzers] = useState<any[]>([]);
    const [rtus, setRTUs] = useState<any[]>([]);
    const { user, isAdmin, isLoading: isAuthLoading } = useAuth();
    const [registers, setRegisters] = useState<any[]>([]);
    const [buildings, setBuildings] = useState<any[]>([]);
    const [isShowLogsModalOpen, setIsShowLogsModalOpen] = useState(false);
    const [isShowChartModalOpen, setIsShowChartModalOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    //console.log("isAuthLoading: ", isAuthLoading)


    const fetchBuildings = async (analyzers: any[], rtus: any[]) => {
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
                            const rtu = rtus.find((rtu) => rtu._id == analyzer.gateway);
                            allRegisters.push({
                                registerInfo: { id: node.id, ...node.data },
                                analyzerInfo: analyzer,
                                rtuInfo: rtu,
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
                                    const rtu = rtus.find((rtu) => rtu._id == analyzer.gateway);
                                    allRegisters.push({
                                        registerInfo: { id: node.id, ...node.data },
                                        analyzerInfo: analyzer,
                                        rtuInfo: rtu,
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
                                            const rtu = rtus.find((rtu) => rtu._id == analyzer.gateway);
                                            allRegisters.push({
                                                registerInfo: { id: node.id, ...node.data },
                                                analyzerInfo: analyzer,
                                                rtuInfo: rtu,
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

    const fetchRTUs = async () => {
        try {
            const response = await fetch('/api/RTUs');
            const data = await response.json();
            //console.log("data", data);
            setRTUs(data);
            return data
        } catch (error) {
            console.error('Error fetching rtus:', error);
        }
    };

    const fetchData = async () => {
        const _analyzers = await fetchAnalyzers()
        const _rtus = await fetchRTUs()
        const _registers = await fetchBuildings(_analyzers, _rtus)
        const _trendLogs = await fetchTrendLogs(_analyzers, _rtus, _registers)
    }
    useEffect(() => {
        if (!isAuthLoading && (isAdmin || user?.permissions?.trendLog)) {
            fetchData()
        }
    }, [isAuthLoading]);
    // Kullanıcıları getir
    const fetchTrendLogs = async (analyzers: any[], rtus: any[], registers: any[]) => {
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
                data[i].rtu = registers.find((register: any) => register.rtuInfo._id === analyzer.gateway).rtuInfo
                data[i].unit = registers.find((register: any) => register.registerInfo.id === data[i].registerId).unit
            }
            //console.log("trendlogs data: ", data)
            setTrendLogs(data);
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
    const exportToXls = async (trendLog: TrendLogType) => {
        try {
            //console.log("trendLog", trendLog)
            //önce tüm veriyi çek
            const response = await fetch(`/api/trend-logs/${trendLog._id}`);
            const responseData = (await response.json())
            //console.log("responseData", responseData)
            const logs = responseData.trendLogData
            //console.log("logs: ", logs)

            if (!logs || logs.length === 0) {
                showToast("No log data to export", "warning");
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

            // showToast("Trend log exported to Excel successfully");
        } catch (error: any) {
            console.error("Export error:", error);
            showToast(error.message || "Trend log could not be exported to Excel", "error");
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
                exportToXls(TrendLog);
                const response = await fetch(`/api/trend-logs/${TrendLog._id}`, {
                    method: "DELETE",
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || "TrendLog could not be deleted");
                }

                showToast("TrendLog deleted successfully");
                setDeleting(false);
                fetchData();
            } catch (error: any) {
                showErrorAlert(error.message || "TrendLog could not be deleted");
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
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                    <div className="overflow-x-auto">
                        <div className="overflow-x-auto w-full">
                            <table className="w-full">
                                <thead className="bg-gray-100 dark:bg-black/50">
                                    <tr>
                                        <th className="px-4 sm:px-6 py-3 text-left">
                                            <SmallText className="font-bold uppercase tracking-wider">Unit</SmallText>
                                        </th>
                                        <th className="px-4 sm:px-6 py-3 text-left hidden lg:table-cell">
                                            <SmallText className="font-bold uppercase tracking-wider">Analyzer</SmallText>
                                        </th>
                                        <th className="px-4 sm:px-6 py-3 text-left hidden lg:table-cell">
                                            <SmallText className="font-bold uppercase tracking-wider">Gateway</SmallText>
                                        </th>
                                        <th className="px-4 sm:px-6 py-3 text-left hidden lg:table-cell">
                                            <SmallText className="font-bold uppercase tracking-wider">Address</SmallText>
                                        </th>
                                        <th className="px-4 sm:px-6 py-3 text-left hidden lg:table-cell">
                                            <SmallText className="font-bold uppercase tracking-wider">Interval</SmallText>
                                        </th>
                                        <th className="px-4 sm:px-6 py-3 text-right">
                                            <SmallText className="font-bold uppercase tracking-wider">Actions</SmallText>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {trendLogs.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-4 sm:px-6 py-4 text-center">
                                                <SmallText className="text-gray-500 dark:text-gray-400">No TrendLogs found</SmallText>
                                            </td>
                                        </tr>
                                    ) : (
                                        trendLogs.map((TrendLog) => (
                                            <tr key={TrendLog._id} className="hover:bg-gray-50 dark:bg-gray-800/30">
                                                <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                                                    <div className="hidden lg:block font-medium text-gray-800 dark:text-gray-300">{TrendLog.unit}</div>
                                                    <div className="lg:hidden mt-1 space-y-1">
                                                        <div
                                                            className="p-2 cursor-pointer grid grid-cols-[1fr_3fr] text-xs space-y-2 w-full"
                                                        >

                                                            <div className="font-bold"> Unit </div>
                                                            <div className="font-normal">{TrendLog.unit}</div>
                                                            <div className="font-bold"> Analyzer </div>
                                                            <div className="font-normal">{TrendLog.analyzer.name} (Slave: {TrendLog.analyzer.slaveId})</div>
                                                            <div className="font-bold"> RTU </div>
                                                            <div className="font-normal">{TrendLog.rtu.name} </div>
                                                            <div className="font-bold"> Address </div>
                                                            <div className="font-normal">{TrendLog.register.address}</div>
                                                            <div className="font-bold"> Interval </div>
                                                            <div className="font-normal">{TrendLog.interval}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 sm:px-6 py-4 whitespace-nowrap hidden lg:table-cell">
                                                    <Paragraph className="font-medium text-gray-500 dark:text-gray-400">
                                                        {TrendLog.analyzer.name} (Slave: {TrendLog.analyzer.slaveId})
                                                    </Paragraph>
                                                </td>
                                                <td className="px-4 sm:px-6 py-4 whitespace-nowrap hidden lg:table-cell">
                                                    <span className={`inline-block px-2 py-1 rounded-full text-blue-600 dark:text-blue-400`}>
                                                        {TrendLog.rtu.name}
                                                    </span>
                                                </td>
                                                <td className="px-4 sm:px-6 py-4 whitespace-nowrap hidden lg:table-cell">
                                                    <span className={`inline-block px-2 py-1 rounded-full text-blue-600 dark:text-blue-400`}>
                                                        {TrendLog.register.address}
                                                    </span>
                                                </td>
                                                <td className="px-4 sm:px-6 py-4 whitespace-nowrap hidden lg:table-cell">
                                                    <span className={`inline-block px-2 py-1 rounded-full text-blue-600 dark:text-blue-400`}>
                                                        {TrendLog.interval} {TrendLog.period}
                                                    </span>
                                                </td>
                                                <td className="px-4 sm:px-6 whitespace-nowrap text-right">
                                                    <div className="flex justify-end space-x-1 sm:space-x-2 h-full ">
                                                        {/* Show logs ve export to xls butonları */}
                                                        <IconButton
                                                            size="sm"
                                                            onClick={() => openShowLogsModal(TrendLog)}
                                                            icon={<Eye size={14} />}
                                                            variant="secondary"
                                                            shape="circle"
                                                            className="p-2 sm:p-3"
                                                        />
                                                        {/* Show chart */}
                                                        <IconButton
                                                            size="sm"
                                                            onClick={() => openShowChartModal(TrendLog)}
                                                            icon={<ChartLine size={14} />}
                                                            variant="primary"
                                                            shape="circle"
                                                            className="p-2 sm:p-3"
                                                        />
                                                        {/* <IconButton
                                                            size="sm"
                                                            onClick={() => exportToXls(TrendLog)}
                                                            icon={<FileText size={14} />}
                                                            variant="primary"
                                                            shape="circle"
                                                            className="px-2 sm:px-3"
                                                        /> */}
                                                        {/* Düzenleme butonu sadece admin kullanıcılar tarafından görülür */}
                                                        {isAdmin && (
                                                            <IconButton
                                                                size="sm"
                                                                onClick={() => openEditTrendLogModal(TrendLog)}
                                                                icon={<Pencil size={14} />}
                                                                variant="warning"
                                                                shape="circle"
                                                                className="px-2 sm:px-3"
                                                            />
                                                        )}
                                                        {/* Silme butonu sadece admin kullanıcılar tarafından görülür */}
                                                        {isAdmin && (
                                                            <IconButton
                                                                disabled={deleting}
                                                                size="sm"
                                                                onClick={() => handleDeleteTrendLog(TrendLog)}
                                                                icon={<Trash2 size={14} />}
                                                                variant="error"
                                                                shape="circle"
                                                                className="px-2 sm:px-3"
                                                            />
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
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
