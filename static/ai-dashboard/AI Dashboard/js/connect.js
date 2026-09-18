/* ============ CONNECT PAGE LOGIC ============ */
const state = loadState();

// Reflect any saved tenant/extension/hotel context on load
document.getElementById('inTenant').value = state.tenantId;
document.getElementById('inExt').value = state.extension;
document.getElementById('headExt').textContent = state.extension;
document.getElementById('pillExt').textContent = state.extension;
document.getElementById('pillTenant').textContent = state.tenantId;

if(state.connected){
  setOnlineUI();
  addLog('Tenant ' + state.tenantId + ' · extension ' + state.extension + ' was already registered');
}

function timeNow(){
  return new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'});
}

function addLog(message){
  const box = document.getElementById('logBox');
  const row = document.createElement('div');
  row.className = 'line';
  row.innerHTML = '<span class="t">['+timeNow()+']</span> ' + message;
  box.appendChild(row);
  box.scrollTop = box.scrollHeight;
}

function setOnlineUI(){
  document.getElementById('pulseDot').classList.add('on');
  document.getElementById('pillState').textContent = 'ONLINE';
  document.getElementById('statusPill').classList.remove('off');
  document.getElementById('waveform').classList.add('live');
}

function setOfflineUI(){
  document.getElementById('pulseDot').classList.remove('on');
  document.getElementById('pillState').textContent = 'OFFLINE';
  document.getElementById('statusPill').classList.add('off');
  document.getElementById('waveform').classList.remove('live');
  document.getElementById('connectBtn').disabled = false;
  document.getElementById('connectLabel').textContent = 'Connect';
}

function goOnline(){
  const btn = document.getElementById('connectBtn');
  const label = document.getElementById('connectLabel');
  btn.disabled = true;
  label.textContent = 'Connecting…';
  document.getElementById('waveform').classList.add('live');
  const tenantVal = document.getElementById('inTenant').value.trim() || 'TEN-0000';
  document.getElementById('pillTenant').textContent = tenantVal;
  addLog('Authenticating tenant ' + tenantVal);
  addLog('SIP REGISTER sent to ' + document.getElementById('inServer').value);

  setTimeout(()=>{
    setOnlineUI();
    addLog('Registration successful');
    addLog('Extension ' + document.getElementById('inExt').value + ' is ONLINE for tenant ' + tenantVal);
    addLog('Opening AI dashboard…');

    state.connected = true;
    state.tenantId = tenantVal;
    state.extension = document.getElementById('inExt').value;
    saveState(state);

    setTimeout(()=>{ window.location.href = 'hoteldashboard.html'; }, 900);
  }, 900);
}

function goOffline(){
  setOfflineUI();
  addLog('Extension disconnected');
  state.connected = false;
  saveState(state);
}

// Toggle password visibility
function togglePassVisibility() {
  const passInput = document.getElementById('inPass');
  const eyeIcon = document.getElementById('eyeIcon');
  const eyeOffIcon = document.getElementById('eyeOffIcon');

  if (passInput.type === 'password') {
    passInput.type = 'text';
    eyeIcon.style.display = 'none';
    eyeOffIcon.style.display = 'block';
  } else {
    passInput.type = 'password';
    eyeIcon.style.display = 'block';
    eyeOffIcon.style.display = 'none';
  }
}

// Updated goOnline() to check for Phone No & Password
function goOnline(){
  const btn = document.getElementById('connectBtn');
  const label = document.getElementById('connectLabel');
  const phone = document.getElementById('inPhone').value.trim();
  const pass = document.getElementById('inPass').value.trim();

  if(!phone || !pass){
    addLog('Registration rejected — Phone No and SIP Password are required');
    return;
  }

  btn.disabled = true;
  label.textContent = 'Connecting…';
  document.getElementById('waveform').classList.add('live');
  addLog('Authenticating phone number ' + phone);
  addLog('SIP REGISTER sent to core.cnetvoip.cloud');

  setTimeout(()=>{
    setOnlineUI();
    addLog('Registration successful');
    addLog('Extension ' + state.extension + ' is ONLINE for ' + phone);
    addLog('Opening AI dashboard…');

    state.connected = true;
    saveState(state);

    setTimeout(()=>{ window.location.href = 'hoteldashboard.html'; }, 900);
  }, 900);
}