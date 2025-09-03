'use client';

import { useEffect, useRef } from 'react';

const AnimatedBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const parentElement = canvas.parentElement;

    const resizeCanvas = () => {
      if (parentElement) {
        const rect = parentElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
      } else {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    };

    resizeCanvas();

    class Blob {
      x: number;
      y: number;
      r: number;
      dx: number;
      dy: number;
      color: string;

      constructor() {
        const width = parentElement ? parentElement.clientWidth : window.innerWidth;
        const height = parentElement ? parentElement.clientHeight : window.innerHeight;
        
        this.x = Math.random() * (canvas?.width || width);
        this.y = Math.random() * (canvas?.height || height);
        this.r = 60 + Math.random() * 120;
        this.dx = (Math.random() - 0.5) * 0.4;
        this.dy = (Math.random() - 0.5) * 0.4;
        this.color = ["#00ffff", "#3399ff", "#0099cc"][
          Math.floor(Math.random() * 3)
        ];
      }

      move() {
        const width = parentElement ? parentElement.clientWidth : window.innerWidth;
        const height = parentElement ? parentElement.clientHeight : window.innerHeight;
        
        this.x += this.dx;
        this.y += this.dy;
        if (this.x < 0 || this.x > (canvas?.width || width)) this.dx *= -1;
        if (this.y < 0 || this.y > (canvas?.height || height)) this.dy *= -1;
      }

      draw() {
        if (!ctx || !canvas) return;
        ctx.beginPath();
        const grad = ctx.createRadialGradient(
          this.x,
          this.y,
          this.r * 0.2,
          this.x,
          this.y,
          this.r
        );
        grad.addColorStop(0, this.color + "55");
        grad.addColorStop(1, "#0f1b4700");
        ctx.fillStyle = grad;
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    class Particle {
      x: number;
      y: number;
      size: number;
      speedX: number;
      color: string;

      constructor() {
        const width = parentElement ? parentElement.clientWidth : window.innerWidth;
        const height = parentElement ? parentElement.clientHeight : window.innerHeight;
        
        this.x = Math.random() * (canvas?.width || width);
        this.y = Math.random() * (canvas?.height || height);
        this.size = Math.random() * 2 + 1;
        this.speedX = Math.random() * 0.5 + 0.2;
        this.color = "#00ffff";
      }

      update() {
        const width = parentElement ? parentElement.clientWidth : window.innerWidth;
        const height = parentElement ? parentElement.clientHeight : window.innerHeight;
        
        this.x += this.speedX;
        if (this.x > (canvas?.width || width)) {
          this.x = 0;
          this.y = Math.random() * (canvas?.height || height);
        }
      }

      draw() {
        if (ctx && canvas) {
          ctx.beginPath();
          ctx.fillStyle = this.color;
          ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    class Radar {
      angle: number;
      radius: number;
      centerX: number;
      centerY: number;

      constructor() {
        const width = parentElement ? parentElement.clientWidth : window.innerWidth;
        const height = parentElement ? parentElement.clientHeight : window.innerHeight;
        
        this.angle = 0;
        this.radius = Math.min(canvas?.width || width, canvas?.height || height) * 0.4;
        this.centerX = (canvas?.width || width) / 2;
        this.centerY = (canvas?.height || height) / 2;
      }

      update() {
        this.angle += 0.002;
        if (this.angle > Math.PI * 2) this.angle = 0;
      }

      draw() {
        if (!ctx || !canvas) return;
        ctx.beginPath();
        const x = this.centerX + this.radius * Math.cos(this.angle);
        const y = this.centerY + this.radius * Math.sin(this.angle);
        const grad = ctx.createRadialGradient(x, y, 0, x, y, 100);
        grad.addColorStop(0, "#00ffff33");
        grad.addColorStop(1, "#0f1b4700");
        ctx.fillStyle = grad;
        ctx.arc(x, y, 100, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    class Spark {
      x: number;
      y: number;
      opacity: number;
      fade: number;

      constructor() {
        const width = parentElement ? parentElement.clientWidth : window.innerWidth;
        const height = parentElement ? parentElement.clientHeight : window.innerHeight;
        
        this.x = Math.random() * (canvas?.width || width);
        this.y = Math.random() * (canvas?.height || height);
        this.opacity = 0;
        this.fade = Math.random() * 0.02 + 0.005;
      }

      update() {
        this.opacity += this.fade;
        if (this.opacity > 0.8 || this.opacity < 0) this.fade *= -1;
      }

      draw() {
        if (!ctx) return;
        ctx.beginPath();
        ctx.fillStyle = `rgba(0,255,255,${this.opacity})`;
        ctx.arc(this.x, this.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const blobs = Array.from({ length: 6 }, () => new Blob());
    const particles = Array.from({ length: 100 }, () => new Particle());
    const radar = new Radar();
    const sparks = Array.from({ length: 30 }, () => new Spark());
    
    // Radar'ın merkez konumunu güncelle
    const updateRadarPosition = () => {
      radar.centerX = canvas.width / 2;
      radar.centerY = canvas.height / 2;
    };
    
    updateRadarPosition();

    let animationFrameId: number;

    function animate() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      blobs.forEach((b) => {
        b.move();
        b.draw();
      });
      
      particles.forEach((p) => {
        p.update();
        p.draw();
      });
      
      radar.update();
      radar.draw();
      
      sparks.forEach((s) => {
        s.update();
        s.draw();
      });
      
      animationFrameId = requestAnimationFrame(animate);
    }

    animate();

    const handleResize = () => {
      resizeCanvas();
      updateRadarPosition();
    };
    
    window.addEventListener("resize", handleResize);

    // Cleanup function
    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      style={{ 
        position: 'absolute', 
        top: 0, 
        left: 0, 
        width: '100%',
        height: '100%',
        zIndex: 0,
        background: '#0f1b47'
      }} 
    />
  );
};

export default AnimatedBackground;
