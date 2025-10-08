"use client";
import React from 'react';
import { Smartphone, Pencil, Trash2 } from 'lucide-react';
import { SmallText, Paragraph } from '@/components/ui/typography';
import { IconButton } from '@/components/ui/icon-button';

interface MobileUser {
  _id: string;
  username: string;
  permissionLevel: 'read' | 'readwrite' | 'admin';
  lastLogin?: string;
  createdAt: string;
  updatedAt: string;
}

const MobileUserCard = ({ user, onEdit, onDelete }: { 
  user: MobileUser; 
  onEdit: (user: MobileUser) => void; 
  onDelete: (userId: string) => void;
}) => {
  // Helper to get permission level display text
  const getPermissionText = (level: string) => {
    switch(level) {
      case 'admin': return 'Administrator';
      case 'readwrite': return 'Read & Write';
      case 'read': return 'Read Only';
      default: return level;
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden transform hover:scale-105 transition-transform duration-300 ease-in-out">
      <div className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <Smartphone className="h-10 w-10 text-blue-500 dark:text-blue-400" />
          </div>
          <div className="ml-4">
            <Paragraph className="font-semibold text-lg text-gray-800 dark:text-gray-200">{user.username}</Paragraph>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              user.permissionLevel === 'admin' 
                ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                : user.permissionLevel === 'readwrite'
                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
            }`}>
              {getPermissionText(user.permissionLevel)}
            </span>
          </div>
        </div>
        <div className="mt-4">
          <SmallText className="text-gray-500 dark:text-gray-400">
            Created: {new Date(user.createdAt).toLocaleDateString()}
          </SmallText>
        </div>
      </div>
      <div className="bg-gray-50 dark:bg-gray-700 px-5 py-3 flex justify-end space-x-2">
        <IconButton
          size="sm"
          onClick={() => onEdit(user)}
          icon={<Pencil size={14} />}
          variant="warning"
          className="p-2 sm:p-3"
        />
        <IconButton
          size="sm"
          onClick={() => onDelete(user._id)}
          icon={<Trash2 size={14} />}
          variant="error"
          className="px-2 sm:px-3"
        />
      </div>
    </div>
  );
};

export default MobileUserCard;