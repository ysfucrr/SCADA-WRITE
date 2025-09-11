"use client";

import { useWebSocket } from "@/context/WebSocketContext";
import { useEffect, useState } from "react";

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

export const RegisterWidget: React.FC<RegisterWidgetProps> = ({ title, registers }) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
      <h4 className="text-md font-bold mb-2">{title}</h4>
      <div className="space-y-2">
        {registers.map((reg) => (
          <RegisterValue key={reg.id} register={reg} />
        ))}
      </div>
    </div>
  );
};