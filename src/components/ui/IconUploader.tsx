"use client";

import React, { useState, useRef } from "react";
import { Trash2, Upload } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button/CustomButton";
import { IconButton } from "@/components/ui/icon-button";
import { showToast } from "@/components/ui/alert";
import { eventEmitter, EVENTS } from "@/lib/events";

interface IconUploaderProps {
  currentIcon?: string;
  defaultIcon: React.ReactNode;
  onIconChange: (iconPath: string | null) => Promise<void>;
  size?: "sm" | "md" | "lg";
}

const IconUploader: React.FC<IconUploaderProps> = ({
  currentIcon,
  defaultIcon,
  onIconChange,
  size = "md",
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-12 h-12",
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // SVG dosyaları için boyut kontrolü yapmıyoruz
    const isSvg = file.type === 'image/svg+xml';
    
    if (isSvg) {
      // SVG dosyası için doğrudan yükleme işlemine geç
      uploadFile(file);
      return;
    }

    // Diğer resim formatları için boyut kontrolü yap
    const fileUrl = URL.createObjectURL(file);
    const img = document.createElement('img');
    img.onload = async () => {
      URL.revokeObjectURL(fileUrl);
      
      if (img.width > 512 || img.height > 512) {
        showToast("Icon must be 512x512 pixels or smaller", "error");
        return;
      }
      
      // Boyut kontrolü geçtiyse dosyayı yükle
      uploadFile(file);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(fileUrl);
      showToast("Invalid image file", "error");
    };
    
    img.src = fileUrl;
  };

  const uploadFile = async (file: File) => {
    // Upload the file
    const formData = new FormData();
    formData.append("file", file);
    
    try {
      setIsUploading(true);
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Upload failed with status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        await onIconChange(data.filePath);
        // İkon güncellendiğinde olay yayınla
        eventEmitter.emit(EVENTS.ICON_UPDATED, data.filePath);
        showToast("Icon uploaded successfully", "success");
      } else {
        throw new Error(data.error || "Failed to upload icon");
      }
    } catch (error) {
      console.error("Error uploading icon:", error);
      showToast("Failed to upload icon", "error");
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveIcon = async () => {
    try {
      setIsUploading(true);
      
      // Eğer mevcut bir ikon varsa, önce sunucudan sil
      if (currentIcon) {
        const iconFilename = currentIcon.split('/').pop();
        
        if (iconFilename) {
          try {
            // API'ye DELETE isteği gönder
            const deleteResponse = await fetch('/api/upload', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ filePath: iconFilename })
            });
            
            if (!deleteResponse.ok) {
              console.warn('Icon file deletion from server failed:', deleteResponse.status);
            } else {
              console.log('Icon file deleted from uploads:', iconFilename);
            }
          } catch (deleteError) {
            console.error('Error deleting icon file:', deleteError);
          }
        }
      }
      
      // İkon referansını null yap
      await onIconChange(null);
      
      // İkon kaldırıldığında olay yayınla
      eventEmitter.emit(EVENTS.ICON_UPDATED, null);
      showToast("Icon removed successfully", "success");
    } catch (error) {
      console.error("Error removing icon:", error);
      showToast("Failed to remove icon", "error");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`relative ${sizeClasses[size]} flex items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800`}>
        {currentIcon ? (
          <Image
            src={currentIcon}
            alt="Icon"
            fill
            className="object-contain p-1"
          />
        ) : (
          <div className="text-gray-500 dark:text-gray-400">{defaultIcon}</div>
        )}
      </div>
      
      <div className="flex gap-1">
        <IconButton
          onClick={handleUploadClick}
          variant="primary"
          size="sm"
          icon={<Upload className="h-3 w-3" />}
          disabled={isUploading}
        />
        
        {currentIcon && (
          <IconButton
            onClick={handleRemoveIcon}
            variant="error"
            size="sm"
            icon={<Trash2 className="h-3 w-3" />}
            disabled={isUploading}
          />
        )}
        
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          className="hidden"
        />
      </div>
    </div>
  );
};

export default IconUploader;
