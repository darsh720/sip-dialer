/* ============ GUARD: must be connected first ============ */
const state = loadState();
if(!state.connected){
  window.location.href = 'hotellogin.html';
}

const CALLER_NUMBERS = ["+1 646 555 0912","+1 917 555 0134","+1 332 555 0087","+1 718 555 0221","+1 212 555 0399","+1 646 555 0450","+1 347 555 0188"];
const INTENTS = ["transfer","lookup","ticket"];

/* ============ INIT ============ */
document.addEventListener('DOMContentLoaded', ()=>{
  syncHotelToUI();
  fillHotelForm();
  fillSettingsForm();
  document.getElementById('sideExt').textContent = state.extension;
  document.getElementById('sideTenant').textContent = state.tenantId;
  document.getElementById('topExt').textContent = state.extension;
  document.getElementById('topTenant').textContent = state.tenantId;
  document.getElementById('prevExt').textContent = state.extension;
  document.getElementById('hotelExtRef').textContent = state.extension;
  document.getElementById('hTenant').value = state.tenantId;
  renderKB();
  renderLogs();
  renderOverview();
  toast('Tenant ' + state.tenantId + ' · extension ' + state.extension + ' ready', 'ok');
});

/* ============ NAV ============ */
document.getElementById('navList').addEventListener('click', (e)=>{
  const b = e.target.closest('button[data-tab]');
  if(!b || b.dataset.tab === 'logout') return;
  document.querySelectorAll('.nav button[data-tab]').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  document.querySelector('.tab-panel[data-panel="'+b.dataset.tab+'"]').classList.add('active');
});

function logout(){
  state.connected = false;
  saveState(state);
  window.location.href = 'hotellogin.html';
}

const HOTEL_DEPT_KEYS = [
  'frontDesk', 'ringGroup', 'sales', 'gm', 'laundry', 'lobby', 'fitness',
  'pool', 'elevator', 'meetingRoom', 'maintenanceRoom', 'office', 'agm', 'businessCenter'
];

/* ============ HOTEL DETAILS ============ */
function fillHotelForm(){
  const h = state.hotel;
  document.getElementById('hName').value = h.name || '';
  document.getElementById('hDid').value = h.did || '';
  document.getElementById('hFrontExt').value = h.frontExt || '';
  document.getElementById('hTz').value = h.tz || 'America/New_York';
  document.getElementById('hAddress').value = h.address || '';
  document.getElementById('hGreeting').value = h.greeting || '';
  document.getElementById('hLang').value = h.lang || 'English';
  document.getElementById('hFallback').value = h.fallback || '';

  const depts = h.departmentExtensions || {};
  HOTEL_DEPT_KEYS.forEach((k) => {
    const el = document.getElementById(`hdept-${k}`);
    if(el) {
      el.value = depts[k] || (k === 'frontDesk' ? (h.frontExt || '') : '');
    }
  });
}

function saveHotel(){
  const deptExts = {};
  HOTEL_DEPT_KEYS.forEach((k) => {
    const el = document.getElementById(`hdept-${k}`);
    deptExts[k] = el ? el.value.trim() : '';
  });

  const frontVal = deptExts['frontDesk'] || document.getElementById('hFrontExt').value || '';
  document.getElementById('hFrontExt').value = frontVal;

  state.hotel = {
    name: document.getElementById('hName').value || 'Unnamed Hotel',
    did: document.getElementById('hDid').value,
    frontExt: frontVal,
    tz: document.getElementById('hTz').value,
    address: document.getElementById('hAddress').value,
    greeting: document.getElementById('hGreeting').value,
    lang: document.getElementById('hLang').value,
    fallback: document.getElementById('hFallback').value,
    departmentExtensions: deptExts
  };
  saveState(state);
  syncHotelToUI();

  // Sync to active backend profile
  fetch('/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenant_id: state.tenantId || 'TEN-0049',
      hotel_profile: {
        propertyName: state.hotel.name,
        hotel: state.hotel.name,
        propertyPhoneNumber: state.hotel.did,
        propertyAddress: state.hotel.address,
        address: state.hotel.address,
        greeting: state.hotel.greeting,
        departmentExtensions: deptExts
      }
    })
  }).catch((err) => console.error('Could not sync hotel details to backend', err));

  const note = document.getElementById('hotelSavedNote');
  note.style.opacity = '1';
  setTimeout(()=> note.style.opacity = '0', 1800);
  toast('Hotel details & department extensions saved', 'ok');
}

function syncHotelToUI(){
  document.getElementById('topHotelName').textContent = state.hotel.name;
  document.getElementById('prevHotelName').textContent = state.hotel.name;
  document.getElementById('prevGreeting').textContent = state.hotel.greeting;
}

/* ============ KNOWLEDGE BASE ============ */
function addQA(){
  const q = document.getElementById('kbQ').value.trim();
  const a = document.getElementById('kbA').value.trim();
  if(!q || !a){ toast('Enter both a question and an answer', 'warn'); return; }
  state.kb.unshift({q,a});
  saveState(state);
  document.getElementById('kbQ').value = '';
  document.getElementById('kbA').value = '';
  renderKB();
  toast('Question added to knowledge base', 'ok');
}

function deleteQA(i){
  state.kb.splice(i,1);
  saveState(state);
  renderKB();
}

function renderKB(){
  const term = (document.getElementById('kbSearch').value || '').toLowerCase();
  const list = document.getElementById('kbList');
  const items = state.kb.filter(item => item.q.toLowerCase().includes(term) || item.a.toLowerCase().includes(term));
  list.innerHTML = '';
  if(items.length === 0){
    list.innerHTML = '<div class="empty">No matching questions yet.</div>';
    return;
  }
  items.forEach((item)=>{
    const realIndex = state.kb.indexOf(item);
    const row = document.createElement('div');
    row.className = 'kb-item';
    row.innerHTML = `
      <div>
        <div class="q">${escapeHtml(item.q)}</div>
        <div class="a">${escapeHtml(item.a)}</div>
      </div>
      <button class="icon-btn" onclick="deleteQA(${realIndex})" title="Remove">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
      </button>`;
    list.appendChild(row);
  });
}

/* ============ CALL LOGS ============ */
function renderLogs(){
  const term = (document.getElementById('logSearch').value || '').toLowerCase();
  const filter = document.getElementById('logFilter').value;
  const body = document.getElementById('logsBody');
  const rows = state.logs.filter(l =>
    (filter === 'all' || l.status === filter) && l.caller.toLowerCase().includes(term)
  );
  body.innerHTML = '';
  document.getElementById('logsEmpty').style.display = rows.length ? 'none' : 'block';
  rows.forEach(l=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${l.time}</td>
      <td class="caller">${l.caller}</td>
      <td><span class="tag ${l.intent}">${l.intent}</span></td>
      <td>${l.duration}</td>
      <td><span class="status-chip ${l.status}">${l.status}</span></td>`;
    body.appendChild(tr);
  });
}

/* ============ OVERVIEW ============ */
function renderOverview(){
  const total = state.logs.length;
  const transfers = state.logs.filter(l=>l.intent==='transfer').length;
  const lookups = state.logs.filter(l=>l.intent==='lookup').length;
  const tickets = state.logs.filter(l=>l.intent==='ticket').length;
  document.getElementById('statCalls').textContent = total;
  document.getElementById('statTransfers').textContent = transfers;
  document.getElementById('statLookups').textContent = lookups;
  document.getElementById('statTickets').textContent = tickets;
  document.getElementById('statTransfersPct').textContent = (total ? Math.round(transfers/total*100) : 0) + '% of calls';
  document.getElementById('statLookupsPct').textContent = (total ? Math.round(lookups/total*100) : 0) + '% of calls';

  const recent = document.getElementById('recentList');
  recent.innerHTML = '';
  if(state.logs.length === 0){
    recent.innerHTML = '<div class="empty">No calls yet today.</div>';
    return;
  }
  state.logs.slice(0,5).forEach(l=>{
    const row = document.createElement('div');
    row.className = 'mini-row';
    row.innerHTML = `
      <div>
        <div class="who">${l.caller}</div>
        <div class="meta">${l.time} · ${l.duration}</div>
      </div>
      <span class="tag ${l.intent}">${l.intent}</span>`;
    recent.appendChild(row);
  });
}

function simulateCall(){
  const caller = CALLER_NUMBERS[Math.floor(Math.random()*CALLER_NUMBERS.length)];
  const intent = INTENTS[Math.floor(Math.random()*INTENTS.length)];
  const statusRoll = Math.random();
  const status = statusRoll > .85 ? 'missed' : (statusRoll > .7 ? 'escalated' : 'completed');
  const duration = status === 'missed' ? '0:00' : (Math.floor(Math.random()*90)+15) + 's';
  const time = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});

  state.logs.unshift({time, caller, intent, duration, status});
  saveState(state);
  renderLogs();
  renderOverview();
  toast('Incoming call from ' + caller + ' — ' + intent, 'ok');
}

/* ============ SETTINGS ============ */
function fillSettingsForm(){
  const s = state.settings;
  document.getElementById('sGreeting').checked = s.greeting;
  document.getElementById('sAutoTransfer').checked = s.autoTransfer;
  document.getElementById('sSms').checked = s.sms;
  document.getElementById('sEmail').checked = s.email;
  document.getElementById('sVoice').value = s.voice;
  document.getElementById('sRetries').value = s.retries;
}

function saveSettings(){
  state.settings = {
    greeting: document.getElementById('sGreeting').checked,
    autoTransfer: document.getElementById('sAutoTransfer').checked,
    sms: document.getElementById('sSms'.checked),
    email: document.getElementById('sEmail').checked,
    voice: document.getElementById('sVoice').value,
    retries: document.getElementById('sRetries').value
  };
  saveState(state);
  const note = document.getElementById('settingsSavedNote');
  note.style.opacity = '1';
  setTimeout(()=> note.style.opacity = '0', 1800);
  toast('AI settings saved', 'ok');
}