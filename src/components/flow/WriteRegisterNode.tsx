"use client";

import { Edit, Trash2, Send, Plus, Minus } from 'lucide-react';
import Image from 'next/image';
import { memo, useEffect, useRef, useState } from 'react';
import { NodeProps, NodeToolbar, Position } from 'reactflow';
import '@/styles/seven-segment.css';
import { useWebSocket } from '@/context/WebSocketContext';
import { showToast } from '../ui/alert';
import { Button } from '../ui/button/CustomButton';
import { Input } from '../ui/input';
import { NumericFormat } from "react-number-format";
import { backendLogger } from '@/lib/logger/BackendLogger';
import { useAuth } from '@/hooks/use-auth';

interface WriteRegisterNodeData {
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
  offsetValue?: number;
  decimalPlaces?: number;
  backgroundColor?: string;
  textColor?: string;
  opacity?: number;
  analyzerId?: string | number;
  registerType: 'write' | 'readwrite';
  writeValue?: number | string; // Default value for input field
  lastValue?: number | string;  // Last value written by user
  minValue?: number;
  maxValue?: number;
  writePermission?: boolean;
  controlType?: 'numeric' | 'boolean' | 'dropdown' | 'manual';
  stepValue?: number;
  onValue?: number | string;
  offValue?: number | string;
  dropdownOptions?: Array<{label: string, value: number | string}>;
  placeholder?: string;
  infoText?: string;
  writeOnIcon?: string;
  writeOffIcon?: string;
  onEdit?: () => void;
  onDelete?: () => void;
}

const WriteRegisterNode = memo((node: NodeProps<WriteRegisterNodeData>) => {
  const { 
    label, 
    address, 
    dataType, 
    fontFamily, 
    scale,
    scaleUnit,
    font = 1,
    byteOrder,
    backgroundColor = '#000000',
    textColor = '#ffffff',
    opacity,
    bit,
    analyzerId = '1',
    offsetValue = 0,
    decimalPlaces = 2,
    registerType,
    writeValue: defaultWriteValue = '',
    minValue,
    maxValue,
    writePermission = true,
    controlType = 'numeric',
    stepValue = 1,
    onValue = 1,
    offValue = 0,
    dropdownOptions = [],
    placeholder = 'Enter value',
    infoText = '',
    writeOnIcon,
    writeOffIcon
  } = node.data;

  const [currentValue, setCurrentValue] = useState<string | number>('--');
  const [writeValue, setWriteValue] = useState<string>('');
  const [isWriting, setIsWriting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Load persisted value from database when component mounts
  useEffect(() => {
    // Öncelikle lastValue kullanılır, varsa - bu kullanıcının son yazdığı değerdir
    if (node.data.lastValue !== undefined) {
      setWriteValue(node.data.lastValue.toString());
    }
    // Eğer lastValue yoksa, defaultWriteValue kullanılır (varsayılan değer)
    else if (defaultWriteValue) {
      setWriteValue(defaultWriteValue.toString());
    }
    // Hiçbiri yoksa boş string
    else {
      setWriteValue('');
    }
  }, [node.data.lastValue, defaultWriteValue]);
  const textRef = useRef<HTMLDivElement | null>(null);
  const { isAdmin } = useAuth()

  // Increment/Decrement functions for numeric control
  const incrementValue = () => {
    if (controlType !== 'numeric') return;
    
    const currentNum = parseFloat(writeValue) || 0;
    const step = stepValue || 1; // Kullanıcının belirlediği step değeri
    let newValue = currentNum + step;
    
    if (maxValue !== undefined && newValue > maxValue) {
      newValue = maxValue;
    }
    
    // Step değerine göre ondalık basamak sayısını belirle
    const decimalPlaces = stepValue < 1 ? 2 : 0;
    setWriteValue(newValue.toFixed(decimalPlaces));
  };

  const decrementValue = () => {
    if (controlType !== 'numeric') return;
    
    const currentNum = parseFloat(writeValue) || 0;
    const step = stepValue || 1; // Kullanıcının belirlediği step değeri
    let newValue = currentNum - step;
    
    if (minValue !== undefined && newValue < minValue) {
      newValue = minValue;
    }
    
    // Step değerine göre ondalık basamak sayısını belirle
    const decimalPlaces = stepValue < 1 ? 2 : 0;
    setWriteValue(newValue.toFixed(decimalPlaces));
  };

  // WebSocket hook'unu kullan
  const { watchRegister, unwatchRegister, writeRegister, isConnected } = useWebSocket();

  // Register değerini formatla
  const formatValue = (registerValue: any) => {
    if (registerValue !== null && registerValue !== undefined) {
      if (dataType === 'boolean') {
        setCurrentValue(registerValue === 1 || registerValue === true ? 'ON' : 'OFF');
      } else if (typeof registerValue === 'number') {
        setCurrentValue(registerValue.toFixed(2));
      } else {
        setCurrentValue(registerValue);
      }
    } else {
      setCurrentValue('--');
    }
    setIsLoading(false);
  };

  // WebSocket ile register izlemeyi başlat (sadece readwrite için)
  useEffect(() => {
    if (registerType === 'readwrite') {
      if (!isConnected) {
        setIsLoading(true);
        setCurrentValue('--');
        return;
      }

      setIsLoading(true);

      const register = {
        registerId: node.id,
        analyzerId: analyzerId,
        address,
        dataType,
        scale,
        scaleUnit,
        byteOrder,
        bit
      };

      watchRegister(register, formatValue);

      return () => {
        unwatchRegister(register, formatValue);
      };
    }
  }, [address, dataType, scale, byteOrder, bit, analyzerId, isConnected, watchRegister, unwatchRegister, registerType]);

  // Write value validation
  const validateWriteValue = (value: string): boolean => {
    if (!value.trim()) return false;

    const numValue = parseFloat(value);
    if (isNaN(numValue)) return false;

    if (minValue !== undefined && numValue < minValue) return false;
    if (maxValue !== undefined && numValue > maxValue) return false;

    return true;
  };

  // Handle write operation
  const handleWrite = async () => {
    if (!writePermission) {
      showToast('Write permission is disabled for this register', 'error');
      return;
    }

    if (!validateWriteValue(writeValue)) {
      let errorMsg = 'Invalid write value';
      if (minValue !== undefined && maxValue !== undefined) {
        errorMsg += ` (must be between ${minValue} and ${maxValue})`;
      } else if (minValue !== undefined) {
        errorMsg += ` (must be >= ${minValue})`;
      } else if (maxValue !== undefined) {
        errorMsg += ` (must be <= ${maxValue})`;
      }
      showToast(errorMsg, 'error');
      return;
    }

    setIsWriting(true);
    try {
      // Ters formül uygula: Raw Value = (User Value - Offset) ÷ Scale
      let processedValue: number;
      
      // Boolean toggle artık onValue/offValue'dan gelen herhangi bir sayıyı gönderebilir.
      const userValue = parseFloat(writeValue);

      // Eğer kontrol tipi 'boolean' ise, değeri doğrudan kullan.
      // Diğer durumlarda endüstriyel formülü uygula.
      if (controlType === 'boolean') {
        processedValue = userValue;
      } else {
        // Endüstriyel formül: (Kullanıcı Değeri - Ofset) / Ölçek
        processedValue = (userValue - (offsetValue || 0)) / (scale || 1);
      }
      
      // Tüm int türleri için (boolean kontrolü dahil) sonucu yuvarla.
      if (dataType.includes('int')) {
        processedValue = Math.round(processedValue);
      }

      const writeData = {
        analyzerId,
        address,
        value: processedValue,
        dataType,
        byteOrder,
        bit: dataType === 'boolean' ? bit : undefined,
      };

      backendLogger.info(`[FRONTEND] Write operation starting: Label=${label}, ControlType=${controlType}`, "WriteRegisterNode", {
        userValue: writeValue,
        processedValue,
        formula: `(${writeValue} - ${offsetValue || 0}) ÷ ${scale || 1} = ${processedValue}`,
        writeData,
        minValue,
        maxValue,
        stepValue,
        writePermission
      });

      // WebSocket üzerinden write işlemi yap
      await writeRegister(writeData);

      backendLogger.info(`[FRONTEND] Write operation completed successfully`, "WriteRegisterNode", writeData);
      showToast('Write operation successful', 'success');
      
      // Save the last written value to the database
      try {
        await fetch(`/api/registers/${node.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lastValue: userValue }),
        });
        backendLogger.info(`[FRONTEND] Persisted lastValue ${userValue} for register ${node.id}`, "WriteRegisterNode");
      } catch (dbError) {
        backendLogger.error(`[FRONTEND] Failed to persist lastValue for register ${node.id}`, "WriteRegisterNode", { error: dbError });
        // Don't show this error to user as the main operation was successful
      }
      
      // Keep the written value in the input instead of resetting it
      // This allows the user to see what was last written
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Write operation failed';
      backendLogger.error(`[FRONTEND] Write operation failed: ${errorMessage}`, "WriteRegisterNode", {
        analyzerId,
        address,
        value: writeValue,
        error: errorMessage
      });
      showToast(errorMessage, 'error');
    } finally {
      setIsWriting(false);
    }
  };

  // Font boyutu hesaplama fonksiyonu
  const calculateFontSize = (element: HTMLDivElement, textValue: string | number) => {
    const parentElement = element.parentElement;
    if (parentElement) {
      const parentWidth = parentElement.clientWidth * 0.7;
      const parentHeight = parentElement.clientHeight * 0.4; // Write node için daha az alan

      const v = typeof textValue === "number" ? textValue.toFixed(2) : textValue.toString();
      const widthRatio = parentWidth / (v.length * 20);
      const heightRatio = parentHeight / 40;

      const ratio = Math.min(widthRatio, heightRatio);
      const fontSize = Math.max(12, Math.floor(ratio * 40));
      element.style.fontSize = `${fontSize}px`;
    }
  };

  // Boyut değişikliklerini izlemek için ResizeObserver
  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (textRef.current) {
          const displayValue = registerType === 'readwrite' 
            ? (typeof currentValue === 'number' ? currentValue.toFixed(2) + ' ' + scaleUnit : currentValue + ' ' + scaleUnit)
            : 'WRITE';
          calculateFontSize(textRef.current, displayValue);
        }
      }
    });

    if (textRef.current) {
      resizeObserver.observe(textRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [currentValue, registerType, scaleUnit]);

  function hexToRgba(hex: string, opacity: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const a = opacity;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  return (
    <div className="write-register-node relative group w-full h-full" style={{ ...(node as any).style }}>
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
              className="z-50 p-1 bg-warning-500 hover:bg-warning-600 text-white rounded-md items-center justify-center"
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

      <div
        className="w-full h-full flex flex-col justify-between p-0 rounded-md overflow-hidden"
        style={{
          backgroundColor: hexToRgba(backgroundColor, opacity! / 100),
          border: node.selected && isAdmin ? '6px solid #f00' : 'none',
          borderRadius: '5px',
        }}
      >
        {controlType === 'numeric' && (
          <>
            {/* Büyük değer gösterimi - Üst bölüm */}
            <div className="flex-1 flex items-center justify-center pt-5">
              <div className="text-center">
                <span className="text-4xl font-bold text-blue-600 dark:text-blue-400">
                  {writeValue || '0'}
                </span>
                {scaleUnit && <span className="text-sm text-gray-500 ml-2">{scaleUnit}</span>}
              </div>
            </div>
            
            {/* Modern NumericFormat bileşeni - Orta bölüm */}
            <div className="px-4 mb-4">
              <div className="flex items-center">
                <Button
                  onClick={decrementValue}
                  disabled={!writePermission || isWriting || (minValue !== undefined && parseFloat(writeValue) <= minValue)}
                  className="h-10 w-10 p-0 rounded-full flex items-center justify-center"
                  size="sm"
                  variant="secondary"
                >
                  <Minus size={16} />
                </Button>
                
                <div className="flex-1 mx-2">
                  <NumericFormat
                    value={writeValue}
                    onValueChange={(values) => {
                      const { value } = values;
                      setWriteValue(value);
                    }}
                    thousandSeparator={false}
                    decimalScale={decimalPlaces}
                    allowNegative={false}
                    disabled={!writePermission || isWriting}
                    placeholder="Value"
                    className="w-full h-10 text-lg text-center font-bold rounded-md border border-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                  />
                </div>
                
                <Button
                  onClick={incrementValue}
                  disabled={!writePermission || isWriting || (maxValue !== undefined && parseFloat(writeValue) >= maxValue)}
                  className="h-10 w-10 p-0 rounded-full flex items-center justify-center"
                  size="sm"
                  variant="secondary"
                >
                  <Plus size={16} />
                </Button>
              </div>
              
              {/* Min-Max değer gösterimi */}
              <div className="flex justify-between text-xs text-gray-500 mt-1 px-2">
                <span>{minValue !== undefined ? minValue : 0}</span>
                <span>{maxValue !== undefined ? maxValue : 100}</span>
              </div>
            </div>
            
            {/* Write Button - Alt kısım (tam genişlik) */}
            <Button
              onClick={handleWrite}
              disabled={!writePermission || isWriting || !writeValue.trim()}
              className="w-full py-3 text-base font-semibold rounded-none border-t"
              size="sm"
            >
              {isWriting ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <>
                  <Send size={16} className="mr-2" />
                  Write Value
                </>
              )}
            </Button>
          </>
        )}

        {controlType === 'boolean' && (
          <div className="w-full h-full flex items-center justify-center">
            {/* Single Toggle Button - Tüm alanı kaplar */}
            <div
              onClick={() => {
                if (!writePermission || isWriting) return;
                
                // Toggle logic: Eğer şu anki değer ON ise OFF yap, değilse ON yap
                // Toggle logic: mevcut değer onValue'ya eşitse offValue'ya, değilse onValue'ya geç
                const currentValStr = writeValue.toString();
                const onValStr = onValue !== undefined ? onValue.toString() : '';
                const offValStr = offValue !== undefined ? offValue.toString() : '';
                
                // Eğer mevcut değer `onValue` ise bir sonraki değer `offValue` olur.
                // Eğer değilse (başlangıç durumu veya `offValue` durumu), bir sonraki değer `onValue` olur.
                const newValue = currentValStr === onValStr ? offValStr : onValStr;
                
                setWriteValue(newValue);
                
                //
                // handleWrite'ı bir sonraki event döngüsünde çağırarak,
                // state güncellemesinin tamamlanmasını ve doğru değerin gönderilmesini sağla
                setTimeout(async () => {
                  // Doğrudan handleWrite'ın içindeki mantığı burada kullanalım
                  // state güncellemesi hemen yansımayabileceğinden, 'newValue' kullanıyoruz.
                  if (!writePermission) {
                    showToast('Write permission is disabled for this register', 'error');
                    return;
                  }

                  setIsWriting(true);
                  try {
                    const valueToSend = parseFloat(newValue);
                    if (isNaN(valueToSend)) {
                        throw new Error("Invalid number for boolean toggle");
                    }

                    let processedValue: number = valueToSend;

                    if (dataType.includes('int')) {
                        processedValue = Math.round(processedValue);
                    }

                    const writeData = {
                      analyzerId,
                      address,
                      value: processedValue,
                      dataType,
                      byteOrder,
                      bit: dataType === 'boolean' ? bit : undefined,
                    };

                    backendLogger.info(`[FRONTEND] Boolean Toggle Write: Label=${label}`, "WriteRegisterNode", {
                      userValue: newValue,
                      processedValue,
                      writeData,
                    });

                    await writeRegister(writeData);

                    backendLogger.info(`[FRONTEND] Write operation completed successfully`, "WriteRegisterNode", writeData);
                    showToast('Write operation successful', 'success');
                    
                    // Son yazılan değeri veritabanına kaydet (eğer geçerliyse)
                    if (processedValue !== undefined && !isNaN(processedValue)) {
                      try {
                        await fetch(`/api/registers/${node.id}`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ lastValue: processedValue }),
                        });
                        backendLogger.info(`[FRONTEND] Persisted lastValue ${processedValue} for register ${node.id}`, "WriteRegisterNode");
                      } catch (dbError) {
                        backendLogger.error(`[FRONTEND] Failed to persist writeValue for register ${node.id}`, "WriteRegisterNode", { error: dbError });
                        // Kullanıcıya bu hatayı göstermeye gerek yok, ana işlem başarılı oldu.
                      }
                    }

                  } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Write operation failed';
                    backendLogger.error(`[FRONTEND] Write operation failed: ${errorMessage}`, "WriteRegisterNode", {
                      analyzerId,
                      address,
                      value: newValue,
                      error: errorMessage
                    });
                    showToast(errorMessage, 'error');
                  } finally {
                    setIsWriting(false);
                    // Değeri tetiklenen yeni değerde bırak, başlangıç değerine döndürme
                    // setWriteValue(newValue); ya da olduğu gibi bırak
                  }
                }, 100);
              }}
              className={`w-full h-full flex items-center justify-center cursor-pointer ${
                !writePermission || isWriting
                  ? 'opacity-50 cursor-not-allowed'
                  : ''
              }`}
              style={{
                backgroundColor: 'transparent' // Background'u tamamen kaldır
              }}
            >
              {/* Şu anki duruma göre icon göster */}
              {writeValue === onValue.toString() ? (
                // ON durumu
                writeOnIcon ? (
                  <div className="relative w-full h-full p-4">
                    <Image
                      src={writeOnIcon}
                      alt="ON"
                      fill
                      className="object-contain"
                      priority
                    />
                  </div>
                ) : (
                  <span className="text-2xl font-bold text-white">ON</span>
                )
              ) : (
                // OFF durumu
                writeOffIcon ? (
                  <div className="relative w-full h-full p-4">
                    <Image
                      src={writeOffIcon}
                      alt="OFF"
                      fill
                      className="object-contain"
                      priority
                    />
                  </div>
                ) : (
                  <span className="text-2xl font-bold text-white">OFF</span>
                )
              )}
            </div>
          </div>
        )}

        {controlType === 'dropdown' && (
          <div className="flex flex-col h-full justify-center space-y-4">
            <select
              value={writeValue}
              onChange={(e) => setWriteValue(e.target.value)}
              disabled={!writePermission || isWriting}
              className="w-full h-12 text-base rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
            >
              <option value="">Select value...</option>
              {dropdownOptions.map((option, index) => (
                <option key={index} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Button
              onClick={handleWrite}
              disabled={!writePermission || isWriting || !writeValue.trim()}
              className="w-full h-12 text-base font-semibold"
              size="sm"
            >
              {isWriting ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <>
                  <Send size={16} className="mr-2" />
                  Write Selected
                </>
              )}
            </Button>
          </div>
        )}

        {controlType === 'manual' && (
          <div className="flex flex-col h-full justify-center space-y-3">
            {/* Label Display - Üst kısım */}
            <div className="text-center">
              <span className="text-lg font-bold text-gray-700 dark:text-gray-300">
                {label}
              </span>
              {infoText && (
                <div className="text-xs text-gray-500 mt-1">
                  {infoText}
                </div>
              )}
            </div>
            
            {/* Manual Input - Orta kısım */}
            <div className="flex gap-3 items-center">
              <Input
                type="number"
                value={writeValue}
                onChange={(e) => setWriteValue(e.target.value)}
                placeholder={placeholder}
                className="flex-1 h-12 text-lg text-center font-bold"
                disabled={!writePermission || isWriting}
                min={minValue}
                max={maxValue}
              />
            </div>
            
            {/* Send Button - Alt kısım */}
            <Button
              onClick={handleWrite}
              disabled={!writePermission || isWriting || !writeValue.trim()}
              className="w-full h-12 text-base font-semibold"
              size="sm"
            >
              {isWriting ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <>
                  <Send size={16} className="mr-2" />
                  Send Value
                </>
              )}
            </Button>
          </div>
        )}

        {!writePermission && (
          <div className="text-sm text-red-500 text-center mt-2">Write disabled</div>
        )}
      </div>
    </div>
  );
});

WriteRegisterNode.displayName = 'WriteRegisterNode';

export default WriteRegisterNode;