import { Button } from '@/components/ui/button/CustomButton';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import React, { useEffect, useRef, useState } from 'react';
import { Node } from 'reactflow';
import { v4 as uuidv4 } from 'uuid';
import FileInput from '../form/input/FileInput';
import Slider from '../ui/slider';
import { Typography } from '../ui/typography';
import { ChevronDown } from 'lucide-react';
import { Spinner } from '../ui/spinner';
import { showErrorAlert } from '../ui/alert';
interface ImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (groupData: Node) => void;
  node?: Node
  isEditMode?: boolean;
}

interface Building {
  _id: string;
  id: string;
  name: string;
  floors: Floor[];
}

interface Floor {
  _id: string;
  id: string;
  name: string;
  rooms: Room[];
}

interface Room {
  _id: string;
  id: string;
  name: string;
}

const ImageModal: React.FC<ImageModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isEditMode,
  node,
}) => {
  const [opacity, setOpacity] = useState(100);
  const [image, setImage] = useState('');
  const [navigationUrl, setNavigationUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Modal açıldığında veya initialData değiştiğinde state'leri güncelle
  useEffect(() => {
    if (isOpen) {
      //console.log("Modal açıldı, initialData:", node);

      // Arka plan tipi ve resim ayarları
      setImage(node?.data?.image || '');
      setNavigationUrl(node?.data?.navigationUrl || '');
      setOpacity(node?.data?.opacity || 100);
      // Dosya seçimini sıfırla
      setFile(null);
    }
  }, [isOpen, node]);

  useEffect(() => {
    if (isOpen) {
      fetchBuildings();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as HTMLElement)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };
  // Bina render fonksiyonu
  const renderBuilding = (building: Building) => {
    const buildingUrl = `/${building._id}`;

    return (
      <div key={building._id} className="navigation-item">
        <div
          className={`flex items-center p-2 cursor-pointer hover:bg-gray-100 ${navigationUrl === buildingUrl ? 'bg-blue-100' : ''}`}
          onClick={() => handleNavigationItemClick(buildingUrl)}
        >
          <span className="font-medium">{building.name}</span>
        </div>

        {/* Katlar */}
        <div className="">
          {building.floors.map(floor => renderFloor(floor, building))}
        </div>
      </div>
    );
  };

  // Kat render fonksiyonu
  const renderFloor = (floor: Floor, building: Building) => {
    const floorUrl = `/${building._id}/${floor.id}`;

    return (
      <div key={floor.id} className="navigation-item">
        <div
          className={`pl-6 flex items-center p-2 cursor-pointer hover:bg-gray-100 ${navigationUrl === floorUrl ? 'bg-blue-100' : ''}`}
          onClick={() => handleNavigationItemClick(floorUrl)}
        >
          {/* <ChevronRight size={16} className="mr-1" /> */}
          <span>{floor.name}</span>
        </div>

        {/* Odalar */}
        <div className="">
          {floor.rooms.map(room => renderRoom(room, building, floor))}
        </div>
      </div>
    );
  };

  // Oda render fonksiyonu
  const renderRoom = (room: Room, building: Building, floor: Floor) => {
    const roomUrl = `/${building._id}/${floor.id}/${room.id}`;

    return (
      <div
        key={room.id}
        className={`pl-12 flex items-center p-2 cursor-pointer hover:bg-gray-100 ${navigationUrl === roomUrl ? 'bg-blue-100' : ''}`}
        onClick={() => handleNavigationItemClick(roomUrl)}
      >
        {/* <ChevronRight size={16} className="mr-1" /> */}
        {/* <ChevronRight size={16} className="mr-1" /> */}
        <span className="mr-1">{room.name}</span>
      </div>
    );
  };
  // Dropdown için seçili öğenin adını göster
  const getSelectedItemName = () => {
    if (!navigationUrl) return "Select Navigation Target (optional)";

    // URL'den ID'leri ayıkla
    const parts = navigationUrl.split('/').filter(p => p);

    if (parts.length === 0) return "Select Navigation Target (optional)";

    // Bina ID'si
    const buildingId = parts[0];
    const building = buildings.find(b => b._id === buildingId || b.id === buildingId);

    if (!building) return "Select Navigation Target (optional)";

    // Sadece bina seçilmişse
    if (parts.length === 1) return building.name;

    // Kat ID'si
    const floorId = parts[1];
    const floor = building.floors.find(f => f._id === floorId || f.id === floorId);

    if (!floor) return building.name;

    // Sadece kat seçilmişse
    if (parts.length === 2) return `${building.name} > ${floor.name}`;

    // Oda ID'si
    const roomId = parts[2];
    const room = floor.rooms.find(r => r._id === roomId || r.id === roomId);

    if (!room) return `${building.name} > ${floor.name}`;

    return `${building.name} > ${floor.name} > ${room.name}`;
  };
  // Tüm navigasyon menüsünü render et
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

  // Navigasyon öğesi için tıklama işleyicisi
  const handleNavigationItemClick = (url: string) => {
    setNavigationUrl(url);
    setIsDropdownOpen(false);
  };

  // Resmin en boy oranına göre node boyutlarını hesapla
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

  const handleConfirm = async () => {
    if (file) {
      setIsUploading(true);
      const formData = new FormData();
      if (!file) return;
      formData.append('file', file);

      try {
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();
        if (data.success) {
          // Resim yüklendikten sonra boyutlarını hesapla
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
                  image: data.filePath,
                  opacity: opacity,
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
    } else if (image) {
      // Mevcut resmin boyutlarını hesapla

      const dimensions = await calculateImageDimensions(image);

      onConfirm({
        id: node?.id || uuidv4(),
        type: 'imageNode',
        position: { x: 0, y: 0 },
        width: dimensions.width,
        height: dimensions.height,
        data: {
          image: image,
          opacity: opacity,
          navigationUrl: navigationUrl,
        },
        style: {
          width: dimensions.width,
          height: dimensions.height
        }
      });

    } else {
      showErrorAlert("Please choose an image");
      return;
    }
    //reset form
    setImage('');
    setNavigationUrl('');
    setOpacity(100);
    setFile(null);
    onClose();

  };

  const handleCancel = () => {
    setImage('');
    setNavigationUrl('');
    setOpacity(100);
    setFile(null);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleCancel} className="sm:max-w-[425px]">
      <div className="p-6">
        <Typography variant="h3">{isEditMode ? 'Edit Group Box' : 'Add Group Box'}</Typography>
        <div className="grid gap-4 py-4 mt-4">

          <>
            {image && (
              <div className="grid grid-cols-4 items-center gap-4">
                <div className="text-right">Current</div>
                <div className="col-span-3">
                  <div className="h-20 w-full bg-cover bg-center rounded border" style={{ backgroundImage: `url(${image})` }} />
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
          </>
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
