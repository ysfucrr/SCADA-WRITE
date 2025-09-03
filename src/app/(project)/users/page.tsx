"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { PlusCircle, Pencil, Trash2, User } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Heading2, Heading3, Paragraph, SmallText } from "@/components/ui/typography";
import { Button, OutlineButton } from "@/components/ui/button/CustomButton";
import { IconButton } from "@/components/ui/icon-button";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Modal } from "@/components/ui/modal";
import UserForm from "@/components/users/UserForm";
import { showAlert, showConfirmAlert, showToast } from "@/components/ui/alert";

// Kullanıcı tipi
export interface UserType {
    _id: string;
    username: string;
    role: string;
    createdAt: string;
    permissions?: {
        dashboard: boolean;
        users: boolean;
        units: boolean;
        trendLog: boolean;
    };
    buildingPermissions?: {
        [buildingId: string]: boolean;
    };
}

export default function UsersPage() {
    const [users, setUsers] = useState<UserType[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Modal durumları
    const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
    const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<UserType | undefined>(undefined);
    const { user: loginedUser, isAdmin, isLoading: isAuthLoading } = useAuth();

    // Kullanıcıları getir
    const fetchUsers = async () => {
        try {
            setIsLoading(true);
            const response = await fetch("/api/users");

            if (!response.ok) {
                throw new Error("Error fetching users");
            }

            const data = await response.json();
            setUsers(data);
        } catch (error) {
            console.error("Error fetching users:", error);
            showToast("Error fetching users", "error");
        } finally {
            setIsLoading(false);
        }
    };

    // Sayfa yüklendiğinde kullanıcıları getir
    useEffect(() => {
        if (isAdmin || loginedUser?.permissions?.users) {
            fetchUsers();
        } else if (!isAdmin) {
            setIsLoading(false);
        }
    }, [isAdmin, loginedUser?.permissions]);



    // Kullanıcı ekle modalını aç
    const openAddUserModal = () => {
        setSelectedUser(undefined);
        setIsAddUserModalOpen(true);
    };

    // Kullanıcı ekle
    const handleAddUser = async (userData: { username: string; password: string; permissions: any, buildingPermissions: any }) => {
        try {
            const response = await fetch("/api/users", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(userData),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "User could not be added");
            }

            showToast("User added successfully");
            setIsAddUserModalOpen(false);
            fetchUsers();
        } catch (error: any) {
            showToast(error.message || "User could not be added", "error");
        }
    };

    // Kullanıcı düzenle modalını aç
    const openEditUserModal = (user: UserType) => {
        setSelectedUser(user);
        setIsEditUserModalOpen(true);
    };

    // Kullanıcı düzenle
    const handleEditUser = async (userData: { username: string; password: string; permissions: any, buildingPermissions: any }) => {
        if (!selectedUser) return;

        try {
            // Eğer password boşsa, API'ye göndermiyoruz
            const dataToSend = {
                permissions: userData.permissions,
                buildingPermissions: userData.buildingPermissions
            };
            //console.log("dataToSend: ", dataToSend)
            // Şifre varsa ekle
            if (userData.password) {
                Object.assign(dataToSend, { password: userData.password });
            }

            const response = await fetch(`/api/users/${selectedUser._id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(dataToSend),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "User could not be updated");
            }

            showToast("User updated successfully");
            setIsEditUserModalOpen(false);
            fetchUsers();
        } catch (error: any) {
            showToast(error.message || "User could not be updated", "error");
        }
    };

    // Kullanıcı sil
    const handleDeleteUser = async (user: UserType) => {
        const result = await showConfirmAlert(
            "Delete User",
            `"${user.username}" user will be deleted. Are you sure?`,
            "Delete",
            "Cancel",
        );
        if (result.isConfirmed) {
            try {
                const response = await fetch(`/api/users/${user._id}`, {
                    method: "DELETE",
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || "User could not be deleted");
                }

                showToast("User deleted successfully");
                fetchUsers();
            } catch (error: any) {
                showToast(error.message || "User could not be deleted", "error");
            }
        }
    };

    // Kimlik doğrulama yükleniyorsa
    // if (status === "loading") {
    //     return <Spinner variant="bars" fullPage />;
    // }


    if (isAuthLoading) {
        return <Spinner variant="bars" fullPage />
    }
    return (
        <div>
            <PageBreadcrumb pageTitle="Users" />

            <div className="flex justify-between items-center mb-6">
                {/* <div>  </div> */}
                <Button
                    onClick={openAddUserModal}
                    leftIcon={<PlusCircle size={16} />}
                    variant="primary"
                >
                    Add New User
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
                                            <SmallText className="font-bold uppercase tracking-wider">User</SmallText>
                                        </th>
                                        <th className="px-4 sm:px-6 py-3 text-left hidden sm:table-cell">
                                            <SmallText className="font-bold uppercase tracking-wider">Role</SmallText>
                                        </th>
                                        <th className="px-4 sm:px-6 py-3 text-left hidden md:table-cell">
                                            <SmallText className="font-bold uppercase tracking-wider">Created At</SmallText>
                                        </th>
                                        <th className="px-4 sm:px-6 py-3 text-right">
                                            <SmallText className="font-bold uppercase tracking-wider">Actions</SmallText>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {users.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-4 sm:px-6 py-4 text-center">
                                                <SmallText className="text-gray-500 dark:text-gray-400">No users found</SmallText>
                                            </td>
                                        </tr>
                                    ) : (
                                        users.map((user) => (
                                            <tr key={user._id} className="hover:bg-gray-50 dark:bg-gray-800/30">
                                                <td className="px-4 sm:px-6 py-4 whitespace-normal">
                                                    <Paragraph className="hidden sm:block font-medium text-gray-800 dark:text-gray-300">{user.username}</Paragraph>
                                                    <div className="sm:hidden mt-1 space-y-1">
                                                        <div>
                                                            <SmallText className="text-gray-500 dark:text-gray-400 font-medium">Username: </SmallText>
                                                            <SmallText className="text-gray-700 dark:text-gray-300">{user.username}</SmallText>
                                                        </div>
                                                        <div>
                                                            <SmallText className="text-gray-500 dark:text-gray-400 font-medium">Role: </SmallText>
                                                            <SmallText className="text-blue-600 dark:text-blue-400">{user.role}</SmallText>
                                                        </div>
                                                        <div>
                                                            <SmallText className="text-gray-500 dark:text-gray-400 font-medium">Created at: </SmallText>
                                                            <SmallText className="text-gray-700 dark:text-gray-300">
                                                                {user.createdAt ? new Date(user.createdAt).toLocaleDateString("tr-TR") : "-"}
                                                            </SmallText>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 sm:px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                                                    <span className={`inline-block px-2 py-1 rounded-full text-blue-600 dark:text-blue-400`}>
                                                        {user.role}
                                                    </span>
                                                </td>
                                                <td className="px-4 sm:px-6 py-4 whitespace-nowrap hidden md:table-cell">
                                                    <Paragraph className="font-medium text-gray-500 dark:text-gray-400">
                                                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString("tr-TR") : "-"}
                                                    </Paragraph>
                                                </td>
                                                <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right">
                                                    <div className="flex justify-end space-x-1 sm:space-x-2">
                                                        <IconButton
                                                            size="sm"
                                                            disabled={user._id == loginedUser?.id}
                                                            onClick={() => openEditUserModal(user)}
                                                            icon={<Pencil size={14} />}
                                                            variant="warning"
                                                            className="p-2 sm:p-3"
                                                        />
                                                        <IconButton
                                                            disabled={user._id == loginedUser?.id}
                                                            size="sm"
                                                            onClick={() => handleDeleteUser(user)}
                                                            icon={<Trash2 size={14} />}
                                                            variant="error"
                                                            className="px-2 sm:px-3"
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
                isOpen={isAddUserModalOpen}
                onClose={() => setIsAddUserModalOpen(false)}
                className="max-w-2xl"
            >
                <UserForm
                    onSubmit={handleAddUser}
                    onCancel={() => setIsAddUserModalOpen(false)}
                />
            </Modal>

            {/* Kullanıcı Düzenle Modal */}
            <Modal
                isOpen={isEditUserModalOpen}
                onClose={() => setIsEditUserModalOpen(false)}
                className="max-w-2xl"
            >
                {selectedUser && (
                    <UserForm
                        user={selectedUser}
                        onSubmit={handleEditUser}
                        onCancel={() => setIsEditUserModalOpen(false)}
                    />
                )}
            </Modal>
        </div>
    );
}
