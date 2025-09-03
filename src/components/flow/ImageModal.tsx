import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button/CustomButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Typography } from '../ui/typography';
import FileInput from '../form/input/FileInput';
import { v4 as uuidv4 } from 'uuid';
import Slider from '../ui/slider';
import { Node } from 'reactflow';
import { Spinner } from '../ui/spinner';
import { Building, ChevronDown, DoorOpen, Layers } from 'lucide-react';
import { NumericFormat } from 'react-number-format';
interface ImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (groupData: Node) => void;
  node?: Node
  isEditMode?: boolean;
}

interface Building {
  _id: string;
  name: string;
  floors: Floor[];
  icon: string;
}

interface Floor {
  _id: string;
  name: string;
  rooms: Room[];
  icon: string;
}

interface Room {
  _id: string;
  name: string;
  icon: string;
}
const ImageModal: React.FC<ImageModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isEditMode,
  node,
}) => {
  const [backgroundColor, setBackgroundColor] = useState('transparent');
  const [opacity, setOpacity] = useState(100);
  const [backgroundType, setBackgroundType] = useState('color');
  const [backgroundImage, setBackgroundImage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [navigationUrl, setNavigationUrl] = useState('');
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  // Modal açıldığında veya initialData değiştiğinde state'leri güncelle
  useEffect(() => {
    if (isOpen) {
      //console.log("Modal açıldı, initialData:", node);

      // Arka plan tipi ve resim ayarları
      const hasBackgroundImage = !!node?.data?.backgroundImage;
      setBackgroundType(hasBackgroundImage ? 'image' : 'color');
      setBackgroundImage(node?.data?.backgroundImage || '');
      setOpacity(node?.data?.opacity || 100);
      setBackgroundColor(node?.data?.backgroundColor || 'transparent');
      setNavigationUrl(node?.data?.navigationUrl || '');
      
      // Width ve height değerlerini ayarla
      setWidth(node?.width || 300);
      setHeight(node?.height || 300);

      // Dosya seçimini sıfırla
      setFile(null);
    }
  }, [isOpen, node]);


  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };


  const fetchBuildings = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/units');
      const data = await response.json();

      if (data.success) {
        setBuildings(data.buildings);
      } else {
        console.error('Failed to fetch buildings:', data.message);
      }
    } catch (error) {
      console.error('Error fetching buildings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchBuildings();
    }
  }, [isOpen]);

  const handleCancel = () => {
    //reset form
    setBackgroundColor('transparent');
    setOpacity(100);
    setBackgroundType('color');
    setBackgroundImage('');
    setFile(null);
    onClose();
  };

  const calculateImageDimensions = (imageSrc: string): Promise<{ width: number, height: number }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const ratio = img.width / img.height;
        const baseSize = 300; // Temel boyut
        let width, height;

        if (ratio > 1) { // Yatay resim
          width = baseSize;
          height = baseSize / ratio;
        } else { // Dikey veya kare resim
          height = baseSize;
          width = baseSize * ratio;
        }
        console.log("width", width);
        console.log("height", height);
        resolve({ width, height });
      };
      img.src = imageSrc;
    });
  };

  const renderNavigationDropdown = () => {
    return (
      <div className="relative w-full">
        <div
          className="flex items-center justify-between p-2 border rounded-md cursor-pointer"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        >
          <span className="text-sm text-gray-600 dark:text-gray-400">{getSelectedItemName()}</span>
          <ChevronDown size={16} />
        </div>

        {isDropdownOpen && (
          <div
            ref={dropdownRef}
            className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto"
          >
            <div
              className="p-2 cursor-pointer hover:bg-gray-100"
              onClick={() => handleNavigationItemClick('')}
            >
              Select Navigation Target (optional)
            </div>
            <div className="border-t">
              {buildings.map(building => renderBuilding(building))}
            </div>
          </div>
        )}
      </div>
    );
  };
  const renderBuilding = (building: Building) => {
    const buildingUrl = `/${building._id}`;

    return (
      <div key={building._id} className="navigation-item">
        <div
          className={` gap-2 flex items-center p-2 cursor-pointer hover:bg-gray-100 ${navigationUrl === buildingUrl ? 'bg-blue-100' : ''}`}
          onClick={() => handleNavigationItemClick(buildingUrl)}
        >
          {building.icon ? <div className="relative h-5 w-5">
            <img src={building.icon} alt={building.name} className="h-full w-full object-contain" />
          </div> : <Building />}

          <span className="font-medium">{building.name}</span>
        </div>

        {/* Katlar */}
        <div className="">
          {building.floors.map(floor => renderFloor(floor, building))}
        </div>
      </div>
    );
  };
  const renderFloor = (floor: Floor, building: Building) => {
    const floorUrl = `/${building._id}/${floor._id}`;

    return (
      <div key={floor._id} className="navigation-item">
        <div
          className={` gap-2 pl-6 flex items-center p-2 cursor-pointer hover:bg-gray-100 ${navigationUrl === floorUrl ? 'bg-blue-100' : ''}`}
          onClick={() => handleNavigationItemClick(floorUrl)}
        >
          {floor.icon ? <div className="relative h-5 w-5">
            <img src={floor.icon} alt={floor.name} className="h-full w-full object-contain" />
          </div> : <Layers />}
          <span>{floor.name}</span>
        </div>

        {/* Odalar */}
        <div className="">
          {floor.rooms.map(room => renderRoom(room, building, floor))}
        </div>
      </div>
    );
  };
  const renderRoom = (room: Room, building: Building, floor: Floor) => {
    const roomUrl = `/${building._id}/${floor._id}/${room._id}`;

    return (
      <div
        key={room._id}
        className={` gap-2 pl-12 flex items-center p-2 cursor-pointer hover:bg-gray-100 ${navigationUrl === roomUrl ? 'bg-blue-100' : ''}`}
        onClick={() => handleNavigationItemClick(roomUrl)}
      >
        {room.icon ? <div className="relative h-5 w-5">
          <img src={room.icon} alt={room.name} className="h-full w-full object-contain" />
        </div> : <DoorOpen />}
        <span className="mr-1">{room.name}</span>
      </div>
    );
  };
  const handleNavigationItemClick = (url: string) => {
    setNavigationUrl(url);
    setIsDropdownOpen(false);
  };
  const getSelectedItemName = () => {
    if (!navigationUrl) return "Select Navigation Target (optional)";
    console.log("navigationUrl", navigationUrl);
    // URL'den ID'leri ayıkla
    const parts = navigationUrl.split('/').filter(p => p);

    if (parts.length === 0) return "Select Navigation Target (optional)";

    // Bina ID'si
    const buildingId = parts[0];
    const building = buildings.find(b => b._id === buildingId);

    if (!building) return "Select Navigation Target (optional)";

    // Sadece bina seçilmişse
    if (parts.length === 1) return building.name;

    // Kat ID'si
    const floorId = parts[1];
    const floor = building.floors.find(f => f._id === floorId);

    if (!floor) return building.name;

    // Sadece kat seçilmişse
    if (parts.length === 2) return `${building.name} > ${floor.name}`;

    // Oda ID'si
    const roomId = parts[2];
    const room = floor.rooms.find(r => r._id === roomId);

    if (!room) return `${building.name} > ${floor.name}`;

    return `${building.name} > ${floor.name} > ${room.name}`;
  };
  // Resim seçildiğinde aspect ratio'yu koruyarak height hesaplaması yapar
  const calculateHeightFromWidth = (newWidth: number): number => {
    if (backgroundType === 'color') return height; // Renk modunda oranı korumaya gerek yok
    
    if (width === 0 || height === 0) return 300; // Geçerli boyutlar yoksa varsayılan değer
    
    const ratio = width / height;
    return newWidth / ratio;
  };
  
  // Width değiştiğinde otomatik olarak height'ı günceller (resim modunda)
  useEffect(() => {
    if (backgroundType === 'image' && width > 0) {
      const newHeight = calculateHeightFromWidth(width);
      setHeight(newHeight);
    }
  }, [width, backgroundType]);

  const handleConfirm = async () => {
    if (backgroundType === 'image') {
      if (file) {
        const formData = new FormData();
        formData.append('file', file);

        setIsUploading(true);
        try {
          const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });

          const data = await response.json();
          console.log('Upload response:', data);

          if (data.success) {
            const fileReader = new FileReader();
            fileReader.onload = async (e) => {
              if (e.target?.result) {
                const dimensions = await calculateImageDimensions(e.target.result as string);

                onConfirm({
                  id: node?.id || uuidv4(),
                  type: 'imageNode',
                  position: { x: 0, y: 0 },
                  width: dimensions.width,
                  height: dimensions.height,
                  data: {
                    opacity,
                    backgroundColor: backgroundColor,
                    backgroundImage: backgroundType === 'image' ? data.filePath : undefined,
                    navigationUrl: navigationUrl, 
                  },
                  style: {
                    width: dimensions.width,
                    height: dimensions.height
                  }
                });
              }
            };
            fileReader.readAsDataURL(file);
          }
        } catch (error) {
          console.error('Upload error:', error);
        } finally {
          setIsUploading(false);
        }
      } else {
        onConfirm({
          id: node?.id || uuidv4(),
          type: 'groupNode',
          position: { x: 0, y: 0 },
          width: width,
          height: height,
          data: {
            opacity,
            backgroundColor: backgroundColor,
            backgroundImage: backgroundType === 'image' ? backgroundImage : undefined,
            navigationUrl: navigationUrl, 
          },
          style: {
            width: width,
            height: height
          }
        });
      }
    } else {
      onConfirm({
        id: node?.id || uuidv4(),
        type: 'groupNode',
        position: { x: 0, y: 0 },
        width: width,
        height: height,
        data: {
          opacity,
          backgroundColor: backgroundColor,
          backgroundImage: backgroundType === 'image' ? backgroundImage : undefined,
          navigationUrl: navigationUrl,   
        },
        style: {
          width: width,
          height: height
        }
      });
    }
    //reset form
    setBackgroundColor('transparent');
    setOpacity(100);
    setBackgroundType('color');
    setBackgroundImage('');
    setFile(null);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleCancel} className="sm:max-w-[425px]">
      <div className="p-6">
        <Typography variant="h3">{isEditMode ? 'Edit Image Box' : 'Add Image Box'}</Typography>
        <div className="grid gap-4 py-4 mt-4">

          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Background</Label>
            <div className="col-span-3 flex gap-4">
              <Button
                type="button"
                variant={backgroundType === 'color' ? 'primary' : 'secondary'}
                onClick={() => setBackgroundType('color')}
              >
                Color
              </Button>
              <Button
                type="button"
                variant={backgroundType === 'image' ? 'primary' : 'secondary'}
                onClick={() => setBackgroundType('image')}
              >
                Image
              </Button>
            </div>
          </div>

          {backgroundType === 'color' ? (
            <>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="backgroundColor" className="text-right">
                  Color
                </Label>
                <div className="col-span-3 flex gap-2">
                  <Input
                    id="backgroundColor"
                    type="color"
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    className="w-12 h-10 p-1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="opacity" className="text-right">
                  Opacity
                </Label>
                <div className="col-span-3">
                  <div className="flex items-center gap-2">
                    <Slider
                      id="opacity"
                      min={0}
                      max={100}
                      value={opacity}
                      onChange={setOpacity}
                      className="flex-1"
                    />
                    <span className="w-10 text-center text-black dark:text-white">{opacity}%</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Preview</Label>
                <div className="col-span-3">
                  <div
                    className="h-10 w-full rounded border"
                    style={{
                      backgroundImage: "url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/nYDCgBDAm9BGDWAAJyRCgLaBCAAgXwixzAS0pgAAAABJRU5ErkJggg==')",
                      backgroundColor: backgroundColor + Math.round(opacity * 255 / 100).toString(16),
                    }}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {backgroundImage && (
                <div className="grid grid-cols-4 items-center gap-4">
                  <div className="text-right">Current</div>
                  <div className="col-span-3">
                    <div className="h-20 w-full bg-cover bg-center rounded border" style={{ backgroundImage: `url(${backgroundImage})` }} />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="backgroundImage" className="text-right">
                  Image
                </Label>
                <FileInput
                  id="backgroundImage"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="opacity" className="text-right">
                  Opacity
                </Label>
                <div className="col-span-3">
                  <div className="flex items-center gap-2">
                    <Slider
                      id="opacity"
                      min={0}
                      max={100}
                      value={opacity}
                      onChange={setOpacity}
                      className="flex-1"
                    />
                    <span className="w-10 text-center text-black dark:text-white">{opacity}%</span>
                  </div>
                </div>
              </div>
            </>
          )}
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="navigationUrl">Navigation</Label>
            </div>
            <div className="flex items-center gap-2 w-full">
              {isLoading ? (
                <div className="flex h-10 w-full items-center justify-center border border-input rounded-md bg-background">
                  <Spinner variant='bars' />
                </div>
              ) : (
                renderNavigationDropdown()
              )}
            </div>
          </div>

          <div className="grid gap-2">
              <Label htmlFor="width">Width</Label>
              <div className="relative">
                {/* NumericFormat bileşeni ile değiştirdik */}
                <NumericFormat
                  id="width"
                  value={width}
                  onValueChange={(values: { floatValue?: number }) => {
                    const { floatValue } = values;
                    if (floatValue && floatValue > 0) {
                      setWidth(floatValue);
                      
                      // Width değişince height'ı güncelle (resim modunda)
                      if (backgroundType === 'image') {
                        // Oranı hesapla ve height'ı güncelle
                        if (width > 0 && height > 0) {
                          const ratio = width / height;
                          const newHeight = floatValue / ratio;
                          setHeight(newHeight);
                        }
                      }
                    }
                  }}
                  decimalScale={0} // Tam sayı değerler
                  fixedDecimalScale={false}
                  allowNegative={false}
                  thousandSeparator={false}
                  decimalSeparator="."
                  placeholder="Width"
                  className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="height">Height {backgroundType === 'image' && "(Calculated based on image dimensions)"}</Label>
              <div className="relative">
                {/* NumericFormat bileşeni ile değiştirdik */}
                <NumericFormat
                  id="height"
                  value={height}
                  onValueChange={(values: { floatValue?: number }) => {
                    const { floatValue } = values;
                    if (floatValue && floatValue > 0 && backgroundType === 'color') {
                      setHeight(floatValue);
                    }
                  }}
                  disabled={backgroundType === 'image'}
                  decimalScale={0} // Tam sayı değerler
                  fixedDecimalScale={false}
                  allowNegative={false}
                  thousandSeparator={false}
                  decimalSeparator="."
                  placeholder={backgroundType === 'image' ? "Calculated based on image dimensions" : "Height"}
                  className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
                />
              </div>
              {backgroundType === 'image' && (
                <div className="text-xs text-gray-500 mt-1">
                  Image mode: Aspect ratio is preserved, only width can be changed.
                </div>
              )}
            </div>
        </div>

        <div className="group flex justify-end gap-2 mt-6">
          <Button type="button" variant="error" onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={isUploading}>
            {isUploading ? 'Uploading...' : isEditMode ? 'Update Image' : 'Add Image'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ImageModal;
