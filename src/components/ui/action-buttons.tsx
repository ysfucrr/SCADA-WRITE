"use client"
import React from 'react';
// @ts-ignore
import { Pencil, Save, Trash2, Plus, Minus, X } from 'lucide-react';
import { IconButton } from './icon-button';

interface ActionButtonProps {
  onClick?: (e?: React.MouseEvent) => void;
  size?: 'sm' | 'md' | 'lg';
  shape?: 'circle' | 'square' | 'rounded';
  className?: string;
  disabled?: boolean;
}

export const EditButton: React.FC<ActionButtonProps> = ({
  onClick,
  size = 'md',
  shape = 'circle',
  className = '',
  disabled = false,
}) => {
  return (
    <IconButton
      icon={<Pencil size={size === 'sm' ? 16 : size === 'md' ? 20 : 24} />}
      onClick={onClick}
      variant="primary"
      size={size}
      shape={shape}
      className={className}
      title="Edit"
      disabled={disabled}
    />
  );
};

export const DeleteButton: React.FC<ActionButtonProps> = ({
  onClick,
  size = 'md',
  shape = 'circle',
  className = '',
  disabled = false,
}) => {
  return (
    <IconButton
      icon={<Trash2 size={size === 'sm' ? 16 : size === 'md' ? 20 : 24} />}
      onClick={onClick}
      variant="error"
      size={size}
      shape={shape}
      className={className}
      title="Delete"
      disabled={disabled}
    />
  );
};

export const SaveButton: React.FC<ActionButtonProps> = ({
  onClick,
  size = 'md',
  shape = 'circle',
  className = '',
  disabled = false,
}) => {
  return (
    <IconButton
      icon={<Save size={size === 'sm' ? 16 : size === 'md' ? 20 : 24} />}
      onClick={onClick}
      variant="success"
      size={size}
      shape={shape}
      className={className}
      title="Save"
      disabled={disabled}
    />
  );
};

export const AddButton: React.FC<ActionButtonProps> = ({
  onClick,
  size = 'md',
  shape = 'circle',
  className = '',
  disabled = false,
}) => {
  return (
    <IconButton
      icon={<Plus size={size === 'sm' ? 16 : size === 'md' ? 20 : 24} />}
      onClick={onClick}
      variant="primary"
      size={size}
      shape={shape}
      className={className}
      title="Add"
      disabled={disabled}
    />
  );
};

export const RemoveButton: React.FC<ActionButtonProps> = ({
  onClick,
  size = 'md',
  shape = 'circle',
  className = '',
  disabled = false,
}) => {
  return (
    <IconButton
      icon={<Minus size={size === 'sm' ? 16 : size === 'md' ? 20 : 24} />}
      onClick={onClick}
      variant="error"
      size={size}
      shape={shape}
      className={className}
      title="Remove"
      disabled={disabled}
    />
  );
};

export const CloseButton: React.FC<ActionButtonProps> = ({
  onClick,
  size = 'md',
  shape = 'circle',
  className = '',
  disabled = false,
}) => {
  return (
    <IconButton
      icon={<X size={size === 'sm' ? 16 : size === 'md' ? 20 : 24} />}
      onClick={onClick}
      variant="secondary"
      size={size}
      shape={shape}
      className={className}
      title="Close"
      disabled={disabled}
    />
  );
};
