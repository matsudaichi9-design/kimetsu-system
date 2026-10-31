import { createDefaultState, normalizeState, uid } from './database.js';
import { buildWorldPrompt } from './narrative.js';
import { awardExp, addItem, useItem, makeEnemy, playerAttack, enemyAttack, expForNext } from './rpg.js';

const MODULE = 'kimetsu_world_engine';
const PREFIX = '[Kimetsu World Engine]';
let ctx;
let state;

function getState() {
    ctx = SillyTavern.getContext();
    ctx.extensionSettings[MODULE] ??= createDefaultState();
    ctx.extensionSettings[MODULE] = normalizeState(ctx.extensionSettings[MODULE]);
    state = ctx.extensionSettings[MODULE];
    return state;
}
function save() { ctx.saveSettingsDebounced(); }
function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function activeChatData() {
    ctx = SillyTavern.getContext();
    ctx.chatMetadata[`${MODULE}_chat`] ??= {
        memories: [], combat: { active: false, enemy: null, log: [] },
        world: { location: 'Unknown', time: 'Day 1 · 08:00' }
    };
    return ctx.chatMetadata[`${MODULE}_chat`];
}
function hasChat() { return !!SillyTavern.getContext().chatId; }
function saveChat() { ctx = SillyTavern.getContext(); if (ctx.chatId) ctx.saveMetadata(); }
function refreshView() {
    const tab = $('#kwe-root .kwe-tabs [data-tab].active').data('tab');
    if (tab) renderTab(tab);
}
function notify(message, type = 'success') {
    if (window.toastr?.[type]) window.toastr[type](message, 'Kimetsu World Engine');
    else console.info(PREFIX, message);
}
function renderPanel() {
    getState();
    const $host = $('#extensions_settings2');
    if (!$host.length || $('#kwe-root').length) return;
    $host.append(`
    <section id="kwe-root" class="kwe">
      <div class="kwe-heading"><div><div class="kwe-kana">鬼滅の刃 · KIMETSU NO YAIBA</div><h3>Kimetsu World Engine</h3><small>RPG · Combat · Missions · Character Archive</small></div><span class="kwe-version">v0.2.1</span></div>
      <div class="kwe-tabs">
        <button data-tab="dashboard" class="active">Overview</button><button data-tab="character">Character</button>
        <button data-tab="combat">Combat</button><button data-tab="missions">Missions</button>
        <button data-tab="npcs">NPCs</button><button data-tab="world">World</button><button data-tab="format">Narrative</button>
      </div><div class="kwe-view" id="kwe-view"></div>
    </section>`);
    $('#kwe-root').on('click', '.kwe-tabs [data-tab]', function() {
        $('#kwe-root .kwe-tabs [data-tab]').removeClass('active'); $(this).addClass('active'); renderTab($(this).data('tab'));
    });
    $('#kwe-root').on('click', '[data-goto]', function() {
        $(`#kwe-root .kwe-tabs [data-tab="${$(this).data('goto')}"]`).trigger('click');
    });
    $('#kwe-root').on('click', '[data-action]', handleAction);
    renderTab('dashboard');
}
function bar(value, max) {
    const pct = Math.max(0, Math.min(100, (Number(value) / Math.max(1, Number(max))) * 100));
    return `<div class="kwe-bar"><span style="width:${pct}%"></span></div>`;
}
function renderTab(tab) {
    getState();
    const cd = activeChatData(), p = state.player, $v = $('#kwe-view');
    if (tab === 'dashboard') {
        const enemy = cd.combat.active && cd.combat.enemy;
        $v.html(`<div class="kwe-grid">
          <div class="kwe-stat"><b>Lv. ${p.level}</b><span>${escapeHtml(p.rank)} · ${escapeHtml(p.name)}</span></div>
          <div class="kwe-stat"><b>${p.hp}/${p.maxHp}</b><span>HP</span>${bar(p.hp,p.maxHp)}</div>
          <div class="kwe-stat"><b>${p.stamina}/${p.maxStamina}</b><span>Stamina</span>${bar(p.stamina,p.maxStamina)}</div>
        </div><h4>Battle status / สถานะการต่อสู้</h4>
        ${enemy ? `<div class="kwe-card"><b>${escapeHtml(enemy.name)}</b><span class="kwe-badge">${escapeHtml(enemy.rank)}</span><p>${enemy.hp}/${enemy.maxHp} HP</p>${bar(enemy.hp,enemy.maxHp)}</div>` : '<p class="kwe-muted">No active encounter / ไม่มีการต่อสู้</p>'}
        <div class="kwe-actions"><button class="kwe-primary" data-goto="combat">Open Combat</button><button data-action="insert-prompt">Insert AI RPG context</button><button data-action="export">Export JSON</button></div>
        <h4>Active missions</h4><p>${state.missions.filter(m=>m.status==='Active').length} active · ${state.missions.filter(m=>m.status==='Completed').length} completed</p>
        <p class="kwe-note">ระบบเกมจะเป็นตัวจัดการค่าสถานะและรางวัล ส่วน AI ทำหน้าที่เล่าเรื่องตามผลลัพธ์ที่บันทึกไว้</p>`);
    } else if (tab === 'character') {
        $v.html(`<div class="kwe-profile"><h4>Player character / ตัวละครผู้เล่น</h4>
          <div class="kwe-form-grid">
          ${[['name','Name'],['rank','Demon Slayer rank'],['level','Level'],['exp','EXP'],['hp','HP'],['maxHp','Max HP'],['attack','Attack'],['defense','Defense'],['speed','Speed'],['stamina','Stamina'],['maxStamina','Max stamina'],['money','Money'],['skillPoints','Skill points']].map(([k,l])=>`<label>${l}<input id="kwe-p-${k}" ${['name','rank'].includes(k)?'type="text"':'type="number"'} value="${escapeHtml(p[k])}"></label>`).join('')}
          </div><label>Breathing style<input id="kwe-p-breathing" value="${escapeHtml(p.breathing)}"></label>
          <button class="kwe-primary" data-action="save-player">Save character</button></div>
          <h4>Skills / ทักษะปราณ</h4>${p.skills.map(s=>`<div class="kwe-card"><b>${escapeHtml(s.name)}</b><p>${escapeHtml(s.nameTh||'')} · Power ×${s.power} · Cost ${s.cost} stamina</p><small>${escapeHtml(s.description||'')}</small></div>`).join('')}
          <div class="kwe-actions"><button data-action="add-skill">＋ Add skill</button><button data-action="rest">Rest (recover)</button></div>
          <h4>Inventory / กระเป๋า</h4>${p.inventory.map(i=>`<div class="kwe-inventory"><span>${escapeHtml(i.name)} ×${i.quantity}</span><button data-action="use-item" data-id="${escapeHtml(i.id)}">Use</button></div>`).join('') || '<p class="kwe-muted">Inventory empty</p>'}
          <button data-action="add-item">＋ Add item</button>`);
    } else if (tab === 'combat') {
        const c = cd.combat;
        $v.html(`${c.active && c.enemy ? `<div class="kwe-combat"><div class="kwe-combat-title"><span>ENCOUNTER</span><b>${escapeHtml(c.enemy.name)} · ${escapeHtml(c.enemy.rank)}</b></div><p>Lv.${c.enemy.level} · ${c.enemy.hp}/${c.enemy.maxHp} HP</p>${bar(c.enemy.hp,c.enemy.maxHp)}<div class="kwe-actions"><button class="kwe-primary" data-action="basic-attack">Basic attack</button><select id="kwe-skill-select">${p.skills.map(s=>`<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)} (−${s.cost} STA)</option>`).join('')}</select><button data-action="skill-attack">Use breathing skill</button><button data-action="flee">Flee</button></div><p class="kwe-muted">Your HP: ${p.hp}/${p.maxHp} · Stamina: ${p.stamina}/${p.maxStamina}</p><h4>Battle log</h4><div class="kwe-log">${(c.log||[]).slice(-8).reverse().map(x=>`<p>${escapeHtml(x)}</p>`).join('')}</div></div>` :
          `<h4>Start an encounter / เริ่มการต่อสู้</h4><p class="kwe-muted">เลือกศัตรูเพื่อเริ่มการต่อสู้แบบ Turn-based</p><div class="kwe-enemy-list">${state.enemyTemplates.map(e=>`<div class="kwe-card"><b>${escapeHtml(e.name)}</b> <span class="kwe-badge">${escapeHtml(e.rank)}</span><p>HP ${e.hp} · ATK ${e.attack} · DEF ${e.defense} · Reward ${e.exp} EXP</p><button data-action="start-combat" data-id="${escapeHtml(e.id)}">Engage</button></div>`).join('')}</div>`}
          <div class="kwe-actions"><button data-action="rest">Rest / Recover</button></div>`);
    } else if (tab === 'missions') {
        $v.html(`<div class="kwe-actions"><button class="kwe-primary" data-action="add-mission">＋ Create mission</button></div>
        ${state.missions.map(m=>`<div class="kwe-card"><div class="kwe-card-head"><b>${escapeHtml(m.title)}</b><span class="kwe-badge">${escapeHtml(m.status)}</span></div><p>${escapeHtml(m.description)}</p><div class="kwe-tags"><i>${m.exp} EXP</i><i>${m.money} ¥</i></div><div class="kwe-actions">${m.status==='Active'?`<button data-action="complete-mission" data-id="${escapeHtml(m.id)}">Complete</button>`:''}<button data-action="delete-mission" data-id="${escapeHtml(m.id)}">Delete</button></div></div>`).join('') || '<p class="kwe-muted">No missions created yet.</p>'}`);
    } else if (tab === 'npcs') {
        $v.html(`<div class="kwe-actions"><button class="kwe-primary" data-action="add-npc">＋ Create NPC</button><button data-action="insert-prompt">Insert NPC context</button></div>
        ${state.npcs.map(n=>`<div class="kwe-card"><div class="kwe-card-head"><b>${escapeHtml(n.name)}</b><span>${escapeHtml(n.role||'NPC')}</span></div><p>${escapeHtml(n.personality||'No personality set')}</p><div class="kwe-tags"><i>Trust ${n.trust}/100</i><i>${escapeHtml(n.breathing||'No breathing style')}</i><i>${n.memories.length} memories</i></div><div class="kwe-actions"><button data-action="edit-npc" data-id="${escapeHtml(n.id)}">Edit</button><button data-action="memory" data-id="${escapeHtml(n.id)}">＋ Memory</button><button data-action="relationship" data-id="${escapeHtml(n.id)}">Relationship</button><button data-action="delete-npc" data-id="${escapeHtml(n.id)}">Delete</button></div></div>`).join('') || '<p class="kwe-muted">No NPC registered.</p>'}`);
    } else if (tab === 'world') {
        $v.html(`<label>Current location<input id="kwe-location" value="${escapeHtml(cd.world.location)}"></label><label>World time<input id="kwe-time" value="${escapeHtml(cd.world.time)}"></label><label>Record event / บันทึกเหตุการณ์<textarea id="kwe-event" rows="3" placeholder="Describe an important event..."></textarea></label><button class="kwe-primary" data-action="save-world">Save world</button><h4>Recent memories</h4>${(cd.memories||[]).slice(-10).reverse().map(m=>`<div class="kwe-card"><small>${escapeHtml(m.createdAt||'')}</small><p>${escapeHtml(m.text)}</p></div>`).join('') || '<p class="kwe-muted">No memories recorded.</p>'}`);
    } else {
        $v.html(`<h4>Narrative output / รูปแบบการเล่าเรื่อง</h4>${[['header','Character header / ข้อมูลตัวละคร'],['dialogue','Dialogue / บทสนทนา'],['monologue','Monologue / ความคิด'],['narration','Narration / คำบรรยาย'],['status','Status footer / สถานะท้ายข้อความ']].map(([k,l])=>`<label class="kwe-check"><input type="checkbox" id="kwe-format-${k}" ${state.format[k]?'checked':''}> ${l}</label>`).join('')}<label>Language<select id="kwe-language"><option value="both" ${state.language==='both'?'selected':''}>Thai + English</option><option value="th" ${state.language==='th'?'selected':''}>ไทย</option><option value="en" ${state.language==='en'?'selected':''}>English</option></select></label><button class="kwe-primary" data-action="save-format">Save settings</button><button data-action="insert-prompt">Insert AI context</button>`);
    }
}
function promptValue(label, value='') { return window.prompt(label, value); }
function logCombat(text) {
    const c = activeChatData().combat; c.log ??= []; c.log.push(`${new Date().toLocaleTimeString()} — ${text}`); c.log = c.log.slice(-30);
}
function finishEnemy() {
    const cd = activeChatData(), e = cd.combat.enemy;
    const levels = awardExp(state.player, e.exp);
    state.player.money += e.reward;
    logCombat(`Victory! +${e.exp} EXP, +${e.reward} ¥.`);
    cd.combat.active = false; cd.combat.enemy = null;
    notify(`Victory! +${e.exp} EXP${levels.length ? ` · Level ${levels.join(', ')}` : ''}`);
    save(); saveChat();
}
function enemyTurn() {
    const cd = activeChatData();
    if (!cd.combat.active || !cd.combat.enemy) return;
    const result = enemyAttack(state.player, cd.combat.enemy);
    logCombat(`${cd.combat.enemy.name} attacks for ${result.damage} damage.`);
    if (result.defeated) {
        logCombat('You were defeated. Recover with Rest before another battle.');
        cd.combat.active = false; cd.combat.enemy = null;
        notify('You were defeated.', 'error');
    }
}
function performAttack(skillId=null) {
    const cd = activeChatData();
    if (!cd.combat.active || !cd.combat.enemy) return;
    const result = playerAttack(state.player, cd.combat.enemy, skillId);
    if (!result.ok) return notify(result.message, 'warning');
    logCombat(`You use ${result.skill} and deal ${result.damage} damage.`);
    if (result.defeated) finishEnemy();
    else enemyTurn();
    save(); saveChat(); renderTab('combat');
}
function handleAction() {
    const action = $(this).data('action'), id = String($(this).data('id') || '');
    getState(); const cd = activeChatData(), p = state.player;
    if (action === 'save-player') {
        for (const k of ['name','rank','breathing']) p[k] = $(`#kwe-p-${k}`).val();
        for (const k of ['level','exp','hp','maxHp','attack','defense','speed','stamina','maxStamina','money','skillPoints']) p[k] = Number($(`#kwe-p-${k}`).val()) || 0;
        p.expToNext = expForNext(p.level); p.hp = Math.min(p.hp,p.maxHp); p.stamina = Math.min(p.stamina,p.maxStamina);
        save(); notify('Character saved'); renderTab('character');
    } else if (action === 'rest') {
        p.hp = p.maxHp; p.stamina = p.maxStamina; save(); notify('HP and stamina fully recovered'); refreshView();
    } else if (action === 'add-skill') {
        const name = promptValue('Skill name'); if (!name?.trim()) return;
        const power = Number(promptValue('Power multiplier (e.g. 1.5)','1.5')) || 1.5;
        const cost = Number(promptValue('Stamina cost','5')) || 5;
        p.skills.push({id:uid(),name:name.trim(),nameTh:promptValue('Thai name','')||'',type:'attack',power,cost,description:promptValue('Description','')||''});
        save(); renderTab('character');
    } else if (action === 'add-item') {
        const name = promptValue('Item name'); if (!name?.trim()) return;
        const effect = (promptValue('Effect: heal or stamina','heal')||'').trim().toLowerCase();
        if (!['heal','stamina'].includes(effect)) return notify('Effect must be heal or stamina.', 'warning');
        const value = Number(promptValue('Effect value','20')) || 20;
        addItem(p.inventory,{id:uid(),name:name.trim(),type:'consumable',quantity:1,effect,value});
        save(); renderTab('character');
    } else if (action === 'use-item') {
        const result = useItem(p,id); notify(result.message,result.ok?'success':'warning'); save(); renderTab('character');
    } else if (action === 'start-combat') {
        if (!hasChat()) return notify('Open a chat first.', 'warning');
        if (p.hp <= 0) return notify('Recover your HP before fighting.', 'warning');
        const template = state.enemyTemplates.find(e=>e.id===id); if (!template) return;
        cd.combat = {active:true,enemy:makeEnemy(template,p.level),log:[]};
        logCombat(`Encounter started: ${template.name}.`);
        saveChat(); renderTab('combat');
    } else if (action === 'basic-attack') performAttack();
    else if (action === 'skill-attack') performAttack($('#kwe-skill-select').val());
    else if (action === 'flee') { logCombat('You fled from battle.'); cd.combat.active=false; cd.combat.enemy=null; saveChat(); renderTab('combat'); }
    else if (action === 'add-mission') {
        const title=promptValue('Mission title'); if(!title?.trim()) return;
        const description=promptValue('Description','')||'';
        const exp=Number(promptValue('EXP reward','50'))||0, money=Number(promptValue('Money reward','20'))||0;
        state.missions.push({id:uid(),title:title.trim(),description,exp,money,status:'Active'});
        save(); renderTab('missions');
    } else if (action === 'complete-mission') {
        const m=state.missions.find(x=>x.id===id); if(!m||m.status!=='Active') return;
        m.status='Completed'; const ups=awardExp(p,m.exp); p.money+=m.money;
        notify(`Mission completed · +${m.exp} EXP · +${m.money} ¥${ups.length?` · Level ${ups.join(', ')}`:''}`);
        save(); renderTab('missions');
    } else if (action === 'delete-mission') {
        state.missions=state.missions.filter(x=>x.id!==id); save(); renderTab('missions');
    } else if (action === 'add-npc' || action === 'edit-npc') {
        const old=state.npcs.find(n=>n.id===id);
        const name=promptValue('Character name',old?.name||''); if(!name?.trim()) return;
        const fields=[['role','Role'],['personality','Personality'],['appearance','Appearance'],['breathing','Breathing style'],['goals','Goals'],['secrets','Secrets']];
        const data={}; for(const [k,l] of fields) data[k]=promptValue(l,old?.[k]||'')??old?.[k]??'';
        const trust=Number(promptValue('Trust (0-100)',String(old?.trust??0)));
        const npc={...(old||{}),id:old?.id||uid(),name:name.trim(),...data,trust:Math.max(0,Math.min(100,trust||0)),memories:old?.memories||[],relationships:old?.relationships||[]};
        if(old) state.npcs=state.npcs.map(n=>n.id===id?npc:n); else state.npcs.push(npc);
        save(); renderTab('npcs'); notify('NPC saved');
    } else if (action === 'delete-npc') {
        if(confirm('Delete this NPC?')) {state.npcs=state.npcs.filter(n=>n.id!==id);save();renderTab('npcs');}
    } else if (action === 'memory') {
        const npc=state.npcs.find(n=>n.id===id); if(!npc)return;
        const text=promptValue(`Memory for ${npc.name}`); if(text?.trim()){npc.memories.push({text:text.trim(),createdAt:new Date().toISOString()});save();renderTab('npcs');}
    } else if (action === 'relationship') {
        const npc=state.npcs.find(n=>n.id===id); if(!npc)return;
        const target=promptValue('Relationship target (player or NPC name)'); if(!target?.trim())return;
        const type=promptValue('Relationship type (friend, rival, family, etc.)','acquaintance')||'acquaintance';
        const value=Number(promptValue('Relationship value (-100 to 100)','0'))||0;
        npc.relationships=npc.relationships.filter(r=>r.target!==target.trim());
        npc.relationships.push({target:target.trim(),type,value:Math.max(-100,Math.min(100,value))});
        save();renderTab('npcs');
    } else if (action === 'save-world') {
        if(!hasChat()) return notify('Open a chat first.','warning');
        cd.world.location=$('#kwe-location').val(); cd.world.time=$('#kwe-time').val();
        const event=$('#kwe-event').val()?.trim();
        if(event){cd.memories.push({text:event,createdAt:new Date().toISOString()});cd.memories=cd.memories.slice(-100);}
        saveChat();notify('World data saved');renderTab('world');
    } else if (action === 'save-format') {
        for(const k of ['header','dialogue','monologue','narration','status'])state.format[k]=$(`#kwe-format-${k}`).prop('checked');
        state.language=$('#kwe-language').val();save();notify('Narrative settings saved');
    } else if (action === 'insert-prompt') {
        const prompt=buildWorldPrompt(state,cd), $input=$('#send_textarea');
        if(!$input.length)return notify('Open a chat first. Chat input not found.','warning');
        const previous=$input.val();$input.val(`${previous?previous+'\n\n':''}${prompt}`).trigger('input');
        notify('RPG context inserted. Review before sending.');
    } else if (action === 'export') {
        const blob=new Blob([JSON.stringify({settings:state,chat:cd},null,2)],{type:'application/json'});
        const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='kimetsu-world-engine-backup.json';a.click();URL.revokeObjectURL(url);
    }
}
jQuery(async () => {
    try {
        ctx=SillyTavern.getContext();
        renderPanel();
        ctx.eventSource.on(ctx.event_types.APP_READY,renderPanel);
        ctx.eventSource.on(ctx.event_types.CHAT_CHANGED,()=>{activeChatData();refreshView();});
        console.info(PREFIX,'v0.2.1 loaded');
    } catch(error) { console.error(PREFIX,'Initialization failed',error); }
});
