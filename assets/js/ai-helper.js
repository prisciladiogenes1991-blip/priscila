/* ===== AI HELPER — Suggestion Simulation ===== */
AquiAds.AIHelper = {

  suggestionTemplates: {
    safeZone:    { icon:'📐', title:'Ajustar Zona Segura',     desc:'Mover elementos para dentro da área segura do formato.' },
    contrast:    { icon:'🎨', title:'Melhorar Contraste',      desc:'Ajustar cores para garantir leitura clara em qualquer ambiente.' },
    cta:         { icon:'👆', title:'Adicionar Chamada para Ação', desc:'Inserir botão ou texto incentivando o clique.' },
    logo:        { icon:'🏷️', title:'Reservar Espaço para Logo', desc:'Adicionar área dedicada ao logo da empresa.' },
    readability: { icon:'🔤', title:'Aumentar Tamanho da Fonte', desc:'Aumentar fontes para garantir legibilidade à distância.' },
    proportions: { icon:'📏', title:'Rebalancear Composição',  desc:'Redistribuir elementos para melhor equilíbrio visual.' },
    textCount:   { icon:'✍️', title:'Simplificar o Texto',     desc:'Reduzir a quantidade de texto para mensagem mais direta.' },
  },

  analyze(state, validationResults) {
    const suggestions = [];
    validationResults.checks.forEach(check => {
      if (check.status === 'fail' || check.status === 'warn') {
        const tmpl = this.suggestionTemplates[check.id];
        if (tmpl) {
          suggestions.push({
            id: check.id,
            icon: tmpl.icon,
            title: tmpl.title,
            desc: tmpl.desc,
            checkMessage: check.message,
            apply: this.buildApplyFn(check.id)
          });
        }
      }
    });
    const improvedScore = Math.min(100, validationResults.score + suggestions.length * 12);
    return { suggestions, improvedScore };
  },

  buildApplyFn(checkId) {
    const fns = {
      safeZone(state, format) {
        if (!format) return state;
        const mW = format.safeZoneMargin * 100;
        const mH = format.safeZoneMargin * 100;
        state.elements = state.elements.map(el => {
          let { x, y, w, h } = el;
          if (x < mW) x = mW;
          if (y < mH) y = mH;
          if (x + w > 100 - mW) x = Math.max(mW, 100 - mW - w);
          if (y + h > 100 - mH) y = Math.max(mH, 100 - mH - h);
          return { ...el, x, y };
        });
        return state;
      },
      contrast(state) {
        state.elements = state.elements.map(el => {
          if (el.type !== 'text') return el;
          const bgColor = (state.background && state.background.value) || '#FFFFFF';
          const bg = AquiAds.Utils.hexToRgb(bgColor);
          const lum = AquiAds.Utils.getLuminance(bg.r, bg.g, bg.b);
          const newColor = lum > 0.5 ? '#1A1A1A' : '#FFFFFF';
          return { ...el, styles: { ...el.styles, color: newColor } };
        });
        return state;
      },
      cta(state) {
        const hasCTA = state.elements.some(el => {
          const t = (el.content || '').toLowerCase();
          return ['saiba mais','compre','clique','acesse'].some(kw => t.includes(kw));
        });
        if (!hasCTA) {
          state.elements.push({
            id: AquiAds.Utils.generateId(), type: 'text',
            x: 10, y: 80, w: 40, h: 10, zIndex: state.elements.length + 10,
            locked: false, visible: true, content: 'Saiba Mais →',
            styles: { color: '#FF6B00', fontSize: '16px', fontWeight: '700', fontFamily: 'Inter', backgroundColor: 'rgba(255,107,0,0.1)', borderRadius: '6px', padding: '6px 14px' }
          });
        }
        return state;
      },
      logo(state) {
        const hasLogo = state.elements.some(e => e.type === 'image' || e.type === 'logo');
        if (!hasLogo) {
          state.elements.push({
            id: AquiAds.Utils.generateId(), type: 'rect',
            x: 75, y: 80, w: 18, h: 12, zIndex: state.elements.length + 10,
            locked: false, visible: true, content: 'LOGO',
            styles: { backgroundColor: 'rgba(255,107,0,0.15)', borderRadius: '6px', border: '2px dashed #FF6B00', color: '#FF6B00', fontSize: '10px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center' }
          });
        }
        return state;
      },
      readability(state) {
        state.elements = state.elements.map(el => {
          if (el.type !== 'text') return el;
          const current = parseInt(el.styles.fontSize || '14');
          if (current < 18) return { ...el, styles: { ...el.styles, fontSize: Math.round(current * 1.25) + 'px' } };
          return el;
        });
        return state;
      },
      proportions(state) { return state; },
      textCount(state) { return state; },
    };
    return fns[checkId] || ((s) => s);
  },

  openModal(editorState, format, validationResults) {
    const { suggestions, improvedScore } = this.analyze(editorState, validationResults);
    const modal = document.getElementById('ai-modal');
    if (!modal) return;

    const scoreEl = modal.querySelector('#ai-score-improvement');
    if (scoreEl) {
      scoreEl.innerHTML = `
        <div class="score-improvement">
          <span class="from">${validationResults.score}</span>
          <span class="arrow">→</span>
          <span class="to">${improvedScore}</span>
          <p>Pontos de qualidade estimados após as melhorias</p>
        </div>`;
    }

    const listEl = modal.querySelector('#ai-suggestions-list');
    if (listEl) {
      if (suggestions.length === 0) {
        listEl.innerHTML = `<div style="text-align:center;padding:32px;">
          <div style="font-size:2.5rem;margin-bottom:12px;">🎉</div>
          <h4 style="margin-bottom:8px;">Criativo está ótimo!</h4>
          <p style="color:var(--color-text-muted);font-size:0.9rem;">Sua pontuação é alta. Poucas melhorias sugeridas.</p>
        </div>`;
      } else {
        listEl.innerHTML = `<div class="ai-suggestions-list">` +
          suggestions.map(s => `
            <div class="ai-suggestion-item">
              <input type="checkbox" class="ai-suggestion-check" data-id="${s.id}" checked>
              <span class="ai-suggestion-icon">${s.icon}</span>
              <div class="ai-suggestion-text">
                <strong>${s.title}</strong>
                <span>${s.desc}</span>
              </div>
            </div>`).join('') +
          `</div>`;
      }
    }

    modal.querySelector('#ai-apply-btn').onclick = () => {
      const checked = [...modal.querySelectorAll('.ai-suggestion-check:checked')].map(el => el.dataset.id);
      this.applySelected(checked, editorState, format, suggestions);
      this.closeModal();
    };

    modal.querySelector('#ai-apply-all-btn').onclick = () => {
      const allIds = suggestions.map(s => s.id);
      this.applySelected(allIds, editorState, format, suggestions);
      this.closeModal();
    };

    document.getElementById('ai-modal-overlay').classList.add('modal-overlay--open');
  },

  applySelected(selectedIds, editorState, format, suggestions) {
    if (!selectedIds.length) return;
    let newState = AquiAds.Utils.deepClone(editorState);
    newState.history = [];
    selectedIds.forEach(id => {
      const sug = suggestions.find(s => s.id === id);
      if (sug) newState = sug.apply(newState, format);
    });
    if (window.Editor) {
      Editor.loadState(newState);
      Editor.snapshot();
      const results = AquiAds.Validator.validate(Editor.state, Editor.format);
      AquiAds.Validator.renderResults(results, document.getElementById('validation-strip'), document.getElementById('quality-badge'));
      AquiAds.Validator.highlightViolations(results.checks, document.getElementById('canvas-stage'));
    }
    AquiAds.Toast.show(`${selectedIds.length} melhoria(s) aplicada(s) com sucesso!`, 'success');
  },

  closeModal() {
    document.getElementById('ai-modal-overlay').classList.remove('modal-overlay--open');
  }
};
