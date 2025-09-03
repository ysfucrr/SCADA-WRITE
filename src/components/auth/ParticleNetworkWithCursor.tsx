"use client";

import React, { useRef, useEffect } from 'react';

interface ParticleNetworkProps {
  particleCount?: number;
  maxDist?: number;
  backgroundColor?: string;
  pointColor?: string;
  interactionRadius?: number;
  interactionStrength?: number;
}

interface MousePosition {
  x: number | null;
  y: number | null;
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

const ParticleNetworkWithCursor: React.FC<ParticleNetworkProps> = ({
  particleCount = 200,        // Nokta sayısı
  maxDist = 120,              // Çizgi çekme mesafesi
  backgroundColor = '#ffffff',// Arka plan rengi
  pointColor = '#26b6d9',     // Nokta rengi
  interactionRadius = 100,    // Fare etkisi yarıçapı
  interactionStrength = 0.2   // Fare kuvveti çarpanı
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    // Fare konumu
    const mouse: MousePosition = { x: null, y: null };

    // Event listener'lar
    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    
    const handleMouseLeave = () => {
      mouse.x = null;
      mouse.y = null;
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseout', handleMouseLeave);

    // Pencere boyutuna göre resize
    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    
    window.addEventListener('resize', handleResize);

    // Hex renk kodunu RGB'ye dönüştür
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 0, g: 0, b: 0 };
    };

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
        // Kenar yansımaları
        if (this.x <= 0 || this.x >= width) this.vx *= -1;
        if (this.y <= 0 || this.y >= height) this.vy *= -1;

        // Fare etkileşimi (itme)
        if (mouse.x !== null && mouse.y !== null) {
          const dx = this.x - mouse.x;
          const dy = this.y - mouse.y;
          const dist = Math.hypot(dx, dy);
          if (dist < interactionRadius) {
            const force = (interactionRadius - dist) / interactionRadius;
            this.vx += (dx / dist) * force * interactionStrength;
            this.vy += (dy / dist) * force * interactionStrength;
          }
        }
      }
      
      draw(ctx: CanvasRenderingContext2D) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = pointColor;
        ctx.fill();
      }
    }

    // Parçacıkları oluştur
    const particles: Particle[] = [];
    for (let i = 0; i < particleCount; i++) {
      particles.push(new ParticleClass());
    }

    // Animasyon döngüsü
    let animationId: number;
    const animate = () => {
      // Temizle + arka plan
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);

      // Çizgiler
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
            const alpha = 1 - dist / maxDist;
            const rgbColor = hexToRgb(pointColor);
            ctx.strokeStyle = `rgba(${rgbColor.r},${rgbColor.g},${rgbColor.b},${alpha})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }

      // Parçacıklar
      particles.forEach(p => {
        p.update();
        p.draw(ctx);
      });

      animationId = requestAnimationFrame(animate);
    };
    animate();

    // Cleanup
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseout', handleMouseLeave);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
    };
  }, [
    particleCount,
    maxDist,
    backgroundColor,
    pointColor,
    interactionRadius,
    interactionStrength
  ]);

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

export default ParticleNetworkWithCursor;