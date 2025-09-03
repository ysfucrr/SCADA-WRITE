"use client";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { showAlert, showConfirmAlert, showErrorAlert, showToast } from "@/components/ui/alert";
import { Button, OutlineButton } from "@/components/ui/button/CustomButton";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { Heading3, Paragraph, SmallText } from "@/components/ui/typography";
import RTUForm from "@/components/RTUs/RTUForm";
import { useAuth } from "@/hooks/use-auth";
import { Pencil, PlusCircle, Trash2, User } from "lucide-react";
import { useEffect, useState } from "react";
import IconButton from "@/components/ui/icon-button";

// Kullanıcı tipi
export interface RTUType {
    _id: string;
    name: string;
    connectionType: string;
    ipAddress: string;
    port: string;
    baudRate: string;
    parity: string;
    stopBits: string;
    createdAt: string;
}

export default function RTUSettingsPage() {
    const [RTUs, setRTUs] = useState<RTUType[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Modal durumları
    const [isAddRTUModalOpen, setIsAddRTUModalOpen] = useState(false);
    const [isEditRTUModalOpen, setIsEditRTUModalOpen] = useState(false);
    const [selectedRTU, setSelectedRTU] = useState<RTUType | undefined>(undefined);
    const { user, isAdmin, isLoading: isAuthLoading } = useAuth();
    useEffect(() => {
        if (!isAuthLoading && isAdmin) {
            fetchRTUs();
        }
    }, [isAuthLoading, isAdmin]);
    // Kullanıcıları getir
    const fetchRTUs = async () => {
        try {
            setIsLoading(true);
            const response = await fetch("/api/RTUs");

            if (!response.ok) {
                throw new Error("Error fetching RTUs");
            }

            const data = await response.json();
            setRTUs(data);
        } catch (error) {
            console.error("Error fetching  RTUs:", error);
            showToast("Error fetching RTUs", "error");
        } finally {
            setIsLoading(false);
        }
    };


    // Kullanıcı ekle modalını aç
    const openAddRTUModal = () => {
        setSelectedRTU(undefined);
        setIsAddRTUModalOpen(true);
    };

    // Kullanıcı ekle
    const handleAddRTU = async (RTUData: { name: string; connectionType: string; ipAddress: string; port: string; baudRate: string; parity: string; stopBits: string; }) => {
        try {
            const response = await fetch("/api/RTUs", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(RTUData),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "RTU could not be added");
            }

            showToast("RTU added successfully");
            setIsAddRTUModalOpen(false);
            fetchRTUs();
        } catch (error: any) {
            showToast(error.message || "RTU could not be added", "error");
        }
    };

    // Kullanıcı düzenle modalını aç
    const openEditRTUModal = (RTU: RTUType) => {
        setSelectedRTU(RTU);
        setIsEditRTUModalOpen(true);
    };

    // Kullanıcı düzenle
    const handleEditRTU = async (RTUData: { name: string; connectionType: string; ipAddress: string; port: string; baudRate: string; parity: string; stopBits: string; }) => {
        if (!selectedRTU) return;

        try {
            const dataToSend = {
                name: RTUData.name,
                connectionType: RTUData.connectionType,
                ipAddress: RTUData.ipAddress,
                port: RTUData.port,
                baudRate: RTUData.baudRate,
                parity: RTUData.parity,
                stopBits: RTUData.stopBits
            };

            const response = await fetch(`/api/RTUs/${selectedRTU._id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(dataToSend),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "RTU could not be updated");
            }

            showToast("RTU updated successfully");
            setIsEditRTUModalOpen(false);
            fetchRTUs();
        } catch (error: any) {
            showToast(error.message || "RTU could not be updated", "error");
        }
    };

    // Kullanıcı sil
    const handleDeleteRTU = async (RTU: RTUType) => {
        const anlyzerHasThisRTU = await fetch(`/api/analyzers?gateway=${RTU._id}`);

        const anlyzerHasThisRTUData = await anlyzerHasThisRTU.json();
        if (anlyzerHasThisRTUData.length > 0) {
            showErrorAlert("RTU is used by an analyzer");
            return;
        }
        const result = await showConfirmAlert(
            "Delete RTU",
            `"${RTU.name}" RTU will be deleted. Are you sure?`,
            "Yes",
            "Cancel",
        );

        if (result.isConfirmed) {
            try {
                const response = await fetch(`/api/RTUs/${RTU._id}`, {
                    method: "DELETE",
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || "RTU could not be deleted");
                }

                showToast("RTU deleted successfully");
                fetchRTUs();
            } catch (error: any) {
                showToast(error.message || "RTU could not be deleted", "error");
            }
        }
    };

    if (isAuthLoading) {
        return <Spinner variant="bars" fullPage />
    } 

    return (
        <div>
            <PageBreadcrumb pageTitle="Gteway Settings" />

            <div className="flex justify-between items-center mb-6">
                <Button
                    onClick={openAddRTUModal}
                    leftIcon={<PlusCircle size={16} />}
                    variant="primary"
                >
                    Add Gateway
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
                                        <th className="px-4 sm:px-6 py-3 text-left hidden md:table-cell">
                                            <SmallText className="font-bold uppercase tracking-wider">Address:Port</SmallText>
                                        </th>
                                        <th className="px-4 sm:px-6 py-3 text-right">
                                            <SmallText className="font-bold uppercase tracking-wider">Actions</SmallText>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {RTUs.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-4 sm:px-6 py-4 text-center">
                                                <SmallText className="text-gray-500 dark:text-gray-400">No RTUs found</SmallText>
                                            </td>
                                        </tr>
                                    ) : (
                                        RTUs.map((RTU) => (
                                            <tr key={RTU._id} className="hover:bg-gray-50 dark:bg-gray-800/30">
                                                <td className="px-4 sm:px-6 py-4 whitespace-normal">
                                                    <Paragraph className="hidden sm:block font-medium text-gray-800 dark:text-gray-300">{RTU.name}</Paragraph>
                                                    <div className="sm:hidden mt-1 space-y-1">
                                                        <div>
                                                            <SmallText className="text-gray-500 dark:text-gray-400 font-medium">Name: </SmallText>
                                                            <SmallText className="text-gray-700 dark:text-gray-300">{RTU.name}</SmallText>
                                                        </div>
                                                        <div>
                                                            <SmallText className="text-gray-500 dark:text-gray-400 font-medium">Type: </SmallText>
                                                            <SmallText className="text-gray-700 dark:text-gray-300">
                                                                {RTU.connectionType == "serial" ? "Serial (RTU)" : "IP Gateway"}
                                                            </SmallText>
                                                        </div>
                                                        <div>
                                                            <SmallText className="text-gray-500 dark:text-gray-400 font-medium">Address:Port: </SmallText>
                                                            <SmallText className="text-blue-600 dark:text-blue-400">{RTU.connectionType == "serial" ? RTU.port : (RTU.ipAddress + ":" + RTU.port)}</SmallText>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 sm:px-6 py-4 whitespace-nowrap hidden md:table-cell">
                                                    <Paragraph className="font-medium text-gray-500 dark:text-gray-400">
                                                        {RTU.connectionType == "serial" ? "Serial (RTU)" : "IP Gateway"}
                                                    </Paragraph>
                                                </td>
                                                <td className="px-4 sm:px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                                                    <span className={`inline-block px-2 py-1 rounded-full text-blue-600 dark:text-blue-400`}>
                                                        {RTU.connectionType == "serial" ? RTU.port : (RTU.ipAddress + ":" + RTU.port)}
                                                    </span>
                                                </td>
                                                <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right">
                                                    <div className="flex justify-end space-x-1 sm:space-x-2">
                                                        <IconButton
                                                            size="sm"
                                                            onClick={() => openEditRTUModal(RTU)}
                                                            icon={<Pencil size={14} />}
                                                            variant="warning"
                                                            className="p-2 sm:p-3"
                                                        />
                                                        <IconButton
                                                            size="sm"
                                                            onClick={() => handleDeleteRTU(RTU)}
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
                isOpen={isAddRTUModalOpen}
                onClose={() => setIsAddRTUModalOpen(false)}
                className="max-w-2xl"
            >
                <RTUForm
                    onSubmit={handleAddRTU}
                    onCancel={() => setIsAddRTUModalOpen(false)}
                />
            </Modal>

            {/* Kullanıcı Düzenle Modal */}
            <Modal
                isOpen={isEditRTUModalOpen}
                onClose={() => setIsEditRTUModalOpen(false)}
                className="max-w-2xl"
            >
                {selectedRTU && (
                    <RTUForm
                        rtu={selectedRTU}
                        onSubmit={handleEditRTU}
                        onCancel={() => setIsEditRTUModalOpen(false)}
                    />
                )}
            </Modal>
        </div>
    );
}
