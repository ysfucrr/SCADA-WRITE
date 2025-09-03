"use client";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { showAlert, showConfirmAlert, showErrorAlert, showToast } from "@/components/ui/alert";
import { Button, OutlineButton } from "@/components/ui/button/CustomButton";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { Heading3, Paragraph, SmallText } from "@/components/ui/typography";
import AnalyzerForm from "@/components/Analyzers/AnalyzerForm";
import { useAuth } from "@/hooks/use-auth";
import { Pencil, PlusCircle, Trash2, User } from "lucide-react";
import { useEffect, useState } from "react";
import IconButton from "@/components/ui/icon-button";
import { useSidebar } from "@/context/SidebarContext";
import { useRouter } from "next/navigation";

// Kullanıcı tipi
export interface AnalyzerType {
    _id: string;
    name: string;
    slaveId: string;
    model: string;
    poll: string;
    timeout: string;
    ctRadio: string;
    vtRadio: string;
    connection: string;
    gateway: string;
    unit: string;
    createdAt: string;
    updatedAt: string;
}
interface Building {
    _id: string;
    id: string;
    name: string;
    floors: Floor[];
}
interface Floor {
    _id: string;
    id: string;
    name: string;
    rooms: Room[];
}
interface Room {
    _id: string;
    id: string;
    name: string;
}


export default function AnalyzersPage() {
    // Tüm state hook'ları en üstte ve koşulsuz olarak tanımlanmalı
    const [analyzers, setAnalyzers] = useState<AnalyzerType[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // Modal durumları
    const [isAddAnalyzerModalOpen, setIsAddAnalyzerModalOpen] = useState(false);
    const [isEditAnalyzerModalOpen, setIsEditAnalyzerModalOpen] = useState(false);
    const [selectedAnalyzer, setSelectedAnalyzer] = useState<AnalyzerType | undefined>(undefined);
    const [buildings, setBuildings] = useState<Building[]>([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [rtus, setRTUs] = useState<any[]>([]);
    const { license, setLicense } = useSidebar();
    const router = useRouter();
    // Auth hook'u da koşulsuz olarak tanımlanmalı
    const { user, isAdmin, isLoading: isAuthLoading } = useAuth();

    // Kullanıcıları getir
    const fetchAnalyzers = async () => {
        try {
            setIsLoading(true);
            const response = await fetch("/api/analyzers");

            if (!response.ok) {
                throw new Error("Error fetching analyzers");
            }

            const data = await response.json();
            //console.log("analyzers",data)
            setAnalyzers(data);
        } catch (error) {
            console.error("Error fetching  analyzers:", error);
            showToast("Error fetching analyzers", "error");
        } finally {
            setIsLoading(false);
        }
    };
    const fetchRTUs = async () => {
        try {
            setIsLoading(true);
            const response = await fetch("/api/RTUs");

            if (!response.ok) {
                throw new Error("Error fetching rtus");
            }

            const data = await response.json();
            //console.log("rtus",data)
            await fetchAnalyzers();
            setRTUs(data);
        } catch (error) {
            console.error("Error fetching  rtus:", error);
            showToast("Error fetching rtus", "error");
        } finally {
            setIsLoading(false);
        }
    };
    // Tüm useEffect tanımlamalarını koşulsuz olarak yap
    
    // Buildings verilerini yükle
    useEffect(() => {
        fetchBuildings();
    }, []);
    
    // Buildings verisi geldiğinde RTU'ları yükle
    useEffect(() => {
        if (isAuthLoading) return;
        
        if (isAdmin) {
            fetchRTUs();
        } else {
            setIsLoading(false);
        }
    }, [buildings, isAdmin, isAuthLoading]);


    const fetchBuildings = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/units');
            const data = await response.json();

            if (data.success) {
                setBuildings(data.buildings);
            } else {
                console.error('Failed to fetch buildings:', data.message);
            }
        } catch (error) {
            console.error('Error fetching buildings:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Kullanıcı ekle modalını aç
    const openAddAnalyzerModal = async () => {
         if (license && analyzers.length >= license.maxDevices) {
            await showErrorAlert("License limit exceeded", "Contact administrator for buying license to add more analyzers");
            router.push('/update-license');
            return;
        }

        setSelectedAnalyzer(undefined);
        setIsAddAnalyzerModalOpen(true);
    };
    const getUnitNameFromPath = (unit: string) => {
        if (!unit) return "Select Navigation Target";

        // URL'den ID'leri ayıkla
        const parts = unit.split('/').filter(p => p);

        if (parts.length === 0) return "Select Navigation Target";

        // Bina ID'si
        const buildingId = parts[0];
        const building = buildings.find(b => b._id === buildingId || b.id === buildingId);

        if (!building) return "Select Navigation Target";

        // Sadece bina seçilmişse
        if (parts.length === 1) return building.name;

        // Kat ID'si
        const floorId = parts[1];
        const floor = building.floors.find(f => f._id === floorId || f.id === floorId);

        if (!floor) return building.name;

        // Sadece kat seçilmişse
        if (parts.length === 2) return `${building.name} > ${floor.name}`;

        // Oda ID'si
        const roomId = parts[2];
        const room = floor.rooms.find(r => r._id === roomId || r.id === roomId);

        if (!room) return `${building.name} > ${floor.name}`;

        return `${building.name} > ${floor.name} > ${room.name}`;
    };
    // Kullanıcı ekle
    const handleAddAnalyzer = async (analyzerData: { name: string; slaveId: string; model: string; poll: string; timeout: string; ctRadio: string; vtRadio: string; connection: string; gateway: string; }) => {
        try {
            const response = await fetch("/api/analyzers", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(analyzerData),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Analyzer could not be added");
            }

            showToast("Analyzer added successfully");
            setLicense({
               ...license!,
                usedAnalyzers: license!.usedAnalyzers + 1,
            });
            setIsAddAnalyzerModalOpen(false);
            fetchAnalyzers();
        } catch (error: any) {
            showToast(error.message || "Analyzer could not be added", "error");
        }
    };

    // Kullanıcı düzenle modalını aç
    const openEditAnalyzerModal = (analyzer: AnalyzerType) => {
        setSelectedAnalyzer(analyzer);
        setIsEditAnalyzerModalOpen(true);
    };

    // Kullanıcı düzenle
    const handleEditAnalyzer = async (analyzerData: { name: string; slaveId: string; model: string; poll: string; timeout: string; ctRadio: string; vtRadio: string; connection: string; gateway: string; }) => {
        if (!selectedAnalyzer) return;

        try {
            // Eğer password boşsa, API'ye göndermiyoruz
            const dataToSend = {
                name: analyzerData.name,
                slaveId: analyzerData.slaveId,
                model: analyzerData.model,
                poll: analyzerData.poll,
                timeout: analyzerData.timeout,
                ctRadio: analyzerData.ctRadio,
                vtRadio: analyzerData.vtRadio,
                connection: analyzerData.connection,
                gateway: analyzerData.gateway
            };

            const response = await fetch(`/api/analyzers/${selectedAnalyzer._id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(dataToSend),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Analyzer could not be updated");
            }

            showToast("Analyzer updated successfully");
            setIsEditAnalyzerModalOpen(false);
            fetchAnalyzers();
        } catch (error: any) {
            showToast(error.message || "Analyzer could not be updated", "error");
        }
    };

    // Kullanıcı sil
    const handleDeleteAnalyzer = async (analyzer: AnalyzerType) => {
        const trendLogs = await fetch(`/api/trend-logs?analyzerId=${analyzer._id}`);
        const trendLogsData = await trendLogs.json();
        if (trendLogsData.length > 0) {
            showErrorAlert("Analyzer has trend logs, cannot be deleted");
            return;
        }
        const result = await showConfirmAlert(
            "Delete Analyzer",
            `"${analyzer.name}" Analyzer will be deleted. Are you sure?`,
            "Yes",
            "Cancel",
        );


        if (result.isConfirmed) {
            try {
                const response = await fetch(`/api/analyzers/${analyzer._id}`, {
                    method: "DELETE",
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || "Analyzer could not be deleted");
                }
                console.log("new license",{
                    ...license!,
                    usedAnalyzers: license!.usedAnalyzers - 1,
                });
                setLicense({
                    ...license!,
                    usedAnalyzers: license!.usedAnalyzers - 1,
                });

                showToast("Analyzer deleted successfully");
                fetchAnalyzers();
            } catch (error: any) {
                showToast(error.message || "Analyzer could not be deleted", "error");
            }
        }
    };

    // Kimlik doğrulama yükleniyorsa
    // if (status === "loading") {
    //     return <Spinner variant="bars" fullPage />;
    // }

    return (
        <div>
            <PageBreadcrumb pageTitle="Analyzers" />

            <div className="flex justify-between items-center mb-6">
                {/* <div>  </div> */}
                <Button
                    onClick={openAddAnalyzerModal}
                    leftIcon={<PlusCircle size={16} />}
                    variant="primary"
                >
                    Add Analyzer
                </Button>
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
                                            <SmallText className="font-bold uppercase tracking-wider">Name</SmallText>
                                        </th>
                                        <th className="px-4 sm:px-6 py-3 text-left hidden sm:table-cell">
                                            <SmallText className="font-bold uppercase tracking-wider">Type</SmallText>
                                        </th>
                                        <th className="px-4 sm:px-6 py-3 text-left hidden sm:table-cell">
                                            <SmallText className="font-bold uppercase tracking-wider">Gateway</SmallText>
                                        </th>
                                        {/* <th className="px-4 sm:px-6 py-3 text-left hidden sm:table-cell">
                                            <SmallText className="font-bold uppercase tracking-wider">Unit</SmallText>
                                        </th> */}
                                        <th className="px-4 sm:px-6 py-3 text-right">
                                            <SmallText className="font-bold uppercase tracking-wider">Actions</SmallText>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {analyzers.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-4 sm:px-6 py-4 text-center">
                                                <SmallText className="text-gray-500 dark:text-gray-400">No Analyzers found</SmallText>
                                            </td>
                                        </tr>
                                    ) : (
                                        analyzers.map((analyzer) => (
                                            <tr key={analyzer._id} className="hover:bg-gray-50 dark:bg-gray-800/30">
                                                <td className="px-4 sm:px-6 py-4 whitespace-normal">
                                                    <Paragraph className="hidden sm:block font-medium text-gray-800 dark:text-gray-300">{analyzer.name}</Paragraph>
                                                    <div className="sm:hidden mt-1 space-y-1">
                                                        <div>
                                                            <SmallText className="text-gray-500 dark:text-gray-400 font-medium">Name: </SmallText>
                                                            <SmallText className="text-gray-700 dark:text-gray-300">{analyzer.name}</SmallText>
                                                        </div>
                                                        <div>
                                                            <SmallText className="text-gray-500 dark:text-gray-400 font-medium">Type: </SmallText>
                                                            <SmallText className="text-gray-700 dark:text-gray-300">
                                                                {analyzer.connection == "serial" ? "Serial" : "TCP / Ethernet"}
                                                            </SmallText>
                                                        </div>
                                                        <div>
                                                            <SmallText className="text-gray-500 dark:text-gray-400 font-medium">Gateway: </SmallText>
                                                            <SmallText className="text-gray-700 dark:text-gray-300">{rtus.find(rtu => rtu._id === analyzer.gateway)?.name || analyzer.gateway}</SmallText>
                                                        </div>
                                                        {/* <div>
                                                            <SmallText className="text-gray-500 dark:text-gray-400 font-medium">Unit: </SmallText>
                                                            <SmallText className="text-gray-700 dark:text-gray-300">{getUnitNameFromPath(analyzer.unit)}</SmallText>
                                                        </div> */}
                                                    </div>
                                                </td>
                                                <td className="px-4 sm:px-6 py-4 whitespace-nowrap hidden md:table-cell">
                                                    <Paragraph className="font-medium text-gray-500 dark:text-gray-400">
                                                        {analyzer.connection == "serial" ? "Serial (Analyzer)" : "IP Gateway"}
                                                    </Paragraph>
                                                </td>
                                                <td className="px-4 sm:px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                                                    <span className={`inline-block px-2 py-1 rounded-full text-gray-500 dark:text-gray-400`}>
                                                        {rtus.find(rtu => rtu._id === analyzer.gateway)?.name || analyzer.gateway}
                                                    </span>
                                                </td>
                                                {/* <td className="px-4 sm:px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                                                    <span className={`inline-block px-2 py-1 rounded-full text-gray-500 dark:text-gray-400`}>
                                                        {getUnitNameFromPath(analyzer.unit)}
                                                    </span>
                                                </td> */}
                                                <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right">
                                                    <div className="flex justify-end space-x-1 sm:space-x-2">
                                                        <IconButton
                                                            size="sm"
                                                            onClick={() => openEditAnalyzerModal(analyzer)}
                                                            icon={<Pencil size={14} />}
                                                            variant="warning"
                                                            className="p-2 sm:p-3"
                                                        />
                                                        <IconButton
                                                            size="sm"
                                                            onClick={() => handleDeleteAnalyzer(analyzer)}
                                                            icon={<Trash2 size={14} />}
                                                            variant="error"
                                                            className="p-2 sm:p-3"
                                                        />
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

            {/* Kullanıcı Ekle Modal */}
            <Modal
                isOpen={isAddAnalyzerModalOpen}
                onClose={() => setIsAddAnalyzerModalOpen(false)}
                className="max-w-2xl"
            >
                <AnalyzerForm
                    onSubmit={handleAddAnalyzer}
                    onCancel={() => setIsAddAnalyzerModalOpen(false)}
                />
            </Modal>

            {/* Kullanıcı Düzenle Modal */}
            <Modal
                isOpen={isEditAnalyzerModalOpen}
                onClose={() => setIsEditAnalyzerModalOpen(false)}
                className="max-w-2xl"
            >
                {selectedAnalyzer && (
                    <AnalyzerForm
                        analyzer={selectedAnalyzer}
                        onSubmit={handleEditAnalyzer}
                        onCancel={() => setIsEditAnalyzerModalOpen(false)}
                    />
                )}
            </Modal>
        </div>
    );
}
