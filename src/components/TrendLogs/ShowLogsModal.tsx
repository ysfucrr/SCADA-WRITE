"use client"

import { Modal } from "@/components/ui/modal";
import { Heading3 } from "@/components/ui/typography";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import * as XLSX from 'xlsx';
import DatePicker from "../form/date-picker";
import { showToast } from "../ui/alert";
import { Button } from "../ui/button/CustomButton";
import { Spinner } from "../ui/spinner";
interface TrendLogType {
    _id: string;
    trendLogId: string;
    value: number;
    timestamp: string;
    analyzerId: string;
    registerId: string;
}
export default function ShowLogsModal({ trendLogId, onClose, isOpen, registerName }: { trendLogId: string; onClose: () => void; isOpen: boolean; registerName: string }) {
    const [trendLogs, setTrendLogs] = useState<TrendLogType[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [startDate, setStartDate] = useState<Date>(new Date(new Date().setHours(0, 0, 0, 0)));
    const [endDate, setEndDate] = useState<Date>(new Date(new Date().setHours(23, 59, 59, 999)));
    
    const router = useRouter();

    const fetchTrendLogs = async () => {
        try {
            setIsLoading(true);
            const response = await fetch(`/api/trend-logs/${trendLogId}`);

            if (!response.ok) {
                throw new Error("Error fetching trend logs");
            }

            const data = await response.json();
            setTrendLogs(data.trendLogData);
        } catch (error) {
            console.error("Error fetching trend logs:", error);
            showToast("Error fetching trend logs", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const exportToXls = (trendLogId: string) => {
        try {
            // Filtrelenmiş verileri al
            const filteredLogs = trendLogs.filter(
                (log) => new Date(log.timestamp) >= startDate && new Date(log.timestamp) <= endDate
            );

            if (filteredLogs.length === 0) {
                showToast("No log data to export", "warning");
                return;
            }

            // XLSX formatı için veri hazırlama
            const data = filteredLogs.map(log => ({
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
            const fileName = `trend_log_${registerName}_${new Date().toISOString().slice(0, 10)}.xlsx`;

            // XLSX dosyasını indirme
            XLSX.writeFile(workbook, fileName);

            showToast("Trend log exported to Excel successfully");
        } catch (error: any) {
            console.error("Export error:", error);
            showToast(error.message || "Trend log could not be exported to Excel", "error");
        }
    };
    useEffect(() => {
        fetchTrendLogs();

        // DatePicker takvim overflow sorununu çözmek için CSS ekleme
        const style = document.createElement('style');
        style.innerHTML = `
            .flatpickr-calendar {
                z-index: 99999 !important;
                position: absolute !important;
            }
        `;
        document.head.appendChild(style);

        return () => {
            // Component unmount olduğunda style'ı kaldır
            document.head.removeChild(style);
        };
    }, []);

    return (
        <Modal isOpen={isOpen} onClose={onClose} className="max-w-4xl max-h-[90vh]">
            <div className="p-6 flex flex-col" style={{ height: "calc(90vh - 48px)" }}>
                <Heading3>Logs</Heading3>
                {/* Tarih filtresi ve export to xls butonu */}
                <div className="mt-4">
                    <div className="flex flex-col md:flex-row md:items-end gap-4">
                        <div className="flex flex-col md:flex-row gap-4 flex-1">
                            <div className="w-1/2 flex-1">
                                <DatePicker
                                    id="start-date-picker"
                                    defaultDate={startDate || new Date()}
                                    onChange={(selectedDates: Date[]) => {
                                        setStartDate(selectedDates[0] as Date);
                                        fetchTrendLogs();
                                    }}
                                    placeholder="Start Date"
                                    label="From"
                                />
                            </div>
                            <div className="w-1/2 flex-1">
                                <DatePicker
                                    id="end-date-picker"
                                    defaultDate={endDate || new Date()}
                                    onChange={(selectedDates: Date[]) => {
                                        setEndDate(selectedDates[0] as Date);
                                        fetchTrendLogs();
                                    }}
                                    placeholder="End Date"
                                    label="To"
                                />
                            </div>
                        </div>

                        <div className="md:self-end">
                            <Button
                                onClick={() => exportToXls(trendLogId)}
                                variant="primary"
                                className="w-full md:w-auto whitespace-nowrap"
                            >
                                Export to XLS
                            </Button>
                        </div>
                    </div>
                </div>
                <div className="mt-4 flex-1 min-h-0 flex flex-col overflow-hidden">
                    <div className="rounded-md border border-gray-200 dark:border-gray-800 flex flex-col h-full">
                        {/* Header kısmı - Sabit kalacak */}
                        <div className="flex-shrink-0 bg-gray-50 dark:bg-gray-900/50">
                            <table className="w-full">
                                <thead>
                                    <tr>
                                        <th className="h-12 px-4 text-left align-middle font-semibold text-gray-700 dark:text-gray-300">Timestamp</th>
                                        <th className="h-12 px-4  align-middle font-semibold text-gray-700 dark:text-gray-300 w-[500px] text-center">Value</th>
                                    </tr>
                                </thead>
                            </table>
                        </div>

                        {/* Veri satırları - Scroll edilebilir */}
                        <div className="overflow-y-auto flex-1" style={{ maxHeight: "calc(100% - 48px)" }}>
                            <table className="w-full">
                                <tbody>
                                    {trendLogs.length === 0 ? (
                                        <tr className="flex flex-row justify-center items-center border-t h-12 px-4 align-middle text-center py-8 text-gray-500 dark:text-gray-400">
                                            <td colSpan={2} className="border-t h-12 px-4 align-middle text-center py-8 text-gray-500 dark:text-gray-400">
                                                {isLoading ? <Spinner variant="bars" size="lg" /> : "No log entries found for this trend log"}
                                            </td>
                                        </tr>
                                    ) : (

                                        trendLogs.filter((log) => new Date(log.timestamp) >= startDate && new Date(log.timestamp) <= endDate).map((log: TrendLogType) => (
                                            <tr key={log._id} className="border-t border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/20 transition-colors">
                                                <td className="h-12 px-4 align-middle text-sm">
                                                    <div className="font-medium text-gray-800 dark:text-gray-400">{new Date(log.timestamp).toLocaleString('en-US', { dateStyle: 'medium' })}</div>
                                                    <div className="text-xs text-gray-600 dark:text-gray-400">{new Date(log.timestamp).toLocaleTimeString('en-US')}</div>
                                                </td>
                                                <td className="h-12 px-4 align-middle w-[500px] text-center">
                                                    <div className="font-mono px-2 py-1 rounded inline-block text-gray-800 dark:text-gray-400 ">
                                                        {typeof log.value === 'number' ? log.value.toFixed(4) : log.value}
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
            </div>
        </Modal>
    );
}