/* ============ GUARD ============ */
const adminState = loadAdminState();
if(!adminState.authenticated){
  window.location.href = 'adminlogin.html';
}

const INTENT_WORDS = ["guest lookup","transfer to front desk","complaint ticket","check-in question","Wi-Fi question"];
let currentPage = 1;
const ITEMS_PER_PAGE = 10;

document.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('sideOperator').textContent = adminState.operatorId;
  renderAll();
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
  adminState.authenticated = false;
  saveAdminState(adminState);
  window.location.href = 'adminlogin.html';
}

function onGlobalSearch(){
  const term = document.getElementById('globalSearch').value;
  document.querySelector('.nav button[data-tab="tenants"]').click();
  document.getElementById('tenantSearch').value = term;
  currentPage = 1;
  renderTenants();
}

function onTenantSearchInput(){
  currentPage = 1;
  renderTenants();
}

/* ============ RENDER ALL ============ */
function renderAll(){
  renderKPIs();
  renderAttention();
  renderOverviewFeed();
  renderTenants();
  renderActivityFull();
}

/* ============ KPIs ============ */
function renderKPIs(){
  const total = adminState.tenants.length;
  const online = adminState.tenants.filter(t=>t.status==='online').length;
  const offline = total - online;
  const calls = adminState.tenants.reduce((sum,t)=>sum + (t.callsToday||0), 0);

  document.getElementById('kpiProvisioned').textContent = total;
  document.getElementById('kpiProvisionedPct').textContent = Math.round(total/49*100) + '% of tenants';
  document.getElementById('kpiOnline').textContent = online;
  document.getElementById('kpiOnlineNote').textContent = offline + ' offline';
  document.getElementById('kpiCalls').textContent = calls;
}

/* ============ ATTENTION LIST ============ */
function renderAttention(){
  const el = document.getElementById('attentionList');
  const needs = adminState.tenants.filter(t=>t.status!=='online');
  el.innerHTML = '';
  if(needs.length === 0){
    el.innerHTML = '<div class="empty">All tenants are online. Nothing needs attention.</div>';
    return;
  }
  needs.forEach(t=>{
    const row = document.createElement('div');
    row.className = 'mini-row';
    row.innerHTML = `
      <div>
        <div class="who">${escapeHtml(t.hotel)}</div>
        <div class="meta">ID: ${t.id} · Property: ${t.propertyNo || 'N/A'} · ${t.lastActivity}</div>
      </div>
      <span class="status-chip ${t.status}">${t.status}</span>`;
    el.appendChild(row);
  });
}

/* ============ OVERVIEW FEED (top 5) ============ */
function renderOverviewFeed(){
  const el = document.getElementById('overviewFeed');
  el.innerHTML = '';
  if(adminState.activity.length === 0){
    el.innerHTML = '<div class="empty">No activity yet.</div>';
    return;
  }
  adminState.activity.slice(0,5).forEach(a=>{
    el.appendChild(feedItem(a));
  });
}

function renderActivityFull(){
  const el = document.getElementById('activityFeedFull');
  el.innerHTML = '';
  if(adminState.activity.length === 0){
    el.innerHTML = '<div class="empty">No activity yet.</div>';
    return;
  }
  adminState.activity.forEach(a=>{
    el.appendChild(feedItem(a));
  });
}

function feedItem(a){
  const row = document.createElement('div');
  row.className = 'feed-item';
  row.innerHTML = `
    <div class="feed-dot"></div>
    <div>
      <div class="feed-text"><b>${escapeHtml(a.hotel)}</b> (${a.tenant}) — ${escapeHtml(a.event)}</div>
      <div class="feed-time">${a.time}</div>
    </div>`;
  return row;
}

/* ============ TENANTS TABLE WITH PAGINATION ============ */
function renderTenants(){
  const term = (document.getElementById('tenantSearch').value || '').toLowerCase();
  const status = document.getElementById('statusFilter').value;

  const allFiltered = adminState.tenants.filter(t=>{
    const matchesTerm = !term || 
      t.hotel.toLowerCase().includes(term) || 
      t.id.toLowerCase().includes(term) || 
      (t.propertyNo && t.propertyNo.toLowerCase().includes(term)) ||
      (t.ownerName && t.ownerName.toLowerCase().includes(term));
    const matchesStatus = status === 'all' || t.status === status;
    return matchesTerm && matchesStatus;
  });

  const totalItems = allFiltered.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;

  if (currentPage > totalPages) currentPage = totalPages;

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedRows = allFiltered.slice(startIndex, endIndex);

  const body = document.getElementById('tenantsBody');
  body.innerHTML = '';
  document.getElementById('tenantsEmpty').style.display = totalItems === 0 ? 'block' : 'none';

  paginatedRows.forEach(t=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="tenant-id-chip">${t.id}</td>
      <td class="tenant-hotel">${escapeHtml(t.hotel)}</td>
      <td class="tenant-did" style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(t.address || 'N/A')}</td>
      <td class="tenant-did">${escapeHtml(t.propertyNo || 'N/A')}</td>
      <td><b>${escapeHtml(t.ownerName || 'N/A')}</b></td>
      <td><span class="status-chip ${t.status}">${t.status}</span></td>
      <td>${t.callsToday || 0}</td>
      <td>
        <div class="row-actions">
          <a href="tenantdetails.html?tenant=${encodeURIComponent(t.id)}&hotel=${encodeURIComponent(t.hotel)}" target="_blank">View</a>
          <button onclick="restartTenant('${t.id}')">Restart</button>
          <button onclick="toggleSuspend('${t.id}')">${t.status === 'offline' ? 'Activate' : 'Suspend'}</button>
          <button class="danger" onclick="removeTenant('${t.id}')">Remove</button>
        </div>
      </td>`;
    body.appendChild(tr);
  });

  renderPaginationControls(totalItems, totalPages);
}

function renderPaginationControls(totalItems, totalPages) {
  const container = document.getElementById('pagination');
  if (!container) return;

  if (totalItems === 0) {
    container.innerHTML = '';
    return;
  }

  const startItem = (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const endItem = Math.min(currentPage * ITEMS_PER_PAGE, totalItems);

  let buttonsHtml = `
    <button ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">Prev</button>
  `;

  for (let i = 1; i <= totalPages; i++) {
    buttonsHtml += `
      <button class="${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>
    `;
  }

  buttonsHtml += `
    <button ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">Next</button>
  `;

  container.innerHTML = `
    <div class="page-info">Showing ${startItem}–${endItem} of ${totalItems} tenants</div>
    <div class="pagination-controls">${buttonsHtml}</div>
  `;
}

function changePage(page) {
  currentPage = page;
  renderTenants();
}

function findTenant(id){
  return adminState.tenants.find(t=>t.id === id);
}

function restartTenant(id){
  const t = findTenant(id);
  if(!t) return;
  if(t.status === 'online'){
    toast(t.hotel + ' is already online', 'warn');
    return;
  }
  t.status = 'provisioning';
  saveAdminState(adminState);
  renderAll();
  toast('Re-registering ' + t.hotel + '…');
  setTimeout(()=>{
    t.status = 'online';
    t.lastActivity = 'just now';
    logActivity(t, 'Extension re-registered by operator');
    saveAdminState(adminState);
    renderAll();
    toast(t.hotel + ' is back online', 'ok');
  }, 1000);
}

function toggleSuspend(id){
  const t = findTenant(id);
  if(!t) return;
  if(t.status === 'offline'){
    t.status = 'online';
    t.lastActivity = 'just now';
    logActivity(t, 'Extension activated by operator');
    toast(t.hotel + ' activated', 'ok');
  }else{
    t.status = 'offline';
    t.lastActivity = 'just now';
    logActivity(t, 'Extension suspended by operator');
    toast(t.hotel + ' suspended', 'warn');
  }
  saveAdminState(adminState);
  renderAll();
}

function removeTenant(id){
  const t = findTenant(id);
  if(!t) return;
  if(!confirm('Remove the AI extension for ' + t.hotel + '? This cannot be undone.')) return;
  adminState.tenants = adminState.tenants.filter(x=>x.id !== id);
  saveAdminState(adminState);
  renderAll();
  toast(t.hotel + ' removed from platform', 'warn');
}

function logActivity(t, event){
  adminState.activity.unshift({
    time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}),
    tenant: t.id, hotel: t.hotel, event
  });
}

/* ============ SIMULATE PLATFORM CALL ============ */
function simulatePlatformCall(){
  const onlineTenants = adminState.tenants.filter(t=>t.status==='online');
  if(onlineTenants.length === 0){
    toast('No tenants are online right now', 'warn');
    return;
  }
  const t = onlineTenants[Math.floor(Math.random()*onlineTenants.length)];
  const event = 'Call handled — ' + INTENT_WORDS[Math.floor(Math.random()*INTENT_WORDS.length)];
  t.callsToday += 1;
  t.lastActivity = 'just now';
  logActivity(t, event);
  saveAdminState(adminState);
  renderAll();
  toast(t.hotel + ' — ' + event, 'ok');
}

/* ============ ADD TENANT MODAL ============ */
function openAddTenant(){
  const nextId = adminState.nextTenantSeq || 1000;
  document.getElementById('newTenantId').value = String(nextId);
  document.getElementById('newHotelName').value = '';
  document.getElementById('newPropertyNo').value = '';
  document.getElementById('newOwnerName').value = '';
  document.getElementById('newHotelAddress').value = '';
  document.getElementById('addTenantOverlay').classList.add('show');
}

function closeAddTenant(){
  document.getElementById('addTenantOverlay').classList.remove('show');
}

function submitAddTenant(){
  const hotel = document.getElementById('newHotelName').value.trim();
  const propertyNo = document.getElementById('newPropertyNo').value.trim();
  const ownerName = document.getElementById('newOwnerName').value.trim();
  const address = document.getElementById('newHotelAddress').value.trim();
  const id = document.getElementById('newTenantId').value;

  if(!hotel || !propertyNo || !ownerName || !address){
    toast('Hotel name, Property No, Owner name, and Address are required', 'warn');
    return;
  }

  const tenant = { 
    id, 
    hotel, 
    address,
    propertyNo, 
    ownerName, 
    status: 'provisioning', 
    callsToday: 0, 
    lastActivity: 'just now'
  };

  adminState.tenants.unshift(tenant);
  adminState.nextTenantSeq = (adminState.nextTenantSeq || 1000) + 1;
  logActivity(tenant, 'AI extension provisioned by operator');
  saveAdminState(adminState);
  closeAddTenant();
  currentPage = 1;
  renderAll();
  toast('Provisioning ' + hotel + '…');

  setTimeout(()=>{
    tenant.status = 'online';
    tenant.lastActivity = 'just now';
    logActivity(tenant, 'Extension registered — now online');
    saveAdminState(adminState);
    renderAll();
    toast(hotel + ' is online', 'ok');
  }, 1400);
}

document.getElementById('addTenantOverlay').addEventListener('click', (e)=>{
  if(e.target.id === 'addTenantOverlay') closeAddTenant();
});