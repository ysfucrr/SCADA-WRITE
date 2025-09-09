"use client";
import React from 'react';
import { User, Pencil, Trash2 } from 'lucide-react';
import { SmallText, Paragraph } from '@/components/ui/typography';
import { IconButton } from '@/components/ui/icon-button';

const UserCard = ({ user, onEdit, onDelete, loginedUser }: { user: any; onEdit: (user: any) => void; onDelete: (user: any) => void, loginedUser: any }) => {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden transform hover:scale-105 transition-transform duration-300 ease-in-out">
            <div className="p-5">
                <div className="flex items-center">
                    <div className="flex-shrink-0">
                        <User className="h-10 w-10 text-gray-500 dark:text-gray-400" />
                    </div>
                    <div className="ml-4">
                        <Paragraph className="font-semibold text-lg text-gray-800 dark:text-gray-200">{user.username}</Paragraph>
                        <SmallText className="text-gray-600 dark:text-gray-400">{user.role}</SmallText>
                    </div>
                </div>
                <div className="mt-4">
                    <SmallText className="text-gray-500 dark:text-gray-400">
                        Created At: {new Date(user.createdAt).toLocaleDateString("tr-TR")}
                    </SmallText>
                </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 px-5 py-3 flex justify-end space-x-2">
                <IconButton
                    size="sm"
                    disabled={user._id == loginedUser?.id}
                    onClick={() => onEdit(user)}
                    icon={<Pencil size={14} />}
                    variant="warning"
                    className="p-2 sm:p-3"
                />
                <IconButton
                    disabled={user._id == loginedUser?.id}
                    size="sm"
                    onClick={() => onDelete(user)}
                    icon={<Trash2 size={14} />}
                    variant="error"
                    className="px-2 sm:px-3"
                />
            </div>
        </div>
    );
};

export default UserCard;