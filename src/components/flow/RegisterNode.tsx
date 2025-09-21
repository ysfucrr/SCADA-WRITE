"use client";

import { Edit, Trash2, Send } from 'lucide-react';
import { memo, useEffect, useRef, useState, Fragment } from 'react';
import { NodeProps, NodeToolbar, Position } from 'reactflow';
import '@/styles/seven-segment.css';
import { useWebSocket } from '@/context/WebSocketContext';
import RegisterGraphComponent from './RegisterGraphComponent_new';
import Image from 'next/image';
import { useAuth } from '@/hooks/use-auth';
import { Menu, Transition } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';

interface RegisterNodeData {
  style?: React.CSSProperties;
  label: string;
  address: number;
  dataType: string;
  fontFamily: string;
  scale: number;
  scaleUnit: string;
  font: number;
  byteOrder?: string;
  bit?: number;
  decimalPlaces?: number;
  backgroundColor?: string;
  textColor?: string;
  opacity?: number;
  analyzerId?: string | number;
  displayMode?: 'digit' | 'graph';
  registerType?: 'read' | 'write';
  controlType?: 'dropdown' | 'button';
  dropdownOptions?: { label: string, value: string }[];
  onValue?: string;
  offValue?: string;
  onIcon?: string;
  offIcon?: string;
  onEdit?: () => void;
  onDelete?: () => void;
}

 const RegisterNode = memo((node: NodeProps<RegisterNodeData>) => {
  const { label, address, dataType, fontFamily, scale, scaleUnit, font = 1, byteOrder, backgroundColor = '#000000', textColor = '#ffffff', opacity, bit, analyzerId = '1', displayMode = 'digit', registerType = 'read', controlType = 'dropdown', dropdownOptions, onValue = '1', offValue = '0', onIcon, offIcon } = node.data;
  const [value, setValue] = useState<string | number>('--' ); // For display
  const [rawValue, setRawValue] = useState<any>(null); // For state logic
  const [isLoading, setIsLoading] = useState(true);
  const textRef = useRef<HTMLDivElement | null>(null);
  const booleanTextRef = useRef<HTMLDivElement | null>(null);
  const { isAdmin } = useAuth()

  // WebSocket hook'unu kullan
  const { watchRegister, unwatchRegister, writeRegister, isConnected } = useWebSocket();

  const handleWrite = async (writeValue: number) => {
    try {
        await writeRegister(node.id, writeValue);
    } catch (error) {
        console.error("Write operation failed", error);
    }
  };

  // Register değerini formatla
  const formatValue = (registerValue: any) => {
    if (registerValue !== null && registerValue !== undefined) {
      if (dataType === 'boolean') {
        setValue(registerValue === 1 || registerValue === true ? 'ON' : 'OFF');
      } else if (typeof registerValue === 'number') {
        // Ondalık sayılar için 2 basamak göster
        setValue(registerValue.toFixed(node.data.decimalPlaces || 2));
      } else {
        setValue(registerValue);
      }
    } else {
      setValue('--');
    }
    setIsLoading(false);
  };

  // WebSocket ile register izlemeyi başlat
  useEffect(() => {
    // Dropdown tipi write register'lar için hiçbir watch işlemi yapma.
    if (registerType === 'write' && controlType === 'dropdown') {
      setIsLoading(false);
      setValue(label); // Sadece etiketi göster
      return;
    }

    // Bağlantı yoksa, polling'i başlatma ve durumu beklemede olarak ayarla.
    if (!isConnected) {
      setIsLoading(true);
      setValue('--');
      return;
    }

    setIsLoading(true);

    // 'read' veya 'write-button' tipleri için izlemeyi başlat.
    const register = {
      registerId: node.id,
      analyzerId: analyzerId,
      address,
      dataType,
      scale,
      scaleUnit,
      byteOrder,
      bit,
      registerType
    };
    
    // İşlenmemiş değeri state'te tutmak için ayrı bir callback
    const rawValueCallback = (currentVal: any) => {
      setRawValue(currentVal);
      formatValue(currentVal); // Görüntüyü de formatla
    };

    watchRegister(register, rawValueCallback);
    
    // Component unmount olduğunda izlemeyi bırak.
    return () => {
      unwatchRegister(register, rawValueCallback);
    };
  }, [address, dataType, scale, byteOrder, bit, analyzerId, isConnected, watchRegister, unwatchRegister, registerType, controlType, label, node.id]);

  // Font boyutu hesaplama fonksiyonu
  const calculateFontSize = (element: HTMLDivElement, textValue: string | number) => {
    const parentElement = element.parentElement;
    if (parentElement) {
      const parentWidth = parentElement.clientWidth * 0.7;
      const parentHeight = parentElement.clientHeight * 0.9;

      const v = typeof textValue === "number" ? textValue.toFixed(2) : textValue.toString();
      const widthRatio = parentWidth / (v.length * 20); 
      const heightRatio = parentHeight / 40;

      const ratio = Math.min(widthRatio, heightRatio);

      const fontSize = Math.max(12, Math.floor(ratio * 40));
      element.style.fontSize = `${fontSize}px`;
    }
  };

  // Boyut değişikliklerini izlemek için ResizeObserver kullanıyoruz
  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Normal register için
        if (textRef.current && dataType !== 'boolean') {
          calculateFontSize(textRef.current, value + ' ' + scaleUnit);
        }
        // Boolean register için
        if (booleanTextRef.current && dataType === 'boolean') {
          calculateFontSize(booleanTextRef.current, value);
        }
      }
    });

    if (registerType === 'read') {
        if (textRef.current && dataType !== 'boolean') {
            resizeObserver.observe(textRef.current);
        }
        if (booleanTextRef.current && dataType === 'boolean') {
            resizeObserver.observe(booleanTextRef.current);
        }
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [value, dataType, registerType]);



  function hexToRgba(hex: string, opacity: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const a = opacity;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }


  return (
    <div className="register-node relative group w-full h-full" style={{ ...(node as any).style, overflow: 'visible' }}>
      {isAdmin && (
        <NodeToolbar isVisible={node.selected} position={Position.Top}>
          <div className="h-6 flex flex-row items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                node.data.onEdit?.();
              }}
              className=" z-50 p-1 bg-warning-500 hover:bg-warning-600 text-white rounded-md items-center justify-center"
              style={{ height: '100%', aspectRatio: '1/1' }}
            >
              <Edit size={"100%"} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                node.data.onDelete?.();
              }}
              className="flex z-50 mr-2 p-1 bg-error-500 hover:bg-error-600 text-white rounded-md items-center justify-center"
              style={{ height: '100%', aspectRatio: '1/1' }}
            >
              <Trash2 size={"100%"} />
            </button>
          </div>
        </NodeToolbar>
      )}
      
      <div className=" w-full h-full flex items-center justify-center relative text-center"
        style={{
          ...(displayMode === 'digit' && registerType !== 'write' && { backgroundColor: hexToRgba(backgroundColor, opacity! / 100) }),
          border: node.selected && isAdmin ? '6px solid #f00' : 'none',
          borderRadius: '5px',
        }}
      >
        {registerType === 'write' && controlType === 'dropdown' ? (
          <div className="flex flex-col w-full h-full"
            style={{ backgroundColor: hexToRgba(backgroundColor, opacity! / 100) }}>
            <div className="text-center p-2 w-full">
              <span className="text-lg font-bold" style={{ color: textColor, fontFamily: fontFamily }}>
                {label}
              </span>
            </div>
            
            <div className="flex-grow flex flex-col items-center justify-center px-4 w-full">
              <select
                id={`select-${node.id}`}
                className="w-full text-base rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 px-4 py-3 mb-4"
                style={{
                  minWidth: "90%",
                  maxWidth: "100%"
                }}
              >
                <option value="">Select value...</option>
                {(dropdownOptions || []).map((option, index) => (
                  <option key={index} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              
              <button
                onClick={() => {
                  const selectElement = document.getElementById(`select-${node.id}`) as HTMLSelectElement;
                  if (selectElement && selectElement.value) {
                    handleWrite(Number(selectElement.value));
                    selectElement.value = ""; // Reset selection after write
                  }
                }}
                className="w-full text-base font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors duration-200 flex items-center justify-center px-4 py-3"
                style={{
                  minWidth: "90%",
                  maxWidth: "100%"
                }}
              >
                <Send size={16} className="mr-2" />
                Write Selected
              </button>
            </div>
          </div>
        ) : registerType === 'write' && controlType === 'button' ? (
          <button
            onClick={() => {
              const numericOnValue = Number(onValue);
              const valueToSend = rawValue === numericOnValue ? Number(offValue) : numericOnValue;
              handleWrite(valueToSend);
            }}
            className="w-full h-full p-0 border-none bg-transparent cursor-pointer flex items-center justify-center"
            style={{ backgroundColor: hexToRgba(backgroundColor, opacity! / 100) }}
            >
            {(onIcon || offIcon) ? (
              <Image
                src={rawValue === Number(onValue) ? onIcon! : offIcon!}
                alt={rawValue === Number(onValue) ? 'ON' : 'OFF'}
                fill
                className="object-contain p-2"
                priority
              />
            ) : (
                <div className="text-center font-bold" style={{ color: textColor }}>
                {rawValue === Number(onValue) ? (label.toUpperCase() + ' ON') : (label.toUpperCase() + ' OFF')}
              </div>
            )}
          </button>
        ) : displayMode === 'digit' ? (
          dataType === 'boolean' && (onIcon || offIcon) ? (
            <div className="w-full h-full flex items-center justify-center p-2">
              {isLoading ? (
                <div className="text-center" style={{ color: textColor }}>
                  {isConnected ? '... ' + scaleUnit : '-- ' + scaleUnit}
                </div>
              ) : (
                ((value as any) === true || value === 1 || value === 'ON' || value === 'on' || value === 'true' || value === '1') ? (
                  onIcon ? (
                    <Image
                      src={onIcon}
                      alt="ON"
                      fill
                      className="object-contain"
                      priority
                    />
                  ) : (
                    <div
                      ref={booleanTextRef}
                      className="text-center w-full h-full flex items-center justify-center"
                      style={{
                        color: textColor,
                        fontFamily: fontFamily,
                        whiteSpace: 'nowrap',
                        lineHeight: '1'
                      }}
                    >
                      ON
                    </div>
                  )
                ) : (
                  offIcon ? (
                    <Image
                      src={offIcon}
                      alt="OFF"
                      fill
                      className="object-contain"
                      priority
                    />
                  ) : (
                    <div
                      ref={booleanTextRef}
                      className="text-center w-full h-full flex items-center justify-center"
                      style={{
                        color: textColor,
                        fontFamily: fontFamily,
                        whiteSpace: 'nowrap',
                        lineHeight: '1'
                      }}
                    >
                      OFF
                    </div>
                  )
                )
              )}
            </div>
          ) : (
            <div
              ref={textRef}
              className=" w-full h-full flex items-center justify-center"
              style={{
                marginLeft: 16,
                marginRight: 16,
                fontFamily: fontFamily,
                color: textColor,
                whiteSpace: 'nowrap',
                lineHeight: '1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px',
                margin: "auto"
              }}
            >
              {isLoading ? (isConnected ? '... ' + scaleUnit : '-- ' + scaleUnit) : typeof value === 'number' ? value + ' ' + scaleUnit : value + ' ' + scaleUnit}
            </div>
          )
        ) : (
          <div className="w-full h-full">
            <RegisterGraphComponent
              registerId={node.id}
              registerName={label}
              analyzerId={analyzerId}
              address={address}
              dataType={dataType}
              scale={scale}
              byteOrder={byteOrder}
              bit={bit}
              width={(node as any).width || 300}
              height={(node as any).height || 200}
              maxDataPoints={50}
              showToolbar={false}
              theme="dark"
            />
          </div>
        )}
      </div>
    </div>
  );
});

export default memo(RegisterNode);