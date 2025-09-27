"use client";
import React, { useState, useEffect } from "react";
import { UserType } from "@/app/(project)/users/page";
import { SmallText } from "@/components/ui/typography";
import Switch from "../form/switch/Switch";
import { showToast } from "../ui/alert";
import { useAuth } from "@/hooks/use-auth";
interface UserFormProps {
    user?: UserType;
    onSubmit: (userData: {
        username: string;
        password: string;
        permissions: {
            billing: boolean;
            users: boolean;
            units: boolean;
            trendLog: boolean;
            periodicReports: boolean;
        };
        buildingPermissions: {
            [buildingId: string]: boolean;
        };
    }) => void;
    onCancel: () => void;
}

const UserForm: React.FC<UserFormProps> = ({ user, onSubmit, onCancel }) => {
    const [username, setUsername] = useState(user?.username || "");
    const [password, setPassword] = useState("");
    const [permissions, setPermissions] = useState({
        billing: user?.permissions?.billing || false,
        users: user?.permissions?.users || false,
        units: user?.permissions?.units || false,
        trendLog: user?.permissions?.trendLog || false,
        periodicReports: user?.permissions?.periodicReports || false,
        multiLog: user?.permissions?.multiLog || false,
    });
    const [buildingPermissions, setBuildingPermissions] = useState<{ [key: string]: boolean }>({});
    const [buildings, setBuildings] = useState<Array<{ _id: string, name: string }>>([]);
    const [isLoadingBuildings, setIsLoadingBuildings] = useState(true);
    const { user: loginedUser, isAdmin, isLoading: isAuthLoading } = useAuth();
    useEffect(() => {
        const fetchBuildings = async () => {
            try {
                setIsLoadingBuildings(true);
                const response = await fetch('/api/units');
                const data = await response.json();

                if (data.success && data.buildings) {
                    setBuildings(data.buildings);

                    // Initialize permissions with user's existing permissions or false
                    const initialPermissions: { [key: string]: boolean } = {};
                    data.buildings.forEach((building: { _id: string }) => {
                        initialPermissions[building._id] = user?.buildingPermissions?.[building._id] || false;
                    });
                    setBuildingPermissions(initialPermissions);
                }
            } catch (error) {
                console.error('Error fetching buildings:', error);
            } finally {
                setIsLoadingBuildings(false);
            }
        };

        fetchBuildings();
    }, [user]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Form validation
        if (!username || (!user && !password)) {
            return;
        }

        // Sadece true olan yetkileri gönder veya boş obje
        const filteredPermissions = buildingPermissions
            ? Object.fromEntries(
                Object.entries(buildingPermissions).filter(([_, value]) => value)
            )
            : {};

        //check must have at least one permission or one building permission
        //filteredPermissions are also based on buildingPermissions
        console.log("filteredPermissions: ", filteredPermissions)
        console.log("buildingPermissions: ", buildingPermissions)
        console.log("permissions: ", permissions)

        if (!Object.values(filteredPermissions).some(Boolean) && Object.values(permissions).some(Boolean)) {
            showToast("User must have at least one permission or one building permission", "error");
            return;
        }

        console.log('Submitting:', {
            username,
            password: password || '',
            permissions,
            buildingPermissions: filteredPermissions
        });

        onSubmit({
            username,
            password: password || '',
            permissions,
            buildingPermissions: filteredPermissions
        });
    };

    return (
        <div className="p-6">
            <h2 className="text-xl font-bold mb-6 text-blue-600 dark:text-blue-400">
                {user ? "Edit User" : "Add New User"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Username input */}
                <div>
                    <label htmlFor="username" className="block text-sm font-semibold mb-2">
                        Username
                    </label>
                    <div className="relative rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 hover:border-blue-500/50 transition-all">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-5 w-5 text-gray-500 dark:text-gray-400"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                            </svg>
                        </div>
                        <input
                            id="username"
                            className="block w-full pl-10 pr-3 py-3 text-base placeholder-muted-foreground bg-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            placeholder="Username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            disabled={!!user} // Read-only if editing existing user
                        />
                    </div>
                </div>

                {/* Password input */}
                <div>
                    <label htmlFor="password" className="block text-sm font-semibold mb-2">
                        Password
                    </label>
                    <div className="relative rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 hover:border-blue-500/50 transition-all">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-5 w-5 text-gray-500 dark:text-gray-400"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                        </div>
                        <input
                            id="password"
                            type="password"
                            className="block w-full pl-10 pr-3 py-3 text-base placeholder-muted-foreground bg-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            placeholder={user ? "Leave blank to keep current password" : "Password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                </div>

                {/* Permissions */}
                <div className="mt-6">
                    <div className="text-left text-sm font-semibold mb-3 pb-1 border-b border-gray-200 dark:border-gray-700">
                        Page Permissions
                    </div>
                    <div className="grid grid-cols-2 gap-y-3 gap-x-2">
                        {/* billing permission */}
                        <div className="flex items-center space-x-2">
                            <div className="switch-container">
                                <Switch
                                    disabled={loginedUser?.role != "admin" && !loginedUser?.permissions?.billing}
                                    onChange={(value) =>
                                        setPermissions({
                                            ...permissions,
                                            billing: value,
                                        })
                                    }
                                    label="Billing"
                                    defaultChecked={permissions.billing}
                                />
                            </div>
                        </div>

                        {/* Users permission */}
                        <div className="flex items-center space-x-2">
                            <div className="switch-container">
                                <Switch
                                    disabled={loginedUser?.role != "admin" && !loginedUser?.permissions?.users}
                                    label="Users"
                                    defaultChecked={permissions.users}
                                    onChange={(value) =>
                                        setPermissions({
                                            ...permissions,
                                            users: value,
                                        })
                                    }
                                />
                            </div>
                        </div>

                        {/* Settings permission */}
                        <div className="flex items-center space-x-2">
                            <div className="switch-container">
                                <Switch
                                    disabled={loginedUser?.role != "admin" && !loginedUser?.permissions?.units}
                                    label="Units"
                                    defaultChecked={permissions.units}
                                    onChange={(value) =>
                                        setPermissions({
                                            ...permissions,
                                            units: value,
                                        })
                                    }
                                />
                            </div>
                        </div>

                        {/* Trend Log permission */}
                        <div className="flex items-center space-x-2">
                            <div className="switch-container">
                                <Switch
                                    disabled={loginedUser?.role != "admin" && !loginedUser?.permissions?.trendLog}
                                    label="Trend Log"
                                    defaultChecked={permissions.trendLog}
                                    onChange={(value) =>
                                        setPermissions({
                                            ...permissions,
                                            trendLog: value,
                                        })
                                    }
                                />
                            </div>
                        </div>

                        {/* Periodic Reports permission */}
                        <div className="flex items-center space-x-2">
                            <div className="switch-container">
                                <Switch
                                    disabled={loginedUser?.role !== "admin"}
                                    label="Periodic Reports"
                                    defaultChecked={permissions.periodicReports}
                                    onChange={(value) =>
                                        setPermissions({
                                            ...permissions,
                                            periodicReports: value,
                                        })
                                    }
                                />
                            </div>
                        </div>

                        {/* Multi Log permission */}
                        <div className="flex items-center space-x-2">
                            <div className="switch-container">
                                <Switch
                                    disabled={loginedUser?.role !== "admin"}
                                    label="Multi Log"
                                    defaultChecked={permissions.multiLog}
                                    onChange={(value) =>
                                        setPermissions({
                                            ...permissions,
                                            multiLog: value,
                                        })
                                    }
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Building Permissions */}
                <div className="mt-6">
                    <div className="text-left text-sm font-semibold mb-3 pb-1 border-b border-gray-200 dark:border-gray-700">
                        Building Permissions
                    </div>
                    {isLoadingBuildings ? (
                        <div>Loading...</div>
                    ) : (
                        <div className="grid grid-cols-2 gap-y-3 gap-x-2">
                            {buildings.map((building) => (
                                <div key={building._id} className="flex items-center space-x-2">
                                    <div className="switch-container">
                                        <Switch
                                            disabled={loginedUser?.role != "admin" && !loginedUser?.buildingPermissions?.[building._id]}
                                            label={building.name}
                                            defaultChecked={buildingPermissions?.[building._id]}
                                            onChange={(value) =>
                                                setBuildingPermissions({
                                                    ...buildingPermissions,
                                                    [building._id]: value,
                                                })
                                            }
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                {loginedUser?.role != "admin" && <div className="text-red-500">Non-admin users can only give their own permissions</div>}
                <div className="flex items-center justify-end space-x-3 mt-8">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                    >
                        {user ? "Save Changes" : "Add User"}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default UserForm;
