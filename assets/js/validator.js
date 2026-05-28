/* ===== VALIDATOR — Safe Zone + Quality Score ===== */
AquiAds.Validator = {

  validate(state, format) {
    if (!state || !format) return { score: 0, grade: 'F', checks: [] };
    const checks = [
      this.checkSafeZone(state.elements, format),
      this.checkContrast(state.elements, state.background),
      this.checkCTAPresence(state.elements),
      this.checkLogoPresence(state.elements),
      this.checkReadability(state.elements, format),
      this.checkElementProportions(state.elements, format),
      this.checkTextCount(state.elements),
    ];
    const score = this.computeScore(checks);
    const grade = AquiAds.Utils.scoreGrade(score);
    return { score, grade, checks };
  },

  checkSafeZone(elements, format) {
    const mW = format.width  * format.safeZoneMargin;
    const mH = format.height * format.safeZoneMargin;
    const safe = { x: mW, y: mH, x2: format.width - mW, y2: format.height - mH };
    const criticalTypes = ['text', 'logo', 'rect', 'circle'];
    const violations = elements.filter(el => {
      if (!el.visible) return false;
      if (!criticalTypes.includes(el.type)) return false;
      const elX  = (el.x / 100) * format.width;
      const elY  = (el.y / 100) * format.height;
      const elX2 = elX + (el.w / 100) * format.width;
      const elY2 = elY + (el.h / 100) * format.height;
      return elX < safe.x || elY < safe.y || elX2 > safe.x2 || elY2 > safe.y2;
    });
    if (violations.length === 0) return { id:'safeZone', label:'Zona Segura', status:'pass', message:'Todos os elementos estão dentro da zona segura.', weight:20, violationIds:[] };
    return { id:'safeZone', label:'Zona Segura', status:'fail', message:`${violations.length} elemento(s) fora da zona segura.`, weight:20, violationIds: violations.map(e=>e.id) };
  },

  checkContrast(elements, background) {
    const textEls = elements.filter(e => e.type === 'text' && e.visible);
    if (!textEls.length) return { id:'contrast', label:'Contraste', status:'warn', message:'Adicione texto para verificar o contraste.', weight:20 };
    const bgColor = (background && background.type === 'solid') ? background.value : '#FFFFFF';
    let minRatio = 21;
    textEls.forEach(el => {
      const textColor = (el.styles && el.styles.color) || '#000000';
      const ratio = AquiAds.Utils.getContrastRatio(textColor, bgColor);
      if (ratio < minRatio) minRatio = ratio;
    });
    if (minRatio >= 4.5) return { id:'contrast', label:'Contraste', status:'pass', message:`Contraste adequado (${minRatio.toFixed(1)}:1).`, weight:20 };
    if (minRatio >= 3.0) return { id:'contrast', label:'Contraste', status:'warn', message:`Contraste baixo (${minRatio.toFixed(1)}:1). Recomendado ≥4.5:1.`, weight:20 };
    return { id:'contrast', label:'Contraste', status:'fail', message:`Contraste insuficiente (${minRatio.toFixed(1)}:1). Mínimo 3:1.`, weight:20 };
  },

  checkCTAPresence(elements) {
    const ctaKeywords = ['saiba mais','compre','clique','acesse','garanta','aproveite','desconto','oferta','ligue','whatsapp','comprar','solicite','peça','fale','contato','ver mais','conheça','visite','baixe','cadastre'];
    const textEls = elements.filter(e => e.type === 'text' && e.visible);
    if (!textEls.length) return { id:'cta', label:'CTA Presente', status:'warn', message:'Adicione um botão ou chamada para ação.', weight:15 };
    const hasCTA = textEls.some(el => {
      const t = (el.content || '').toLowerCase();
      return ctaKeywords.some(kw => t.includes(kw));
    });
    if (hasCTA) return { id:'cta', label:'CTA Presente', status:'pass', message:'Chamada para ação encontrada.', weight:15 };
    return { id:'cta', label:'CTA Presente', status:'warn', message:'Adicione uma chamada para ação (ex: "Saiba Mais").', weight:15 };
  },

  checkLogoPresence(elements) {
    const hasLogo = elements.some(e => e.type === 'logo' || (e.type === 'image' && e.visible));
    if (hasLogo) return { id:'logo', label:'Logo / Imagem', status:'pass', message:'Imagem ou logo presente.', weight:10 };
    return { id:'logo', label:'Logo / Imagem', status:'warn', message:'Adicione o logo da sua empresa.', weight:10 };
  },

  checkReadability(elements, format) {
    const textEls = elements.filter(e => e.type === 'text' && e.visible);
    if (!textEls.length) return { id:'readability', label:'Legibilidade', status:'warn', message:'Nenhum texto encontrado.', weight:15 };
    const isOOH = format.category === 'OOH';
    const minFontPx = isOOH ? 18 : 10;
    const problems = textEls.filter(el => {
      const fs = parseInt((el.styles && el.styles.fontSize) || '14px');
      return fs < minFontPx;
    });
    if (problems.length === 0) return { id:'readability', label:'Legibilidade', status:'pass', message:'Tamanho de fonte adequado.', weight:15 };
    return { id:'readability', label:'Legibilidade', status:'warn', message:`${problems.length} texto(s) com fonte pequena. Mínimo ${minFontPx}px.`, weight:15 };
  },

  checkElementProportions(elements, format) {
    const visible = elements.filter(e => e.visible);
    if (visible.length < 2) return { id:'proportions', label:'Composição', status:'warn', message:'Adicione mais elementos ao criativo.', weight:10 };
    const oversized = visible.filter(el => {
      const area = (el.w/100) * (el.h/100);
      return area > 0.85 && el.type !== 'rect';
    });
    if (oversized.length > 0) return { id:'proportions', label:'Composição', status:'warn', message:'Algum elemento ocupa quase toda a área.', weight:10 };
    return { id:'proportions', label:'Composição', status:'pass', message:'Proporção dos elementos equilibrada.', weight:10 };
  },

  checkTextCount(elements) {
    const textEls = elements.filter(e => e.type === 'text' && e.visible);
    if (textEls.length === 0) return { id:'textCount', label:'Quantidade de Texto', status:'fail', message:'Nenhum texto no criativo.', weight:10 };
    if (textEls.length > 7)   return { id:'textCount', label:'Quantidade de Texto', status:'warn', message:`${textEls.length} elementos de texto. Simplifique para maior impacto.`, weight:10 };
    return { id:'textCount', label:'Quantidade de Texto', status:'pass', message:`${textEls.length} elemento(s) de texto.`, weight:10 };
  },

  computeScore(checks) {
    let earned = 0, total = 0;
    checks.forEach(c => {
      total += c.weight;
      if (c.status === 'pass') earned += c.weight;
      else if (c.status === 'warn') earned += c.weight * 0.5;
    });
    return total > 0 ? Math.round((earned / total) * 100) : 0;
  },

  renderResults(results, stripEl, badgeEl) {
    if (stripEl) {
      stripEl.innerHTML = '';
      results.checks.forEach(c => {
        const item = document.createElement('div');
        item.className = 'validation-item';
        item.innerHTML = `<span class="validation-dot validation-dot--${c.status}"></span><span>${c.label}: ${c.message}</span>`;
        stripEl.appendChild(item);
      });
    }
    if (badgeEl) {
      const grade = results.grade;
      const colorMap = { A:'#22C55E', B:'#84CC16', C:'#F59E0B', D:'#F97316', F:'#EF4444' };
      badgeEl.innerHTML = `<strong style="color:${colorMap[grade]}">${results.score}</strong><span>/100 &nbsp;·&nbsp; Nota ${grade}</span>`;
      badgeEl.classList.add('animate-pulse');
      setTimeout(() => badgeEl.classList.remove('animate-pulse'), 400);
    }
  },

  highlightViolations(checks, stageEl) {
    if (!stageEl) return;
    stageEl.querySelectorAll('.canvas-element').forEach(el => el.classList.remove('canvas-element--violation'));
    const safeCheck = checks.find(c => c.id === 'safeZone');
    if (safeCheck && safeCheck.violationIds) {
      safeCheck.violationIds.forEach(id => {
        const el = stageEl.querySelector(`[data-id="${id}"]`);
        if (el) el.classList.add('canvas-element--violation');
      });
    }
  }
};
