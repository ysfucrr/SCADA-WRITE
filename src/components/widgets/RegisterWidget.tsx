"use client";

import { useWebSocket } from "@/context/WebSocketContext";
import { useEffect, useState } from "react";
import { PencilSquareIcon, TrashIcon } from "@heroicons/react/24/outline";

interface Register {
  id: string;
  label: string;
  analyzerId: string;
  address: number;
  dataType: string;
  bit?: number;
}

interface RegisterWidgetProps {
  title: string;
  registers: Register[];
  onEdit: () => void;
  onDelete: () => void;
}

const RegisterValue: React.FC<{ register: Register }> = ({ register }) => {
  const [value, setValue] = useState<any>(null);
  const { watchRegister, unwatchRegister } = useWebSocket();

  useEffect(() => {
    const handleValueChange = (newValue: any) => {
      setValue(newValue);
    };

    watchRegister(
      {
        analyzerId: register.analyzerId,
        address: register.address,
        dataType: register.dataType,
        registerId: register.id,
        bit: register.bit
      },
      handleValueChange
    );

    return () => {
      unwatchRegister(
        {
          analyzerId: register.analyzerId,
          address: register.address,
          dataType: register.dataType,
          bit: register.bit
        },
        handleValueChange
      );
    };
  }, [register, watchRegister, unwatchRegister]);

  return (
        <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate font-medium">{register.label}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                 {value !== null ? value.toString() : <span className="text-xs text-gray-500">Loading...</span>}
            </p>
        </div>
  );
};

export const RegisterWidget: React.FC<RegisterWidgetProps> = ({ title, registers, onEdit, onDelete }) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 relative group border border-transparent hover:border-blue-500 transition-all duration-300">
        <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <button onClick={onEdit} className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <PencilSquareIcon className="h-5 w-5" />
            </button>
            <button onClick={onDelete} className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <TrashIcon className="h-5 w-5" />
            </button>
        </div>
      
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4 text-center tracking-wider">{title}</h3>
      
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {registers.map((reg) => (
            <RegisterValue key={reg.id} register={reg} />
            ))}
        </div>
    </div>
  );
};