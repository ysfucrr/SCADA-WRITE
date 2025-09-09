"use client";

import { Edit, Trash2 } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { NodeProps, NodeToolbar, Position } from 'reactflow';
import '@/styles/seven-segment.css';
import { useWebSocket } from '@/context/WebSocketContext';
import RegisterGraphComponent from './RegisterGraphComponent_new';
import Image from 'next/image';
import { useAuth } from '@/hooks/use-auth';

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
  backgroundColor?: string;
  textColor?: string;
  opacity?: number;
  analyzerId?: string | number; // Analizör ID'si string veya number olabilir
  displayMode?: 'digit' | 'graph';
  onIcon?: string; // Boolean register için ON ikonu
  offIcon?: string; // Boolean register için OFF ikonu
  onEdit?: () => void;
  onDelete?: () => void;
}

 const RegisterNode = memo((node: NodeProps<RegisterNodeData>) => {
  const { label, address, dataType, fontFamily, scale, scaleUnit, font = 1, byteOrder, backgroundColor = '#000000', textColor = '#ffffff', opacity, bit, analyzerId = '1', displayMode = 'digit', onIcon, offIcon } = node.data;
  const [value, setValue] = useState<string | number>('--' );
  const [isLoading, setIsLoading] = useState(true);
  const textRef = useRef<HTMLDivElement | null>(null);
  const booleanTextRef = useRef<HTMLDivElement | null>(null);
  const { isAdmin } = useAuth()

  // WebSocket hook'unu kullan
  const { watchRegister, unwatchRegister, isConnected } = useWebSocket();

  // Register değerini formatla
  const formatValue = (registerValue: any) => {
    if (registerValue !== null && registerValue !== undefined) {
      if (dataType === 'boolean') {
        setValue(registerValue === 1 || registerValue === true ? 'ON' : 'OFF');
      } else if (typeof registerValue === 'number') {
        // Ondalık sayılar için 2 basamak göster
        setValue(registerValue.toFixed(2));
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
    // Bağlantı yoksa bekle
    if (!isConnected) {
      setIsLoading(true);
      setValue('--');
      return;
    }

    setIsLoading(true);

    // Register izlemeyi başlat ve değer değişimlerini dinle
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

    //console.log(`[REGISTERNODE] Register izleme başlatılıyor:`, register);
    //console.log(`[REGISTERNODE] FormatValue callback:`, formatValue);

    watchRegister(register, formatValue);
    //console.log(`[REGISTERNODE] WatchRegister çağrısı tamamlandı`);

    // Component unmount olduğunda izlemeyi durdur
    return () => {
      unwatchRegister(register, formatValue);
    };
  }, [address, dataType, scale, byteOrder, bit, analyzerId, isConnected, watchRegister, unwatchRegister]);

  // Font boyutu hesaplama fonksiyonu
  const calculateFontSize = (element: HTMLDivElement, textValue: string | number) => {
    const parentElement = element.parentElement;
    if (parentElement) {
      const parentWidth = parentElement.clientWidth * 0.7;
      const parentHeight = parentElement.clientHeight * 0.9;

      const v = typeof textValue === "number" ? textValue.toFixed(2) : textValue.toString();
      // Genişlik ve yüksekliğe göre güvenli bir font boyutu hesapla
      const widthRatio = parentWidth / (v.length * 20); // Karakter başına yaklaşık 20px
      const heightRatio = parentHeight / 40; // Yükseklik için yaklaşık 40px

      // İki orandan küçük olanı seç (taşmayı önlemek için)
      const ratio = Math.min(widthRatio, heightRatio);

      // Font boyutunu güncelle (minimum 12px, maksimum 200px)
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

    // Normal register için observer ekle
    if (textRef.current && dataType !== 'boolean') {
      resizeObserver.observe(textRef.current);
    }

    // Boolean register için observer ekle
    if (booleanTextRef.current && dataType === 'boolean') {
      resizeObserver.observe(booleanTextRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [value, dataType]);



  function hexToRgba(hex: string, opacity: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const a = opacity;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }


  return (
    <div className="register-node relative group w-full h-full" style={{ ...(node as any).style }}>
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
      {/* Resize için NodeResizer */}
      {/* <NodeResizer
       color="#ff0071"
        isVisible={node.selected}
        minWidth={200}
        minHeight={100}
        keepAspectRatio={false}
        handleStyle={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          backgroundColor: '#ff0071',
          border: '1px solid #ddd',
          cursor: 'resize',
          zIndex: 9999
        }}
      /> */}

      <div className=" w-full h-full flex items-center justify-center relative text-center"
        style={{
          ...(displayMode === 'digit' && { backgroundColor: hexToRgba(backgroundColor, opacity! / 100) }),
          border: node.selected && isAdmin ? '6px solid #f00' : 'none',
          borderRadius: '5px',
        }}
      >
        {displayMode === 'digit' ? (
          // Boolean register ve ikonlar varsa ikon göster, yoksa normal text göster
          dataType === 'boolean' && (onIcon || offIcon) ? (
            <div className="w-full h-full flex items-center justify-center p-2">
              {isLoading ? (
                <div className="text-center" style={{ color: textColor }}>
                  {isConnected ? '... ' + scaleUnit : '-- ' + scaleUnit}
                </div>
              ) : (
                // Boolean değerine göre ikon göster - ON durumları: true, 1, 'ON', 'on', 'true', '1'
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
            // Normal text gösterimi
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
              {isLoading ? (isConnected ? '... ' + scaleUnit : '-- ' + scaleUnit) : typeof value === 'number' ? value.toFixed(2) + ' ' + scaleUnit : value + ' ' + scaleUnit}
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

        {/* Düzenleme butonları */}
        {/* <div className=" h-[5%] absolute top-1 right-1 rounded m-1 flex justify-between items-center z-10">
          <div className="h-full absolute right-0 top-4 bottom-0  flex flex-row items-center">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                node.data.onEdit?.();
              }}
              className="hidden group-hover:flex z-50 mr-2 p-1 bg-warning-500 hover:bg-warning-600 text-white rounded-md items-center justify-center"
              style={{ height: '100%', aspectRatio: '1/1', minWidth: '56px', minHeight: '56px' }}
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
              className="hidden group-hover:flex z-50 mr-2 p-1 bg-error-500 hover:bg-error-600 text-white rounded-md items-center justify-center"
              style={{ height: '100%', aspectRatio: '1/1', minWidth: '56px', minHeight: '56px' }}
            >
              <Trash2 size={"100%"} />
            </button>
          </div>
        </div> */}
      </div>
    </div>
  );
});

export default memo(RegisterNode);