"use client";

import { memo } from 'react';
import { NodeProps } from 'reactflow';
import RegisterNode from './RegisterNode';
import WriteRegisterNode from './WriteRegisterNode';
import ReadWriteRegisterNode from './ReadWriteRegisterNode';

// Union type for all possible register node data
type AllRegisterNodeData = {
  registerType?: 'read' | 'write' | 'readwrite';
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
  analyzerId?: string | number;
  displayMode?: 'digit' | 'graph';
  writeValue?: number | string;
  minValue?: number;
  maxValue?: number;
  writePermission?: boolean;
  readAddress?: number;
  controlType?: 'numeric' | 'boolean' | 'dropdown';
  onValue?: number | string;
  offValue?: number | string;
  dropdownOptions?: Array<{label: string, value: number | string}>;
  onIcon?: string;
  offIcon?: string;
  onEdit?: () => void;
  onDelete?: () => void;
};

const RegisterNodeFactory = memo((props: NodeProps<AllRegisterNodeData>) => {
  const { registerType = 'read' } = props.data;

  switch (registerType) {
    case 'write':
      return <WriteRegisterNode {...(props as any)} />;
    case 'readwrite':
      return <ReadWriteRegisterNode {...(props as any)} />;
    case 'read':
    default:
      return <RegisterNode {...(props as any)} />;
  }
});

RegisterNodeFactory.displayName = 'RegisterNodeFactory';

export default RegisterNodeFactory;