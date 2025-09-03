"use client";

import { Button } from '@/components/ui/button/CustomButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import Slider from '@/components/ui/slider';
import { Typography } from '@/components/ui/typography';
import { Building, ChevronDown, DoorOpen, Layers } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Node } from 'reactflow';
import { v4 as uuidv4 } from 'uuid';
import { Spinner } from '../ui/spinner';
import { NumericFormat } from 'react-number-format';

interface TextModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (nodeData: Node) => void;
  node?: Node
  isEditMode?: boolean;
}

interface Building {
  _id: string;
  name: string;
  icon?: string;
  floors: Floor[];
}

interface Floor {
  _id: string;
  name: string;
  icon?: string;
  rooms: Room[];
}

interface Room {
  _id: string;
  name: string;
  icon?: string;
}

const fontFamilies = [
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
  { value: 'Helvetica, sans-serif', label: 'Helvetica' },
  { value: 'Times New Roman, serif', label: 'Times New Roman' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Courier New, monospace', label: 'Courier New' },
  { value: 'Trebuchet MS, sans-serif', label: 'Trebuchet MS' },
  { value: 'Impact, sans-serif', label: 'Impact' },
  { value: 'Seven Segment', label: 'Seven Segment' },

];

const TextModal: React.FC<TextModalProps> = ({ isOpen, isEditMode = false, onClose, onConfirm, node }) => {
  // Başlangıç değerleri boş olarak ayarla, useEffect ile güncellenecek
  const [text, setText] = useState('Text Node');
  const [navigationUrl, setNavigationUrl] = useState('');
  const [textColor, setTextColor] = useState('#ffffff');
  const [backgroundColor, setBackgroundColor] = useState('#000000');
  const [fontFamily, setFontFamily] = useState('Arial, sans-serif');
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [opacity, setOpacity] = useState(100);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(node && node.width ? node.width : 150);
  const [height, setHeight] = useState<number>(node && node.height ? node.height : 80);


  useEffect(() => {
    if (isOpen && node) {
      //console.log("node var");
      setText(node.data.text || 'Text Node');
      setNavigationUrl(node.data.navigationUrl || '');
      setTextColor(node.data.textColor || '#ffffff');
      setFontFamily(node.data.fontFamily || 'Arial, sans-serif');
      setOpacity(node.data.opacity || 100);
      setBackgroundColor(node.data.backgroundColor);
      setWidth(node.width || 150);
      setHeight(node.height || 80);
    }
  }, [isOpen, node]);

  // Bina listesini çek
  useEffect(() => {
    if (isOpen) {
      fetchBuildings();
    }
  }, [isOpen]);

  // Dışarı tıklama işleyicisi
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

  const handleConfirm = () => {
    // Opacity değerini backgroundColor'a uygula (hex formatında)
  

    onConfirm({
      id: node?.id || uuidv4(),
      type: 'textNode',
      position: { x: 0, y: 0 },
      width,
      height,
      style: {
        width: width,
        height: height
      },
      data: {
        text,
        navigationUrl,
        textColor,
        backgroundColor,
        opacity,
        fontFamily
      },
    });
    //reset form
    setText('Text Node');
    setNavigationUrl('');
    setTextColor('#ffffff');
    setFontFamily('Arial, sans-serif');
    setOpacity(100);
    setBackgroundColor('#000000');
    onClose();
  };

  const handleCancel = () => {
    setText('Text Node');
    setNavigationUrl('');
    setTextColor('#ffffff');
    setFontFamily('Arial, sans-serif');
    setOpacity(100);
    setBackgroundColor('#000000');
    onClose();
  };

  // Dropdown için seçili öğenin adını göster
  const getSelectedItemName = () => {
    if (!navigationUrl) return "Select Navigation Target (optional)";

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

  // Navigasyon öğesi için tıklama işleyicisi
  const handleNavigationItemClick = (url: string) => {
    setNavigationUrl(url);
    setIsDropdownOpen(false);
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

  // Kat render fonksiyonu
  const renderFloor = (floor: Floor, building: Building) => {
    const floorUrl = `/${building._id}/${floor._id}`;

    return (
      <div key={floor._id} className="navigation-item">
        <div
          className={`pl-6 flex items-center p-2 cursor-pointer hover:bg-gray-100 ${navigationUrl === floorUrl ? 'bg-blue-100' : ''}`}
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

  // Oda render fonksiyonu
  const renderRoom = (room: Room, building: Building, floor: Floor) => {
    const roomUrl = `/${building._id}/${floor._id}/${room._id}`;

    return (
      <div
        key={room._id}
        className={`pl-12 flex items-center p-2 cursor-pointer hover:bg-gray-100 ${navigationUrl === roomUrl ? 'bg-blue-100' : ''}`}
        onClick={() => handleNavigationItemClick(roomUrl)}
      >
        {room.icon ? <div className="relative h-5 w-5">
          <img src={room.icon} alt={room.name} className="h-full w-full object-contain" />
        </div> : <DoorOpen />}
        <span className="mr-1">{room.name}</span>
      </div>
    );
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

  return (
    <Modal isOpen={isOpen} onClose={handleCancel} className="sm:max-w-[425px]">
      <div className="p-6">
        <Typography variant="h4" className="mb-4">
          {isEditMode ? 'Text Edit' : 'New Text Add'}
        </Typography>

        <div className="space-y-6">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="text">Text</Label>
              <Input
                id="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Text content"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="fontFamily">Font Family</Label>
              <select
                id="fontFamily"
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                className="text-black dark:text-white flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>option]:bg-white dark:[&>option]:bg-slate-800 dark:[&>option]:text-white"
                style={{ colorScheme: 'auto' }}
              >
                {fontFamilies.map((font) => (
                  <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                    {font.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="textColor">Text Color</Label>
              <div className="col-span-3 flex gap-2">
                <Input
                  id="textColor"
                  type="color"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  className="w-12 h-10 p-1"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="backgroundColor">Background Color</Label>
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

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="opacity">Background Opacity</Label>
              </div>
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

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="navigationUrl">Navigation</Label>
              </div>
              <div className="flex items-center gap-2 w-full">
                {isLoading ? (
                  <div className="flex h-10 w-full items-center justify-center border border-input rounded-md bg-background">
                    <Spinner variant='bars'/>
                  </div>
                ) : (
                  renderNavigationDropdown()
                )}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="preview">Preview</Label>
              {/* Preview için renk hesaplaması */}
              <div
                className="p-4 rounded-md flex items-center justify-center"
                style={{
                  backgroundColor: `${backgroundColor}${Math.round(opacity * 2.55).toString(16).padStart(2, '0')}`,
                  fontFamily: fontFamily
                }}
              >
                <span style={{ color: textColor }}>{text || 'Örnek Metin'}</span>
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
                                console.log("values: ", values)
                                setWidth(floatValue || 0);
                              }}
                              decimalScale={4} // 4 ondalık basamak
                              fixedDecimalScale={false} // Sonda 0 gösterme
                              allowNegative={false} // Negatif değerlere izin verme
                              thousandSeparator={false} // Binlik ayracı kullanma
                              decimalSeparator="." // Ondalık ayracı nokta olarak ayarla
                              placeholder="Width"
                              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
                            />
                          </div>
                        </div>
            
                        <div className="grid gap-2">
                          <Label htmlFor="height">Height</Label>
                          <div className="relative">
                            {/* NumericFormat bileşeni ile değiştirdik */}
                            <NumericFormat
                              id="height"
                              value={height}
                              onValueChange={(values: { floatValue?: number }) => {
                                const { floatValue } = values;
                                console.log("values: ", values)
                                setHeight(floatValue || 0);
                              }}
                              decimalScale={4} // 4 ondalık basamak
                              fixedDecimalScale={false} // Sonda 0 gösterme
                              allowNegative={false} // Negatif değerlere izin verme
                              thousandSeparator={false} // Binlik ayracı kullanma
                              decimalSeparator="." // Ondalık ayracı nokta olarak ayarla
                              placeholder="Scale Factor"
                              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
                            />
                          </div>
                        </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button variant="secondary" onClick={handleCancel}>Cancel</Button>
            <Button onClick={handleConfirm}>{isEditMode ? 'Update' : 'Add'}</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
export default TextModal;
