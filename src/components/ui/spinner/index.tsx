import React from "react";
import { cn } from "@/lib/utils";

type SpinnerProps = {
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  variant?: "circle" | "dots" | "pulse" | "bars";
  className?: string;
  fullPage?: boolean;
  color?: string;
};

const sizeConfig = {
  sm: { width: 20, height: 20, strokeWidth: 2 },
  md: { width: 28, height: 28, strokeWidth: 3 },
  lg: { width: 36, height: 36, strokeWidth: 3 },
  xl: { width: 40, height: 40, strokeWidth: 4 },
  "2xl": { width: 48, height: 48, strokeWidth: 4 },
};

export function Spinner({
  size = "md",
  variant = "circle",
  className,
  fullPage = false,
  color,
}: SpinnerProps) {
  const { width, height, strokeWidth } = sizeConfig[size];

  // Renk sınıfı (özel renk verilmediyse varsayılan tema rengini kullan)
  const colorClass = color || "text-blue-600 dark:text-blue-400";

  // Spinner varyantları
  const spinnerVariants = {
    // Basit çember spinner
    circle: (
      <div className={`${colorClass} animate-spin`}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            className="opacity-25"
            cx={width / 2}
            cy={height / 2}
            r={(width - strokeWidth * 2) / 2}
            stroke="currentColor"
            strokeWidth={strokeWidth}
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d={`
              M ${width / 2} ${strokeWidth}
              A ${(width - strokeWidth * 2) / 2} ${(height - strokeWidth * 2) / 2} 0 1 1 ${width / 2 - 1} ${strokeWidth}
            `}
          ></path>
        </svg>
      </div>
    ),

    // 3 noktalı spinner
    dots: (
      <div className={`flex items-center space-x-${size === "sm" ? "1" : "2"}`}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(
              "rounded-full animate-pulse",
              colorClass,
              {
                "w-1.5 h-1.5": size === "sm",
                "w-2 h-2": size === "md",
                "w-2.5 h-2.5": size === "lg",
                "w-3 h-3": size === "xl",
                "w-4 h-4": size === "2xl",
              },
              `animate-delay-${i * 150}`
            )}
            style={{
              animationDelay: `${i * 0.15}s`,
              backgroundColor: "currentColor",
            }}
          />
        ))}
      </div>
    ),

    // Nabız efektli spinner
    pulse: (
      <div
        className={cn(
          "rounded-full animate-pulse",
          colorClass,
          {
            "w-5 h-5": size === "sm",
            "w-6 h-6": size === "md",
            "w-8 h-8": size === "lg",
            "w-10 h-10": size === "xl",
            "w-12 h-12": size === "2xl",
          }
        )}
        style={{ backgroundColor: "currentColor", opacity: 0.75 }}
      />
    ),
    
    // Çubuk spinner
    bars: (
      <div className={`flex items-end justify-center space-x-${size === "sm" ? "0.5" : "1"}`}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              "animate-bounce",
              colorClass,
              {
                "w-1 h-3": size === "sm",
                "w-1.5 h-4": size === "md",
                "w-1.5 h-5": size === "lg",
                "w-2 h-6": size === "xl",
                "w-2.5 h-8": size === "2xl",
              }
            )}
            style={{
              animationDelay: `${i * 0.1}s`,
              animationDuration: "1s",
              backgroundColor: "currentColor",
              borderRadius: "2px",
            }}
          />
        ))}
      </div>
    ),
  };

  // Spinner içeriği
  const spinnerContent = spinnerVariants[variant];

  // Tam sayfa spinner modu
  if (fullPage) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center z-[999999] bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
        {spinnerContent}
        <p className="mt-4 text-sm text-gray-600 dark:text-gray-400 animate-pulse">Loading...</p>
      </div>
    );
  }

  // Normal spinner modu
  return <div className={cn("flex items-center justify-center", className)}>{spinnerContent}</div>;
}

// SpinnerPage component for full page loading
export function SpinnerPage({
  size = "lg",
  variant = "circle",
  color,
}: {
  size?: SpinnerProps["size"];
  variant?: SpinnerProps["variant"];
  color?: SpinnerProps["color"];
}) {
  return <Spinner size={size} variant={variant} fullPage color={color} />;
}

// CSS için gerekli style ekleyin
if (typeof document !== "undefined") {
  const styleEl = document.createElement("style");
  styleEl.textContent = `
    @keyframes spinner-pulse {
      0%, 100% { opacity: 0.6; transform: scale(0.75); }
      50% { opacity: 1; transform: scale(1); }
    }
    
    .animate-pulse {
      animation: spinner-pulse 1.5s infinite ease-in-out;
    }
  `;
  document.head.appendChild(styleEl);
}

