import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button/CustomButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Typography } from '../ui/typography';
import FileInput from '../form/input/FileInput';
import Slider from '../ui/slider';

interface BackgroundModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (backgroundData: { type: string; color?: string; image?: string; opacity: number }) => void;
  initialBackgroundImage?: string;
  initialBackgroundColor?: string;
  initialOpacity?: number;
}

const BackgroundModal: React.FC<BackgroundModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  initialBackgroundImage,
  initialBackgroundColor,
  initialOpacity,
}) => {
  const [backgroundColor, setBackgroundColor] = useState(initialBackgroundColor || '#f0f0f0');
  const [opacity, setOpacity] = useState(initialOpacity || 100);
  const [backgroundType, setBackgroundType] = useState(initialBackgroundImage ? 'image' : 'color');
  const [backgroundImage, setBackgroundImage] = useState(initialBackgroundImage || '');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Modal açıldığında state'leri güncelle
  useEffect(() => {
    if (isOpen) {
      // Arka plan tipi ve resim ayarları
      const hasBackgroundImage = !!initialBackgroundImage;
      setBackgroundType(hasBackgroundImage ? 'image' : 'color');
      setBackgroundImage(initialBackgroundImage || '');
      setOpacity(initialOpacity || 100);
      setBackgroundColor(initialBackgroundColor || '#f0f0f0');

      // Dosya seçimini sıfırla
      setFile(null);
    }
  }, [isOpen, initialBackgroundImage, initialBackgroundColor, initialOpacity]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleCancel = () => {
    // Reset form
    setBackgroundColor('#f0f0f0');
    setOpacity(100);
    setBackgroundType('color');
    setBackgroundImage('');
    setFile(null);
    onClose();
  };

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
            onConfirm({
              type: 'image',
              image: data.filePath,
              opacity
            });
            setIsUploading(false);
            onClose();
          } else {
            throw new Error(data.error || 'Failed to upload background image');
          }
        } catch (error) {
          console.error('Error uploading background image:', error);
          setIsUploading(false);
        }
      } else if (backgroundImage) {
        // Eğer mevcut bir resim varsa ve yeni bir resim seçilmediyse
        onConfirm({
          type: 'image',
          image: backgroundImage,
          opacity
        });
        onClose();
      } else {
        // Resim seçilmedi, renk moduna geç
        setBackgroundType('color');
      }
    } else {
      // Renk modu
      onConfirm({
        type: 'color',
        color: backgroundColor,
        opacity
      });
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleCancel} className="sm:max-w-[425px]">
      <div className="p-6">
        <Typography variant="h3">Set Background</Typography>
        <Typography variant="small" className="text-gray-500 mt-1">
          Choose a background color or image for your flow
        </Typography>
        <div className="grid gap-6 mt-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Type</Label>
            <div className="col-span-3 flex gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="colorType"
                  name="backgroundType"
                  value="color"
                  checked={backgroundType === 'color'}
                  onChange={() => setBackgroundType('color')}
                />
                <Label htmlFor="colorType" className="cursor-pointer">Color</Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="imageType"
                  name="backgroundType"
                  value="image"
                  checked={backgroundType === 'image'}
                  onChange={() => setBackgroundType('image')}
                />
                <Label htmlFor="imageType" className="cursor-pointer">Image</Label>
              </div>
            </div>
          </div>
          {backgroundType === 'color' ? (
            <div>
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
                      backgroundColor: backgroundColor,
                      opacity: opacity / 100,
                      backgroundImage: "url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/nYDCgBDAm9BGDWAAJyRCgLaBCAAgXwixzAS0pgAAAABJRU5ErkJggg==')"
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div>
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
            </div>
          )}
          <div className="group flex justify-end gap-2 mt-6">
            <Button type="button" variant="error" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirm} disabled={isUploading}>
              {isUploading ? 'Uploading...' : 'Apply Background'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default BackgroundModal;
