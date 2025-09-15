"use client";

import { Edit, Trash2, Send, Eye, Plus, Minus } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { NodeProps, NodeToolbar, Position } from 'reactflow';
import '@/styles/seven-segment.css';
import { useWebSocket } from '@/context/WebSocketContext';
import { showToast } from '../ui/alert';
import { Button } from '../ui/button/CustomButton';
import { Input } from '../ui/input';
import Image from 'next/image';
import { backendLogger } from '@/lib/logger/BackendLogger';
import { useAuth } from '@/hooks/use-auth';

interface ReadWriteRegisterNodeData {
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
  registerType: 'readwrite';
  writeValue?: number | string;
  minValue?: number;
  maxValue?: number;
  writePermission?: boolean;
  readAddress?: number; // Read/Write için ayrı read adresi
  controlType?: 'numeric' | 'boolean' | 'dropdown' | 'manual';
  stepValue?: number;
  onValue?: number | string;
  offValue?: number | string;
  dropdownOptions?: Array<{label: string, value: number | string}>;
  placeholder?: string;
  infoText?: string;
  writeOnIcon?: string;
  writeOffIcon?: string;
  onIcon?: string;
  offIcon?: string;
  onEdit?: () => void;
  onDelete?: () => void;
}

const ReadWriteRegisterNode = memo((node: NodeProps<ReadWriteRegisterNodeData>) => {
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
    writeValue: defaultWriteValue = '',
    minValue,
    maxValue,
    writePermission = true,
    readAddress,
    controlType = 'numeric',
    stepValue = 1,
    onValue = 1,
    offValue = 0,
    dropdownOptions = [],
    placeholder = 'Enter value',
    infoText = '',
    writeOnIcon,
    writeOffIcon,
    onIcon,
    offIcon
  } = node.data;

  const [currentValue, setCurrentValue] = useState<string | number>('--');
  const [writeValue, setWriteValue] = useState<string>(defaultWriteValue?.toString() || '');
  const [isWriting, setIsWriting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [mode, setMode] = useState<'read' | 'write'>('read');
  const textRef = useRef<HTMLDivElement | null>(null);
  const booleanTextRef = useRef<HTMLDivElement | null>(null);
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

  // WebSocket ile register izlemeyi başlat
  useEffect(() => {
    if (!isConnected) {
      setIsLoading(true);
      setCurrentValue('--');
      return;
    }

    setIsLoading(true);

    const register = {
      registerId: node.id,
      analyzerId: analyzerId,
      address: readAddress || address, // Read için readAddress kullan, yoksa address
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
  }, [address, dataType, scale, byteOrder, bit, analyzerId, isConnected, watchRegister, unwatchRegister]);

  // Write value validation
  const validateWriteValue = (value: string): boolean => {
    if (!value.trim()) return false;

    // Eğer kontrol tipi 'boolean' ise, herhangi bir sayısal değeri geçerli kabul et.
    // Artık sadece '0', '1' gibi değerlerle kısıtlı değil.
    if (controlType === 'boolean') {
        return !isNaN(parseFloat(value));
    }

    // Diğer kontrol tipleri için mevcut doğrulama devam etsin.
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
      if (dataType === 'boolean') {
        errorMsg += ' (use 0/1, true/false, or on/off)';
      } else if (minValue !== undefined && maxValue !== undefined) {
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

      backendLogger.info(`[FRONTEND] ReadWrite operation starting: Label=${label}, Mode=${mode}, ControlType=${controlType}`, "ReadWriteRegisterNode", {
        userValue: writeValue,
        processedValue,
        formula: `(${writeValue} - ${offsetValue || 0}) ÷ ${scale || 1} = ${processedValue}`,
        writeData,
        readAddress,
        minValue,
        maxValue,
        stepValue,
        writePermission
      });

      // WebSocket üzerinden write işlemi yap
      await writeRegister(writeData);

      backendLogger.info(`[FRONTEND] ReadWrite operation completed successfully`, "ReadWriteRegisterNode", writeData);
      showToast('Write operation successful', 'success');
      setWriteValue(defaultWriteValue?.toString() || '');
      setMode('read'); // Switch back to read mode after successful write
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Write operation failed';
      backendLogger.error(`[FRONTEND] ReadWrite operation failed: ${errorMessage}`, "ReadWriteRegisterNode", {
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
      const parentHeight = parentElement.clientHeight * 0.5; // ReadWrite node için orta alan

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
        if (textRef.current && dataType !== 'boolean') {
          const displayValue = typeof currentValue === 'number' ? currentValue.toFixed(2) + ' ' + scaleUnit : currentValue + ' ' + scaleUnit;
          calculateFontSize(textRef.current, displayValue);
        }
        if (booleanTextRef.current && dataType === 'boolean') {
          calculateFontSize(booleanTextRef.current, currentValue);
        }
      }
    });

    if (textRef.current && dataType !== 'boolean') {
      resizeObserver.observe(textRef.current);
    }
    if (booleanTextRef.current && dataType === 'boolean') {
      resizeObserver.observe(booleanTextRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [currentValue, dataType]);

  function hexToRgba(hex: string, opacity: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const a = opacity;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  return (
    <div className="readwrite-register-node relative group w-full h-full" style={{ ...(node as any).style }}>
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
        className="w-full h-full flex flex-col items-center justify-center relative text-center"
        style={{
          backgroundColor: hexToRgba(backgroundColor, opacity! / 100),
          border: node.selected && isAdmin ? '6px solid #f00' : 'none',
          borderRadius: '5px',
        }}
      >
        {/* Mode Toggle */}
        <div className="w-full p-1 bg-gray-100 dark:bg-gray-700 flex">
          <button
            onClick={() => setMode('read')}
            className={`flex-1 px-2 py-1 text-xs rounded ${mode === 'read' ? 'bg-blue-500 text-white' : 'bg-transparent text-gray-600 dark:text-gray-300'}`}
          >
            <Eye size={12} className="inline mr-1" />
            READ
          </button>
          <button
            onClick={() => setMode('write')}
            disabled={!writePermission}
            className={`flex-1 px-2 py-1 text-xs rounded ${mode === 'write' ? 'bg-green-500 text-white' : 'bg-transparent text-gray-600 dark:text-gray-300'} ${!writePermission ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Send size={12} className="inline mr-1" />
            WRITE
          </button>
        </div>

        {/* Display Area */}
        <div className="flex-1 w-full flex items-center justify-center">
          {mode === 'read' ? (
            // Read Mode Display
            dataType === 'boolean' && (onIcon || offIcon) ? (
              <div className="w-full h-full flex items-center justify-center p-2">
                {isLoading ? (
                  <div className="text-center" style={{ color: textColor }}>
                    {isConnected ? '... ' + scaleUnit : '-- ' + scaleUnit}
                  </div>
                ) : (
                  ((currentValue as any) === true || currentValue === 1 || currentValue === 'ON' || currentValue === 'on' || currentValue === 'true' || currentValue === '1') ? (
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
                className="w-full h-full flex items-center justify-center"
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
                {isLoading ? (isConnected ? '... ' + scaleUnit : '-- ' + scaleUnit) 
                : typeof currentValue === 'number' ? currentValue.toFixed(2) + ' ' + scaleUnit 
                : currentValue + ' ' + scaleUnit}
              </div>
            )
          ) : (
            // Write Mode Display
            <div className="w-full h-full flex items-center justify-center">
              <span style={{ color: '#00ff00', fontWeight: 'bold', fontSize: '18px' }}>
                WRITE MODE
              </span>
            </div>
          )}
        </div>

        {/* Write Controls (only visible in write mode) */}
        {mode === 'write' && (
          <div className="w-full p-2 border-t border-gray-300 bg-gray-50 dark:bg-gray-800 dark:border-gray-600">
            {controlType === 'numeric' && (
              <>
                {/* Current Value Display */}
                <div className="text-center mb-2">
                  <span className="text-lg font-bold text-green-600 dark:text-green-400">
                    {writeValue || defaultWriteValue || '0'}
                  </span>
                  {scaleUnit && <span className="text-sm text-gray-500 ml-1">{scaleUnit}</span>}
                </div>
                
                {/* Plus/Minus Controls */}
                <div className="flex gap-2 items-center mb-2">
                  <Button
                    onClick={decrementValue}
                    disabled={!writePermission || isWriting || (minValue !== undefined && parseFloat(writeValue) <= minValue)}
                    className="h-8 w-8 p-0 text-sm"
                    size="sm"
                    variant="secondary"
                  >
                    <Minus size={14} />
                  </Button>
                  
                  <Input
                    type="number"
                    value={writeValue}
                    onChange={(e) => setWriteValue(e.target.value)}
                    placeholder="Value"
                    className="flex-1 h-8 text-sm text-center"
                    disabled={!writePermission || isWriting}
                    min={minValue}
                    max={maxValue}
                  />
                  
                  <Button
                    onClick={incrementValue}
                    disabled={!writePermission || isWriting || (maxValue !== undefined && parseFloat(writeValue) >= maxValue)}
                    className="h-8 w-8 p-0 text-sm"
                    size="sm"
                    variant="secondary"
                  >
                    <Plus size={14} />
                  </Button>
                </div>
                
                {/* Write Button */}
                <Button
                  onClick={handleWrite}
                  disabled={!writePermission || isWriting || !writeValue.trim()}
                  className="w-full h-8 text-sm"
                  size="sm"
                >
                  {isWriting ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <>
                      <Send size={14} className="mr-1" />
                      Write Value
                    </>
                  )}
                </Button>
              </>
            )}

            {controlType === 'boolean' && (
              <div className="w-full h-full flex items-center justify-center">
                {/* Single Toggle Button - Tüm write area'yı kaplar */}
                <div
                  onClick={() => {
                    if (!writePermission || isWriting) return;
                    
                    // Toggle logic: mevcut değer onValue'ya eşitse offValue'ya, değilse onValue'ya geç
                    const currentValStr = writeValue.toString();
                    const onValStr = onValue !== undefined ? onValue.toString() : '';
                    const offValStr = offValue !== undefined ? offValue.toString() : '';
                    
                    // Eğer mevcut değer `onValue` ise bir sonraki değer `offValue` olur.
                    // Eğer değilse (başlangıç durumu veya `offValue` durumu), bir sonraki değer `onValue` olur.
                    const newValue = currentValStr === onValStr ? offValStr : onValStr;
                    
                    setWriteValue(newValue);
                    
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
    
                        backendLogger.info(`[FRONTEND] Boolean Toggle Write: Label=${label}`, "ReadWriteRegisterNode", {
                          userValue: newValue,
                          processedValue,
                          writeData,
                        });
    
                        await writeRegister(writeData);
    
                        backendLogger.info(`[FRONTEND] Write operation completed successfully`, "ReadWriteRegisterNode", writeData);
                        showToast('Write operation successful', 'success');
                        
                        // Son yazılan değeri veritabanına kaydet (eğer geçerliyse)
                        if (processedValue !== undefined && !isNaN(processedValue)) {
                          try {
                            await fetch(`/api/registers/${node.id}`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ writeValue: processedValue }),
                            });
                            backendLogger.info(`[FRONTEND] Persisted writeValue ${processedValue} for register ${node.id}`, "ReadWriteRegisterNode");
                          } catch (dbError) {
                            backendLogger.error(`[FRONTEND] Failed to persist writeValue for register ${node.id}`, "ReadWriteRegisterNode", { error: dbError });
                          }
                        }
    
                        setMode('read'); // Yazma sonrası okuma moduna dön
    
                      } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : 'Write operation failed';
                        backendLogger.error(`[FRONTEND] Write operation failed: ${errorMessage}`, "ReadWriteRegisterNode", {
                          analyzerId,
                          address,
                          value: newValue,
                          error: errorMessage
                        });
                        showToast(errorMessage, 'error');
                      } finally {
                        setIsWriting(false);
                        // Değeri tetiklenen yeni değerde bırak
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
                      <span className="text-xl font-bold text-white">ON</span>
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
                      <span className="text-xl font-bold text-white">OFF</span>
                    )
                  )}
                </div>
              </div>
            )}

            {controlType === 'dropdown' && (
              <div className="space-y-2">
                <select
                  value={writeValue}
                  onChange={(e) => setWriteValue(e.target.value)}
                  disabled={!writePermission || isWriting}
                  className="w-full h-8 text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
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
                  className="w-full h-8 text-sm"
                  size="sm"
                >
                  {isWriting ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <>
                      <Send size={14} className="mr-1" />
                      Write Selected
                    </>
                  )}
                </Button>
              </div>
            )}

            {controlType === 'manual' && (
              <div className="flex flex-col h-full justify-center space-y-3">
                {/* Label Display */}
                <div className="text-center">
                  <span className="text-base font-bold text-green-600 dark:text-green-400">
                    {label}
                  </span>
                  {infoText && (
                    <div className="text-xs text-gray-500 mt-1">
                      {infoText}
                    </div>
                  )}
                </div>
                
                {/* Manual Input */}
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    value={writeValue}
                    onChange={(e) => setWriteValue(e.target.value)}
                    placeholder={placeholder}
                    className="flex-1 h-10 text-base text-center"
                    disabled={!writePermission || isWriting}
                    min={minValue}
                    max={maxValue}
                  />
                  
                  <Button
                    onClick={handleWrite}
                    disabled={!writePermission || isWriting || !writeValue.trim()}
                    className="h-10 px-4 text-sm"
                    size="sm"
                  >
                    {isWriting ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      <Send size={14} />
                    )}
                  </Button>
                </div>
              </div>
            )}

            {!writePermission && (
              <div className="text-xs text-red-500 mt-1">Write disabled</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

ReadWriteRegisterNode.displayName = 'ReadWriteRegisterNode';

export default ReadWriteRegisterNode;