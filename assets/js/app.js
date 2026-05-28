/* ===== AQUIADS GLOBAL NAMESPACE ===== */
window.AquiAds = {};

/* ===== AUTH ===== */
AquiAds.Auth = {
  login(email, password) {
    if (!email || !password || password.length < 6) return { success: false, message: 'Credenciais inválidas.' };
    let user = AquiAds.State.get('aquiads_user');
    if (!user) {
      user = { name: email.split('@')[0].replace(/[^a-zA-Z]/g,' ').trim() || 'Usuário', email, segment: 'PME', createdAt: new Date().toISOString(), plan: 'free' };
      AquiAds.State.set('aquiads_user', user);
    }
    AquiAds.State.set('aquiads_session', { email, loginAt: new Date().toISOString() });
    return { success: true };
  },
  register(data) {
    const { name, email, password, segment } = data;
    if (!name || !email || !password) return { success: false, message: 'Preencha todos os campos.' };
    if (password.length < 6) return { success: false, message: 'Senha mínima de 6 caracteres.' };
    const user = { name, email, segment: segment || 'PME', createdAt: new Date().toISOString(), plan: 'free' };
    AquiAds.State.set('aquiads_user', user);
    AquiAds.State.set('aquiads_session', { email, loginAt: new Date().toISOString() });
    return { success: true };
  },
  logout() {
    localStorage.removeItem('aquiads_session');
    window.location.href = 'index.html';
  },
  requireLogin() {
    if (!AquiAds.State.get('aquiads_session')) {
      window.location.href = 'index.html';
      return false;
    }
    return true;
  },
  getUser() { return AquiAds.State.get('aquiads_user') || {}; },
  isLoggedIn() { return !!AquiAds.State.get('aquiads_session'); }
};

/* ===== STATE ===== */
AquiAds.State = {
  get(key, def = null) {
    try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : def; } catch(e) { return def; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch(e) { console.warn('Storage full:', e); }
  },
  getCreatives() { return this.get('aquiads_creatives', []); },
  saveCreative(creative) {
    const list = this.getCreatives();
    const idx = list.findIndex(c => c.id === creative.id);
    if (idx >= 0) list[idx] = creative; else list.unshift(creative);
    this.set('aquiads_creatives', list);
  },
  deleteCreative(id) {
    this.set('aquiads_creatives', this.getCreatives().filter(c => c.id !== id));
  },
  getNextId() {
    const n = this.get('aquiads_id_counter', 1000);
    this.set('aquiads_id_counter', n + 1);
    return n.toString(36);
  }
};

/* ===== UTILS ===== */
AquiAds.Utils = {
  generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); },
  deepClone(obj) { return JSON.parse(JSON.stringify(obj)); },
  formatDate(d) { return new Date(d).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' }); },
  debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
  clamp(val, min, max) { return Math.min(Math.max(val, min), max); },
  hexToRgb(hex) {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return r ? { r: parseInt(r[1],16), g: parseInt(r[2],16), b: parseInt(r[3],16) } : { r:0, g:0, b:0 };
  },
  getLuminance(r, g, b) {
    const srgb = [r,g,b].map(v => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); });
    return 0.2126*srgb[0] + 0.7152*srgb[1] + 0.0722*srgb[2];
  },
  getContrastRatio(hex1, hex2) {
    const c1 = this.hexToRgb(hex1), c2 = this.hexToRgb(hex2);
    const l1 = this.getLuminance(c1.r,c1.g,c1.b), l2 = this.getLuminance(c2.r,c2.g,c2.b);
    const lighter = Math.max(l1,l2), darker = Math.min(l1,l2);
    return (lighter+0.05)/(darker+0.05);
  },
  getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  },
  renderScoreRing(score, container) {
    const grade = AquiAds.Utils.scoreGrade(score);
    const r = 18, circ = 2*Math.PI*r;
    const offset = circ * (1 - score/100);
    const colorMap = { A:'#22C55E', B:'#84CC16', C:'#F59E0B', D:'#F97316', F:'#EF4444' };
    container.innerHTML = `
      <svg viewBox="0 0 44 44" width="44" height="44">
        <circle class="score-ring-track" cx="22" cy="22" r="${r}"/>
        <circle class="score-ring-fill score-ring--${grade.toLowerCase()}"
          cx="22" cy="22" r="${r}"
          stroke="${colorMap[grade]}"
          stroke-dasharray="${circ}"
          stroke-dashoffset="${offset}"
          fill="none" stroke-width="3" stroke-linecap="round"
          transform="rotate(-90 22 22)"/>
        <text class="score-ring-text" x="22" y="22" fill="${colorMap[grade]}">${score}</text>
      </svg>`;
  },
  scoreGrade(score) {
    if (score >= 90) return 'A';
    if (score >= 75) return 'B';
    if (score >= 60) return 'C';
    if (score >= 45) return 'D';
    return 'F';
  }
};

/* ===== ROUTER ===== */
AquiAds.Router = {
  goTo(page, params = {}) {
    const qs = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
    window.location.href = page + qs;
  }
};

/* ===== NOTIFICATIONS ===== */
AquiAds.Notifications = {
  add(message, type = 'info') {
    const list = AquiAds.State.get('aquiads_notifications', []);
    list.unshift({ id: AquiAds.Utils.generateId(), message, type, read: false, createdAt: new Date().toISOString() });
    if (list.length > 50) list.splice(50);
    AquiAds.State.set('aquiads_notifications', list);
  },
  getAll() { return AquiAds.State.get('aquiads_notifications', []); },
  markRead(id) {
    const list = this.getAll().map(n => n.id === id ? {...n, read:true} : n);
    AquiAds.State.set('aquiads_notifications', list);
  },
  markAllRead() {
    AquiAds.State.set('aquiads_notifications', this.getAll().map(n => ({...n, read:true})));
  },
  getUnreadCount() { return this.getAll().filter(n => !n.read).length; }
};

/* ===== TOAST ===== */
AquiAds.Toast = {
  show(message, type = 'default', duration = 3000) {
    let container = document.getElementById('toast-container');
    if (!container) { container = document.createElement('div'); container.id = 'toast-container'; document.body.appendChild(container); }
    const toast = document.createElement('div');
    toast.className = `toast toast--${type} animate-fadeIn`;
    const icons = { success:'✓', error:'✕', warning:'⚠', default:'ℹ' };
    toast.innerHTML = `<span>${icons[type]||icons.default}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
};

/* ===== TOOLTIP ===== */
AquiAds.Tooltip = {
  init() {
    let box = null;
    document.addEventListener('mouseover', e => {
      const el = e.target.closest('[data-tooltip]');
      if (!el) return;
      if (box) box.remove();
      box = document.createElement('div');
      box.className = 'tooltip-box';
      box.textContent = el.dataset.tooltip;
      el.appendChild(box);
    });
    document.addEventListener('mouseout', e => {
      if (box && !e.target.closest('[data-tooltip]')) { box.remove(); box = null; }
    });
  }
};

/* ===== FORMATS CONFIG ===== */
AquiAds.Formats = [
  { id:'ooh-outdoor',   name:'Outdoor 14×48ft',     category:'OOH',     width:1344, height:462,  safeZoneMargin:0.05,
    specs:{ res:'72 DPI', color:'CMYK', maxMB:50, formats:'JPG, PDF', bleed:'3mm' } },
  { id:'ooh-panel-6x3', name:'Painel 6×3m',          category:'OOH',     width:1200, height:600,  safeZoneMargin:0.05,
    specs:{ res:'96 DPI', color:'CMYK', maxMB:30, formats:'JPG, PDF', bleed:'2mm' } },
  { id:'ooh-metro-sp',  name:'Metrô SP',             category:'OOH',     width:1920, height:1080, safeZoneMargin:0.08,
    specs:{ res:'96 DPI', color:'RGB',  maxMB:20, formats:'JPG, PNG', bleed:'0' } },
  { id:'ooh-metro-rj',  name:'Metrô RJ',             category:'OOH',     width:1200, height:400,  safeZoneMargin:0.08,
    specs:{ res:'96 DPI', color:'RGB',  maxMB:20, formats:'JPG, PNG', bleed:'0' } },
  { id:'ooh-airport',   name:'Painel Aeroporto',     category:'OOH',     width:1920, height:540,  safeZoneMargin:0.06,
    specs:{ res:'144 DPI',color:'RGB',  maxMB:25, formats:'JPG, PNG', bleed:'0' } },
  { id:'digital-square',name:'Feed Instagram 1080×1080', category:'Digital', width:1080, height:1080, safeZoneMargin:0.04,
    specs:{ res:'72 DPI', color:'RGB',  maxMB:10, formats:'JPG, PNG', bleed:'0' } },
  { id:'digital-story', name:'Story 1080×1920',      category:'Digital', width:1080, height:1920, safeZoneMargin:0.12,
    specs:{ res:'72 DPI', color:'RGB',  maxMB:10, formats:'JPG, PNG', bleed:'0' } },
  { id:'digital-mpu',   name:'MPU 300×250',          category:'Digital', width:300,  height:250,  safeZoneMargin:0.03,
    specs:{ res:'72 DPI', color:'RGB',  maxMB:5,  formats:'JPG, PNG, GIF', bleed:'0' } },
  { id:'digital-leader',name:'Leaderboard 728×90',   category:'Digital', width:728,  height:90,   safeZoneMargin:0.02,
    specs:{ res:'72 DPI', color:'RGB',  maxMB:3,  formats:'JPG, PNG, GIF', bleed:'0' } },
  { id:'digital-rect',  name:'Retângulo 300×600',    category:'Digital', width:300,  height:600,  safeZoneMargin:0.04,
    specs:{ res:'72 DPI', color:'RGB',  maxMB:8,  formats:'JPG, PNG', bleed:'0' } },
];

/* ===== TEMPLATES CONFIG ===== */
AquiAds.Templates = [
  // --- AWARENESS ---
  {
    id:'aw-outdoor', name:'Marca em Outdoor', objective:'awareness', format:'ooh-outdoor',
    description:'Apresente sua marca com impacto máximo nas ruas.',
    thumb:'linear-gradient(135deg,#1A1A2E,#16213E)',
    elements:[
      { id:'e1', type:'rect',  x:0,   y:0,   w:100, h:100, zIndex:1, locked:false, visible:true, content:'', styles:{ backgroundColor:'#16213E', borderRadius:'0' } },
      { id:'e2', type:'text',  x:8,   y:20,  w:60,  h:30,  zIndex:2, locked:false, visible:true, content:'SUA MARCA AQUI', styles:{ color:'#FF6B00', fontSize:'28px', fontWeight:'800', fontFamily:'Inter' } },
      { id:'e3', type:'text',  x:8,   y:55,  w:55,  h:15,  zIndex:3, locked:false, visible:true, content:'Uma mensagem que conecta seu público.', styles:{ color:'#FFFFFF', fontSize:'14px', fontFamily:'Inter' } },
      { id:'e4', type:'rect',  x:8,   y:75,  w:20,  h:12,  zIndex:4, locked:false, visible:true, content:'Saiba Mais', styles:{ backgroundColor:'#FF6B00', borderRadius:'6px', color:'#fff', fontSize:'10px', fontWeight:'700', display:'flex', alignItems:'center', justifyContent:'center' } },
    ]
  },
  {
    id:'aw-metro', name:'Awareness Metrô SP', objective:'awareness', format:'ooh-metro-sp',
    description:'Alta visibilidade para passageiros do Metrô SP.',
    thumb:'linear-gradient(135deg,#FF6B00,#FF8C00)',
    elements:[
      { id:'e1', type:'rect',  x:0,   y:0,   w:100, h:100, zIndex:1, locked:false, visible:true, content:'', styles:{ backgroundColor:'#FF6B00' } },
      { id:'e2', type:'text',  x:10,  y:25,  w:50,  h:25,  zIndex:2, locked:false, visible:true, content:'CONHEÇA\nNOSSO PRODUTO', styles:{ color:'#fff', fontSize:'26px', fontWeight:'800', fontFamily:'Inter', lineHeight:'1.2' } },
      { id:'e3', type:'rect',  x:65,  y:10,  w:28,  h:80,  zIndex:2, locked:false, visible:true, content:'', styles:{ backgroundColor:'rgba(255,255,255,0.15)', borderRadius:'12px' } },
    ]
  },
  {
    id:'aw-square', name:'Awareness Instagram', objective:'awareness', format:'digital-square',
    description:'Aumente o reconhecimento da sua marca no Instagram.',
    thumb:'linear-gradient(135deg,#667eea,#764ba2)',
    elements:[
      { id:'e1', type:'rect',  x:0,   y:0,   w:100, h:100, zIndex:1, locked:false, visible:true, content:'', styles:{ backgroundColor:'#764ba2' } },
      { id:'e2', type:'text',  x:10,  y:30,  w:80,  h:20,  zIndex:2, locked:false, visible:true, content:'VOCÊ CONHECE\nNOSSA MARCA?', styles:{ color:'#fff', fontSize:'22px', fontWeight:'800', fontFamily:'Inter', textAlign:'center' } },
      { id:'e3', type:'rect',  x:35,  y:10,  w:30,  h:14,  zIndex:3, locked:false, visible:true, content:'', styles:{ backgroundColor:'rgba(255,255,255,0.25)', borderRadius:'8px' } },
      { id:'e4', type:'text',  x:10,  y:75,  w:80,  h:10,  zIndex:4, locked:false, visible:true, content:'@suamarca', styles:{ color:'rgba(255,255,255,0.8)', fontSize:'12px', textAlign:'center', fontFamily:'Inter' } },
    ]
  },
  {
    id:'aw-story', name:'Awareness Story', objective:'awareness', format:'digital-story',
    description:'Apareça nos stories com visual marcante.',
    thumb:'linear-gradient(180deg,#f093fb,#f5576c)',
    elements:[
      { id:'e1', type:'rect',  x:0,   y:0,   w:100, h:100, zIndex:1, locked:false, visible:true, content:'', styles:{ backgroundColor:'#f5576c' } },
      { id:'e2', type:'text',  x:10,  y:35,  w:80,  h:18,  zIndex:2, locked:false, visible:true, content:'SUA MARCA\nMERCE SER VISTA', styles:{ color:'#fff', fontSize:'24px', fontWeight:'800', fontFamily:'Inter', textAlign:'center' } },
      { id:'e3', type:'rect',  x:30,  y:58,  w:40,  h:8,   zIndex:3, locked:false, visible:true, content:'Saiba Mais ↑', styles:{ backgroundColor:'#fff', borderRadius:'100px', color:'#f5576c', fontSize:'11px', fontWeight:'700', display:'flex', alignItems:'center', justifyContent:'center' } },
    ]
  },

  // --- TRÁFEGO ---
  {
    id:'tr-panel', name:'Tráfego Painel 6×3m', objective:'trafego', format:'ooh-panel-6x3',
    description:'Direcione o público para seu site ou loja.',
    thumb:'linear-gradient(135deg,#0f2027,#203a43,#2c5364)',
    elements:[
      { id:'e1', type:'rect',  x:0,   y:0,   w:100, h:100, zIndex:1, locked:false, visible:true, content:'', styles:{ backgroundColor:'#0f2027' } },
      { id:'e2', type:'text',  x:8,   y:15,  w:60,  h:20,  zIndex:2, locked:false, visible:true, content:'ACESSE AGORA', styles:{ color:'#FF6B00', fontSize:'26px', fontWeight:'800', fontFamily:'Inter' } },
      { id:'e3', type:'text',  x:8,   y:40,  w:55,  h:18,  zIndex:3, locked:false, visible:true, content:'www.seusite.com.br', styles:{ color:'#fff', fontSize:'18px', fontFamily:'Inter', fontWeight:'600' } },
      { id:'e4', type:'rect',  x:8,   y:65,  w:30,  h:18,  zIndex:4, locked:false, visible:true, content:'Visite o Site', styles:{ backgroundColor:'#FF6B00', borderRadius:'8px', color:'#fff', fontSize:'12px', fontWeight:'700', display:'flex', alignItems:'center', justifyContent:'center' } },
    ]
  },
  {
    id:'tr-mpu', name:'Banner MPU 300×250', objective:'trafego', format:'digital-mpu',
    description:'Bannner de alta conversão para sites parceiros.',
    thumb:'linear-gradient(135deg,#11998e,#38ef7d)',
    elements:[
      { id:'e1', type:'rect',  x:0,   y:0,   w:100, h:100, zIndex:1, locked:false, visible:true, content:'', styles:{ backgroundColor:'#11998e' } },
      { id:'e2', type:'text',  x:8,   y:12,  w:84,  h:22,  zIndex:2, locked:false, visible:true, content:'Descubra o que\ntemos para você', styles:{ color:'#fff', fontSize:'14px', fontWeight:'700', fontFamily:'Inter' } },
      { id:'e3', type:'rect',  x:8,   y:75,  w:50,  h:16,  zIndex:3, locked:false, visible:true, content:'Clique Aqui', styles:{ backgroundColor:'#fff', borderRadius:'6px', color:'#11998e', fontSize:'11px', fontWeight:'700', display:'flex', alignItems:'center', justifyContent:'center' } },
    ]
  },
  {
    id:'tr-story-link', name:'Story com Link', objective:'trafego', format:'digital-story',
    description:'Story otimizado para arrastar e clicar.',
    thumb:'linear-gradient(180deg,#4facfe,#00f2fe)',
    elements:[
      { id:'e1', type:'rect',  x:0,   y:0,   w:100, h:100, zIndex:1, locked:false, visible:true, content:'', styles:{ backgroundColor:'#4facfe' } },
      { id:'e2', type:'text',  x:10,  y:25,  w:80,  h:20,  zIndex:2, locked:false, visible:true, content:'ARRASTE PARA\nCONHECER MAIS', styles:{ color:'#fff', fontSize:'22px', fontWeight:'800', fontFamily:'Inter', textAlign:'center' } },
      { id:'e3', type:'text',  x:10,  y:82,  w:80,  h:10,  zIndex:3, locked:false, visible:true, content:'↑ Ver mais', styles:{ color:'#fff', fontSize:'14px', textAlign:'center', fontFamily:'Inter', fontWeight:'600' } },
    ]
  },

  // --- CONVERSÃO ---
  {
    id:'co-oferta', name:'Oferta Flash 1080×1080', objective:'conversao', format:'digital-square',
    description:'Crie urgência e aumente as conversões.',
    thumb:'linear-gradient(135deg,#f7971e,#ffd200)',
    elements:[
      { id:'e1', type:'rect',  x:0,   y:0,   w:100, h:100, zIndex:1, locked:false, visible:true, content:'', styles:{ backgroundColor:'#ffd200' } },
      { id:'e2', type:'text',  x:8,   y:8,   w:84,  h:12,  zIndex:2, locked:false, visible:true, content:'⚡ OFERTA RELÂMPAGO', styles:{ color:'#1A1A1A', fontSize:'16px', fontWeight:'800', fontFamily:'Inter', textAlign:'center' } },
      { id:'e3', type:'text',  x:8,   y:30,  w:84,  h:28,  zIndex:3, locked:false, visible:true, content:'ATÉ\n50% OFF', styles:{ color:'#FF6B00', fontSize:'40px', fontWeight:'900', fontFamily:'Inter', textAlign:'center', lineHeight:'1.1' } },
      { id:'e4', type:'rect',  x:20,  y:72,  w:60,  h:14,  zIndex:4, locked:false, visible:true, content:'COMPRE AGORA', styles:{ backgroundColor:'#1A1A1A', borderRadius:'8px', color:'#ffd200', fontSize:'14px', fontWeight:'800', display:'flex', alignItems:'center', justifyContent:'center' } },
    ]
  },
  {
    id:'co-leader', name:'Leaderboard Conversão', objective:'conversao', format:'digital-leader',
    description:'Capture cliques no topo de páginas web.',
    thumb:'linear-gradient(90deg,#FF6B00,#FF8C00)',
    elements:[
      { id:'e1', type:'rect',  x:0,   y:0,   w:100, h:100, zIndex:1, locked:false, visible:true, content:'', styles:{ backgroundColor:'#FF6B00' } },
      { id:'e2', type:'text',  x:3,   y:20,  w:60,  h:60,  zIndex:2, locked:false, visible:true, content:'Frete Grátis + 30% OFF na primeira compra!', styles:{ color:'#fff', fontSize:'13px', fontWeight:'700', fontFamily:'Inter' } },
      { id:'e3', type:'rect',  x:75,  y:15,  w:22,  h:70,  zIndex:3, locked:false, visible:true, content:'Aproveitar', styles:{ backgroundColor:'#fff', borderRadius:'4px', color:'#FF6B00', fontSize:'10px', fontWeight:'800', display:'flex', alignItems:'center', justifyContent:'center' } },
    ]
  },
  {
    id:'co-outdoor', name:'OOH Promoção', objective:'conversao', format:'ooh-outdoor',
    description:'Atraia clientes com promoção em outdoor.',
    thumb:'linear-gradient(135deg,#FC466B,#3F5EFB)',
    elements:[
      { id:'e1', type:'rect',  x:0,   y:0,   w:100, h:100, zIndex:1, locked:false, visible:true, content:'', styles:{ backgroundColor:'#3F5EFB' } },
      { id:'e2', type:'text',  x:6,   y:18,  w:55,  h:28,  zIndex:2, locked:false, visible:true, content:'PROMOÇÃO\nEXCLUSIVA', styles:{ color:'#fff', fontSize:'28px', fontWeight:'900', fontFamily:'Inter', lineHeight:'1.2' } },
      { id:'e3', type:'text',  x:6,   y:52,  w:45,  h:14,  zIndex:3, locked:false, visible:true, content:'Só até dia 30!', styles:{ color:'rgba(255,255,255,0.8)', fontSize:'14px', fontFamily:'Inter' } },
      { id:'e4', type:'text',  x:6,   y:70,  w:30,  h:18,  zIndex:4, locked:false, visible:true, content:'(11) 9999-9999', styles:{ color:'#fff', fontSize:'16px', fontWeight:'700', fontFamily:'Inter' } },
    ]
  },

  // --- PROMOÇÃO ---
  {
    id:'pr-story', name:'Promoção Story', objective:'promocao', format:'digital-story',
    description:'Comunique descontos de forma visual e direta.',
    thumb:'linear-gradient(180deg,#f953c6,#b91d73)',
    elements:[
      { id:'e1', type:'rect',  x:0,   y:0,   w:100, h:100, zIndex:1, locked:false, visible:true, content:'', styles:{ backgroundColor:'#b91d73' } },
      { id:'e2', type:'text',  x:10,  y:20,  w:80,  h:15,  zIndex:2, locked:false, visible:true, content:'SUPER PROMOÇÃO', styles:{ color:'#fff', fontSize:'22px', fontWeight:'800', fontFamily:'Inter', textAlign:'center' } },
      { id:'e3', type:'text',  x:10,  y:38,  w:80,  h:20,  zIndex:3, locked:false, visible:true, content:'30%\nOFF', styles:{ color:'#FFD200', fontSize:'48px', fontWeight:'900', fontFamily:'Inter', textAlign:'center', lineHeight:'1' } },
      { id:'e4', type:'text',  x:10,  y:62,  w:80,  h:10,  zIndex:4, locked:false, visible:true, content:'Use o cupom: PROMO30', styles:{ color:'rgba(255,255,255,0.9)', fontSize:'13px', textAlign:'center', fontFamily:'Inter' } },
      { id:'e5', type:'rect',  x:20,  y:76,  w:60,  h:10,  zIndex:5, locked:false, visible:true, content:'QUERO DESCONTO', styles:{ backgroundColor:'#FFD200', borderRadius:'100px', color:'#b91d73', fontSize:'11px', fontWeight:'800', display:'flex', alignItems:'center', justifyContent:'center' } },
    ]
  },
  {
    id:'pr-metro-rj', name:'Promoção Metrô RJ', objective:'promocao', format:'ooh-metro-rj',
    description:'Impacte passageiros cariocas com sua oferta.',
    thumb:'linear-gradient(135deg,#009245,#FCEE21)',
    elements:[
      { id:'e1', type:'rect',  x:0,   y:0,   w:100, h:100, zIndex:1, locked:false, visible:true, content:'', styles:{ backgroundColor:'#009245' } },
      { id:'e2', type:'text',  x:8,   y:20,  w:55,  h:28,  zIndex:2, locked:false, visible:true, content:'LIQUIDAÇÃO\nDE VERÃO', styles:{ color:'#FCEE21', fontSize:'26px', fontWeight:'900', fontFamily:'Inter', lineHeight:'1.2' } },
      { id:'e3', type:'text',  x:8,   y:55,  w:50,  h:20,  zIndex:3, locked:false, visible:true, content:'Até 60% de desconto\nnos melhores produtos', styles:{ color:'#fff', fontSize:'13px', fontFamily:'Inter', lineHeight:'1.5' } },
    ]
  },
  {
    id:'pr-outdoor', name:'Outdoor Sazonal', objective:'promocao', format:'ooh-outdoor',
    description:'Aproveite datas especiais para impulsionar vendas.',
    thumb:'linear-gradient(135deg,#FF512F,#F09819)',
    elements:[
      { id:'e1', type:'rect',  x:0,   y:0,   w:100, h:100, zIndex:1, locked:false, visible:true, content:'', styles:{ backgroundColor:'#FF512F' } },
      { id:'e2', type:'text',  x:6,   y:18,  w:60,  h:22,  zIndex:2, locked:false, visible:true, content:'DIA DAS MÃES\nESPECIAL', styles:{ color:'#fff', fontSize:'26px', fontWeight:'900', fontFamily:'Inter', lineHeight:'1.2' } },
      { id:'e3', type:'text',  x:6,   y:48,  w:50,  h:16,  zIndex:3, locked:false, visible:true, content:'Presentes a partir de R$ 49,90', styles:{ color:'rgba(255,255,255,0.9)', fontSize:'14px', fontFamily:'Inter' } },
      { id:'e4', type:'text',  x:6,   y:70,  w:40,  h:16,  zIndex:4, locked:false, visible:true, content:'www.loja.com.br', styles:{ color:'#FFD200', fontSize:'15px', fontWeight:'700', fontFamily:'Inter' } },
    ]
  },
  {
    id:'pr-square', name:'Sale Banner Instagram', objective:'promocao', format:'digital-square',
    description:'Promoção clara e visualmente atraente para o feed.',
    thumb:'linear-gradient(135deg,#1FA2FF,#12D8FA,#A6FFCB)',
    elements:[
      { id:'e1', type:'rect',  x:0,   y:0,   w:100, h:100, zIndex:1, locked:false, visible:true, content:'', styles:{ backgroundColor:'#1FA2FF' } },
      { id:'e2', type:'text',  x:10,  y:15,  w:80,  h:15,  zIndex:2, locked:false, visible:true, content:'ÚLTIMAS UNIDADES', styles:{ color:'#fff', fontSize:'15px', fontWeight:'700', fontFamily:'Inter', textAlign:'center', letterSpacing:'0.05em' } },
      { id:'e3', type:'text',  x:10,  y:35,  w:80,  h:22,  zIndex:3, locked:false, visible:true, content:'25% OFF', styles:{ color:'#FFD200', fontSize:'42px', fontWeight:'900', fontFamily:'Inter', textAlign:'center' } },
      { id:'e4', type:'rect',  x:20,  y:68,  w:60,  h:14,  zIndex:4, locked:false, visible:true, content:'COMPRAR AGORA', styles:{ backgroundColor:'#fff', borderRadius:'8px', color:'#1FA2FF', fontSize:'13px', fontWeight:'800', display:'flex', alignItems:'center', justifyContent:'center' } },
    ]
  },

  // --- LANÇAMENTO ---
  {
    id:'la-hero', name:'Product Hero 1080×1080', objective:'lancamento', format:'digital-square',
    description:'Anuncie o lançamento do seu produto com elegância.',
    thumb:'linear-gradient(135deg,#0F0C29,#302B63,#24243e)',
    elements:[
      { id:'e1', type:'rect',  x:0,   y:0,   w:100, h:100, zIndex:1, locked:false, visible:true, content:'', styles:{ backgroundColor:'#0F0C29' } },
      { id:'e2', type:'text',  x:10,  y:10,  w:80,  h:8,   zIndex:2, locked:false, visible:true, content:'NOVIDADE', styles:{ color:'#FF6B00', fontSize:'12px', fontWeight:'700', fontFamily:'Inter', textAlign:'center', letterSpacing:'0.2em' } },
      { id:'e3', type:'text',  x:10,  y:25,  w:80,  h:22,  zIndex:3, locked:false, visible:true, content:'APRESENTAMOS\nNOSSO NOVO\nPRODUTO', styles:{ color:'#fff', fontSize:'24px', fontWeight:'900', fontFamily:'Inter', textAlign:'center', lineHeight:'1.2' } },
      { id:'e4', type:'rect',  x:35,  y:55,  w:30,  h:14,  zIndex:4, locked:false, visible:true, content:'', styles:{ backgroundColor:'rgba(255,107,0,0.1)', border:'2px solid #FF6B00', borderRadius:'8px' } },
      { id:'e5', type:'rect',  x:25,  y:78,  w:50,  h:12,  zIndex:5, locked:false, visible:true, content:'Saiba Mais', styles:{ backgroundColor:'#FF6B00', borderRadius:'100px', color:'#fff', fontSize:'12px', fontWeight:'700', display:'flex', alignItems:'center', justifyContent:'center' } },
    ]
  },
  {
    id:'la-story', name:'Story Lançamento', objective:'lancamento', format:'digital-story',
    description:'Gere expectativa para seu novo produto ou serviço.',
    thumb:'linear-gradient(180deg,#141E30,#243B55)',
    elements:[
      { id:'e1', type:'rect',  x:0,   y:0,   w:100, h:100, zIndex:1, locked:false, visible:true, content:'', styles:{ backgroundColor:'#141E30' } },
      { id:'e2', type:'text',  x:10,  y:18,  w:80,  h:10,  zIndex:2, locked:false, visible:true, content:'EM BREVE', styles:{ color:'#FF6B00', fontSize:'14px', fontWeight:'700', fontFamily:'Inter', textAlign:'center', letterSpacing:'0.25em' } },
      { id:'e3', type:'text',  x:10,  y:32,  w:80,  h:20,  zIndex:3, locked:false, visible:true, content:'ALGO INCRÍVEL\nESTÁ CHEGANDO', styles:{ color:'#fff', fontSize:'26px', fontWeight:'800', fontFamily:'Inter', textAlign:'center', lineHeight:'1.2' } },
      { id:'e4', type:'text',  x:10,  y:58,  w:80,  h:8,   zIndex:4, locked:false, visible:true, content:'Fique ligado — 15/01/2025', styles:{ color:'rgba(255,255,255,0.6)', fontSize:'12px', textAlign:'center', fontFamily:'Inter' } },
      { id:'e5', type:'text',  x:10,  y:82,  w:80,  h:8,   zIndex:5, locked:false, visible:true, content:'↑ Ative o lembrete', styles:{ color:'#FF6B00', fontSize:'13px', textAlign:'center', fontFamily:'Inter', fontWeight:'600' } },
    ]
  },
  {
    id:'la-billboard', name:'Billboard Teaser OOH', objective:'lancamento', format:'ooh-outdoor',
    description:'Gere curiosidade antes do lançamento nas ruas.',
    thumb:'linear-gradient(135deg,#000000,#434343)',
    elements:[
      { id:'e1', type:'rect',  x:0,   y:0,   w:100, h:100, zIndex:1, locked:false, visible:true, content:'', styles:{ backgroundColor:'#000' } },
      { id:'e2', type:'text',  x:10,  y:25,  w:80,  h:22,  zIndex:2, locked:false, visible:true, content:'EM BREVE.', styles:{ color:'#FF6B00', fontSize:'44px', fontWeight:'900', fontFamily:'Inter', textAlign:'center' } },
      { id:'e3', type:'text',  x:10,  y:58,  w:80,  h:14,  zIndex:3, locked:false, visible:true, content:'15.01.2025', styles:{ color:'rgba(255,255,255,0.5)', fontSize:'18px', fontFamily:'Inter', textAlign:'center', letterSpacing:'0.2em' } },
    ]
  },
];

/* ===== SEED DEMO DATA ===== */
AquiAds.seedDemoData = function() {
  if (!AquiAds.Auth.isLoggedIn()) return;
  const list = AquiAds.State.getCreatives();
  if (list.length > 0) return;
  const demos = [
    { id:'demo1', name:'Campanha Verão 2025', formatId:'digital-square', status:'approved', score:82, thumbnail:'', createdAt: new Date(Date.now()-5*86400000).toISOString(), updatedAt: new Date(Date.now()-2*86400000).toISOString(), campaign:{ name:'Verão 2025', start:'2025-01-01', end:'2025-01-31' } },
    { id:'demo2', name:'Outdoor Lançamento', formatId:'ooh-outdoor', status:'review',    score:68, thumbnail:'', createdAt: new Date(Date.now()-2*86400000).toISOString(), updatedAt: new Date(Date.now()-1*86400000).toISOString(), campaign:{} },
    { id:'demo3', name:'Story Promoção',     formatId:'digital-story', status:'draft',    score:45, thumbnail:'', createdAt: new Date(Date.now()-1*86400000).toISOString(), updatedAt: new Date().toISOString(), campaign:{} },
  ];
  AquiAds.State.set('aquiads_creatives', demos);
  AquiAds.Notifications.add('Bem-vindo ao AquiAds! Seu painel de exemplo foi configurado.', 'info');
  AquiAds.Notifications.add('Criativo "Campanha Verão 2025" aprovado com sucesso!', 'success');
};

/* ===== INIT ===== */
document.addEventListener('DOMContentLoaded', () => {
  AquiAds.Tooltip.init();
  const page = window.location.pathname.split('/').pop() || 'index.html';
  if (page !== 'index.html' && page !== '') {
    if (!AquiAds.Auth.requireLogin()) return;
    AquiAds.seedDemoData();
  }
  if (AquiAds.Auth.isLoggedIn() && (page === 'index.html' || page === '')) {
    // Already logged in — show dashboard link option handled by index page
  }
});
