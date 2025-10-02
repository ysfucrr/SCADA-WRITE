'use client';

import React from 'react';
import CloudSettings from '@/components/cloud/CloudSettings';

export default function CloudSettingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">☁️ Cloud Settings</h1>
          <p className="text-gray-600 mt-1">
            SCADA-Mobile bridge sunucu ayarlarını yapılandırın
          </p>
        </div>
      </div>

      <CloudSettings />
    </div>
  );
}