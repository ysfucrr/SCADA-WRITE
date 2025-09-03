"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { Typography } from './typography';

interface EditableTitleProps {
  defaultTitle: string;
  className?: string;
}

const EditableTitle: React.FC<EditableTitleProps> = ({ 
  defaultTitle = "Admin", 
  className = "" 
}) => {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [serverTitle, setServerTitle] = useState(defaultTitle);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Başlığı API'den çek
  useEffect(() => {
    const fetchTitle = async () => {
      try {
        const response = await fetch('/api/settings/title');
        const data = await response.json();
        if (data.success && data.title) {
          setTitle(data.title);
          setServerTitle(data.title);
        }
      } catch (error) {
        console.error("Failed to fetch title:", error);
      }
    };

    fetchTitle();
  }, []);

  // Düzenleme modunu başlat
  const handleDoubleClick = () => {
    if (isAdmin) {
      setIsEditing(true);
      // Input odaklandığında içeriğini seç
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 10);
    }
  };

  // Başlığı kaydet
  const saveTitle = async () => {
    if (title === serverTitle || !isAdmin) {
      setIsEditing(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/settings/title', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title })
      });

      const data = await response.json();
      if (data.success) {
        setServerTitle(title);
      } else {
        setTitle(serverTitle); // Başarısız olursa eski değeri geri yükle
        console.error("Failed to update title:", data.error);
      }
    } catch (error) {
      console.error("Error updating title:", error);
      setTitle(serverTitle); // Hata durumunda eski değeri geri yükle
    } finally {
      setIsLoading(false);
      setIsEditing(false);
    }
  };

  // Enter tuşuna basıldığında kaydet
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      saveTitle();
    } else if (e.key === 'Escape') {
      setTitle(serverTitle); // İptal et
      setIsEditing(false);
    }
  };

  // Dışarı tıklandığında düzenlemeyi kapat
  const handleBlur = () => {
    saveTitle();
  };

  return (
    <div 
      className={`${className} relative`}
      onDoubleClick={handleDoubleClick}
      title={isAdmin ? "Double click to edit" : ""}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
          maxLength={30}
        />
      ) : (
        <div className="cursor-pointer text-center w-full flex-1">
          <Typography variant="h3"> {title || "Admin"}</Typography>
        </div>
      )}
    </div>
  );
};

export default EditableTitle;
