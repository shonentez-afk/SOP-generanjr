// Stage24 A4: only a repeated SOP-derived TWI generation opens this comparison.
// No proposal changes user data before a deliberate "Apply selected" click.
function twiShowPreview(changes){
  return new Promise(resolve=>{
    const modal=document.createElement('div');
    modal.id='twiGenerationPreview';
    modal.setAttribute('role','presentation');
    modal.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.65);padding:18px;display:flex;align-items:center;justify-content:center;';
    const protectedCount=changes.filter(c=>!c.checked).length;
    const rows=changes.map((change,i)=>{
      const checked=change.checked?' checked':'';
      const badge=change.manual?'Ручная правка сохранена':
        change.clearing?'Очистка поля — только вручную':'Обычное обновление';
      return '<div style="border:1px solid #cbd5e1;border-radius:10px;padding:10px;margin-top:10px;background:white;">'+
        '<label style="display:flex;gap:10px;align-items:center;font-weight:600;cursor:pointer;">'+
        '<input type="checkbox" data-twi-choice="'+i+'"'+checked+
        ' style="width:17px;height:17px;flex:none;">'+
        '<span>'+escapeHtml(change.group+' / '+change.label)+'</span></label>'+
        '<div style="font-size:12px;color:#475569;margin:4px 0 8px 27px;">'+escapeHtml(badge)+'</div>'+
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;">'+
        '<div style="background:#f1f5f9;padding:8px;border-radius:6px;overflow-wrap:anywhere;white-space:pre-wrap;"><b>Сейчас</b><div>'+escapeHtml(change.current||'—')+'</div></div>'+
        '<div style="background:#ecfdf5;padding:8px;border-radius:6px;overflow-wrap:anywhere;white-space:pre-wrap;"><b>Предложение ИИ</b><div>'+escapeHtml(change.proposed||'(пусто)')+'</div></div>'+
        '</div></div>';
    }).join('');
    modal.innerHTML='<section role="dialog" aria-modal="true" aria-labelledby="twiPreviewTitle"'+
      ' style="background:#fff;width:min(980px,100%);max-height:90vh;overflow-y:auto;border-radius:14px;padding:18px;color:#0f172a;box-shadow:0 20px 55px #0f172a55;">'+
      '<h2 id="twiPreviewTitle" style="font-size:19px;font-weight:700;margin:0 0 10px;">Сравнение обновления TWI из СОП</h2>'+
      '<p style="font-size:13px;margin:0 0 10px;">Изменений: '+changes.length+
      '. Сохранены по умолчанию: '+protectedCount+
      '. Отметьте только те предложения ИИ, которые хотите применить. Инструктор и обучаемый не изменяются.</p>'+
      '<div style="font-size:12px;padding:8px;background:#fffbeb;border:1px solid #fde68a;border-radius:7px;">'+
      'Ручные исправления не будут затёрты. Отмена оставляет текущий TWI без изменений.</div>'+
      '<div data-twi-changes>'+rows+'</div>'+
      '<div style="position:sticky;bottom:-18px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:10px;background:white;padding:14px 0 2px;margin-top:14px;border-top:1px solid #e2e8f0;">'+
      '<button type="button" data-twi-preview-cancel style="border:1px solid #94a3b8;border-radius:7px;padding:9px 14px;background:#fff;">Оставить текущий TWI</button>'+
      '<button type="button" data-twi-preview-apply style="border-radius:7px;padding:9px 14px;background:#047857;color:white;font-weight:600;">Применить выбранные</button>'+
      '</div></section>';
    const close=result=>{
      document.removeEventListener('keydown',onKeyDown);
      modal.remove();
      resolve(result);
    };
    const onKeyDown=event=>{
      if(event.key==='Escape'){event.preventDefault();close(null);}
      if(event.key==='Tab'){
        // Focus stays in the dialog while it is open.
        const controls=[...modal.querySelectorAll('input,button')].filter(el=>!el.disabled);
        const first=controls[0],last=controls[controls.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    };
    modal.querySelector('[data-twi-preview-cancel]').addEventListener('click',()=>close(null));
    modal.querySelector('[data-twi-preview-apply]').addEventListener('click',()=>{
      const chosen=new Set();
      modal.querySelectorAll('[data-twi-choice]').forEach(input=>{
        if(input.checked)chosen.add(changes[Number(input.dataset.twiChoice)].id);
      });
      close(chosen);
    });
    document.body.appendChild(modal);
    document.addEventListener('keydown',onKeyDown);
    modal.querySelector('[data-twi-preview-cancel]').focus();
  });
}
