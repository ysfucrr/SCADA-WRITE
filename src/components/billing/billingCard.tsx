import { Building, ChevronDown, ChevronUp, DoorOpen, Layers, Pencil, Trash2, Download } from "lucide-react";
import IconButton from "../ui/icon-button";
import { SmallText, Paragraph, Code } from "../ui/typography";
import { useEffect, useState, MouseEvent } from "react";
import { useWebSocket } from '@/context/WebSocketContext';
import { useAuth } from "@/hooks/use-auth";
import * as XLSX from 'xlsx';
import { utils, CellObject } from 'xlsx'; // Cell style türlerini tanımla
import { billingType } from "@/app/(project)/billing/page";
import { showConfirmAlert } from "../ui/alert";

export default function BillingCard({ billing, onEdit, onDelete, buildings }: { billing: billingType; onEdit: (billing: billingType) => void; onDelete: (billing: billingType) => void; buildings: any[]; }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const { watchRegister, unwatchRegister, isConnected } = useWebSocket();
    const [trendlogValues, setTrendlogValues] = useState<{ [key: string]: any }>({});
    const { isAdmin } = useAuth();
    // Genişletme/daraltma durumu değiştiğinde çağrılacak
    const toggleExpand = () => {
        setIsExpanded(!isExpanded);
    };

    // Her kayıt için benzersiz kimlik oluşturan yardımcı fonksiyon
    const getRegisterKey = (registerId: string) => {
        return `register_${registerId}`;
    };

    // WebSocket'ten gelen değeri güncelle
    const updateRegisterValue = (registerId: string, value: any) => {
        setTrendlogValues(prev => ({
            ...prev,
            [getRegisterKey(registerId)]: value
        }));
    };

    // Bileşen yüklendiğinde WebSocket izlemeyi başlat
    useEffect(() => {
        if (!billing.trendLogs || billing.trendLogs.length === 0 || !isConnected) return;

        const watches: { registerId: string, register: any }[] = [];

        // Tüm kayıtlar için WebSocket bağlantısı kur
        billing.trendLogs.forEach(trendLog => {
            const registerConfig = findRegisterConfigFromRegisterId(trendLog.registerId);
            if (!registerConfig) {
                console.error(`Register config not found for ${trendLog.registerId}`);
                return;
            }

            const register = {
                analyzerId: registerConfig.analyzerId,
                address: registerConfig.address,
                dataType: registerConfig.dataType,
                scale: registerConfig.scale,
                byteOrder: registerConfig.byteOrder,
                bit: registerConfig.bit
            };

            console.log(`Watching register: ${trendLog.registerId}`, register);

            // Kayıt listesine ekle
            watches.push({ registerId: trendLog.registerId, register });

            // WebSocket izlemeyi başlat
            watchRegister(register, (value) => updateRegisterValue(trendLog.registerId, value));
        });

        // Bileşen unmount olduğunda izlemeyi durdur
        return () => {
            watches.forEach(({ registerId, register }) => {
                console.log(`Unwatching register: ${registerId}`);
                unwatchRegister(register, (value) => updateRegisterValue(registerId, value));
            });
        };
    }, [isConnected, billing.trendLogs, watchRegister, unwatchRegister]);
    // billing verilerini PDF formatında dışa aktarma fonksiyonu
    const exportToPdf = async (billing: billingType) => {
        try {
            // PDF dosyasını al
            const response = await fetch(`/api/billings/export/${billing._id}`);

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            // Blob olarak al
            const blob = await response.blob();

            // Dosya indirme işlemi için URL oluştur
            const url = window.URL.createObjectURL(blob);

            // Görünmez bir indirme linki oluştur ve tıkla
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `energy-report-${new Date().toISOString().split('T')[0]}.pdf`;
            document.body.appendChild(a);
            a.click();

            // Temizlik
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            billing.startTime = new Date().toISOString();
            billing.trendLogs.forEach((trendLog: any) => {
                trendLog.firstValue = trendlogValues[getRegisterKey(trendLog.registerId)];
            });
        } catch (error) {
            console.error('PDF indirme hatası:', error);
        }

    };

    // Sadece metin olarak unit bilgisi döndüren yardımcı fonksiyon (Excel export için)
    // const getUnitTextFromRegisterId = (registerId: string): string => {
    //     for (let i = 0; i < buildings.length; i++) {
    //         const building = buildings[i];
    //         if (building.flowData && building.flowData.nodes) {
    //             for (let j = 0; j < building.flowData.nodes.length; j++) {
    //                 const node = building.flowData.nodes[j];
    //                 if (node.id === registerId) {
    //                     return `${building.name} > ${node.data.label}`;
    //                 }
    //             }
    //             if (building.floors && building.floors.length > 0) {
    //                 for (let j = 0; j < building.floors.length; j++) {
    //                     const floor = building.floors[j];
    //                     if (floor.flowData && floor.flowData.nodes) {
    //                         for (let k = 0; k < floor.flowData.nodes.length; k++) {
    //                             const node = floor.flowData.nodes[k];
    //                             if (node.id === registerId) {
    //                                 return `${building.name} > ${floor.name} > ${node.data.label}`;
    //                             }
    //                         }
    //                     }
    //                 }
    //             }
    //         }
    //     }
    //     return "";
    // };

    const convertToUnit = (value: number) => {
        if (!value) return "0.00 kWh";
        return `${value.toLocaleString(navigator.language || 'en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })} kWh`;

        // //Otomatik olarak kwh / mwh yazmasını istiyorum. >= 1000 ise mwh
        // if (value >= 1000) {
        //     return `${((value / 1000)).toLocaleString(navigator.language || 'en-US', {
        //         minimumFractionDigits: 2,
        //         maximumFractionDigits: 2
        //     })} MWh`;
        // }
        // return `${value.toLocaleString(navigator.language || 'en-US', {
        //     minimumFractionDigits: 2,
        //     maximumFractionDigits: 2
        // })} kWh`;
    }

    const findRegisterConfigFromRegisterId = (registerId: string) => {
        console.log("registerId: ", registerId)
        console.log("buildings: ", buildings)
        for (let i = 0; i < buildings.length; i++) {
            const building = buildings[i];
            if (building.flowData && building.flowData.nodes) {
                for (let j = 0; j < building.flowData.nodes.length; j++) {
                    const node = building.flowData.nodes[j];
                    if (node.id === registerId) {
                        return node.data
                    }
                }
                if (building.floors && building.floors.length > 0) {
                    for (let j = 0; j < building.floors.length; j++) {
                        const floor = building.floors[j];
                        if (floor.flowData && floor.flowData.nodes) {
                            for (let k = 0; k < floor.flowData.nodes.length; k++) {
                                const node = floor.flowData.nodes[k];
                                if (node.id === registerId) {
                                    return node.data
                                }
                            }
                        }
                        if (floor.rooms && floor.rooms.length > 0) {
                            for (let k = 0; k < floor.rooms.length; k++) {
                                const room = floor.rooms[k];
                                if (room.flowData && room.flowData.nodes) {
                                    for (let l = 0; l < room.flowData.nodes.length; l++) {
                                        const node = room.flowData.nodes[l];
                                        if (node.id === registerId) {
                                            return node.data
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        return "";
    };
    const dayDifference = (date1: string, date2: string) => {
        const d1 = new Date(date1);
        const d2 = new Date(date2);
        const diffTime = Math.abs(d2.getTime() - d1.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays - 1;
    };
    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden transition-all duration-300 ease-in-out">
            {/* Kart Başlık Satırı */}
            <div
                className="flex items-center justify-between p-4 cursor-pointer"
                onClick={toggleExpand}
            >
                {isExpanded ?
                    <ChevronUp className="text-gray-500 dark:text-gray-400 ml-2" size={20} /> :
                    <ChevronDown className="text-gray-500 dark:text-gray-400 ml-2" size={20} />
                }
                <div className="ml-8 flex items-center justify-between flex-grow pr-8">
                    <h2 className="text-lg font-semibold text-gray-800 dark:text-white w-1/3 truncate">{billing.name}</h2>
                    <span className="font-medium text-gray-600 dark:text-gray-300 w-1/3 text-center">
                        <span className="text-emerald-600 dark:text-emerald-400">{billing.price.toLocaleString(navigator.language || 'en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        })} {billing.currency}/KWh</span>
                    </span>

                    <span className="text-gray-500 dark:text-gray-400">
                    </span>
                </div>

                {/* İkonlar */}
                <div className="flex items-center gap-2" onClick={(e: MouseEvent) => e.stopPropagation()}>
                    <IconButton
                        size="sm"
                        onClick={() => exportToPdf(billing)}
                        icon={<Download size={16} />}
                        variant="success"
                        className="p-2"
                        title="Export to Excel"
                    />
                    <IconButton
                        size="sm"
                        onClick={() => {
                            onEdit(billing);
                        }}
                        icon={<Pencil size={16} />}
                        variant="warning"
                        className="p-2"
                    />
                    {isAdmin && (
                        <IconButton
                            size="sm"
                            onClick={async () => {
                                const result = await showConfirmAlert(
                                    "Delete Billing",
                                    `"${billing.name}" Billing will be deleted. Are you sure?`,
                                    "Yes",
                                    "Cancel",
                                );
                                if (result.isConfirmed) {
                                    await exportToPdf(billing);
                                    onDelete(billing);
                                }
                            }}
                            icon={<Trash2 size={16} />}
                            variant="error"
                            className="p-2"
                        />
                    )}

                </div>
            </div>

            {/* Genişletilmiş İçerik - Tablo */}
            {isExpanded && (
                <div className="px-4 pb-4">
                    <table className="w-full table-fixed">
                        <thead className="bg-gray-100 dark:bg-black/50">
                            <tr>
                                <th className="px-4 sm:px-6 py-3 text-left w-4/12">
                                    <SmallText className="font-bold uppercase tracking-wider">Location</SmallText>
                                </th>
                                <th className="px-4 sm:px-6 py-3 text-left hidden sm:table-cell w-2/12">
                                    <SmallText className="font-bold uppercase tracking-wider">First Value</SmallText>
                                </th>
                                <th className="px-4 sm:px-6 py-3 text-left hidden md:table-cell w-2/12">
                                    <SmallText className="font-bold uppercase tracking-wider">Current Value</SmallText>
                                </th>
                                <th className="px-4 sm:px-6 py-3 text-left hidden md:table-cell w-2/12">
                                    <SmallText className="font-bold uppercase tracking-wider">Used</SmallText>
                                </th>
                                <th className="px-4 sm:px-6 py-3 text-left hidden md:table-cell w-2/12">
                                    <SmallText className="font-bold uppercase tracking-wider">Cost</SmallText>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {billing.trendLogs && billing.trendLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="px-4 sm:px-6 py-4 text-center">
                                        <SmallText className="text-gray-500 dark:text-gray-400">No trend logs found</SmallText>
                                    </td>
                                </tr>
                            ) : (
                                billing.trendLogs && billing.trendLogs.map((trendLog, index) => (
                                    <tr key={`${billing._id}-${index}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                        <td className="px-4 sm:px-6 py-4 whitespace-normal">
                                            <div className="text-gray-700 dark:text-gray-300 hidden md:block mt-1 space-y-1">
                                                {/* {findUnitPathFromRegisterId(trendLog.registerId)} */}
                                                {trendLog.analyzerName}

                                            </div>
                                            <div className="text-gray-700 dark:text-gray-300 md:hidden mt-1 space-y-1">
                                                <div className="flex flex-row justify-between">
                                                    <SmallText className="text-gray-500 dark:text-gray-400 font-medium">Location: </SmallText>
                                                    <span className="text-gray-700 dark:text-gray-300">{trendLog.analyzerName}</span>
                                                    {/* {findUnitPathFromRegisterId(trendLog.registerId)} */}
                                                </div>
                                                <div className="flex flex-row justify-between">
                                                    <SmallText className="text-gray-500 dark:text-gray-400 font-medium">First Value: </SmallText>
                                                    <span className="text-gray-700 dark:text-gray-300">
                                                        {convertToUnit(trendLog.firstValue)}
                                                    </span> 
                                                </div>
                                                <div className="flex flex-row justify-between">
                                                    <SmallText className="text-gray-500 dark:text-gray-400 font-medium">Current Value: </SmallText>
                                                    <span className="text-gray-700 dark:text-gray-300">
                                                        {convertToUnit(trendlogValues[getRegisterKey(trendLog.registerId)])}
                                                    </span>
                                                </div>
                                                <div className="flex flex-row justify-between">
                                                    <SmallText className="text-gray-500 dark:text-gray-400 font-medium">Used: </SmallText>
                                                    <span className="text-gray-700 dark:text-gray-300">
                                                        {convertToUnit(trendlogValues[getRegisterKey(trendLog.registerId)]- trendLog.firstValue)}
                                                    </span>
                                                </div>
                                                <div className="flex flex-row justify-between">
                                                    <SmallText className="text-gray-500 dark:text-gray-400 font-medium">Cost: </SmallText>
                                                    <span className="text-gray-700 dark:text-gray-300">
                                                        {((trendlogValues[getRegisterKey(trendLog.registerId)] - trendLog.firstValue) * billing.price).toLocaleString(navigator.language || 'en-US', {
                                                            minimumFractionDigits: 2,
                                                            maximumFractionDigits: 2
                                                        }) + " " + billing.currency || '--'}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="text-gray-700 dark:text-gray-300     px-4 sm:px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                                            {convertToUnit(trendLog.firstValue)}
                                        </td>
                                        <td className="text-gray-700 dark:text-gray-300 px-4 sm:px-6 py-4 whitespace-nowrap hidden md:table-cell">
                                            {convertToUnit(trendlogValues[getRegisterKey(trendLog.registerId)])}
                                        </td>
                                        <td className="text-gray-700 dark:text-gray-300 px-4 sm:px-6 py-4 whitespace-nowrap hidden md:table-cell">
                                            {convertToUnit(trendlogValues[getRegisterKey(trendLog.registerId)]- trendLog.firstValue)}
                                        </td>
                                        <td className="text-gray-700 dark:text-gray-300 px-4 sm:px-6 py-4 whitespace-nowrap hidden md:table-cell">
                                            {((trendlogValues[getRegisterKey(trendLog.registerId)] - trendLog.firstValue) * billing.price).toLocaleString(navigator.language || 'en-US', {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2
                                            }) + " " + billing.currency || '--'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                    <hr />
                    <div className="flex flex-col sm:flex-row gap-4 justify-end mt-2">
                        <div>
                            <SmallText className="text-gray-500 dark:text-gray-400 font-medium text-[16px]  ">Start Date: </SmallText>
                            <Code className="text-gray-700 dark:text-gray-300  font-medium text-[16px]">
                                {new Date(billing.startTime).toLocaleDateString()}
                            </Code>
                        </div>
                        <div>
                            <SmallText className="text-gray-500 dark:text-gray-400 font-medium text-[16px]  ">Days: </SmallText>
                            <Code className="text-gray-700 dark:text-gray-300  font-medium text-[16px]">
                                {dayDifference(billing.startTime, new Date().toISOString())}
                            </Code>
                        </div>
                        <div>
                            <SmallText className="text-gray-500 dark:text-gray-400 font-medium text-[16px]">Used Total: </SmallText>
                            <Code className="text-gray-700 dark:text-gray-300  font-medium text-[16px]">
                                {convertToUnit(billing.trendLogs.reduce((total, trendLog) => total + (trendlogValues[getRegisterKey(trendLog.registerId)] - trendLog.firstValue), 0))}
                            </Code>
                        </div>
                        <div>
                            <SmallText className="text-gray-500 dark:text-gray-400 font-medium text-[16px]">Total Cost: </SmallText>
                            <Code className="text-gray-700 dark:text-gray-300  font-medium text-[16px]">
                                {billing.trendLogs.reduce((total, trendLog) => total + (trendlogValues[getRegisterKey(trendLog.registerId)] - trendLog.firstValue) * billing.price, 0).toLocaleString(navigator.language || 'en-US', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2
                                }) + " " + billing.currency || '--'}
                            </Code>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}