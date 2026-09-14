/* ============ SHARED STATE (persists across pages via localStorage) ============ */
const STORAGE_KEY = 'cnv_ai_extension_state_v2';

function defaultState(){
  return {
    connected: false,
    tenantId: "1000",
    extension: "501",
    hotel: {
      name: "ABC Hotel", 
      propertyNo: "PR-1001",
      ownerName: "John Doe",
      address: "123 Main Street, New York, USA",
      greeting: "Welcome to ABC Hotel. How may I help you today?",
      lang: "English", 
      fallback: "501"
    },
    kb: [
      {q: "What is check-in time?", a: "Check-in starts at 2:00 PM."},
      {q: "Do you provide free Wi-Fi?", a: "Yes, free Wi-Fi is available in all rooms."}
    ],
    logs: [
      {time: "09:14 AM", caller: "+1 646 555 0912", intent: "transfer", duration: "0:42", status: "completed"},
      {time: "09:47 AM", caller: "+1 917 555 0134", intent: "lookup", duration: "0:28", status: "completed"},
      {time: "10:22 AM", caller: "+1 332 555 0087", intent: "ticket", duration: "1:05", status: "escalated"},
      {time: "11:03 AM", caller: "+1 718 555 0221", intent: "lookup", duration: "0:19", status: "completed"},
      {time: "11:40 AM", caller: "+1 212 555 0399", intent: "transfer", duration: "0:00", status: "missed"}
    ],
    settings: { greeting: true, autoTransfer: true, sms: true, email: false, voice: "Warm Female — Aria", retries: 2 }
  };
}

function loadState(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(raw){
    try{
      const parsed = JSON.parse(raw);
      return Object.assign(defaultState(), parsed);
    }catch(e){ /* fall through to default */ }
  }
  return defaultState();
}

function saveState(state){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function resetState(){
  localStorage.removeItem(STORAGE_KEY);
}

/* ============ ADMIN / PLATFORM STATE (Updated Key Version) ============ */
const ADMIN_STORAGE_KEY = 'cnv_admin_platform_state_v2'; // Changed key name to bust old cache

function defaultAdminState(){
  return {
    authenticated: false,
    operatorId: "admin@cnetvoip",
    nextTenantSeq: 1008,
    tenants: [
      {id: "1000", hotel: "ABC Hotel", address: "123 Main Street, New York, NY", propertyNo: "PR-1001", ownerName: "John Doe", status: "online", callsToday: 18, lastActivity: "2 min ago"},
      {id: "1001", hotel: "Grand Meridian", address: "450 Ocean Drive, Miami, FL", propertyNo: "PR-1002", ownerName: "Robert Smith", status: "online", callsToday: 31, lastActivity: "6 min ago"},
      {id: "1002", hotel: "Sunset Bay Resort", address: "782 Beach Blvd, San Diego, CA", propertyNo: "PR-1003", ownerName: "Elena Rostova", status: "online", callsToday: 9, lastActivity: "14 min ago"},
      {id: "1003", hotel: "Oakwood Suites", address: "12 Park Avenue, Chicago, IL", propertyNo: "PR-1004", ownerName: "David Miller", status: "offline", callsToday: 0, lastActivity: "3 hr ago"},
      {id: "1004", hotel: "Harbor View Inn", address: "89 Marina Way, Boston, MA", propertyNo: "PR-1005", ownerName: "Sarah Jenkins", status: "online", callsToday: 22, lastActivity: "1 min ago"},
      {id: "1005", hotel: "Palm Court Hotel", address: "555 Sunset Blvd, Los Angeles, CA", propertyNo: "PR-1006", ownerName: "Michael Chang", status: "provisioning", callsToday: 0, lastActivity: "just now"},
      {id: "1006", hotel: "Silverline Business Hotel", address: "204 Michigan Ave, Chicago, IL", propertyNo: "PR-1007", ownerName: "William Vance", status: "online", callsToday: 14, lastActivity: "9 min ago"},
      {id: "1007", hotel: "Riverside Lodge", address: "18 River Road, Austin, TX", propertyNo: "PR-1008", ownerName: "Karen Taylor", status: "offline", callsToday: 0, lastActivity: "1 day ago"}
    ],
    activity: [
      {time: "11:52 AM", tenant: "1004", hotel: "Harbor View Inn", event: "Call handled — guest lookup"},
      {time: "11:44 AM", tenant: "1001", hotel: "Grand Meridian", event: "Call handled — transfer to front desk"},
      {time: "11:31 AM", tenant: "1000", hotel: "ABC Hotel", event: "Call handled — complaint ticket #2291"},
      {time: "09:20 AM", tenant: "1003", hotel: "Oakwood Suites", event: "Extension went offline"}
    ]
  };
}

function loadAdminState(){
  const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
  if(raw){
    try{
      const parsed = JSON.parse(raw);
      // Ensure missing fields are populated if partial object exists
      if(parsed && parsed.tenants && parsed.tenants.length > 0 && parsed.tenants[0].propertyNo){
        return Object.assign(defaultAdminState(), parsed);
      }
    }catch(e){ /* fall through */ }
  }
  return defaultAdminState();
}

function saveAdminState(state){
  localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(state));
}

/* ============ TOASTS ============ */
function ensureToastStack(){
  let stack = document.getElementById('toastStack');
  if(!stack){
    stack = document.createElement('div');
    stack.id = 'toastStack';
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  return stack;
}

function toast(msg, type=""){
  const stack = ensureToastStack();
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(()=>{
    el.style.transition='.3s'; el.style.opacity='0'; el.style.transform='translateY(8px)';
    setTimeout(()=>el.remove(),300);
  }, 2600);
}

/* ============ UTIL ============ */
function escapeHtml(str){
  return String(str || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}