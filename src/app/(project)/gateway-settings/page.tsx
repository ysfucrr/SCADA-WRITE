"use client";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { showAlert, showConfirmAlert, showErrorAlert, showToast } from "@/components/ui/alert";
import { Button, OutlineButton } from "@/components/ui/button/CustomButton";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { Heading3, Paragraph, SmallText } from "@/components/ui/typography";
import GatewayForm from "@/components/gateway/GatewayForm";
import { useAuth } from "@/hooks/use-auth";
import { Pencil, PlusCircle, Trash2, User } from "lucide-react";
import { useEffect, useState } from "react";
import IconButton from "@/components/ui/icon-button";

// Kullanıcı tipi
export interface GatewayType {
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

export default function GatewaySettingsPage() {
    const [gateways, setGateways] = useState<GatewayType[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Modal durumları
    const [isAddGatewayModalOpen, setIsAddGatewayModalOpen] = useState(false);
    const [isEditGatewayModalOpen, setIsEditGatewayModalOpen] = useState(false);
    const [selectedGateway, setSelectedGateway] = useState<GatewayType | undefined>(undefined);
    const { user, isAdmin, isLoading: isAuthLoading } = useAuth();
    useEffect(() => {
        if (!isAuthLoading && isAdmin) {
            fetchGateways();
        }
    }, [isAuthLoading, isAdmin]);
    // Kullanıcıları getir
    const fetchGateways = async () => {
        try {
            setIsLoading(true);
            const response = await fetch("/api/gateway");

            if (!response.ok) {
                throw new Error("Error fetching gateway");
            }

            const data = await response.json();
            setGateways(data);
        } catch (error) {
            console.error("Error fetching  gateway:", error);
            showToast("Error fetching gateway", "error");
        } finally {
            setIsLoading(false);
        }
    };


    // Kullanıcı ekle modalını aç
    const openAddGatewayModal = () => {
        setSelectedGateway(undefined);
        setIsAddGatewayModalOpen(true);
    };

    // Kullanıcı ekle
    const handleAddGateway = async (gatewayData: { name: string; connectionType: string; ipAddress: string; port: string; baudRate: string; parity: string; stopBits: string; }) => {
        try {
            const response = await fetch("/api/gateway", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(gatewayData),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "gateway could not be added");
            }

            showToast("gateway added successfully");
            setIsAddGatewayModalOpen(false);
            fetchGateways();
        } catch (error: any) {
            showToast(error.message || "gateway could not be added", "error");
        }
    };

    // Kullanıcı düzenle modalını aç
    const openEditGatewayModal = (gateway: GatewayType) => {
        setSelectedGateway(gateway);
        setIsEditGatewayModalOpen(true);
    };

    // Kullanıcı düzenle
    const handleEditGateway = async (gatewayData: { name: string; connectionType: string; ipAddress: string; port: string; baudRate: string; parity: string; stopBits: string; }) => {
        if (!selectedGateway) return;

        try {
            const dataToSend = {
                name: gatewayData.name,
                connectionType: gatewayData.connectionType,
                ipAddress: gatewayData.ipAddress,
                port: gatewayData.port,
                baudRate: gatewayData.baudRate,
                parity: gatewayData.parity,
                stopBits: gatewayData.stopBits
            };

            const response = await fetch(`/api/gateway/${selectedGateway._id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(dataToSend),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "gateway could not be updated");
            }

            showToast("gateway updated successfully");
            setIsEditGatewayModalOpen(false);
            fetchGateways();
        } catch (error: any) {
            showToast(error.message || "gateway could not be updated", "error");
        }
    };

    // Kullanıcı sil
    const handleDeleteGateway = async (gateway: GatewayType) => {
        const analyzerHasThisGateway = await fetch(`/api/analyzers?gateway=${gateway._id}`);

        const analyzerHasThisGatewayData = await analyzerHasThisGateway.json();
        if (analyzerHasThisGatewayData.length > 0) {
            showErrorAlert("gateway is used by an analyzer");
            return;
        }
        const result = await showConfirmAlert(
            "Delete gateway",
            `"${gateway.name}" gateway will be deleted. Are you sure?`,
            "Yes",
            "Cancel",
        );

        if (result.isConfirmed) {
            try {
                const response = await fetch(`/api/gateway/${gateway._id}`, {
                    method: "DELETE",
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || "gateway could not be deleted");
                }

                showToast("gateway deleted successfully");
                fetchGateways();
            } catch (error: any) {
                showToast(error.message || "gateway could not be deleted", "error");
            }
        }
    };

    if (isAuthLoading) {
        return <Spinner variant="bars" fullPage />
    } 

    return (
        <div>
            <PageBreadcrumb pageTitle="Gateway Settings" />

            <div className="flex justify-between items-center mb-6">
                <Button
                    onClick={openAddGatewayModal}
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
                                    {gateways.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-4 sm:px-6 py-4 text-center">
                                                <SmallText className="text-gray-500 dark:text-gray-400">No gateway found</SmallText>
                                            </td>
                                        </tr>
                                    ) : (
                                        gateways.map((gateway) => (
                                            <tr key={gateway._id} className="hover:bg-gray-50 dark:bg-gray-800/30">
                                                <td className="px-4 sm:px-6 py-4 whitespace-normal">
                                                    <Paragraph className="hidden sm:block font-medium text-gray-800 dark:text-gray-300">{gateway.name}</Paragraph>
                                                    <div className="sm:hidden mt-1 space-y-1">
                                                        <div>
                                                            <SmallText className="text-gray-500 dark:text-gray-400 font-medium">Name: </SmallText>
                                                            <SmallText className="text-gray-700 dark:text-gray-300">{gateway.name}</SmallText>
                                                        </div>
                                                        <div>
                                                            <SmallText className="text-gray-500 dark:text-gray-400 font-medium">Type: </SmallText>
                                                            <SmallText className="text-gray-700 dark:text-gray-300">
                                                                {gateway.connectionType == "serial" ? "Serial (gateway)" : "IP Gateway"}
                                                            </SmallText>
                                                        </div>
                                                        <div>
                                                            <SmallText className="text-gray-500 dark:text-gray-400 font-medium">Address:Port: </SmallText>
                                                            <SmallText className="text-blue-600 dark:text-blue-400">{gateway.connectionType == "serial" ? gateway.port : (gateway.ipAddress + ":" + gateway.port)}</SmallText>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 sm:px-6 py-4 whitespace-nowrap hidden md:table-cell">
                                                    <Paragraph className="font-medium text-gray-500 dark:text-gray-400">
                                                        {gateway.connectionType == "serial" ? "Serial (gateway)" : "IP Gateway"}
                                                    </Paragraph>
                                                </td>
                                                <td className="px-4 sm:px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                                                    <span className={`inline-block px-2 py-1 rounded-full text-blue-600 dark:text-blue-400`}>
                                                        {gateway.connectionType == "serial" ? gateway.port : (gateway.ipAddress + ":" + gateway.port)}
                                                    </span>
                                                </td>
                                                <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right">
                                                    <div className="flex justify-end space-x-1 sm:space-x-2">
                                                        <IconButton
                                                            size="sm"
                                                            onClick={() => openEditGatewayModal(gateway)}
                                                            icon={<Pencil size={14} />}
                                                            variant="warning"
                                                            className="p-2 sm:p-3"
                                                        />
                                                        <IconButton
                                                            size="sm"
                                                            onClick={() => handleDeleteGateway(gateway)}
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
                isOpen={isAddGatewayModalOpen}
                onClose={() => setIsAddGatewayModalOpen(false)}
                className="max-w-2xl"
            >
                <GatewayForm
                    onSubmit={handleAddGateway}
                    onCancel={() => setIsAddGatewayModalOpen(false)}
                />
            </Modal>

            {/* Kullanıcı Düzenle Modal */}
            <Modal
                isOpen={isEditGatewayModalOpen}
                onClose={() => setIsEditGatewayModalOpen(false)}
                className="max-w-2xl"
            >
                {selectedGateway && (
                    <GatewayForm
                        gateway={selectedGateway}
                        onSubmit={handleEditGateway}
                        onCancel={() => setIsEditGatewayModalOpen(false)}
                    />
                )}
            </Modal>
        </div>
    );
}
