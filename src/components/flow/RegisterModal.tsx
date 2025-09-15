"use client";

import { AnalyzerType } from '@/app/(project)/analyzers/page';
import { Button } from '@/components/ui/button/CustomButton';
import { Input } from "@/components/ui/input";
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { useEffect, useState, useRef } from 'react';
import { NumericFormat } from "react-number-format";
import { Node } from 'reactflow';
import { showToast } from '../ui/alert';
import Slider from '../ui/slider';
import { Spinner } from '../ui/spinner';
import { Typography } from '../ui/typography';
import Image from 'next/image';

interface RegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (registerData: Node) => void;
  node?: Node;
  isEditMode?: boolean;
}

const dataTypes = [
  { value: 'boolean', label: 'Boolean' },
  { value: 'int8', label: 'Int8' },
  { value: 'uint8', label: 'UInt8' },
  { value: 'int16', label: 'Int16' },
  { value: 'uint16', label: 'UInt16' },
  { value: 'int32', label: 'Int32' },
  { value: 'uint32', label: 'UInt32' },
  { value: 'int64', label: 'Int64' },
  { value: 'uint64', label: 'UInt64' },
  { value: 'float32', label: 'Float32' },
  { value: 'float64', label: 'Float64' },
  { value: 'string', label: 'String' },
];

const byteOrderOptions = [
  { value: 'ABCD', label: 'ABCD' },
  { value: 'BADC', label: 'BADC' },
  { value: 'CDAB', label: 'CDAB' },
  { value: 'DCBA', label: 'DCBA' },
];

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

const RegisterModal: React.FC<RegisterModalProps> = ({ isOpen, isEditMode = false, onClose, onConfirm, node }) => {
  // Register type selection
  const [registerType, setRegisterType] = useState<'read' | 'write' | 'readwrite'>('read');
  
  // Register values
  const [displayMode, setDisplayMode] = useState<'digit' | 'graph'>('digit');
  const [address, setAddress] = useState<number | "">(0);
  const [dataType, setDataType] = useState<string>('int16');
  const [scale, setScale] = useState<number>(1);
  const [scaleUnit, setScaleUnit] = useState<string>('');
  const [byteOrder, setByteOrder] = useState<string>('ABCD');
  const [label, setLabel] = useState<string>('Register');
  const [analyzer, setAnalyzer] = useState<string>('');
  const [analyzers, setAnalyzers] = useState<AnalyzerType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [textColor, setTextColor] = useState('#ffffff');
  const [backgroundColor, setBackgroundColor] = useState('#000000');
  const [opacity, setOpacity] = useState<number>(100);
  const [bit, setBit] = useState<number>(node && node.data.bit ? node.data.bit : -1);
  const [width, setWidth] = useState<number>(node && node.width ? node.width : 150);
  const [height, setHeight] = useState<number>(node && node.height ? node.height : 80);
  const [fontFamily, setFontFamily] = useState<string>('Arial, sans-serif');

  // Write-specific states
  const [writeValue, setWriteValue] = useState<number | string>('');
  const [minValue, setMinValue] = useState<number | ''>('');
  const [maxValue, setMaxValue] = useState<number | ''>('');
  const [writePermission, setWritePermission] = useState<boolean>(true);
  const [readAddress, setReadAddress] = useState<number | "">(0); // Separate read address for Read/Write
  const [controlType, setControlType] = useState<'numeric' | 'boolean' | 'dropdown' | 'manual'>('numeric'); // Write control type
  const [stepValue, setStepValue] = useState<number>(1); // Step value for numeric input
  const [offsetValue, setOffsetValue] = useState<number>(0); // Offset value (Raw Value + Offset) * Scale
  const [decimalPlaces, setDecimalPlaces] = useState<number>(2); // Number of decimal places
  
  // For manual input
  const [placeholder, setPlaceholder] = useState<string>('Enter value');
  const [infoText, setInfoText] = useState<string>('');
  
  // For boolean control
  const [onValue, setOnValue] = useState<number | string>(1);
  const [offValue, setOffValue] = useState<number | string>(0);
  
  // Icon states for boolean control
  const [writeOnIcon, setWriteOnIcon] = useState<string>('');
  const [writeOffIcon, setWriteOffIcon] = useState<string>('');
  const [writeOnIconPreview, setWriteOnIconPreview] = useState<string>('');
  const [writeOffIconPreview, setWriteOffIconPreview] = useState<string>('');
  
  // For dropdown control
  const [dropdownOptions, setDropdownOptions] = useState<Array<{label: string, value: number | string}>>([
    { label: 'Option 1', value: 1 },
    { label: 'Option 2', value: 2 }
  ]);

  // Icon states for boolean register
  const [onIcon, setOnIcon] = useState<string>(node?.data?.onIcon || '');
  const [offIcon, setOffIcon] = useState<string>(node?.data?.offIcon || '');
  const [onIconPreview, setOnIconPreview] = useState<string>(node?.data?.onIcon || '');
  const [offIconPreview, setOffIconPreview] = useState<string>(node?.data?.offIcon || '');
  const [uploadStatus, setUploadStatus] = useState<{ loading: boolean, error: string }>({ loading: false, error: '' });

  // File input references
  const onIconInputRef = useRef<HTMLInputElement>(null);
  const offIconInputRef = useRef<HTMLInputElement>(null);

  const fetchAnalyzers = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/analyzers");

      if (!response.ok) {
        throw new Error("Error fetching analyzers");
      }

      const data = await response.json();
      setAnalyzers(data);
    } catch (error) {
      console.error("Error fetching analyzers:", error);
      showToast("Error occurred while loading analyzers", "error");
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
    fetchAnalyzers();
  }, [isOpen]);

  useEffect(() => {
    setAnalyzer('')
    if (analyzers.length > 0 && node?.data?.analyzerId) {
      const selectedAnalyzer = analyzers.find(a => a._id === node.data.analyzerId);
      if (selectedAnalyzer) {
        setAnalyzer(selectedAnalyzer._id);
      }
    }
  }, [analyzers, node?.data?.analyzerId]);

  // Functions for icon upload operations
  const uploadIcon = async (file: File): Promise<string | null> => {
    // Check file size (maximum 100KB)
    if (file.size > 100 * 1024) {
      showToast('File size cannot be larger than 100KB', 'error');
      return null;
    }

    // Check file type
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml'].includes(file.type)) {
      showToast('Please upload a valid image file (JPEG, PNG, GIF, SVG)', 'error');
      return null;
    }

    // Check maximum file size (100KB max)
    if (file.size > 102400) { // 100 * 1024 bytes
      showToast('File size too large. Please upload a file under 100KB', 'error');
      return null;
    }

    // Create FormData and add file
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to upload file');
      }

      return result.filePath; // '/api/image/timestamp-filename.ext' shape
    } catch (error) {
      console.error('Icon upload error:', error);
      showToast('Failed to upload icon', 'error');
      return null;
    }
  };

  const handleOnIconChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Read file for preview
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        const dataUrl = e.target.result.toString();
        setOnIconPreview(dataUrl);
      }
    };
    reader.readAsDataURL(file);

    // Set upload status
    setUploadStatus({ loading: true, error: '' });

    try {
      // Upload file to API
      const filePath = await uploadIcon(file);
      if (filePath) {
        setOnIcon(filePath); // Server returned file path, e.g. '/api/image/1234567890-icon.png'
        showToast('ON icon uploaded successfully', 'success');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      setUploadStatus({ loading: false, error: errorMessage });
      showToast(`ON icon upload error: ${errorMessage}`, 'error');
    } finally {
      setUploadStatus({ loading: false, error: '' });
    }
  };

  const handleOffIconChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Read file for preview
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        const dataUrl = e.target.result.toString();
        setOffIconPreview(dataUrl);
      }
    };
    reader.readAsDataURL(file);

    // Set upload status
    setUploadStatus({ loading: true, error: '' });

    try {
      // Upload file to API
      const filePath = await uploadIcon(file);
      if (filePath) {
        setOffIcon(filePath); // Server returned file path, e.g. '/api/image/1234567890-icon.png'
        showToast('OFF icon uploaded successfully', 'success');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      setUploadStatus({ loading: false, error: errorMessage });
      showToast(`OFF icon upload error: ${errorMessage}`, 'error');
    } finally {
      setUploadStatus({ loading: false, error: '' });
    }
  };

  // Write icon upload handlers
  const handleWriteOnIconChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Read file for preview
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        const dataUrl = e.target.result.toString();
        setWriteOnIconPreview(dataUrl);
      }
    };
    reader.readAsDataURL(file);

    // Set upload status
    setUploadStatus({ loading: true, error: '' });

    try {
      // Upload file to API
      const filePath = await uploadIcon(file);
      if (filePath) {
        setWriteOnIcon(filePath);
        showToast('Write ON icon uploaded successfully', 'success');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      setUploadStatus({ loading: false, error: errorMessage });
      showToast(`Write ON icon upload error: ${errorMessage}`, 'error');
    } finally {
      setUploadStatus({ loading: false, error: '' });
    }
  };

  const handleWriteOffIconChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Read file for preview
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        const dataUrl = e.target.result.toString();
        setWriteOffIconPreview(dataUrl);
      }
    };
    reader.readAsDataURL(file);

    // Set upload status
    setUploadStatus({ loading: true, error: '' });

    try {
      // Upload file to API
      const filePath = await uploadIcon(file);
      if (filePath) {
        setWriteOffIcon(filePath);
        showToast('Write OFF icon uploaded successfully', 'success');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      setUploadStatus({ loading: false, error: errorMessage });
      showToast(`Write OFF icon upload error: ${errorMessage}`, 'error');
    } finally {
      setUploadStatus({ loading: false, error: '' });
    }
  };

  // Reset icons
  const resetIcons = () => {
    setOnIcon('');
    setOffIcon('');
    setOnIconPreview('');
    setOffIconPreview('');
    setWriteOnIcon('');
    setWriteOffIcon('');
    setWriteOnIconPreview('');
    setWriteOffIconPreview('');
  };

  // Update icons if register is updated
  useEffect(() => {
    if (node && node.data && node.data.dataType === 'boolean') {
      // Use onIcon and offIcon values from node.data if available
      if (node.data.onIcon) {
        setOnIcon(node.data.onIcon);
        setOnIconPreview(node.data.onIcon);
      }

      if (node.data.offIcon) {
        setOffIcon(node.data.offIcon);
        setOffIconPreview(node.data.offIcon);
      }
    }
  }, [node]);

  // Load values when node is opened
  useEffect(() => {
    if (isOpen && node) {
      console.log("node data:", node);
      setAddress(node.data.address || 0);
      setDataType(node.data.dataType || 'float32');
      setScale(node.data.scale || 1);
      setScaleUnit(node.data.scaleUnit || '');
      setByteOrder(node.data.byteOrder || 'ABCD');
      setLabel(node.data.label || 'Register');
      setTextColor(node.data.textColor || '#ffffff');
      setBackgroundColor(node.data.backgroundColor || '#000000');
      setFontFamily(node.data.fontFamily || 'Seven Segment');
      // Set opacity value explicitly
      const nodeOpacity = node.data.opacity !== undefined ? node.data.opacity : 100;
      console.log("node data opacity:", nodeOpacity);
      setOpacity(nodeOpacity);

      // Set other values
      setAnalyzer('');
      setBit(node.data.bit !== undefined ? node.data.bit : -1);
      setWidth(node.style?.width ? Number(node.style?.width) : 150);
      setHeight(node.style?.height ? Number(node.style?.height) : 80);

      // Set display mode value from node
      setDisplayMode(node.data.displayMode || 'digit');

      // Set register type from node data
      setRegisterType(node.data.registerType || 'read');

      // Set write-specific values
      // writeValue değeri her zaman defaultWriteValue olarak kullanılmalı
      // lastValue değeri ise kullanıcı arayüzündeki değer için kullanılmalı
      
      // writeValue değerini state'e yükle (bu değer default write value alanı için)
      setWriteValue(node.data.writeValue !== undefined ? node.data.writeValue.toString() : '');
      setMinValue(node.data.minValue || '');
      setMaxValue(node.data.maxValue || '');
      setWritePermission(node.data.writePermission !== undefined ? node.data.writePermission : true);
      setReadAddress(node.data.readAddress || 0);
      setControlType(node.data.controlType || 'numeric');
      setStepValue(node.data.stepValue || 1);
      setOffsetValue(node.data.offsetValue || 0);
      setDecimalPlaces(node.data.decimalPlaces || 2);
      setPlaceholder(node.data.placeholder || 'Enter value');
      setInfoText(node.data.infoText || '');
      setOnValue(node.data.onValue || 1);
      setOffValue(node.data.offValue || 0);
      setDropdownOptions(node.data.dropdownOptions || [{ label: 'Option 1', value: 1 }, { label: 'Option 2', value: 2 }]);

      // Set write icon values
      if (node.data.writeOnIcon) {
        setWriteOnIcon(node.data.writeOnIcon);
        setWriteOnIconPreview(node.data.writeOnIcon);
      }

      if (node.data.writeOffIcon) {
        setWriteOffIcon(node.data.writeOffIcon);
        setWriteOffIconPreview(node.data.writeOffIcon);
      }

      // Set icon values (for read boolean)
      if (node.data.onIcon) {
        console.log('Edit mode - ON Icon path:', node.data.onIcon);
        setOnIcon(node.data.onIcon);
        setOnIconPreview(node.data.onIcon);
      }

      if (node.data.offIcon) {
        console.log('Edit mode - OFF Icon path:', node.data.offIcon);
        setOffIcon(node.data.offIcon);
        setOffIconPreview(node.data.offIcon);
      }
    } else if (isOpen) {
      // Default values for new node
      setRegisterType('read');
      setAddress(0);
      setDataType('float32');
      setScale(1);
      setScaleUnit('');
      setByteOrder('ABCD');
      setLabel('Register');
      setTextColor('#ffffff');
      setBackgroundColor('#000000');
      setOpacity(100);
      setAnalyzer('');
      setBit(-1);
      setWidth(150);
      setHeight(80);
      setFontFamily('Seven Segment');
      setWriteValue('');
      setMinValue('');
      setMaxValue('');
      setWritePermission(true);
      setReadAddress(0);
      setControlType('numeric');
      setStepValue(1);
      setOffsetValue(0);
      setDecimalPlaces(2);
      setPlaceholder('Enter value');
      setInfoText('');
      setOnValue(1);
      setOffValue(0);
      setDropdownOptions([{ label: 'Option 1', value: 1 }, { label: 'Option 2', value: 2 }]);
      setWriteOnIcon('');
      setWriteOffIcon('');
      setWriteOnIconPreview('');
      setWriteOffIconPreview('');
      setOnIcon('');
      setOffIcon('');
      setOnIconPreview('');
      setOffIconPreview('');
    }
  }, [isOpen, node]);

  // Confirmation process
  const handleConfirm = async () => {
    // Check if analyzer is selected
    if (!analyzer) {
      showToast("Please select an analyzer", "error");
      return;
    }
    if (!label) {
      showToast("Please enter a label", "error");
      return;
    }
    const id = node?.id || `register-${Date.now()}`;
    // Call registers post (if node id is not defined) or update API (if node id is defined)
    if (node?.id) {
      if (address != node.data.address ||
        dataType != node.data.dataType ||
        scale != node.data.scale ||
        byteOrder != node.data.byteOrder ||
        analyzer != node.data.analyzerId ||
        bit != node.data.bit) {
        await fetch(`/api/registers/${node.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            nodeId: id,
            label,
            address,
            dataType,
            scale,
            scaleUnit,
            byteOrder: showByteOrderOption ? byteOrder : undefined,
            textColor,
            backgroundColor,
            analyzerId: analyzer,
            analyzer: analyzers.find(a => a._id === analyzer),
            bit: dataType === 'boolean' && bit >= 0 ? bit : undefined,
          }),
        });
      }
    } else {
      await fetch('/api/registers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nodeId: id,
          label,
          address,
          dataType,
          scale,
          byteOrder: showByteOrderOption ? byteOrder : undefined,
          textColor,
          backgroundColor,
          analyzerId: analyzer,
          analyzer: analyzers.find(a => a._id === analyzer),
          bit: dataType === 'boolean' && bit >= 0 ? bit : undefined,
        }),
      });
    }
    const registerData = {
      id,
      type: 'registerNode',
      position: node?.position || { x: 100, y: 100 },
      style: {
        width: width,
        height: height,
      },
      width,
      height,
      data: {
        label,
        address,
        dataType,
        scale,
        scaleUnit,
        fontFamily,
        byteOrder: showByteOrderOption ? byteOrder : undefined,
        textColor,
        backgroundColor,
        opacity,
        analyzerId: analyzer,
        bit: dataType === 'boolean' && bit >= 0 ? bit : undefined,
        displayMode,
        registerType,
        // Write-specific data
        writeValue: (registerType === 'write' || registerType === 'readwrite') ? writeValue : undefined, // writeValue input alanından alınır
        lastValue: (registerType === 'write' || registerType === 'readwrite') ?
                   (isEditMode ? node?.data?.lastValue : undefined) : undefined, // Düzenleme modunda lastValue korunmalı, yeni kayıtlarda boş
        minValue: (registerType === 'write' || registerType === 'readwrite') && minValue !== '' ? minValue : undefined,
        maxValue: (registerType === 'write' || registerType === 'readwrite') && maxValue !== '' ? maxValue : undefined,
        writePermission: (registerType === 'write' || registerType === 'readwrite') ? writePermission : undefined,
        readAddress: registerType === 'readwrite' ? readAddress : undefined,
        controlType: (registerType === 'write' || registerType === 'readwrite') ? controlType : undefined,
        stepValue: (registerType === 'write' || registerType === 'readwrite') && controlType === 'numeric' ? stepValue : undefined,
        offsetValue: offsetValue !== 0 ? offsetValue : undefined,
        decimalPlaces: decimalPlaces !== 2 ? decimalPlaces : undefined,
        placeholder: (registerType === 'write' || registerType === 'readwrite') && controlType === 'manual' ? placeholder : undefined,
        infoText: (registerType === 'write' || registerType === 'readwrite') && controlType === 'manual' ? infoText : undefined,
        onValue: (registerType === 'write' || registerType === 'readwrite') && controlType === 'boolean' ? onValue : undefined,
        offValue: (registerType === 'write' || registerType === 'readwrite') && controlType === 'boolean' ? offValue : undefined,
        dropdownOptions: (registerType === 'write' || registerType === 'readwrite') && controlType === 'dropdown' ? dropdownOptions : undefined,
        // Write boolean icons
        writeOnIcon: (registerType === 'write' || registerType === 'readwrite') && controlType === 'boolean' ? writeOnIcon : undefined,
        writeOffIcon: (registerType === 'write' || registerType === 'readwrite') && controlType === 'boolean' ? writeOffIcon : undefined,
        // Add icons for boolean register (read)
        onIcon: dataType === 'boolean' ? onIcon : undefined,
        offIcon: dataType === 'boolean' ? offIcon : undefined,
      },
    };
    //console.log("register data:", registerData);
    // Reset form
    onConfirm(registerData);
    setRegisterType('read');
    setAddress(0);
    setDataType('float32');
    setScale(1);
    setScaleUnit('');
    setByteOrder('ABCD');
    setLabel('Register');
    setTextColor('#ffffff');
    setBackgroundColor('#000000');
    setOpacity(100);
    setAnalyzer('');
    setBit(-1);
    setWidth(150);
    setHeight(80);
    setFontFamily('Seven Segment');
    setWriteValue('');
    setMinValue('');
    setMaxValue('');
    setWritePermission(true);
    setReadAddress(0);
    setControlType('numeric');
    setStepValue(1);
    setOffsetValue(0);
    setDecimalPlaces(2);
    setPlaceholder('Enter value');
    setInfoText('');
    setOnValue(1);
    setOffValue(0);
    setDropdownOptions([{ label: 'Option 1', value: 1 }, { label: 'Option 2', value: 2 }]);
    resetIcons(); // Reset icons
    onClose();
  };

  const handleCancel = async () => {
    console.log("cancel");

    // Clean up uploaded icons when canceling new register creation
    if (!node?.id) {
      // Delete boolean register icons (read)
      if (onIcon) {
        try {
          await fetch('/api/upload', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath: onIcon.split('/').pop() })
          });
          console.log('ON icon deleted from uploads:', onIcon);
        } catch (error) {
          console.error('Error deleting ON icon:', error);
        }
      }

      if (offIcon) {
        try {
          await fetch('/api/upload', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath: offIcon.split('/').pop() })
          });
          console.log('OFF icon deleted from uploads:', offIcon);
        } catch (error) {
          console.error('Error deleting OFF icon:', error);
        }
      }

      // Delete write boolean control icons
      if (writeOnIcon) {
        try {
          await fetch('/api/upload', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath: writeOnIcon.split('/').pop() })
          });
          console.log('Write ON icon deleted from uploads:', writeOnIcon);
        } catch (error) {
          console.error('Error deleting write ON icon:', error);
        }
      }

      if (writeOffIcon) {
        try {
          await fetch('/api/upload', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath: writeOffIcon.split('/').pop() })
          });
          console.log('Write OFF icon deleted from uploads:', writeOffIcon);
        } catch (error) {
          console.error('Error deleting write OFF icon:', error);
        }
      }
    }

    setRegisterType('read');
    setAddress(0);
    setDataType('float32');
    setScale(1);
    setScaleUnit('');
    setByteOrder('ABCD');
    setLabel('Register');
    setTextColor('#ffffff');
    setBackgroundColor('#000000');
    setFontFamily('Seven Segment');
    setOpacity(100);
    setAnalyzer('');
    setBit(-1);
    setWidth(150);
    setHeight(80);
    setWriteValue('');
    setMinValue('');
    setMaxValue('');
    setWritePermission(true);
    setReadAddress(0);
    setControlType('numeric');
    setStepValue(1);
    setOffsetValue(0);
    setDecimalPlaces(2);
    setPlaceholder('Enter value');
    setInfoText('');
    setOnValue(1);
    setOffValue(0);
    setDropdownOptions([{ label: 'Option 1', value: 1 }, { label: 'Option 2', value: 2 }]);
    resetIcons(); // Reset icons
    onClose();
  };
  // Byte order seçeneği sadece float32 veya int32 için gösterilsin
  const showByteOrderOption = ['float32', 'int32', 'uint32', 'int64', 'uint64', 'float64', 'boolean'].includes(dataType);
  // Bit seçeneği sadece boolean için gösterilsin
  const showBitOption = dataType === 'boolean';

  return (
    isLoading ? <div>
      <Spinner variant='bars' fullPage />
    </div> :
      <Modal isOpen={isOpen} onClose={handleCancel} className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <Typography variant="h4">{isEditMode ? 'Edit Register' : 'Add Register'}</Typography>
          
          {/* General Settings Group */}
          <div className="mt-6">
            <Typography variant="h6" className="mb-4 text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 pb-2">
              General Settings
            </Typography>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
              <div className="grid gap-2">
                <Label htmlFor="label">Label</Label>
                <Input
                  id="label"
                  value={label}
                  required
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Register Label"
                  className="text-black dark:text-white"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="registerType">Register Type <span className="text-red-500">*</span></Label>
                <select
                  id="registerType"
                  value={registerType}
                  onChange={(e) => setRegisterType(e.target.value as 'read' | 'write' | 'readwrite')}
                  className="h-11 w-full appearance-none rounded-lg border border-gray-300 px-4 py-2.5 pr-11 text-sm shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                >
                  <option value="read">Read Holding Register</option>
                  <option value="write">Write Holding Register</option>
                  <option value="readwrite">Read/Write Holding Register</option>
                </select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="analyzer">
                  Analyzer <span className="text-red-500">*</span>
                </Label>
                <select
                  id="analyzer"
                  className={`h-11 w-full appearance-none rounded-lg border ${!analyzer ? 'border-red-500' : 'border-gray-300'} px-4 py-2.5 pr-11 text-sm shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800`}
                  value={analyzer}
                  onChange={(e) => setAnalyzer(e.target.value)}
                  required
                >
                  <option value="" disabled>Select Analyzer</option>
                  {analyzers.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                {!analyzer && (
                  <p className="text-sm text-red-500 mt-1">Please select an analyzer</p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="address">
                  {registerType === 'readwrite' ? 'Write Address' : 'Address'}
                </Label>
                <Input
                  id="address"
                  type="text"
                  value={address}
                  onChange={(e) => {
                    // Allow only numeric values
                    const numericValue = e.target.value.replace(/[^0-9]/g, '');
                    setAddress(numericValue ? parseInt(numericValue) : "");
                  }}
                  placeholder={registerType === 'readwrite' ? 'Write Register Address' : 'Register Address'}
                  className="text-black dark:text-white"
                />
              </div>

              {/* Read Address - show only for readwrite */}
              {registerType === 'readwrite' && (
                <div className="grid gap-2">
                  <Label htmlFor="readAddress">Read Address</Label>
                  <Input
                    id="readAddress"
                    type="text"
                    value={readAddress}
                    onChange={(e) => {
                      // Allow only numeric values
                      const numericValue = e.target.value.replace(/[^0-9]/g, '');
                      setReadAddress(numericValue ? parseInt(numericValue) : "");
                    }}
                    placeholder="Read Register Address"
                    className="text-black dark:text-white"
                  />
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="dataType">Data Type</Label>
                <select
                  id="dataType"
                  value={dataType}
                  onChange={(e) => setDataType(e.target.value)}
                  className="text-black dark:text-white flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>option]:bg-white dark:[&>option]:bg-slate-800 dark:[&>option]:text-white"
                >
                  {dataTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Display Mode - show only for read register */}
              {registerType === 'read' && (
                <div className="grid gap-2">
                  <Label htmlFor="displayMode">Display Mode</Label>
                  <select
                    id="displayMode"
                    value={displayMode}
                    onChange={(e) => setDisplayMode(e.target.value as 'digit' | 'graph')}
                    className="h-11 w-full appearance-none rounded-lg border border-gray-300 px-4 py-2.5 pr-11 text-sm shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                  >
                    <option value="digit">Digit</option>
                    <option value="graph">Graph</option>
                  </select>
                </div>
              )}

              {showByteOrderOption && (
                <div className="grid gap-2">
                  <Label htmlFor="byteOrder">Byte Order</Label>
                  <select
                    id="byteOrder"
                    value={byteOrder}
                    onChange={(e) => setByteOrder(e.target.value)}
                    className="text-black dark:text-white flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>option]:bg-white dark:[&>option]:bg-slate-800 dark:[&>option]:text-white"
                  >
                    {byteOrderOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {showBitOption && (
                <div className="grid gap-2">
                  <Label htmlFor="bit">Bit <span className="text-red-500">*</span></Label>
                  <Input
                    id="bit"
                    type="number"
                    min="0"
                    max="63"
                    value={bit < 0 ? "" : bit}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === "") {
                        setBit(-1);
                      } else {
                        const numValue = parseInt(value);
                        if (numValue >= 0 && numValue <= 63) {
                          setBit(numValue);
                        }
                      }
                    }}
                    placeholder="Bit (0-63)"
                    className="text-black dark:text-white"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Boolean Icons Section - show only for boolean data type */}
          {dataType === 'boolean' && (
            <div className="mt-6">
              <Typography variant="h6" className="mb-4 text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 pb-2">
                Boolean Icons
              </Typography>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* ON Icon Upload */}
                <div className="grid gap-2">
                  <Label htmlFor="onIcon">ON Icon</Label>
                  <div className="flex gap-2">
                    <div className="relative w-20 h-20 border-dashed border-2 border-gray-300 rounded-md flex items-center justify-center">
                      {onIconPreview ? (
                        <div className="relative w-full h-full">
                          <Image
                            src={onIconPreview}
                            alt="ON Icon"
                            className="max-w-full max-h-full p-1 object-contain"
                            fill
                            priority
                            onError={(e) => {
                              console.error('ON Icon load error:', onIconPreview);
                              console.error('Error details:', e);
                            }}
                          />
                        </div>
                      ) : (
                        <Typography className="text-sm text-gray-500">
                          Icon
                        </Typography>
                      )}
                      {uploadStatus.loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-md z-10">
                          <Typography className="text-sm text-white">
                            Uploading...
                          </Typography>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col justify-center gap-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onIconInputRef.current?.click()}
                      >
                        Select Icon
                      </Button>
                      {onIconPreview && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={async () => {
                            console.log('Delete ON icon button clicked, onIcon:', onIcon);
                            // If icon file exists, delete from uploads
                            if (onIcon) {
                              try {
                                const filename = onIcon.split('/').pop();
                                console.log('Deleting ON icon filename:', filename);
                                const deleteResponse = await fetch('/api/upload', {
                                  method: 'DELETE',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ filePath: filename })
                                });
                                console.log('Delete response status:', deleteResponse.status);
                                if (!deleteResponse.ok) {
                                  throw new Error('Failed to delete ON icon');
                                }
                                console.log('ON icon deleted from uploads:', onIcon);
                              } catch (error) {
                                console.error('Error deleting ON icon:', error);
                                showToast('Failed to delete ON icon', 'error');
                                return;
                              }
                            }
                            setOnIcon('');
                            setOnIconPreview('');
                            showToast('ON icon deleted successfully', 'success');
                          }}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                    <input
                      type="file"
                      ref={onIconInputRef}
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleOnIconChange}
                    />
                  </div>
                  <Typography className="text-sm text-gray-500">
                    Icon to be displayed in Boolean &quot;ON&quot; state
                  </Typography>
                </div>

                {/* OFF Icon Upload */}
                <div className="grid gap-2">
                  <Label htmlFor="offIcon">OFF Icon</Label>
                  <div className="flex gap-2">
                    <div className="relative w-20 h-20 border-dashed border-2 border-gray-300 rounded-md flex items-center justify-center">
                      {offIconPreview ? (
                        <div className="relative w-full h-full">
                          <Image
                            src={offIconPreview}
                            alt="OFF Icon"
                            className="max-w-full max-h-full p-1 object-contain"
                            fill
                            priority
                            onError={(e) => {
                              console.error('OFF Icon load error:', offIconPreview);
                              console.error('Error details:', e);
                            }}
                          />
                        </div>
                      ) : (
                        <Typography className="text-sm text-gray-500">
                          Icon
                        </Typography>
                      )}
                      {uploadStatus.loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-md z-10">
                          <Typography className="text-sm text-white">
                            Loading...
                          </Typography>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col justify-center gap-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => offIconInputRef.current?.click()}
                      >
                        Select Icon
                      </Button>
                      {offIconPreview && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={async () => {
                            console.log('Delete OFF icon button clicked, offIcon:', offIcon);
                            // If icon file exists, delete from uploads
                            if (offIcon) {
                              try {
                                const filename = offIcon.split('/').pop();
                                console.log('Deleting OFF icon filename:', filename);
                                const deleteResponse = await fetch('/api/upload', {
                                  method: 'DELETE',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ filePath: filename })
                                });
                                console.log('Delete response status:', deleteResponse.status);
                                if (!deleteResponse.ok) {
                                  throw new Error('Failed to delete OFF icon');
                                }
                                console.log('OFF icon deleted from uploads:', offIcon);
                              } catch (error) {
                                console.error('Error deleting OFF icon:', error);
                                showToast('Failed to delete OFF icon', 'error');
                                return;
                              }
                            }
                            setOffIcon('');
                            setOffIconPreview('');
                            showToast('OFF icon deleted successfully', 'success');
                          }}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                    <input
                      type="file"
                      ref={offIconInputRef}
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleOffIconChange}
                    />
                  </div>
                  <Typography className="text-sm text-gray-500">
                    Icon to be displayed in Boolean &quot;OFF&quot; state
                  </Typography>
                </div>
              </div>
            </div>
          )}

          {/* Write Settings Group */}
          {(registerType === 'write' || registerType === 'readwrite') && (
            <div className="mt-6">
              <Typography variant="h6" className="mb-4 text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 pb-2">
                Write Settings
              </Typography>
              <div className="space-y-4">
                      
                      {/* Control Type Selection */}
                      <div className="grid gap-2 mb-4">
                        <Label htmlFor="controlType">Control Type <span className="text-red-500">*</span></Label>
                        <select
                          id="controlType"
                          value={controlType}
                          onChange={(e) => setControlType(e.target.value as 'numeric' | 'boolean' | 'dropdown')}
                          className="h-11 w-full appearance-none rounded-lg border border-gray-300 px-4 py-2.5 pr-11 text-sm shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                        >
                          <option value="numeric">Numeric Input</option>
                          <option value="boolean">Boolean Toggle</option>
                          <option value="dropdown">Dropdown Selection</option>
                          <option value="manual">Manual Input</option>
                        </select>
                      </div>

                      {/* Numeric Control Settings */}
                      {controlType === 'numeric' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="writeValue">Default Write Value</Label>
                            <Input
                              id="writeValue"
                              type="number"
                              value={writeValue}
                              onChange={(e) => setWriteValue(e.target.value)}
                              placeholder="Default value"
                              className="text-black dark:text-white"
                            />
                          </div>

                          <div className="grid gap-2">
                            <Label htmlFor="stepValue">Step Value</Label>
                            <Input
                              id="stepValue"
                              type="number"
                              step="0.1"
                              min="0.1"
                              value={stepValue}
                              onChange={(e) => setStepValue(e.target.value ? Number(e.target.value) : 1)}
                              placeholder="Step increment (e.g., 0.5)"
                              className="text-black dark:text-white"
                            />
                          </div>

                          <div className="grid gap-2">
                            <Label htmlFor="minValue">Min Value (Optional)</Label>
                            <Input
                              id="minValue"
                              type="number"
                              value={minValue}
                              onChange={(e) => setMinValue(e.target.value ? Number(e.target.value) : '')}
                              placeholder="Minimum value"
                              className="text-black dark:text-white"
                            />
                          </div>

                          <div className="grid gap-2">
                            <Label htmlFor="maxValue">Max Value (Optional)</Label>
                            <Input
                              id="maxValue"
                              type="number"
                              value={maxValue}
                              onChange={(e) => setMaxValue(e.target.value ? Number(e.target.value) : '')}
                              placeholder="Maximum value"
                              className="text-black dark:text-white"
                            />
                          </div>
                        </div>
                      )}

                      {/* Boolean Control Settings */}
                      {controlType === 'boolean' && (
                        <div className="space-y-4">
                          {/* ON/OFF Values */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="grid gap-2">
                              <Label htmlFor="onValue">ON Value</Label>
                              <Input
                                id="onValue"
                                type="text"
                                value={onValue}
                                onChange={(e) => setOnValue(e.target.value)}
                                placeholder="Value for ON state (e.g., 1)"
                                className="text-black dark:text-white"
                              />
                            </div>

                            <div className="grid gap-2">
                              <Label htmlFor="offValue">OFF Value</Label>
                              <Input
                                id="offValue"
                                type="text"
                                value={offValue}
                                onChange={(e) => setOffValue(e.target.value)}
                                placeholder="Value for OFF state (e.g., 0)"
                                className="text-black dark:text-white"
                              />
                            </div>
                          </div>

                          {/* Boolean Icons */}
                          <div className="grid grid-cols-2 gap-4">
                            {/* ON Icon Upload */}
                            <div className="grid gap-2">
                              <Label htmlFor="writeOnIcon">ON Icon</Label>
                              <div className="flex gap-2">
                                <div className="relative w-20 h-20 border-dashed border-2 border-gray-300 rounded-md flex items-center justify-center">
                                  {writeOnIconPreview ? (
                                    <div className="relative w-full h-full">
                                      <Image
                                        src={writeOnIconPreview}
                                        alt="Write ON Icon"
                                        className="max-w-full max-h-full p-1 object-contain"
                                        fill
                                        priority
                                        onError={(e) => {
                                          console.error('Write ON Icon load error:', writeOnIconPreview);
                                          console.error('Error details:', e);
                                        }}
                                      />
                                    </div>
                                  ) : (
                                    <Typography className="text-sm text-gray-500">
                                      Icon
                                    </Typography>
                                  )}
                                  {uploadStatus.loading && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-md z-10">
                                      <Typography className="text-sm text-white">
                                        Uploading...
                                      </Typography>
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-col justify-center gap-1">
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => {
                                      const input = document.createElement('input');
                                      input.type = 'file';
                                      input.accept = 'image/*';
                                      input.onchange = (e) => handleWriteOnIconChange(e as any);
                                      input.click();
                                    }}
                                  >
                                    Select Icon
                                  </Button>
                                  {writeOnIconPreview && (
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={async () => {
                                        console.log('Delete Write ON icon button clicked, writeOnIcon:', writeOnIcon);
                                        if (writeOnIcon) {
                                          try {
                                            const filename = writeOnIcon.split('/').pop();
                                            console.log('Deleting Write ON icon filename:', filename);
                                            const deleteResponse = await fetch('/api/upload', {
                                              method: 'DELETE',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({ filePath: filename })
                                            });
                                            console.log('Delete response status:', deleteResponse.status);
                                            if (!deleteResponse.ok) {
                                              throw new Error('Failed to delete Write ON icon');
                                            }
                                            console.log('Write ON icon deleted from uploads:', writeOnIcon);
                                          } catch (error) {
                                            console.error('Error deleting write ON icon:', error);
                                            showToast('Failed to delete Write ON icon', 'error');
                                            return;
                                          }
                                        }
                                        setWriteOnIcon('');
                                        setWriteOnIconPreview('');
                                        showToast('Write ON icon deleted successfully', 'success');
                                      }}
                                    >
                                      Delete
                                    </Button>
                                  )}
                                </div>
                              </div>
                              <Typography className="text-sm text-gray-500">
                                Icon to be displayed in Boolean &quot;ON&quot; state
                              </Typography>
                            </div>

                            {/* OFF Icon Upload */}
                            <div className="grid gap-2">
                              <Label htmlFor="writeOffIcon">OFF Icon</Label>
                              <div className="flex gap-2">
                                <div className="relative w-20 h-20 border-dashed border-2 border-gray-300 rounded-md flex items-center justify-center">
                                  {writeOffIconPreview ? (
                                    <div className="relative w-full h-full">
                                      <Image
                                        src={writeOffIconPreview}
                                        alt="Write OFF Icon"
                                        className="max-w-full max-h-full p-1 object-contain"
                                        fill
                                        priority
                                        onError={(e) => {
                                          console.error('Write OFF Icon load error:', writeOffIconPreview);
                                          console.error('Error details:', e);
                                        }}
                                      />
                                    </div>
                                  ) : (
                                    <Typography className="text-sm text-gray-500">
                                      Icon
                                    </Typography>
                                  )}
                                  {uploadStatus.loading && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-md z-10">
                                      <Typography className="text-sm text-white">
                                        Loading...
                                      </Typography>
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-col justify-center gap-1">
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => {
                                      const input = document.createElement('input');
                                      input.type = 'file';
                                      input.accept = 'image/*';
                                      input.onchange = (e) => handleWriteOffIconChange(e as any);
                                      input.click();
                                    }}
                                  >
                                    Select Icon
                                  </Button>
                                  {writeOffIconPreview && (
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={async () => {
                                        console.log('Delete Write OFF icon button clicked, writeOffIcon:', writeOffIcon);
                                        if (writeOffIcon) {
                                          try {
                                            const filename = writeOffIcon.split('/').pop();
                                            console.log('Deleting Write OFF icon filename:', filename);
                                            const deleteResponse = await fetch('/api/upload', {
                                              method: 'DELETE',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({ filePath: filename })
                                            });
                                            console.log('Delete response status:', deleteResponse.status);
                                            if (!deleteResponse.ok) {
                                              throw new Error('Failed to delete Write OFF icon');
                                            }
                                            console.log('Write OFF icon deleted from uploads:', writeOffIcon);
                                          } catch (error) {
                                            console.error('Error deleting write OFF icon:', error);
                                            showToast('Failed to delete Write OFF icon', 'error');
                                            return;
                                          }
                                        }
                                        setWriteOffIcon('');
                                        setWriteOffIconPreview('');
                                        showToast('Write OFF icon deleted successfully', 'success');
                                      }}
                                    >
                                      Delete
                                    </Button>
                                  )}
                                </div>
                              </div>
                              <Typography className="text-sm text-gray-500">
                                Icon to be displayed in Boolean &quot;OFF&quot; state
                              </Typography>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Dropdown Control Settings */}
                      {controlType === 'dropdown' && (
                        <div className="grid gap-2">
                          <Label>Dropdown Options</Label>
                          <div className="space-y-2">
                            {dropdownOptions.map((option, index) => (
                              <div key={index} className="flex gap-2 items-center">
                                <Input
                                  type="text"
                                  value={option.label}
                                  onChange={(e) => {
                                    const newOptions = [...dropdownOptions];
                                    newOptions[index].label = e.target.value;
                                    setDropdownOptions(newOptions);
                                  }}
                                  placeholder="Option label"
                                  className="flex-1 text-black dark:text-white"
                                />
                                <Input
                                  type="text"
                                  value={option.value}
                                  onChange={(e) => {
                                    const newOptions = [...dropdownOptions];
                                    newOptions[index].value = e.target.value;
                                    setDropdownOptions(newOptions);
                                  }}
                                  placeholder="Value"
                                  className="w-24 text-black dark:text-white"
                                />
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => {
                                    const newOptions = dropdownOptions.filter((_, i) => i !== index);
                                    setDropdownOptions(newOptions);
                                  }}
                                  disabled={dropdownOptions.length <= 1}
                                >
                                  Remove
                                </Button>
                              </div>
                            ))}
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setDropdownOptions([...dropdownOptions, { label: `Option ${dropdownOptions.length + 1}`, value: dropdownOptions.length + 1 }]);
                              }}
                            >
                              Add Option
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Manual Input Control Settings */}
                      {controlType === 'manual' && (
                        <div className="grid grid-cols-1 gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="placeholder">Input Placeholder</Label>
                            <Input
                              id="placeholder"
                              type="text"
                              value={placeholder}
                              onChange={(e) => setPlaceholder(e.target.value)}
                              placeholder="e.g., Enter CT ratio value"
                              className="text-black dark:text-white"
                            />
                          </div>

                          <div className="grid gap-2">
                            <Label htmlFor="infoText">Info Text (Optional)</Label>
                            <Input
                              id="infoText"
                              type="text"
                              value={infoText}
                              onChange={(e) => setInfoText(e.target.value)}
                              placeholder="e.g., Valid range: 1-32767"
                              className="text-black dark:text-white"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                              <Label htmlFor="minValue">Min Value (Optional)</Label>
                              <Input
                                id="minValue"
                                type="number"
                                value={minValue}
                                onChange={(e) => setMinValue(e.target.value ? Number(e.target.value) : '')}
                                placeholder="Minimum value"
                                className="text-black dark:text-white"
                              />
                            </div>

                            <div className="grid gap-2">
                              <Label htmlFor="maxValue">Max Value (Optional)</Label>
                              <Input
                                id="maxValue"
                                type="number"
                                value={maxValue}
                                onChange={(e) => setMaxValue(e.target.value ? Number(e.target.value) : '')}
                                placeholder="Maximum value"
                                className="text-black dark:text-white"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Write Permission */}
                      <div className="grid gap-2 mt-4">
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="writePermission"
                            checked={writePermission}
                            onChange={(e) => setWritePermission(e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                          />
                          <Label htmlFor="writePermission">Enable Write Permission</Label>
                        </div>
                        <Typography className="text-sm text-gray-500">
                          When disabled, this register will be read-only even if it&apos;s configured as writable
                        </Typography>
                      </div>
             </div>
           </div>
         )}

         {/* Scale Settings Group - show only for non-boolean data types */}
         {dataType !== 'boolean' && (displayMode === 'digit') && (
           <div className="mt-6">
             <Typography variant="h6" className="mb-4 text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 pb-2">
               Scale Settings
             </Typography>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div className="grid gap-2">
                 <Label htmlFor="scale">Scale (Gain)</Label>
                 <div className="relative">
                   <NumericFormat
                     id="scale"
                     value={scale}
                     onValueChange={(values: { floatValue?: number }) => {
                       const { floatValue } = values;
                       setScale(floatValue || 0);
                     }}
                     decimalScale={4}
                     fixedDecimalScale={false}
                     allowNegative={false}
                     thousandSeparator={false}
                     decimalSeparator="."
                     placeholder="Scale Factor (e.g., 0.1)"
                     className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
                   />
                 </div>
               </div>

               <div className="grid gap-2">
                 <Label htmlFor="scale-unit">Unit</Label>
                 <Input
                   id="scale-unit"
                   value={scaleUnit}
                   onChange={(e) => setScaleUnit(e.target.value)}
                   placeholder="°C, KWh, etc."
                   className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
                 />
               </div>

               <div className="grid gap-2">
                 <Label htmlFor="offsetValue">Offset</Label>
                 <div className="relative">
                   <NumericFormat
                     id="offsetValue"
                     value={offsetValue}
                     onValueChange={(values: { floatValue?: number }) => {
                       const { floatValue } = values;
                       setOffsetValue(floatValue || 0);
                     }}
                     decimalScale={4}
                     fixedDecimalScale={false}
                     allowNegative={true}
                     thousandSeparator={false}
                     decimalSeparator="."
                     placeholder="Offset value (e.g., 0)"
                     className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
                   />
                 </div>
                 <Typography className="text-xs text-gray-500">
                   Formula: (Raw Value + Offset) × Scale
                 </Typography>
               </div>

               <div className="grid gap-2">
                 <Label htmlFor="decimalPlaces">Decimal Places</Label>
                 <Input
                   id="decimalPlaces"
                   type="number"
                   min="0"
                   max="6"
                   value={decimalPlaces}
                   onChange={(e) => {
                     const value = parseInt(e.target.value);
                     if (value >= 0 && value <= 6) {
                       setDecimalPlaces(value);
                     }
                   }}
                   placeholder="Decimal places (0-6)"
                   className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
                 />
                 <Typography className="text-xs text-gray-500">
                   Number of decimal places to display
                 </Typography>
               </div>
             </div>
           </div>
         )}

         {/* Appearance Settings Group */}
         <div className="mt-6">
           <Typography variant="h6" className="mb-4 text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 pb-2">
             Appearance Settings
           </Typography>
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
               <Input
                 id="textColor"
                 type="color"
                 value={textColor}
                 onChange={(e) => setTextColor(e.target.value)}
                 className="w-full h-10 p-1"
               />
             </div>

             <div className="grid gap-2">
               <Label htmlFor="backgroundColor">Background Color</Label>
               <Input
                 id="backgroundColor"
                 type="color"
                 value={backgroundColor}
                 onChange={(e) => setBackgroundColor(e.target.value)}
                 className="w-full h-10 p-1"
               />
             </div>

             <div className="grid gap-2 col-span-full">
               <Label htmlFor="opacity">Background Opacity</Label>
               <div className="flex items-center gap-2">
                 <Slider
                   id="opacity"
                   min={0}
                   max={100}
                   value={opacity}
                   onChange={setOpacity}
                   className="flex-1"
                 />
                 <span className="w-16 text-center text-black dark:text-white">{opacity}%</span>
               </div>
             </div>

             <div className="grid gap-2">
               <Label htmlFor="width">Width</Label>
               <NumericFormat
                 id="width"
                 value={width}
                 onValueChange={(values: { floatValue?: number }) => {
                   const { floatValue } = values;
                   setWidth(floatValue || 0);
                 }}
                 decimalScale={0}
                 fixedDecimalScale={false}
                 allowNegative={false}
                 thousandSeparator={false}
                 decimalSeparator="."
                 placeholder="Width"
                 className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
               />
             </div>

             <div className="grid gap-2">
               <Label htmlFor="height">Height</Label>
               <NumericFormat
                 id="height"
                 value={height}
                 onValueChange={(values: { floatValue?: number }) => {
                   const { floatValue } = values;
                   setHeight(floatValue || 0);
                 }}
                 decimalScale={0}
                 fixedDecimalScale={false}
                 allowNegative={false}
                 thousandSeparator={false}
                 decimalSeparator="."
                 placeholder="Height"
                 className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
               />
             </div>
           </div>
         </div>

         {/* Graph Mode Settings - show only for graph mode */}
         {displayMode === 'graph' && (
           <div className="mt-6">
             <Typography variant="h6" className="mb-4 text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 pb-2">
               Graph Settings
             </Typography>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
               <div className="grid gap-2">
                 <Label htmlFor="scale">Scale</Label>
                 <NumericFormat
                   id="scale"
                   value={scale}
                   onValueChange={(values: { floatValue?: number }) => {
                     const { floatValue } = values;
                     setScale(floatValue || 0);
                   }}
                   decimalScale={4}
                   fixedDecimalScale={false}
                   allowNegative={false}
                   thousandSeparator={false}
                   decimalSeparator="."
                   placeholder="Scale Factor"
                   className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
                 />
               </div>

               <div className="grid gap-2">
                 <Label htmlFor="width">Width</Label>
                 <NumericFormat
                   id="width"
                   value={width}
                   onValueChange={(values: { floatValue?: number }) => {
                     const { floatValue } = values;
                     setWidth(floatValue || 0);
                   }}
                   decimalScale={0}
                   fixedDecimalScale={false}
                   allowNegative={false}
                   thousandSeparator={false}
                   decimalSeparator="."
                   placeholder="Width"
                   className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
                 />
               </div>

               <div className="grid gap-2">
                 <Label htmlFor="height">Height</Label>
                 <NumericFormat
                   id="height"
                   value={height}
                   onValueChange={(values: { floatValue?: number }) => {
                     const { floatValue } = values;
                     setHeight(floatValue || 0);
                   }}
                   decimalScale={0}
                   fixedDecimalScale={false}
                   allowNegative={false}
                   thousandSeparator={false}
                   decimalSeparator="."
                   placeholder="Height"
                   className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
                 />
               </div>
             </div>
           </div>
         )}

         {/* Action Buttons */}
         <div className="flex justify-end gap-2 mt-8">
           <Button variant="secondary" onClick={handleCancel}>Cancel</Button>
           <Button onClick={handleConfirm}>{isEditMode ? 'Update' : 'Add'}</Button>
         </div>
       </div>
     </Modal>
  );
};

export default RegisterModal;