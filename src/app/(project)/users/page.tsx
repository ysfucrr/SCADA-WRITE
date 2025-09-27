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
import UserCard from "@/components/users/UserCard";
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
        periodicReports: boolean;
        billing: boolean;
        multiLog: boolean;
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
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
                    {users.length === 0 ? (
                        <div className="col-span-full text-center py-8">
                            <SmallText className="text-gray-500 dark:text-gray-400">No users found</SmallText>
                        </div>
                    ) : (
                        users.map((user) => (
                            <UserCard
                                key={user._id}
                                user={user}
                                onEdit={() => openEditUserModal(user)}
                                onDelete={() => handleDeleteUser(user)}
                                loginedUser={loginedUser}
                            />
                        ))
                    )}
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
