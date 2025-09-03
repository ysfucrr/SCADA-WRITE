"use client"

import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'error';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      className = '',
      ...props
    },
    ref
  ) => {
    // Base styles
    const baseStyles = 'cursor-pointer inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
    
    // Size styles
    const sizeStyles = {
      sm: 'h-9 px-3 text-sm',
      md: 'h-10 px-4 py-2',
      lg: 'h-11 px-6 text-lg',
    };
    
    // Variant styles using CSS variables from globals.css
    const variantStyles = {
      primary: 'bg-[var(--color-brand-600)] dark:bg-[var(--color-brand-500)] text-[var(--color-white)] hover:bg-[var(--color-brand-700)] dark:hover:bg-[var(--color-brand-600)] focus-visible:ring-[var(--color-brand-400)] dark:focus-visible:ring-[var(--color-brand-300)]',
      secondary: 'bg-[var(--color-gray-600)] dark:bg-[var(--color-gray-500)] text-[var(--color-white)] hover:bg-[var(--color-gray-700)] dark:hover:bg-[var(--color-gray-600)] focus-visible:ring-[var(--color-gray-400)] dark:focus-visible:ring-[var(--color-gray-300)]',
      success: 'bg-[var(--color-success-600)] dark:bg-[var(--color-success-500)] text-[var(--color-white)] hover:bg-[var(--color-success-700)] dark:hover:bg-[var(--color-success-600)] focus-visible:ring-[var(--color-success-400)] dark:focus-visible:ring-[var(--color-success-300)]',
      warning: 'bg-[var(--color-warning-500)] dark:bg-[var(--color-warning-400)] text-[var(--color-black)] dark:text-[var(--color-black)] hover:bg-[var(--color-warning-600)] dark:hover:bg-[var(--color-warning-500)] focus-visible:ring-[var(--color-warning-400)] dark:focus-visible:ring-[var(--color-warning-300)]',
      error: 'bg-[var(--color-error-600)] dark:bg-[var(--color-error-500)] text-[var(--color-white)] hover:bg-[var(--color-error-700)] dark:hover:bg-[var(--color-error-600)] focus-visible:ring-[var(--color-error-400)] dark:focus-visible:ring-[var(--color-error-300)]',
    };
    
    // Width style
    const widthStyle = fullWidth ? 'w-full' : '';
    
    // Loading state
    const loadingState = isLoading ? 'relative text-transparent transition-none hover:text-transparent' : '';
    
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${widthStyle} ${loadingState} ${className}`}
        {...props}
      >
        {leftIcon && <span className="mr-2">{leftIcon}</span>}
        {children}
        {rightIcon && <span className="ml-2">{rightIcon}</span>}
        {isLoading && (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <svg
              className="animate-spin h-5 w-5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          </span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

// Outline Button Variant
export const OutlineButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      className = '',
      ...props
    },
    ref
  ) => {
    // Base styles
    const baseStyles = 'cursor-pointer inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none border';
    
    // Size styles
    const sizeStyles = {
      sm: 'h-9 px-3 text-sm',
      md: 'h-10 px-4 py-2',
      lg: 'h-11 px-6 text-lg',
    };
    
    // Variant styles for outline buttons using CSS variables from globals.css
    const variantStyles = {
      primary: 'border-[var(--color-brand-600)] dark:border-[var(--color-brand-500)] text-[var(--color-brand-600)] dark:text-[var(--color-brand-400)] hover:bg-[var(--color-brand-600)] dark:hover:bg-[var(--color-brand-500)] hover:text-[var(--color-white)] focus-visible:ring-[var(--color-brand-400)] dark:focus-visible:ring-[var(--color-brand-300)]',
      secondary: 'border-[var(--color-gray-600)] dark:border-[var(--color-gray-500)] text-[var(--color-gray-600)] dark:text-[var(--color-gray-400)] hover:bg-[var(--color-gray-600)] dark:hover:bg-[var(--color-gray-500)] hover:text-[var(--color-white)] focus-visible:ring-[var(--color-gray-400)] dark:focus-visible:ring-[var(--color-gray-300)]',
      success: 'border-[var(--color-success-600)] dark:border-[var(--color-success-500)] text-[var(--color-success-600)] dark:text-[var(--color-success-400)] hover:bg-[var(--color-success-600)] dark:hover:bg-[var(--color-success-500)] hover:text-[var(--color-white)] focus-visible:ring-[var(--color-success-400)] dark:focus-visible:ring-[var(--color-success-300)]',
      warning: 'border-[var(--color-warning-500)] dark:border-[var(--color-warning-400)] text-[var(--color-warning-500)] dark:text-[var(--color-warning-400)] hover:bg-[var(--color-warning-500)] dark:hover:bg-[var(--color-warning-400)] hover:text-[var(--color-black)] focus-visible:ring-[var(--color-warning-400)] dark:focus-visible:ring-[var(--color-warning-300)]',
      error: 'border-[var(--color-error-600)] dark:border-[var(--color-error-500)] text-[var(--color-error-600)] dark:text-[var(--color-error-400)] hover:bg-[var(--color-error-600)] dark:hover:bg-[var(--color-error-500)] hover:text-[var(--color-white)] focus-visible:ring-[var(--color-error-400)] dark:focus-visible:ring-[var(--color-error-300)]',
    };
    
    // Width style
    const widthStyle = fullWidth ? 'w-full' : '';
    
    // Loading state
    const loadingState = isLoading ? 'relative text-transparent transition-none hover:text-transparent' : '';
    
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${widthStyle} ${loadingState} ${className}`}
        {...props}
      >
        {leftIcon && <span className="mr-2">{leftIcon}</span>}
        {children}
        {rightIcon && <span className="ml-2">{rightIcon}</span>}
        {isLoading && (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <svg
              className="animate-spin h-5 w-5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          </span>
        )}
      </button>
    );
  }
);

OutlineButton.displayName = 'OutlineButton';

// Ghost Button Variant
export const GhostButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      className = '',
      ...props
    },
    ref
  ) => {
    // Base styles
    const baseStyles = 'cursor-pointer inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
    
    // Size styles
    const sizeStyles = {
      sm: 'h-9 px-3 text-sm',
      md: 'h-10 px-4 py-2',
      lg: 'h-11 px-6 text-lg',
    };
    
    // Variant styles for ghost buttons using CSS variables from globals.css
    const variantStyles = {
      primary: 'text-[var(--color-brand-600)] dark:text-[var(--color-brand-400)] hover:bg-[var(--color-brand-50)] dark:hover:bg-[var(--color-brand-950)]/30 focus-visible:ring-[var(--color-brand-400)] dark:focus-visible:ring-[var(--color-brand-300)]',
      secondary: 'text-[var(--color-gray-600)] dark:text-[var(--color-gray-400)] hover:bg-[var(--color-gray-50)] dark:hover:bg-[var(--color-gray-950)]/30 focus-visible:ring-[var(--color-gray-400)] dark:focus-visible:ring-[var(--color-gray-300)]',
      success: 'text-[var(--color-success-600)] dark:text-[var(--color-success-400)] hover:bg-[var(--color-success-50)] dark:hover:bg-[var(--color-success-950)]/30 focus-visible:ring-[var(--color-success-400)] dark:focus-visible:ring-[var(--color-success-300)]',
      warning: 'text-[var(--color-warning-500)] dark:text-[var(--color-warning-400)] hover:bg-[var(--color-warning-50)] dark:hover:bg-[var(--color-warning-950)]/30 focus-visible:ring-[var(--color-warning-400)] dark:focus-visible:ring-[var(--color-warning-300)]',
      error: 'text-[var(--color-error-600)] dark:text-[var(--color-error-400)] hover:bg-[var(--color-error-50)] dark:hover:bg-[var(--color-error-950)]/30 focus-visible:ring-[var(--color-error-400)] dark:focus-visible:ring-[var(--color-error-300)]',
    };
    
    // Width style
    const widthStyle = fullWidth ? 'w-full' : '';
    
    // Loading state
    const loadingState = isLoading ? 'relative text-transparent transition-none hover:text-transparent' : '';
    
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${widthStyle} ${loadingState} ${className}`}
        {...props}
      >
        {leftIcon && <span className="mr-2">{leftIcon}</span>}
        {children}
        {rightIcon && <span className="ml-2">{rightIcon}</span>}
        {isLoading && (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <svg
              className="animate-spin h-5 w-5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          </span>
        )}
      </button>
    );
  }
);

GhostButton.displayName = 'GhostButton';
