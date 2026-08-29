// ---------- reactive particle field (overlays the video, change if it looks dumb or whatever) ----------
(function initParticleField(){
  const canvas = document.getElementById('field');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  let w, h, particles = [];
  const mouse = {x:-9999, y:-9999};

  function resize(){ w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize);

  function initParticles(){
    particles = [];
    const count = Math.min(90, Math.floor((w*h)/13000));
    const colors = ['155,109,255','79,195,255','255,110,199'];
    for(let i=0;i<count;i++){
      particles.push({
        x: Math.random()*w, y: Math.random()*h, r: Math.random()*1.4+0.3,
        vx:(Math.random()-0.5)*0.12, vy:(Math.random()-0.5)*0.12,
        c: colors[Math.floor(Math.random()*colors.length)], tw: Math.random()*Math.PI*2
      });
    }
  }
  initParticles();

  document.addEventListener('mousemove', e=>{
    mouse.x = e.clientX; mouse.y = e.clientY;
    const glow = document.getElementById('glow');
    if(glow){ glow.style.left = e.clientX+'px'; glow.style.top = e.clientY+'px'; }
  });
  document.addEventListener('mouseleave', ()=>{ mouse.x=-9999; mouse.y=-9999; });

  function tick(){
    ctx.clearRect(0,0,w,h);
    for(const p of particles){
      p.x += p.vx; p.y += p.vy; p.tw += 0.02;
      const dx = p.x - mouse.x, dy = p.y - mouse.y;
      const dist = Math.sqrt(dx*dx+dy*dy);
      if(dist < 130){ const f=(130-dist)/130; p.x += (dx/dist)*f*2; p.y += (dy/dist)*f*2; }
      if(p.x < -10) p.x = w+10; if(p.x > w+10) p.x = -10;
      if(p.y < -10) p.y = h+10; if(p.y > h+10) p.y = -10;
      const alpha = 0.3 + Math.sin(p.tw)*0.2;
      ctx.beginPath(); ctx.fillStyle = `rgba(${p.c},${Math.max(0.08,alpha)})`;
      ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
    }
    requestAnimationFrame(tick);
  }
  tick();
})();

// ---------- shared helper: preload an image, resolve true/false instead of throwing ----------
function preloadImage(src){
  return new Promise(resolve=>{
    const img = new Image();
    img.onload = ()=>resolve(true);
    img.onerror = ()=>resolve(false);
    img.src = src;
  });
}

// ---------- shared Night City img list, no to self :: keep them here ----------
const NIGHT_CITY_IMAGES = [
  'assets/img/mods/Rwyn_NightCity/1.png',
  'assets/img/mods/Rwyn_NightCity/2.png',
  'assets/img/mods/Rwyn_NightCity/3.png',
  'assets/img/mods/Rwyn_NightCity/4.png',
  'assets/img/mods/Rwyn_NightCity/5.png',
  'assets/img/mods/Rwyn_NightCity/6.png',
  'assets/img/mods/Rwyn_NightCity/7.png',
  'assets/img/mods/Rwyn_NightCity/8.png',
  'assets/img/mods/Rwyn_NightCity/9.png',
  'assets/img/mods/Rwyn_NightCity/10.png',
  'assets/img/mods/Rwyn_NightCity/11.png'
];
