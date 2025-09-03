"use client";

import React, { useRef, useEffect } from 'react';

interface ParticleNetworkProps {
  particleCount?: number;
  maxDist?: number;
  backgroundColor?: string;
  pointColor?: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  update: () => void;
  draw: (ctx: CanvasRenderingContext2D) => void;
}

const ParticleNetwork: React.FC<ParticleNetworkProps> = ({
  particleCount = 200,
  maxDist = 120,
  backgroundColor = '#ffffff',
  pointColor = '#26b6d9'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;
    
    const particles: Particle[] = [];

    // Pencere boyutu değiştiğinde canvas'ı yeniden boyutlandır
    const resize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', resize);
    resize();

    // Parçacık sınıfı
    class ParticleClass implements Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;

      constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        const speed = 0.6;
        const angle = Math.random() * Math.PI * 2;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.radius = 2;
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;
        // Kenara çarpınca zıplat
        if (this.x <= 0 || this.x >= width) this.vx *= -1;
        if (this.y <= 0 || this.y >= height) this.vy *= -1;
      }

      draw(ctx: CanvasRenderingContext2D) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = pointColor;
        ctx.fill();
      }
    }

    // Parçacıkları oluştur
    for (let i = 0; i < particleCount; i++) {
      particles.push(new ParticleClass());
    }

    // Animasyon döngüsü
    const animate = () => {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);

      // Parçacıklar arası çizgileri çiz
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const p1 = particles[i];
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.hypot(dx, dy);
          
          if (dist < maxDist) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            // Mesafeye göre saydamlığı ayarla
            const alpha = 1 - dist / maxDist;
            const rgbColor = hexToRgb(pointColor);
            ctx.strokeStyle = `rgba(${rgbColor.r},${rgbColor.g},${rgbColor.b},${alpha})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }

      // Parçacıkları güncelle ve çiz
      particles.forEach(p => {
        p.update();
        p.draw(ctx);
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    // Hex renk kodunu RGB'ye dönüştür
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 0, g: 0, b: 0 };
    };

    let animationFrameId = requestAnimationFrame(animate);

    // Cleanup
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [particleCount, maxDist, backgroundColor, pointColor]);

  return (
    <canvas 
      ref={canvasRef} 
      style={{ 
        display: 'block', 
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: 0
      }}
    />
  );
};

export default ParticleNetwork;