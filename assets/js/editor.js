/* ===== EDITOR ===== */
const Editor = {
  state: null,
  format: null,
  selectedId: null,
  scaleRatio: 1,
  dragState: { active: false, elementId: null, startX: 0, startY: 0, origX: 0, origY: 0 },
  resizeState: { active: false, elementId: null, handle: '', startX: 0, startY: 0, origX: 0, origY: 0, origW: 0, origH: 0 },
  history: [],
  historyIndex: -1,

  /* ===== INIT ===== */
  init() {
    const templateId = AquiAds.Utils.getQueryParam('template');
    const creativeId = AquiAds.Utils.getQueryParam('id');
    const formatId   = AquiAds.Utils.getQueryParam('format') || 'digital-square';

    if (templateId) {
      this.initFromTemplate(templateId);
    } else if (creativeId) {
      this.initFromCreative(creativeId);
    } else {
      this.initBlank(formatId);
    }

    this.setupFormatSelector();
    this.bindEvents();
    this.setupPanel();
    this.render();
    this.snapshot();
    this.updateLayersPanel();
    this.triggerValidation();

    // First visit tip
    if (!localStorage.getItem('aquiads_editor_visited')) {
      localStorage.setItem('aquiads_editor_visited', '1');
      setTimeout(() => AquiAds.Toast.show('Dica: clique em "Elementos" para adicionar textos e formas ao seu criativo.', 'default', 5000), 1200);
    }
  },

  initBlank(formatId) {
    this.format = AquiAds.Formats.find(f => f.id === formatId) || AquiAds.Formats[0];
    this.state = {
      id: AquiAds.Utils.generateId(), name: 'Novo Criativo',
      formatId: this.format.id,
      background: { type: 'solid', value: '#FFFFFF' },
      elements: []
    };
  },

  initFromTemplate(templateId) {
    const tmpl = AquiAds.Templates.find(t => t.id === templateId);
    if (!tmpl) { this.initBlank('digital-square'); return; }
    this.format = AquiAds.Formats.find(f => f.id === tmpl.format) || AquiAds.Formats[0];
    this.state = {
      id: AquiAds.Utils.generateId(), name: tmpl.name,
      formatId: this.format.id,
      background: { type: 'solid', value: '#FFFFFF' },
      elements: AquiAds.Utils.deepClone(tmpl.elements)
    };
    document.title = tmpl.name + ' — AquiAds Editor';
  },

  initFromCreative(creativeId) {
    const creative = AquiAds.State.getCreatives().find(c => c.id === creativeId);
    if (!creative) { this.initBlank('digital-square'); return; }
    this.format = AquiAds.Formats.find(f => f.id === creative.formatId) || AquiAds.Formats[0];
    this.state = creative;
    if (!this.state.background) this.state.background = { type: 'solid', value: '#FFFFFF' };
    if (!this.state.elements)   this.state.elements = [];
  },

  /* ===== SETUP CANVAS SCALE ===== */
  setupCanvas() {
    const viewport = document.getElementById('canvas-viewport');
    if (!viewport) return;
    const vW = viewport.clientWidth  - 64;
    const vH = viewport.clientHeight - 64;
    const scaleW = vW / this.format.width;
    const scaleH = vH / this.format.height;
    this.scaleRatio = Math.min(1, scaleW, scaleH);
    const displayW = Math.round(this.format.width  * this.scaleRatio);
    const displayH = Math.round(this.format.height * this.scaleRatio);

    const stage = document.getElementById('canvas-stage');
    const bgCanvas = document.getElementById('bg-canvas');
    if (stage) { stage.style.width = displayW + 'px'; stage.style.height = displayH + 'px'; }
    if (bgCanvas) { bgCanvas.width = displayW; bgCanvas.height = displayH; bgCanvas.style.width = displayW + 'px'; bgCanvas.style.height = displayH + 'px'; }

    this.updateSafeZoneOverlay();
    this.renderBackground();
  },

  updateSafeZoneOverlay() {
    const overlay = document.getElementById('safe-zone-overlay');
    if (!overlay || !this.format) return;
    const mW = Math.round(this.format.safeZoneMargin * this.format.width  * this.scaleRatio);
    const mH = Math.round(this.format.safeZoneMargin * this.format.height * this.scaleRatio);
    overlay.style.left = mW + 'px'; overlay.style.top  = mH + 'px';
    overlay.style.right= mW + 'px'; overlay.style.bottom = mH + 'px';
    overlay.style.width = ''; overlay.style.height = '';
  },

  /* ===== FORMAT SELECTOR ===== */
  setupFormatSelector() {
    const sel = document.getElementById('format-selector');
    if (!sel) return;
    sel.innerHTML = '';
    const groups = {};
    AquiAds.Formats.forEach(f => { if (!groups[f.category]) groups[f.category] = []; groups[f.category].push(f); });
    Object.keys(groups).forEach(cat => {
      const og = document.createElement('optgroup'); og.label = cat;
      groups[cat].forEach(f => {
        const opt = document.createElement('option'); opt.value = f.id; opt.textContent = f.name;
        if (this.format && f.id === this.format.id) opt.selected = true;
        og.appendChild(opt);
      });
      sel.appendChild(og);
    });
    sel.addEventListener('change', e => {
      const newFormat = AquiAds.Formats.find(f => f.id === e.target.value);
      if (!newFormat) return;
      const scaleX = newFormat.width  / this.format.width;
      const scaleY = newFormat.height / this.format.height;
      this.format = newFormat;
      this.state.formatId = newFormat.id;
      this.state.elements = this.state.elements.map(el => ({
        ...el,
        x: AquiAds.Utils.clamp(el.x * scaleX, 0, 95),
        y: AquiAds.Utils.clamp(el.y * scaleY, 0, 95),
        w: AquiAds.Utils.clamp(el.w * scaleX, 1, 100),
        h: AquiAds.Utils.clamp(el.h * scaleY, 1, 100),
      }));
      this.setupCanvas();
      this.renderAll();
      this.triggerValidation();
      AquiAds.Toast.show(`Formato alterado para ${newFormat.name}`, 'default', 2000);
    });
  },

  setupPanel() {
    const nameInput = document.getElementById('creative-name');
    if (nameInput) {
      nameInput.value = this.state.name;
      nameInput.addEventListener('input', e => { this.state.name = e.target.value; });
    }

    // Left panel tabs only (scoped to .panel-left)
    const leftPanel = document.querySelector('.panel-left');
    if (leftPanel) {
      leftPanel.querySelectorAll('.panel-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          leftPanel.querySelectorAll('.panel-tab').forEach(b => b.classList.remove('tab-btn--active'));
          leftPanel.querySelectorAll('.panel-tab-content').forEach(c => c.classList.remove('tab-content--active'));
          btn.classList.add('tab-btn--active');
          const target = document.getElementById('tab-' + btn.dataset.tab);
          if (target) target.classList.add('tab-content--active');
        });
      });
    }

    // Add element buttons
    document.querySelectorAll('.element-btn').forEach(btn => {
      btn.addEventListener('click', () => this.addElement(btn.dataset.type));
    });

    // Background color
    const bgColorInput = document.getElementById('bg-color-input');
    if (bgColorInput) {
      bgColorInput.value = this.state.background.value || '#FFFFFF';
      bgColorInput.addEventListener('input', e => {
        this.state.background = { type: 'solid', value: e.target.value };
        this.renderBackground(); this.triggerValidation();
      });
    }

    // Color swatches
    document.querySelectorAll('.color-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        const color = sw.dataset.color;
        if (this.selectedId) {
          this.updateSelected('color', color);
          this.updateSelected('backgroundColor', color);
        } else {
          this.state.background = { type: 'solid', value: color };
          this.renderBackground();
        }
        this.triggerValidation();
      });
    });

    // Text properties
    ['font-family-sel','font-size-input','text-color-input','text-align-sel'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', e => {
        const map = { 'font-family-sel':'fontFamily','font-size-input':'fontSize','text-color-input':'color','text-align-sel':'textAlign' };
        let val = e.target.value;
        if (id === 'font-size-input') val = val + 'px';
        this.updateSelected(map[id], val);
        this.triggerValidation();
      });
      el.addEventListener('input', e => el.dispatchEvent(new Event('change')));
    });

    // Bold / Italic
    document.getElementById('btn-bold')?.addEventListener('click', () => {
      const el = this.getSelected();
      if (!el) return;
      const isBold = el.styles.fontWeight === '700' || el.styles.fontWeight === 'bold';
      this.updateSelected('fontWeight', isBold ? '400' : '700');
    });
    document.getElementById('btn-italic')?.addEventListener('click', () => {
      const el = this.getSelected();
      if (!el) return;
      const isItalic = el.styles.fontStyle === 'italic';
      this.updateSelected('fontStyle', isItalic ? 'normal' : 'italic');
    });

    // Image upload
    const uploadInput = document.getElementById('image-upload-input');
    const uploadBtn   = document.getElementById('image-upload-btn');
    if (uploadBtn && uploadInput) {
      uploadBtn.addEventListener('click', () => uploadInput.click());
      uploadInput.addEventListener('change', e => {
        if (e.target.files[0]) this.handleImageUpload(e.target.files[0]);
      });
    }

    // Undo / Redo
    document.getElementById('btn-undo')?.addEventListener('click', () => this.undo());
    document.getElementById('btn-redo')?.addEventListener('click', () => this.redo());

    // Save / Submit
    document.getElementById('btn-save')?.addEventListener('click', () => this.save());
    document.getElementById('btn-submit')?.addEventListener('click', () => this.openSubmitModal());

    // Export
    document.querySelectorAll('[data-export]').forEach(btn => {
      btn.addEventListener('click', () => this.exportCreative(btn.dataset.export));
    });

    // Safe zone toggle
    document.getElementById('safe-zone-toggle')?.addEventListener('change', e => {
      const overlay = document.getElementById('safe-zone-overlay');
      if (overlay) overlay.style.display = e.target.checked ? 'block' : 'none';
    });

    // Delete selected
    document.getElementById('btn-delete-selected')?.addEventListener('click', () => {
      if (this.selectedId) this.removeElement(this.selectedId);
    });

    // AI button
    document.getElementById('ai-fab')?.addEventListener('click', () => {
      const results = AquiAds.Validator.validate(this.state, this.format);
      AquiAds.AIHelper.openModal(this.state, this.format, results);
    });
    document.getElementById('ai-modal-close')?.addEventListener('click', () => AquiAds.AIHelper.closeModal());
    document.getElementById('ai-cancel-btn')?.addEventListener('click', () => AquiAds.AIHelper.closeModal());
  },

  /* ===== BACKGROUND ===== */
  renderBackground() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const bg = this.state.background;
    if (!bg || bg.type === 'solid') {
      ctx.fillStyle = bg ? bg.value : '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (bg.type === 'gradient' && bg.gradient) {
      const grd = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grd.addColorStop(0, bg.gradient.from || '#FF6B00');
      grd.addColorStop(1, bg.gradient.to   || '#FF8C00');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  },

  /* ===== ADD ELEMENT ===== */
  addElement(type) {
    const defaults = {
      text:   { w:40, h:12, content:'Texto aqui', styles:{ color:'#1A1A1A', fontSize:'18px', fontWeight:'600', fontFamily:'Inter', textAlign:'left', lineHeight:'1.4' } },
      rect:   { w:30, h:20, content:'', styles:{ backgroundColor:'#FF6B00', borderRadius:'8px' } },
      circle: { w:20, h:20, content:'', styles:{ backgroundColor:'#FF6B00', borderRadius:'50%' } },
      image:  { w:30, h:30, content:'', styles:{ objectFit:'cover', backgroundColor:'#E5E5E5', borderRadius:'8px' } },
      logo:   { w:25, h:12, content:'LOGO', styles:{ backgroundColor:'rgba(255,107,0,0.1)', border:'2px dashed #FF6B00', borderRadius:'6px', color:'#FF6B00', fontSize:'12px', fontWeight:'700', display:'flex', alignItems:'center', justifyContent:'center' } },
      line:   { w:40, h:2,  content:'', styles:{ backgroundColor:'#1A1A1A' } },
    };
    const def = defaults[type] || defaults.rect;
    const el = {
      id: AquiAds.Utils.generateId(), type,
      x: 20, y: 20, w: def.w, h: def.h,
      zIndex: this.state.elements.length + 10,
      locked: false, visible: true,
      content: def.content, styles: { ...def.styles }
    };
    this.state.elements.push(el);
    this.renderElement(el);
    this.selectElement(el.id);
    this.updateLayersPanel();
    this.snapshot();
    this.triggerValidation();
  },

  /* ===== RENDER ELEMENT ===== */
  renderElement(elData) {
    const stage = document.getElementById('canvas-stage');
    if (!stage) return;
    let div = stage.querySelector(`[data-id="${elData.id}"]`);
    if (!div) { div = document.createElement('div'); div.className = 'canvas-element'; div.dataset.id = elData.id; stage.appendChild(div); }
    if (!elData.visible) { div.style.display = 'none'; return; }
    div.style.display = '';
    const s = this.scaleRatio;
    div.style.left   = (elData.x / 100 * this.format.width  * s) + 'px';
    div.style.top    = (elData.y / 100 * this.format.height * s) + 'px';
    div.style.width  = (elData.w / 100 * this.format.width  * s) + 'px';
    div.style.height = (elData.h / 100 * this.format.height * s) + 'px';
    div.style.zIndex = elData.zIndex;
    const st = elData.styles || {};
    div.style.backgroundColor = st.backgroundColor || '';
    div.style.borderRadius    = st.borderRadius     || '';
    div.style.border          = st.border           || '';
    div.style.opacity         = st.opacity !== undefined ? st.opacity : '';
    div.style.display         = st.display          || 'flex';
    div.style.alignItems      = st.alignItems       || 'center';
    div.style.justifyContent  = st.justifyContent   || 'flex-start';
    div.style.padding         = st.padding          || '4px 6px';
    div.style.boxSizing       = 'border-box';
    div.style.overflow        = 'hidden';

    if (elData.type === 'text') {
      div.style.color        = st.color       || '#1A1A1A';
      div.style.fontSize     = Math.max(6, parseFloat(st.fontSize || '14') * s) + 'px';
      div.style.fontWeight   = st.fontWeight  || '400';
      div.style.fontStyle    = st.fontStyle   || 'normal';
      div.style.fontFamily   = st.fontFamily  || 'Inter, sans-serif';
      div.style.textAlign    = st.textAlign   || 'left';
      div.style.lineHeight   = st.lineHeight  || '1.4';
      div.style.whiteSpace   = 'pre-wrap';
      div.style.wordBreak    = 'break-word';
      div.style.cursor       = 'text';
      if (!div.classList.contains('editing')) div.textContent = elData.content || '';
    } else if (elData.type === 'image' && elData.content) {
      div.innerHTML = `<img src="${elData.content}" style="width:100%;height:100%;object-fit:${st.objectFit||'cover'};border-radius:${st.borderRadius||'0'};display:block;" alt="">`;
    } else if (elData.type === 'logo' && !(elData.content || '').startsWith('data:')) {
      div.style.color       = st.color      || '#FF6B00';
      div.style.fontSize    = Math.max(6, parseFloat(st.fontSize||'12') * s) + 'px';
      div.style.fontWeight  = st.fontWeight || '700';
      div.style.fontFamily  = st.fontFamily || 'Inter';
      div.style.textAlign   = 'center';
      div.style.justifyContent = 'center';
      div.textContent = elData.content || 'LOGO';
    } else {
      if (elData.content && elData.type !== 'image') {
        div.style.color = st.color || '#fff';
        div.style.fontSize = Math.max(6, parseFloat(st.fontSize||'12') * s) + 'px';
        div.style.fontWeight = st.fontWeight || '700';
        div.style.fontFamily = st.fontFamily || 'Inter';
        div.style.justifyContent = st.justifyContent || 'center';
        div.textContent = elData.content;
      }
    }
    this.makeDraggable(div);
    this.makeResizable(div);
    this.bindElementEvents(div, elData);
  },

  makeDraggable(div) {
    div.onmousedown = (e) => {
      if (e.target.classList.contains('resize-handle') || div.classList.contains('editing')) return;
      e.preventDefault(); e.stopPropagation();
      this.selectElement(div.dataset.id);
      const el = this.getElementById(div.dataset.id);
      if (!el || el.locked) return;
      const stage = document.getElementById('canvas-stage');
      const stageRect = stage.getBoundingClientRect();
      const divRect   = div.getBoundingClientRect();
      this.dragState = { active:true, elementId:div.dataset.id, startX:e.clientX, startY:e.clientY, origX: divRect.left - stageRect.left, origY: divRect.top - stageRect.top };
    };
  },

  bindElementEvents(div, elData) {
    div.addEventListener('dblclick', e => {
      if (elData.type === 'text') { this.enterTextEdit(div.dataset.id); e.stopPropagation(); }
    });
    div.addEventListener('click', e => { e.stopPropagation(); this.selectElement(div.dataset.id); });
  },

  makeResizable(div) {
    div.querySelectorAll('.resize-handle').forEach(h => h.remove());
    ['nw','ne','se','sw'].forEach(pos => {
      const h = document.createElement('div');
      h.className = `resize-handle resize-handle--${pos}`;
      h.onmousedown = (e) => {
        e.preventDefault(); e.stopPropagation();
        const stage = document.getElementById('canvas-stage');
        const stageRect = stage.getBoundingClientRect();
        const divRect   = div.getBoundingClientRect();
        this.resizeState = {
          active: true, elementId: div.dataset.id, handle: pos,
          startX: e.clientX, startY: e.clientY,
          origX: divRect.left - stageRect.left,
          origY: divRect.top  - stageRect.top,
          origW: divRect.width, origH: divRect.height
        };
      };
      div.appendChild(h);
    });
  },

  /* ===== GLOBAL MOUSE EVENTS ===== */
  bindEvents() {
    const stage = document.getElementById('canvas-stage');
    if (stage) {
      stage.addEventListener('click', () => this.deselectAll());
      window.addEventListener('resize', AquiAds.Utils.debounce(() => { this.setupCanvas(); this.renderAll(); }, 200));
    }

    document.addEventListener('mousemove', e => {
      if (this.dragState.active) this.handleDrag(e);
      if (this.resizeState.active) this.handleResize(e);
    });
    document.addEventListener('mouseup', e => {
      if (this.dragState.active)  this.endDrag(e);
      if (this.resizeState.active) this.endResize(e);
    });
    document.addEventListener('keydown', e => {
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); this.undo(); }
      if (e.ctrlKey && e.key === 'y') { e.preventDefault(); this.redo(); }
      if (e.key === 'Delete' && this.selectedId) {
        const el = this.getSelected();
        if (el && !document.querySelector('.canvas-element.editing')) this.removeElement(this.selectedId);
      }
    });
  },

  handleDrag(e) {
    const ds = this.dragState;
    const stage = document.getElementById('canvas-stage');
    const div   = stage.querySelector(`[data-id="${ds.elementId}"]`);
    if (!div) return;
    const dx = e.clientX - ds.startX, dy = e.clientY - ds.startY;
    const newLeft = ds.origX + dx, newTop = ds.origY + dy;
    const stageW = stage.clientWidth, stageH = stage.clientHeight;
    const elW = div.clientWidth, elH = div.clientHeight;
    const clampedX = AquiAds.Utils.clamp(newLeft, 0, stageW - elW);
    const clampedY = AquiAds.Utils.clamp(newTop,  0, stageH - elH);
    div.style.left = clampedX + 'px'; div.style.top = clampedY + 'px';
  },

  endDrag(e) {
    const ds = this.dragState;
    if (!ds.active) return;
    this.dragState.active = false;
    const stage = document.getElementById('canvas-stage');
    const div   = stage.querySelector(`[data-id="${ds.elementId}"]`);
    if (!div) return;
    const el = this.getElementById(ds.elementId);
    if (!el) return;
    const stageW = stage.clientWidth, stageH = stage.clientHeight;
    el.x = AquiAds.Utils.clamp((parseFloat(div.style.left) / stageW) * 100, 0, 100);
    el.y = AquiAds.Utils.clamp((parseFloat(div.style.top)  / stageH) * 100, 0, 100);
    this.snapshot(); this.triggerValidation();
  },

  handleResize(e) {
    const rs = this.resizeState;
    const stage = document.getElementById('canvas-stage');
    const div   = stage.querySelector(`[data-id="${rs.elementId}"]`);
    if (!div) return;
    const dx = e.clientX - rs.startX, dy = e.clientY - rs.startY;
    const minPx = 20;
    let newL = rs.origX, newT = rs.origY, newW = rs.origW, newH = rs.origH;
    if (rs.handle.includes('e')) { newW = Math.max(minPx, rs.origW + dx); }
    if (rs.handle.includes('s')) { newH = Math.max(minPx, rs.origH + dy); }
    if (rs.handle.includes('w')) { const d = Math.min(dx, rs.origW - minPx); newL = rs.origX + d; newW = rs.origW - d; }
    if (rs.handle.includes('n')) { const d = Math.min(dy, rs.origH - minPx); newT = rs.origY + d; newH = rs.origH - d; }
    div.style.left = newL + 'px'; div.style.top  = newT + 'px';
    div.style.width = newW + 'px'; div.style.height = newH + 'px';
  },

  endResize(e) {
    const rs = this.resizeState;
    if (!rs.active) return;
    this.resizeState.active = false;
    const stage = document.getElementById('canvas-stage');
    const div   = stage.querySelector(`[data-id="${rs.elementId}"]`);
    if (!div) return;
    const el = this.getElementById(rs.elementId);
    if (!el) return;
    const stageW = stage.clientWidth, stageH = stage.clientHeight;
    el.x = (parseFloat(div.style.left)   / stageW) * 100;
    el.y = (parseFloat(div.style.top)    / stageH) * 100;
    el.w = (parseFloat(div.style.width)  / stageW) * 100;
    el.h = (parseFloat(div.style.height) / stageH) * 100;
    this.snapshot(); this.triggerValidation();
  },

  /* ===== SELECT / DESELECT ===== */
  selectElement(id) {
    this.deselectAll();
    this.selectedId = id;
    const stage = document.getElementById('canvas-stage');
    const div = stage.querySelector(`[data-id="${id}"]`);
    if (div) div.classList.add('canvas-element--selected');
    this.populatePropertiesPanel(id);
    this.updateLayersPanel();
  },

  deselectAll() {
    this.selectedId = null;
    document.querySelectorAll('.canvas-element--selected').forEach(el => el.classList.remove('canvas-element--selected'));
    this.updateLayersPanel();
  },

  /* ===== TEXT EDIT ===== */
  enterTextEdit(id) {
    const stage = document.getElementById('canvas-stage');
    const div = stage.querySelector(`[data-id="${id}"]`);
    if (!div) return;
    div.classList.add('editing');
    div.contentEditable = 'true';
    div.focus();
    const range = document.createRange(); range.selectNodeContents(div); range.collapse(false);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    div.onblur = () => this.exitTextEdit(id, div);
  },

  exitTextEdit(id, div) {
    div.contentEditable = 'false'; div.classList.remove('editing');
    const el = this.getElementById(id);
    if (el) { el.content = div.textContent || ''; this.snapshot(); this.triggerValidation(); }
    div.onblur = null;
  },

  /* ===== IMAGE UPLOAD ===== */
  handleImageUpload(file) {
    if (file.size > 10 * 1024 * 1024) { AquiAds.Toast.show('Imagem muito grande. Máximo 10MB.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const id = AquiAds.Utils.generateId();
      const el = { id, type:'image', x:10, y:10, w:40, h:40, zIndex: this.state.elements.length+10, locked:false, visible:true, content: e.target.result, styles:{ objectFit:'cover', borderRadius:'8px' } };
      this.state.elements.push(el);
      this.renderElement(el);
      this.selectElement(id);
      this.updateLayersPanel();
      this.snapshot();
      this.triggerValidation();
    };
    reader.readAsDataURL(file);
  },

  /* ===== REMOVE ELEMENT ===== */
  removeElement(id) {
    this.state.elements = this.state.elements.filter(e => e.id !== id);
    const stage = document.getElementById('canvas-stage');
    const div = stage.querySelector(`[data-id="${id}"]`);
    if (div) div.remove();
    this.selectedId = null;
    this.updateLayersPanel();
    this.snapshot();
    this.triggerValidation();
  },

  /* ===== UPDATE SELECTED ===== */
  updateSelected(prop, value) {
    const el = this.getSelected();
    if (!el) return;
    if (!el.styles) el.styles = {};
    el.styles[prop] = value;
    const stage = document.getElementById('canvas-stage');
    const div = stage.querySelector(`[data-id="${el.id}"]`);
    if (div) this.renderElement(el);
    this.snapshot();
  },

  /* ===== UNDO / REDO ===== */
  snapshot() {
    const snap = AquiAds.Utils.deepClone({ elements: this.state.elements, background: this.state.background });
    if (this.historyIndex < this.history.length - 1) this.history.splice(this.historyIndex + 1);
    this.history.push(snap);
    if (this.history.length > 50) this.history.shift();
    this.historyIndex = this.history.length - 1;
    this.updateUndoRedoButtons();
  },

  undo() {
    if (this.historyIndex <= 0) return;
    this.historyIndex--;
    this.restoreSnapshot(this.history[this.historyIndex]);
  },

  redo() {
    if (this.historyIndex >= this.history.length - 1) return;
    this.historyIndex++;
    this.restoreSnapshot(this.history[this.historyIndex]);
  },

  restoreSnapshot(snap) {
    this.state.elements  = AquiAds.Utils.deepClone(snap.elements);
    this.state.background = AquiAds.Utils.deepClone(snap.background);
    this.renderAll();
    this.triggerValidation();
    this.updateUndoRedoButtons();
  },

  updateUndoRedoButtons() {
    const undoBtn = document.getElementById('btn-undo'), redoBtn = document.getElementById('btn-redo');
    if (undoBtn) undoBtn.disabled = this.historyIndex <= 0;
    if (redoBtn) redoBtn.disabled = this.historyIndex >= this.history.length - 1;
  },

  /* ===== RENDER ALL ===== */
  render() {
    this.setupCanvas();
    this.state.elements.forEach(el => this.renderElement(el));
  },

  renderAll() {
    const stage = document.getElementById('canvas-stage');
    if (!stage) return;
    this.setupCanvas();
    stage.querySelectorAll('.canvas-element').forEach(el => el.remove());
    this.state.elements.forEach(el => this.renderElement(el));
    this.updateLayersPanel();
  },

  /* ===== LOAD STATE (AI apply) ===== */
  loadState(newState) {
    this.state.elements   = AquiAds.Utils.deepClone(newState.elements);
    this.state.background = AquiAds.Utils.deepClone(newState.background || this.state.background);
    this.renderAll();
  },

  /* ===== LAYERS PANEL ===== */
  updateLayersPanel() {
    const list = document.getElementById('layers-list');
    if (!list) return;
    if (!this.state.elements.length) {
      list.innerHTML = '<p style="font-size:0.8rem;color:var(--color-text-muted);padding:12px;text-align:center;">Adicione elementos ao canvas</p>';
      return;
    }
    list.innerHTML = '';
    [...this.state.elements].reverse().forEach(el => {
      const item = document.createElement('div');
      item.className = 'layer-item' + (el.id === this.selectedId ? ' layer-item--selected' : '');
      const icons = { text:'T', rect:'▭', circle:'◉', image:'🖼', logo:'★', line:'─' };
      item.innerHTML = `
        <span class="layer-icon" style="font-size:1rem;width:20px;text-align:center;">${icons[el.type]||'▭'}</span>
        <span class="layer-name">${el.content ? el.content.slice(0,20) || el.type : el.type}</span>
        <div class="layer-actions">
          <button class="layer-action-btn" data-action="visibility" data-id="${el.id}" title="${el.visible?'Ocultar':'Mostrar'}">${el.visible?'👁':'🙈'}</button>
          <button class="layer-action-btn" data-action="delete" data-id="${el.id}" title="Excluir">✕</button>
        </div>`;
      item.addEventListener('click', () => this.selectElement(el.id));
      list.appendChild(item);
    });
    list.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); this.removeElement(btn.dataset.id); });
    });
    list.querySelectorAll('[data-action="visibility"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const el = this.getElementById(btn.dataset.id);
        if (el) { el.visible = !el.visible; this.renderAll(); this.snapshot(); }
      });
    });
  },

  /* ===== PROPERTIES PANEL ===== */
  populatePropertiesPanel(id) {
    const el = this.getElementById(id);
    if (!el) return;
    const fontFam = document.getElementById('font-family-sel');
    const fontSize = document.getElementById('font-size-input');
    const textColor = document.getElementById('text-color-input');
    const textAlign = document.getElementById('text-align-sel');
    if (el.styles) {
      if (fontFam   && el.styles.fontFamily) fontFam.value = el.styles.fontFamily.split(',')[0].trim();
      if (fontSize  && el.styles.fontSize)   fontSize.value = parseInt(el.styles.fontSize);
      if (textColor && el.styles.color)      textColor.value = this.rgbToHex(el.styles.color) || '#1A1A1A';
      if (textAlign && el.styles.textAlign)  textAlign.value = el.styles.textAlign;
    }
    // Switch to text tab if text element (scoped to left panel only)
    if (el.type === 'text') {
      const leftPanel = document.querySelector('.panel-left');
      if (leftPanel) {
        leftPanel.querySelectorAll('.panel-tab').forEach(b => b.classList.remove('tab-btn--active'));
        leftPanel.querySelectorAll('.panel-tab-content').forEach(c => c.classList.remove('tab-content--active'));
        const txtTab = leftPanel.querySelector('.panel-tab[data-tab="text"]');
        const txtContent = document.getElementById('tab-text');
        if (txtTab) txtTab.classList.add('tab-btn--active');
        if (txtContent) txtContent.classList.add('tab-content--active');
      }
    }
  },

  rgbToHex(rgb) {
    if (!rgb) return '#000000';
    if (rgb.startsWith('#')) return rgb;
    const m = rgb.match(/\d+/g);
    if (!m) return '#000000';
    return '#' + m.slice(0,3).map(x => parseInt(x).toString(16).padStart(2,'0')).join('');
  },

  /* ===== SAVE ===== */
  save() {
    this.state.updatedAt = new Date().toISOString();
    if (!this.state.createdAt) this.state.createdAt = this.state.updatedAt;
    if (!this.state.status) this.state.status = 'draft';
    const score = AquiAds.Validator.validate(this.state, this.format).score;
    this.state.score = score;
    AquiAds.State.saveCreative(this.state);
    AquiAds.Toast.show('Criativo salvo com sucesso!', 'success');
  },

  /* ===== EXPORT ===== */
  exportCreative(type) {
    AquiAds.Toast.show(`Preparando exportação ${type.toUpperCase()}...`, 'default', 2000);
    setTimeout(() => {
      try {
        const stage = document.getElementById('canvas-stage');
        if (!stage) return;
        // Use html2canvas if available
        if (window.html2canvas) {
          const overlay = document.getElementById('safe-zone-overlay');
          const prevDisplay = overlay ? overlay.style.display : '';
          if (overlay) overlay.style.display = 'none';
          document.querySelectorAll('.resize-handle, .canvas-element--selected').forEach(el => { el._prevOutline = el.style.outline; el.style.outline = 'none'; });
          html2canvas(stage, { useCORS: true, scale: 1/this.scaleRatio, width: stage.clientWidth, height: stage.clientHeight }).then(canvas => {
            if (overlay) overlay.style.display = prevDisplay;
            document.querySelectorAll('.resize-handle').forEach(el => { el.style.outline = el._prevOutline || ''; });
            const link = document.createElement('a');
            link.download = (this.state.name || 'criativo') + '.' + (type === 'jpg' ? 'jpg' : 'png');
            link.href = canvas.toDataURL(type === 'jpg' ? 'image/jpeg' : 'image/png', 0.92);
            link.click();
            AquiAds.Toast.show('Arquivo exportado com sucesso!', 'success');
          });
        } else {
          AquiAds.Toast.show('Exportação disponível após salvar o criativo.', 'warning');
        }
      } catch(err) { AquiAds.Toast.show('Erro ao exportar. Tente novamente.', 'error'); }
    }, 100);
  },

  /* ===== SUBMIT MODAL ===== */
  openSubmitModal() {
    const results = AquiAds.Validator.validate(this.state, this.format);
    const modal = document.getElementById('submit-modal-overlay');
    if (!modal) return;
    const checklist = document.getElementById('submit-checklist');
    if (checklist) {
      const checks = [
        { ok: !!this.format, label:'Formato selecionado', msg: this.format ? this.format.name : 'Selecione um formato' },
        { ok: results.checks.find(c=>c.id==='safeZone')?.status === 'pass', label:'Zona segura limpa', msg: results.checks.find(c=>c.id==='safeZone')?.message },
        { ok: results.score >= 50, label:`Score de qualidade ≥50 (atual: ${results.score})`, msg: results.score < 50 ? 'Melhore o criativo antes de enviar' : 'Score adequado para envio' },
        { ok: results.checks.find(c=>c.id==='cta')?.status === 'pass', label:'Chamada para ação presente', msg: results.checks.find(c=>c.id==='cta')?.message },
      ];
      checklist.innerHTML = checks.map(c => `
        <div class="checklist-item">
          <div class="checklist-icon checklist-icon--${c.ok?'pass':'warn'}">${c.ok?'✓':'!'}</div>
          <div class="checklist-item-label">
            <div>${c.label}</div>
            <div class="checklist-item-msg">${c.msg||''}</div>
          </div>
        </div>`).join('');
    }
    modal.classList.add('modal-overlay--open');
    document.getElementById('submit-confirm-btn').onclick = () => this.confirmSubmit();
    document.getElementById('submit-close-btn').onclick   = () => modal.classList.remove('modal-overlay--open');
  },

  confirmSubmit() {
    this.save();
    const creative = AquiAds.State.getCreatives().find(c => c.id === this.state.id);
    if (creative) {
      creative.status = 'review';
      creative.submittedAt = new Date().toISOString();
      const campaignName  = document.getElementById('campaign-name')?.value  || this.state.name;
      const campaignStart = document.getElementById('campaign-start')?.value || '';
      const campaignEnd   = document.getElementById('campaign-end')?.value   || '';
      creative.campaign   = { name: campaignName, start: campaignStart, end: campaignEnd };
      AquiAds.State.saveCreative(creative);
      AquiAds.Notifications.add(`Criativo "${creative.name}" enviado para aprovação.`, 'info');
    }
    document.getElementById('submit-modal-overlay').classList.remove('modal-overlay--open');
    AquiAds.Toast.show('Criativo enviado para aprovação!', 'success', 4000);
    setTimeout(() => AquiAds.Router.goTo('dashboard.html'), 2000);
  },

  /* ===== HELPERS ===== */
  getElementById(id) { return this.state.elements.find(e => e.id === id); },
  getSelected()      { return this.getElementById(this.selectedId); },

  triggerValidation: function() {},
};

/* Rebind triggerValidation after AquiAds.Utils is ready */
document.addEventListener('DOMContentLoaded', () => {
  Editor.triggerValidation = AquiAds.Utils.debounce(function() {
    if (!Editor.state || !Editor.format) return;
    const results = AquiAds.Validator.validate(Editor.state, Editor.format);
    AquiAds.Validator.renderResults(results, document.getElementById('validation-strip'), document.getElementById('quality-badge'));
    AquiAds.Validator.highlightViolations(results.checks, document.getElementById('canvas-stage'));
  }, 300);
  Editor.init();
});
