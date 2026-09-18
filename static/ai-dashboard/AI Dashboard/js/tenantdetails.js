/* ============ TENANT DETAILS PAGE LOGIC ============ */

function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  const eyeIcon = btn.querySelector('.eye-icon');
  const eyeOffIcon = btn.querySelector('.eye-off-icon');

  if (input.type === 'password') {
    input.type = 'text';
    eyeIcon.style.display = 'none';
    eyeOffIcon.style.display = 'block';
  } else {
    input.type = 'password';
    eyeIcon.style.display = 'block';
    eyeOffIcon.style.display = 'none';
  }
}

const DEPT_KEYS = [
  'frontDesk', 'ringGroup', 'sales', 'gm', 'laundry', 'lobby', 'fitness',
  'pool', 'elevator', 'meetingRoom', 'maintenanceRoom', 'office', 'agm', 'businessCenter'
];

function getDepartmentExtensionsFromInputs() {
  const exts = {};
  DEPT_KEYS.forEach((key) => {
    const el = document.getElementById(`dept-${key}`);
    exts[key] = el ? el.value.trim() : '';
  });
  return exts;
}

function setDepartmentExtensionsToInputs(exts = {}) {
  DEPT_KEYS.forEach((key) => {
    const el = document.getElementById(`dept-${key}`);
    if (el) el.value = exts[key] || '';
  });
}

async function saveExtensionRegistration() {
  const extNumber = document.getElementById('regExtNumber').value.trim();
  const extPassword = document.getElementById('regExtPassword').value.trim();
  const serverUrl = document.getElementById('regServerUrl').value.trim();

  if(!extNumber || !extPassword || !serverUrl) {
    if(typeof toast === 'function') toast('Please fill in all extension fields', 'warn');
    return;
  }

  const button = document.querySelector('[onclick="saveExtensionRegistration()"]');
  if (button) {
    button.disabled = true;
    button.textContent = 'Registering...';
  }

  const deptExts = getDepartmentExtensionsFromInputs();
  const params = new URLSearchParams(window.location.search);
  const tenantId = params.get('tenant') || '1000';
  const hotelName = (document.getElementById('vHotel') ? document.getElementById('vHotel').value : '') || 'ABC Hotel';
  const hotelAddress = (document.getElementById('vAddress') ? document.getElementById('vAddress').value : '') || '';

  try {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        extension: extNumber,
        password: extPassword,
        server: serverUrl,
        port: 5060,
        tenant_id: tenantId,
        hotel_profile: {
          propertyName: hotelName,
          hotel: hotelName,
          propertyAddress: hotelAddress,
          address: hotelAddress,
          departmentExtensions: deptExts
        }
      })
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || 'Registration failed');

    const note = document.getElementById('regSavedNote');
    if(note) {
      note.style.opacity = '1';
      setTimeout(() => note.style.opacity = '0', 3000);
    }
    if(typeof toast === 'function') toast('AI Extension registered successfully', 'ok');
  } catch (error) {
    if(typeof toast === 'function') toast(error.message, 'warn');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Save & Register AI Extension';
    }
  }
}

async function saveHotelDetails() {
  const params = new URLSearchParams(window.location.search);
  const tenantId = params.get('tenant') || '1000';
  const hotelName = (document.getElementById('vHotel') ? document.getElementById('vHotel').value : '') || 'ABC Hotel';
  const propertyNo = (document.getElementById('vProperty') ? document.getElementById('vProperty').value : '') || '';
  const ownerName = (document.getElementById('vOwner') ? document.getElementById('vOwner').value : '') || '';
  const hotelAddress = (document.getElementById('vAddress') ? document.getElementById('vAddress').value : '') || '';
  const deptExts = getDepartmentExtensionsFromInputs();

  const profile = {
    propertyName: hotelName,
    hotel: hotelName,
    propertyNo: propertyNo,
    ownerName: ownerName,
    propertyAddress: hotelAddress,
    address: hotelAddress,
    departmentExtensions: deptExts
  };

  try {
    await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: tenantId, hotel_profile: profile })
    });
  } catch (err) {
    console.error('Could not sync hotel details with backend', err);
  }

  const note = document.getElementById('hotelSavedNote');
  if(note) {
    note.style.opacity = '1';
    setTimeout(() => note.style.opacity = '0', 2000);
  }
  if(typeof toast === 'function') toast('Hotel details & extensions saved', 'ok');
}

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const tenantId = params.get('tenant') || '1000';
  
  const adminState = typeof loadAdminState === 'function' ? loadAdminState() : { tenants: [] };
  const t = adminState.tenants.find(x => x.id === tenantId) || {
    id: tenantId,
    hotel: params.get('hotel') || "ABC Hotel",
    address: "123 Main Street, New York, NY",
    propertyNo: "PR-1001",
    ownerName: "John Doe"
  };

  // Populate sidebar & topbar text elements
  if(document.getElementById('sideTenant')) document.getElementById('sideTenant').textContent = t.id;
  if(document.getElementById('sideProperty')) document.getElementById('sideProperty').textContent = t.propertyNo || 'N/A';
  if(document.getElementById('topHotelName')) document.getElementById('topHotelName').textContent = t.hotel;
  if(document.getElementById('topTenant')) document.getElementById('topTenant').textContent = t.id;
  if(document.getElementById('topProperty')) document.getElementById('topProperty').textContent = t.propertyNo || 'N/A';
  if(document.getElementById('topOwner')) document.getElementById('topOwner').textContent = t.ownerName || 'N/A';

  // Populate form input elements
  if(document.getElementById('vTenant')) document.getElementById('vTenant').value = t.id;
  if(document.getElementById('vProperty')) document.getElementById('vProperty').value = t.propertyNo || 'N/A';
  if(document.getElementById('vHotel')) document.getElementById('vHotel').value = t.hotel;
  if(document.getElementById('vOwner')) document.getElementById('vOwner').value = t.ownerName || 'N/A';
  if(document.getElementById('vAddress')) document.getElementById('vAddress').value = t.address || 'N/A';

  // Set default frontDesk and ringGroup extensions if present or from backend
  const existingDeptExts = (t.hotelProfile && t.hotelProfile.departmentExtensions) || {
    frontDesk: '501',
    ringGroup: '502'
  };
  setDepartmentExtensionsToInputs(existingDeptExts);

  // Fetch active profile from backend if available
  fetch('/api/profile')
    .then((r) => r.ok ? r.json() : null)
    .then((data) => {
      if (data && data.hotel_profile && data.hotel_profile.departmentExtensions) {
        setDepartmentExtensionsToInputs(data.hotel_profile.departmentExtensions);
      }
    })
    .catch(() => {});

  // Sidebar navigation tab switcher
  const navList = document.getElementById('navList');
  if(navList) {
    navList.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-tab]');
      if (!b || b.dataset.tab === 'close') return;
      document.querySelectorAll('.nav button[data-tab]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      const targetPanel = document.querySelector(`.tab-panel[data-panel="${b.dataset.tab}"]`);
      if(targetPanel) targetPanel.classList.add('active');
    });
  }
});