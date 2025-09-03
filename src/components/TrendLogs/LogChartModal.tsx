"use client"
import { Modal } from "@/components/ui/modal";
import { Heading3 } from "@/components/ui/typography";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { useEffect, useState } from "react";
import { showToast } from "../ui/alert";
import { useRouter } from "next/navigation";
import DatePicker from "../form/date-picker";
import { Button } from "../ui/button/CustomButton";
import ReactApexChart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import * as XLSX from 'xlsx';
interface TrendLogType {
    _id: string;
    trendLogId: string;
    value: number;
    timestamp: string;
    analyzerId: string;
    registerId: string;
}
export default function LogChartModal({ trendLogId, onClose, isOpen, registerName }: { trendLogId: string, onClose: () => void, isOpen: boolean, registerName: string }) {
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
                Value: Number(log.value.toFixed(4))
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
    // Zaman damgalarını grafik için formatşlama
    const formatTimestamps = () => {
        // Filtrelenmiş log'ları al
        const filteredLogs = trendLogs.filter(
            (log) => new Date(log.timestamp) >= startDate && new Date(log.timestamp) <= endDate
        );

        // X ekseni için tarihleri döndür
        return {
            categories: filteredLogs.map((log) => new Date(log.timestamp).toLocaleString('en-US')),
            values: filteredLogs.map((log) => typeof log.value === 'number' ? Number(log.value) : 0)
        };
    };

    const chartData = formatTimestamps();

    const options: ApexOptions = {
        legend: {
            show: false,
            position: "top",
            horizontalAlign: "left",
        },
        colors: ["#465FFF"], // Trend line rengi
        chart: {
            fontFamily: "Outfit, sans-serif",
            height: 350,
            type: "area", // Area chart kullan
            toolbar: {
                show: true, // Araç çubuğunu göster, yakınlaştırma ve diğer araçlar kullanılabilir olacak
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
            },
        },
        stroke: {
            curve: "smooth", // Düz çizgi yerine düzgünleştirilmiş eğri
            width: 3, // Çizgi kalınlığı
        },
        fill: {
            type: "gradient",
            gradient: {
                shade: 'dark',
                type: "vertical",
                shadeIntensity: 0.3,
                opacityFrom: 0.4,
                opacityTo: 0.1,
                stops: [0, 100]
            },
        },
        markers: {
            size: 4, // Nokta büyüklüğü
            colors: ["#465FFF"],
            strokeColors: "#fff",
            strokeWidth: 2,
            hover: {
                size: 7,
            },
        },
        grid: {
            borderColor: '#e0e0e0',
            strokeDashArray: 3,
            xaxis: {
                lines: {
                    show: false,
                },
            },
            yaxis: {
                lines: {
                    show: true,
                },
            },
        },
        dataLabels: {
            enabled: false,
        },
        tooltip: {
            enabled: true,
            shared: false,
            x: {
                show: true,
                format: 'dd MMM yyyy HH:mm:ss',
            },
            y: {
                formatter: function (value) {
                    // Y-axis değerlerini düzenleme (4 ondalık hane ile)
                    return value.toFixed(4);
                }
            },
            marker: {
                show: true,
            },
        },
        xaxis: {
            type: "datetime",
            categories: chartData.categories,
            labels: {
                rotate: -45,
                rotateAlways: false,
                formatter: function (value) {
                    // Tarih formatını basitleştirme
                    const date = new Date(value);
                    return `${date.toLocaleDateString('en-US')} ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
                },
                style: {
                    fontSize: '10px',
                },
            },
            axisBorder: {
                show: true,
                color: '#78909c',
            },
            axisTicks: {
                show: true,
                color: '#78909c',
            },
            tickAmount: 6, // X ekseni üzerinde gösterilecek değer sayısını sınırla
        },
        yaxis: {
            labels: {
                formatter: function (value) {
                    // Y ekseni değerlerini 4 ondalık haneye yuvarla
                    return value.toFixed(4);
                },
                style: {
                    fontSize: "12px",
                    colors: ["#6B7280"],
                },
            },
            title: {
                text: "Value",
                style: {
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#6B7280"
                },
            },
            tickAmount: 5, // Y ekseni üzerinde gösterilecek değer sayısı
            min: function (min) { return min * 0.95; }, // Minimum değere biraz boşluk ekler
            max: function (max) { return max * 1.05; }, // Maksimum değere biraz boşluk ekler
        },
    };
    return (
        <Modal isOpen={isOpen} onClose={() => onClose()} className="max-w-4xl max-h-[80vh] overflow-hidden">
            <div className="p-6 max-h-[80vh] overflow-y-auto overflow-x-visible ">
                <Heading3>Log Chart</Heading3>
                {/* Tarih filtresi ve export to xls butonu */}
                <div className="mt-4 mb-6">
                    {/* md boyutundan küçük ekranlarda flex-col, büyük ekranlarda flex-row */}
                    <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                        {/* Tarih seçicileri - md altı: tam yan yana eşit genişlikte, md üstü: sola yaslanmış */}
                        <div className="flex w-full gap-2">
                            {/* Her bir DatePicker tam olarak %50 genişlik alacak */}
                            <div className="w-1/2 flex-1">
                                <DatePicker
                                    id="start-date-picker"
                                    defaultDate={startDate || new Date()}
                                    onChange={(selectedDates: Date[]) => {
                                        setStartDate(new Date((selectedDates[0] as Date).setHours(0, 0, 0, 0)));
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
                                        setEndDate(new Date((selectedDates[0] as Date).setHours(23, 59, 59, 999)));
                                        fetchTrendLogs();
                                    }}
                                    placeholder="End Date"
                                    label="To"
                                />
                            </div>
                        </div>

                        {/* Buton - md altı: tam genişlik, md üstü: sağa yaslanmış ve otomatik genişlik */}
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
                <div className="mt-4">
                    <div className="rounded-md border border-gray-200 dark:border-gray-800 overflow-hidden p-4 h-[500px]">
                        {trendLogs.length > 0 ? (
                            <ReactApexChart
                                options={options}
                                series={[
                                    {
                                        name: "Value",
                                        data: chartData.values,
                                    }
                                ]}
                                type="area"
                                height="100%"
                                width="100%"
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full">
                                <p className="text-gray-500 dark:text-gray-400">No log entries found for this trend log</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
}