/* ===== AI HELPER — Suggestion Simulation ===== */
AquiAds.AIHelper = {

  suggestionTemplates: {
    safeZone:    { icon:'📐', title:'Ajustar Zona Segura',        desc:'Mover elementos para dentro da área segura do formato.' },
    contrast:    { icon:'🎨', title:'Melhorar Contraste',         desc:'Ajustar cores para garantir leitura clara em qualquer ambiente.' },
    cta:         { icon:'👆', title:'Adicionar Chamada para Ação',desc:'Inserir botão com CTA incentivando o clique.' },
    logo:        { icon:'🏷️', title:'Reservar Espaço para Logo', desc:'Adicionar área dedicada ao logo da empresa.' },
    readability: { icon:'🔤', title:'Aumentar Tamanho da Fonte',  desc:'Aumentar fontes para garantir legibilidade à distância.' },
    proportions: { icon:'📏', title:'Rebalancear Composição',     desc:'Redistribuir elementos para melhor equilíbrio visual.' },
    textCount:   { icon:'✍️', title:'Simplificar o Texto',        desc:'Reduzir a quantidade de texto para mensagem mais direta.' },
  },

  /* Detecta a cor real de fundo — verifica state.background E elementos rect de fundo */
  getEffectiveBackground(state) {
    if (state.background && state.background.type === 'solid' && state.background.value && state.background.value !== '#FFFFFF') {
      return state.background.value;
    }
    // Procura rect cobrindo 100% do canvas (elemento de fundo do template)
    const bgRect = state.elements.find(el =>
      (el.type === 'rect' || el.type === 'circle') &&
      el.x <= 2 && el.y <= 2 && el.w >= 95 && el.h >= 95 &&
      el.styles && el.styles.backgroundColor
    );
    if (bgRect) return bgRect.styles.backgroundColor;
    return (state.background && state.background.value) || '#FFFFFF';
  },

  analyze(state, validationResults) {
    const suggestions = [];
    validationResults.checks.forEach(check => {
      if (check.status === 'fail' || check.status === 'warn') {
        const tmpl = this.suggestionTemplates[check.id];
        if (tmpl) {
          suggestions.push({
            id:           check.id,
            icon:         tmpl.icon,
            title:        tmpl.title,
            desc:         tmpl.desc,
            checkMessage: check.message,
            applyFn:      this.buildApplyFn(check.id),
          });
        }
      }
    });
    const improvedScore = Math.min(100, validationResults.score + suggestions.length * 14);
    return { suggestions, improvedScore };
  },

  buildApplyFn(checkId) {
    const self = this;
    const fns = {

      safeZone(state, format) {
        if (!format) return state;
        const mW = format.safeZoneMargin * 100;
        const mH = format.safeZoneMargin * 100;
        state.elements = state.elements.map(el => {
          // Não mover o background rect
          if (el.x <= 2 && el.y <= 2 && el.w >= 95 && el.h >= 95) return el;
          let { x, y, w, h } = el;
          // Garante que o elemento cabe dentro da zona segura
          w = Math.min(w, 100 - 2 * mW);
          h = Math.min(h, 100 - 2 * mH);
          x = Math.max(mW, Math.min(x, 100 - mW - w));
          y = Math.max(mH, Math.min(y, 100 - mH - h));
          return { ...el, x, y, w, h };
        });
        return state;
      },

      contrast(state) {
        const bgColor = self.getEffectiveBackground(state);
        const bg = AquiAds.Utils.hexToRgb(bgColor);
        const lum = AquiAds.Utils.getLuminance(bg.r, bg.g, bg.b);
        const newTextColor = lum > 0.4 ? '#1A1A1A' : '#FFFFFF';
        state.elements = state.elements.map(el => {
          if (el.type !== 'text') return el;
          const textColor = (el.styles && el.styles.color) || '#000000';
          const ratio = AquiAds.Utils.getContrastRatio(textColor, bgColor);
          if (ratio < 4.5) {
            return { ...el, styles: { ...el.styles, color: newTextColor } };
          }
          return el;
        });
        // Também atualiza background se estiver como gradiente sem valor definido
        if (!state.background) state.background = { type: 'solid', value: bgColor };
        return state;
      },

      cta(state) {
        const hasCTA = state.elements.some(el => {
          const t = (el.content || '').toLowerCase();
          return ['saiba mais','compre','clique','acesse','aproveite','garanta','ver mais','comprar'].some(kw => t.includes(kw));
        });
        if (!hasCTA) {
          const bgColor = self.getEffectiveBackground(state);
          const bg = AquiAds.Utils.hexToRgb(bgColor);
          const lum = AquiAds.Utils.getLuminance(bg.r, bg.g, bg.b);
          const btnBg = '#FF6B00';
          const btnText = '#FFFFFF';
          state.elements.push({
            id: AquiAds.Utils.generateId(), type: 'rect',
            x: 10, y: 78, w: 35, h: 13,
            zIndex: state.elements.length + 10,
            locked: false, visible: true, content: 'Saiba Mais →',
            styles: {
              backgroundColor: btnBg, borderRadius: '8px',
              color: btnText, fontSize: '14px', fontWeight: '700',
              fontFamily: 'Inter', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }
          });
        }
        return state;
      },

      logo(state) {
        const hasLogo = state.elements.some(e => e.type === 'image' || e.type === 'logo');
        if (!hasLogo) {
          state.elements.push({
            id: AquiAds.Utils.generateId(), type: 'rect',
            x: 72, y: 78, w: 20, h: 13,
            zIndex: state.elements.length + 10,
            locked: false, visible: true, content: 'LOGO',
            styles: {
              backgroundColor: 'rgba(255,107,0,0.15)', borderRadius: '6px',
              border: '2px dashed #FF6B00', color: '#FF6B00',
              fontSize: '11px', fontWeight: '700', fontFamily: 'Inter',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }
          });
        }
        return state;
      },

      readability(state, format) {
        const isOOH = format && format.category === 'OOH';
        const minFont = isOOH ? 18 : 12;
        const scale   = isOOH ? 1.4 : 1.25;
        state.elements = state.elements.map(el => {
          if (el.type !== 'text') return el;
          const current = parseInt((el.styles && el.styles.fontSize) || '14');
          if (current < minFont) {
            return { ...el, styles: { ...el.styles, fontSize: Math.round(current * scale) + 'px' } };
          }
          return el;
        });
        return state;
      },

      proportions(state) {
        // Empurra elementos muito grandes para proporções razoáveis
        state.elements = state.elements.map(el => {
          if (el.x <= 2 && el.y <= 2 && el.w >= 95 && el.h >= 95) return el; // bg
          if ((el.w / 100) * (el.h / 100) > 0.6 && el.type !== 'image') {
            return { ...el, w: Math.round(el.w * 0.75), h: Math.round(el.h * 0.75) };
          }
          return el;
        });
        return state;
      },

      textCount(state) {
        // Remove elementos de texto ocultos ou vazios para simplificar
        const textEls = state.elements.filter(e => e.type === 'text' && e.visible);
        if (textEls.length > 5) {
          // Oculta os textos menores (menor área) além dos 5 principais
          const sorted = [...textEls].sort((a, b) => (b.w * b.h) - (a.w * a.h));
          const toHide = sorted.slice(5).map(e => e.id);
          state.elements = state.elements.map(el =>
            toHide.includes(el.id) ? { ...el, visible: false } : el
          );
        }
        return state;
      },
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
          <p>Pontos estimados após aplicar as melhorias selecionadas</p>
        </div>`;
    }

    const listEl = modal.querySelector('#ai-suggestions-list');
    if (listEl) {
      if (suggestions.length === 0) {
        listEl.innerHTML = `<div style="text-align:center;padding:32px;">
          <div style="font-size:2.5rem;margin-bottom:12px;">🎉</div>
          <h4 style="margin-bottom:8px;">Criativo está ótimo!</h4>
          <p style="color:var(--color-text-muted);font-size:0.9rem;">Sua pontuação já é alta. Nenhuma melhoria necessária.</p>
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
                <span style="display:block;font-size:0.75rem;color:var(--color-error);margin-top:2px;">↳ ${s.checkMessage}</span>
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
    if (!selectedIds.length) {
      AquiAds.Toast.show('Selecione ao menos uma melhoria.', 'warning');
      return;
    }

    let newState = AquiAds.Utils.deepClone(editorState);

    selectedIds.forEach(id => {
      const sug = suggestions.find(s => s.id === id);
      if (sug && typeof sug.applyFn === 'function') {
        newState = sug.applyFn(newState, format);
      }
    });

    if (window.Editor) {
      // Atualiza estado do editor
      Editor.state.elements   = AquiAds.Utils.deepClone(newState.elements);
      Editor.state.background = AquiAds.Utils.deepClone(newState.background || Editor.state.background);

      // Re-renderiza canvas completo (incluindo fundo)
      Editor.renderBackground();
      const stage = document.getElementById('canvas-stage');
      if (stage) stage.querySelectorAll('.canvas-element').forEach(el => el.remove());
      Editor.state.elements.forEach(el => Editor.renderElement(el));
      Editor.updateLayersPanel();
      Editor.snapshot();

      // Roda validação e atualiza score
      const results = AquiAds.Validator.validate(Editor.state, Editor.format);
      AquiAds.Validator.renderResults(
        results,
        document.getElementById('validation-strip'),
        document.getElementById('quality-badge')
      );
      AquiAds.Validator.highlightViolations(results.checks, stage);
    }

    AquiAds.Toast.show(`${selectedIds.length} melhoria(s) aplicada(s)!`, 'success');
  },

  closeModal() {
    document.getElementById('ai-modal-overlay').classList.remove('modal-overlay--open');
  }
};
