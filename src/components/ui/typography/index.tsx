"use client"

import React from 'react';

interface TypographyProps {
  variant?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'small' | 'blockquote' | 'code';
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
}

export const Typography = ({
  variant = 'p',
  children,
  className = '',
  as,
  ...props
}: TypographyProps & React.HTMLAttributes<HTMLElement>) => {
  const Component = as || variant;

  // Yeni template için modern Tailwind CSS sınıfları (dark mode destekli)
  const variantStyles = {
    h1: 'text-4xl font-bold tracking-tight text-gray-900 dark:text-gray-100',
    h2: 'text-3xl font-semibold tracking-tight text-gray-800 dark:text-gray-100',
    h3: 'text-2xl font-semibold tracking-tight text-gray-800 dark:text-gray-200',
    h4: 'text-xl font-semibold tracking-tight text-gray-700 dark:text-gray-200',
    h5: 'text-lg font-semibold tracking-tight text-gray-700 dark:text-gray-300',
    h6: 'text-base font-semibold tracking-tight text-gray-700 dark:text-gray-300',
    p: 'text-base leading-7 text-gray-600 dark:text-gray-400',
    small: 'text-sm font-medium text-gray-500 dark:text-gray-500',
    blockquote: 'border-l-4 border-gray-200 dark:border-gray-700 pl-4 italic text-gray-700 dark:text-gray-300',
    code: 'rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 font-mono text-sm text-gray-900 dark:text-gray-100',
  };

  return (
    <Component className={`${variantStyles[variant]} ${className}`} {...props}>
      {children}
    </Component>
  );
};

// Başlık bileşenleri
export const Heading1 = ({ children, className = '', ...props }: Omit<TypographyProps, 'variant'> & React.HTMLAttributes<HTMLHeadingElement>) => (
  <Typography variant="h1" className={className} {...props}>
    {children}
  </Typography>
);

export const Heading2 = ({ children, className = '', ...props }: Omit<TypographyProps, 'variant'> & React.HTMLAttributes<HTMLHeadingElement>) => (
  <Typography variant="h2" className={className} {...props}>
    {children}
  </Typography>
);

export const Heading3 = ({ children, className = '', ...props }: Omit<TypographyProps, 'variant'> & React.HTMLAttributes<HTMLHeadingElement>) => (
  <Typography variant="h3" className={className} {...props}>
    {children}
  </Typography>
);

export const Heading4 = ({ children, className = '', ...props }: Omit<TypographyProps, 'variant'> & React.HTMLAttributes<HTMLHeadingElement>) => (
  <Typography variant="h4" className={className} {...props}>
    {children}
  </Typography>
);

export const Heading5 = ({ children, className = '', ...props }: Omit<TypographyProps, 'variant'> & React.HTMLAttributes<HTMLHeadingElement>) => (
  <Typography variant="h5" className={className} {...props}>
    {children}
  </Typography>
);

export const Heading6 = ({ children, className = '', ...props }: Omit<TypographyProps, 'variant'> & React.HTMLAttributes<HTMLHeadingElement>) => (
  <Typography variant="h6" className={className} {...props}>
    {children}
  </Typography>
);

// Paragraf bileşeni
export const Paragraph = ({ children, className = '', ...props }: Omit<TypographyProps, 'variant'> & React.HTMLAttributes<HTMLParagraphElement>) => (
  <Typography variant="p" className={className} {...props}>
    {children}
  </Typography>
);

// Küçük metin bileşeni
export const SmallText = ({ children, className = '', ...props }: Omit<TypographyProps, 'variant'> & React.HTMLAttributes<HTMLElement>) => (
  <Typography variant="small" as="span" className={className} {...props}>
    {children}
  </Typography>
);

// Alıntı bileşeni
export const BlockQuote = ({ children, className = '', ...props }: Omit<TypographyProps, 'variant'> & React.HTMLAttributes<HTMLQuoteElement>) => (
  <Typography variant="blockquote" as="blockquote" className={className} {...props}>
    {children}
  </Typography>
);

// Kod bileşeni
export const Code = ({ children, className = '', ...props }: Omit<TypographyProps, 'variant'> & React.HTMLAttributes<HTMLElement>) => (
  <Typography variant="code" as="code" className={className} {...props}>
    {children}
  </Typography>
);
