"use client"
import React from 'react';
// @ts-ignore
import { LucideIcon } from 'lucide-react';

interface IconButtonProps {
  icon: React.ReactNode;
  onClick?: (e?: React.MouseEvent) => void;
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'ghost' | 'gray';
  size?: 'sm' | 'md' | 'lg';
  shape?: 'circle' | 'square' | 'rounded';
  className?: string;
  title?: string;
  disabled?: boolean;
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'error';
}

const IconButton: React.FC<IconButtonProps> = ({
  icon,
  onClick,
  variant = 'primary',
  size = 'md',
  shape = 'circle',
  className = '',
  title,
  disabled = false,
  color,
}) => {
  // Size mapping
  const sizeClasses = {
    sm: 'p-1',
    md: 'p-2',
    lg: 'p-3',
  };
  
  // Shape mapping
  const shapeClasses = {
    circle: 'rounded-full',
    square: 'rounded-none',
    rounded: 'rounded-md',
  };

  // Icon size mapping
  const iconSizes = {
    sm: 16,
    md: 20,
    lg: 24,
  };

  // Color variants using CSS variables defined in globals.css
  const variantMap = {
    primary: "bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-600)] text-[var(--color-white)] focus:ring-[var(--color-brand-300)] dark:bg-[var(--color-brand-600)] dark:hover:bg-[var(--color-brand-700)] dark:focus:ring-[var(--color-brand-400)]",
    secondary: "bg-[var(--color-gray-200)] hover:bg-[var(--color-gray-300)] text-[var(--color-gray-700)] focus:ring-[var(--color-gray-300)] dark:bg-[var(--color-gray-700)] dark:hover:bg-[var(--color-gray-600)] dark:text-[var(--color-gray-200)] dark:focus:ring-[var(--color-gray-600)]",
    success: "bg-[var(--color-success-500)] hover:bg-[var(--color-success-600)] text-[var(--color-white)] focus:ring-[var(--color-success-300)] dark:bg-[var(--color-success-600)] dark:hover:bg-[var(--color-success-700)] dark:focus:ring-[var(--color-success-400)]",
    warning: "bg-[var(--color-warning-500)] hover:bg-[var(--color-warning-600)] text-[var(--color-white)] focus:ring-[var(--color-warning-300)] dark:bg-[var(--color-warning-600)] dark:hover:bg-[var(--color-warning-700)] dark:focus:ring-[var(--color-warning-400)]",
    error: "bg-[var(--color-error-500)] hover:bg-[var(--color-error-600)] text-[var(--color-white)] focus:ring-[var(--color-error-300)] dark:bg-[var(--color-error-600)] dark:hover:bg-[var(--color-error-700)] dark:focus:ring-[var(--color-error-400)]",
    gray: "bg-[var(--color-gray-100)] hover:bg-[var(--color-gray-200)] text-[var(--color-gray-800)] focus:ring-[var(--color-gray-200)] dark:bg-[var(--color-gray-800)] dark:hover:bg-[var(--color-gray-700)] dark:text-[var(--color-gray-200)] dark:focus:ring-[var(--color-gray-700)]",
    ghost: "bg-transparent hover:bg-[var(--color-gray-100)] text-[var(--color-gray-600)] dark:hover:bg-[var(--color-gray-800)] dark:text-[var(--color-gray-300)]"
  };

  // Eğer color belirtilmişse ve variant ghost ise, o rengin ghost stilini uygula
  let variantClass = variantMap[variant];
  
  if (variant === 'ghost' && color) {
    const colorClasses = {
      primary: "text-[var(--color-brand-600)] hover:bg-[var(--color-gray-100)] hover:text-[var(--color-brand-700)] dark:text-[var(--color-brand-400)] dark:hover:bg-[var(--color-gray-800)] dark:hover:text-[var(--color-brand-300)]",
      secondary: "text-[var(--color-gray-600)] hover:bg-[var(--color-gray-100)] hover:text-[var(--color-gray-800)] dark:text-[var(--color-gray-400)] dark:hover:bg-[var(--color-gray-800)] dark:hover:text-[var(--color-gray-300)]",
      success: "text-[var(--color-success-600)] hover:bg-[var(--color-gray-100)] hover:text-[var(--color-success-700)] dark:text-[var(--color-success-400)] dark:hover:bg-[var(--color-gray-800)] dark:hover:text-[var(--color-success-300)]",
      warning: "text-[var(--color-warning-600)] hover:bg-[var(--color-gray-100)] hover:text-[var(--color-warning-700)] dark:text-[var(--color-warning-400)] dark:hover:bg-[var(--color-gray-800)] dark:hover:text-[var(--color-warning-300)]",
      error: "text-[var(--color-error-600)] hover:bg-[var(--color-gray-100)] hover:text-[var(--color-error-700)] dark:text-[var(--color-error-400)] dark:hover:bg-[var(--color-gray-800)] dark:hover:text-[var(--color-error-300)]",
    };
    variantClass = colorClasses[color] || variantClass;
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault(); // Form submit'i önlemek için preventDefault eklendi
        onClick?.(e); // Event nesnesini onClick fonksiyonuna iletiyoruz
      }}
      disabled={disabled}
      title={title}
      className={`${shapeClasses[shape]} transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-900 ${variantClass} ${sizeClasses[size]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      {icon}
    </button>
  );
};

export { IconButton };
export default IconButton;
