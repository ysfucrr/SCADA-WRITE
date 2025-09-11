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
      },
      handleValueChange
    );

    return () => {
      unwatchRegister(
        {
          analyzerId: register.analyzerId,
          address: register.address,
          dataType: register.dataType,
        },
        handleValueChange
      );
    };
  }, [register, watchRegister, unwatchRegister]);

  return (
    <div className="flex justify-between">
      <span>{register.label}:</span>
      <span className="font-bold">{value !== null ? value.toString() : "Loading..."}</span>
    </div>
  );
};

export const RegisterWidget: React.FC<RegisterWidgetProps> = ({ title, registers, onEdit, onDelete }) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
      <div className="flex justify-between items-start mb-2">
        <h4 className="text-md font-bold">{title}</h4>
        <div className="flex gap-2">
          <button onClick={onEdit} className="text-gray-500 hover:text-gray-700 dark:hover:text-white">
            <PencilSquareIcon className="h-5 w-5" />
          </button>
          <button onClick={onDelete} className="text-gray-500 hover:text-red-500 dark:hover:text-red-400">
            <TrashIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {registers.map((reg) => (
          <RegisterValue key={reg.id} register={reg} />
        ))}
      </div>
    </div>
  );
};