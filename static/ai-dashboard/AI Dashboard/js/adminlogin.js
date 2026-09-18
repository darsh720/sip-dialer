/* ============ ADMIN LOGIN LOGIC ============ */
const adminAuth = loadAdminState();

if(adminAuth.authenticated){
  setUnlockedUI();
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

function setUnlockedUI(){
  document.getElementById('pulseDot').classList.add('on');
  document.getElementById('pillState').textContent = 'UNLOCKED';
  document.getElementById('statusPill').classList.remove('off');
}

function signIn(){
  const btn = document.getElementById('connectBtn');
  const label = document.getElementById('connectLabel');
  const op = document.getElementById('inOperator').value.trim();
  const pass = document.getElementById('inPasscode').value.trim();

  if(!op || !pass){
    addLog('Sign-in rejected — operator ID and passcode are required');
    return;
  }

  btn.disabled = true;
  label.textContent = 'Verifying…';
  addLog('Verifying operator credentials for ' + op);

  setTimeout(()=>{
    setUnlockedUI();
    addLog('Operator ' + op + ' authenticated');
    addLog('Loading platform console…');

    adminAuth.authenticated = true;
    adminAuth.operatorId = op;
    saveAdminState(adminAuth);

    setTimeout(()=>{ window.location.href = 'admindashboard.html'; }, 800);
  }, 800);
}
function togglePasscodeVisibility() {
  const passInput = document.getElementById('inPasscode');
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