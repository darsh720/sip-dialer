import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../style/admindashboard.css';
import '../style/admin.css';

const ITEMS_PER_PAGE = 10;
const INTENT_WORDS = [
  'guest lookup',
  'transfer to front desk',
  'complaint ticket',
  'check-in question',
  'Wi-Fi question'
];

const EMPTY_ADMIN_STATE = {
  authenticated: true,
  operatorId: '',
  tenants: [],
  activity: [],
};

export default function AdminDashboard() {
  const navigate = useNavigate();

  const [adminState, setAdminState] = useState(() => {
    return EMPTY_ADMIN_STATE;
  });

  const [activeTab, setActiveTab] = useState('overview');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalForm, setModalForm] = useState({
    tenantId: '',
    hotelName: '',
    propertyNo: '',
    ownerName: '',
    address: ''
  });

  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg, type = '') => {
    setToastMessage({ msg, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 2600);
  };

  useEffect(() => {
    fetch('/api/tenants')
      .then((response) => response.json())
      .then((result) => {
        if (result.ok) {
          setAdminState((previous) => ({ ...previous, tenants: result.tenants || [] }));
        }
      })
      .catch((error) => console.error('Could not load tenants', error));
  }, []);

  const logActivity = (tenant, event) => {
    const newEntry = {
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      tenant: tenant.id,
      hotel: tenant.hotel,
      event
    };
    return [newEntry, ...adminState.activity];
  };

  const handleLogout = () => {
    setIsMenuOpen(false);
    setAdminState((prev) => ({ ...prev, authenticated: false }));
    navigate('/admin-login');
  };

  const selectTab = (tab) => {
    setActiveTab(tab);
    setIsMenuOpen(false);
  };

  const handleRestart = (id) => {
    const t = adminState.tenants.find((x) => x.id === id);
    if (!t) return;
    if (t.status === 'online') {
      showToast(`${t.hotel} is already online`, 'warn');
      return;
    }

    const updated = adminState.tenants.map((x) =>
      x.id === id ? { ...x, status: 'provisioning' } : x
    );
    setAdminState((prev) => ({ ...prev, tenants: updated }));
    showToast(`Re-registering ${t.hotel}…`);

    setTimeout(() => {
      setAdminState((prev) => {
        const finished = prev.tenants.map((x) =>
          x.id === id ? { ...x, status: 'online', lastActivity: 'just now' } : x
        );
        const nextActivity = [{
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          tenant: t.id,
          hotel: t.hotel,
          event: 'Extension re-registered by operator'
        }, ...prev.activity];

        return { ...prev, tenants: finished, activity: nextActivity };
      });
      showToast(`${t.hotel} is back online`, 'ok');
    }, 1000);
  };

  const handleToggleSuspend = (id) => {
    const t = adminState.tenants.find((x) => x.id === id);
    if (!t) return;

    const willOnline = t.status === 'offline';
    const nextStatus = willOnline ? 'online' : 'offline';
    const event = willOnline
      ? 'Extension activated by operator'
      : 'Extension suspended by operator';

    const updated = adminState.tenants.map((x) =>
      x.id === id ? { ...x, status: nextStatus, lastActivity: 'just now' } : x
    );

    const nextActivity = [{
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      tenant: t.id,
      hotel: t.hotel,
      event
    }, ...adminState.activity];

    setAdminState((prev) => ({
      ...prev,
      tenants: updated,
      activity: nextActivity
    }));

    showToast(`${t.hotel} ${willOnline ? 'activated' : 'suspended'}`, willOnline ? 'ok' : 'warn');
  };

  const handleRemove = (id) => {
    const t = adminState.tenants.find((x) => x.id === id);
    if (!t) return;
    if (!window.confirm(`Remove the AI extension for ${t.hotel}? This cannot be undone.`)) return;

    setAdminState((prev) => ({
      ...prev,
      tenants: prev.tenants.filter((x) => x.id !== id)
    }));
    showToast(`${t.hotel} removed from platform`, 'warn');
  };

  const handleSimulatePlatformCall = () => {
    const onlineTenants = adminState.tenants.filter((t) => t.status === 'online');
    if (onlineTenants.length === 0) {
      showToast('No tenants are online right now', 'warn');
      return;
    }

    const t = onlineTenants[Math.floor(Math.random() * onlineTenants.length)];
    const event = 'Call handled — ' + INTENT_WORDS[Math.floor(Math.random() * INTENT_WORDS.length)];

    const updatedTenants = adminState.tenants.map((x) =>
      x.id === t.id ? { ...x, callsToday: (x.callsToday || 0) + 1, lastActivity: 'just now' } : x
    );

    const nextActivity = [{
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      tenant: t.id,
      hotel: t.hotel,
      event
    }, ...adminState.activity];

    setAdminState((prev) => ({
      ...prev,
      tenants: updatedTenants,
      activity: nextActivity
    }));
    showToast(`${t.hotel} — ${event}`, 'ok');
  };

  const openAddTenant = () => {
    setModalForm({
      tenantId: '',
      hotelName: '',
      propertyNo: '',
      ownerName: '',
      address: ''
    });
    setIsModalOpen(true);
  };

  const submitAddTenant = async (e) => {
    e.preventDefault();
    const tenantId = modalForm.tenantId.trim();
    if (!tenantId || !modalForm.hotelName.trim() || !modalForm.propertyNo.trim() || !modalForm.ownerName.trim() || !modalForm.address.trim()) {
      showToast('Tenant ID, hotel name, Property No, owner name, and address are required', 'warn');
      return;
    }
    if (adminState.tenants.some((tenant) => tenant.id.toLowerCase() === tenantId.toLowerCase())) {
      showToast(`Tenant ID ${tenantId} already exists`, 'warn');
      return;
    }

    const newTenant = {
      id: tenantId,
      hotel: modalForm.hotelName.trim(),
      propertyNo: modalForm.propertyNo.trim(),
      ownerName: modalForm.ownerName.trim(),
      address: modalForm.address.trim(),
      status: 'provisioning',
      callsToday: 0,
      lastActivity: 'just now'
    };

    const nextActivity = [{
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      tenant: newTenant.id,
      hotel: newTenant.hotel,
      event: 'AI extension provisioned by operator'
    }, ...adminState.activity];

    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: newTenant.id,
          hotel_profile: {
            propertyName: newTenant.hotel,
            propertyNo: newTenant.propertyNo,
            ownerName: newTenant.ownerName,
            propertyAddress: newTenant.address,
            address: newTenant.address,
          },
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || `Server returned ${response.status}`);
      }

      setAdminState((prev) => ({
        ...prev,
        tenants: [newTenant, ...prev.tenants],
        activity: nextActivity
      }));
      setIsModalOpen(false);
      setCurrentPage(1);
      showToast(`${newTenant.hotel} saved to database`, 'ok');
    } catch (error) {
      showToast(`Could not save ${newTenant.hotel}: ${error.message}`, 'warn');
      return;
    }

    setTimeout(() => {
      setAdminState((prev) => {
        const completed = prev.tenants.map((x) =>
          x.id === newTenant.id ? { ...x, status: 'online', lastActivity: 'just now' } : x
        );
        const finalActivity = [{
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          tenant: newTenant.id,
          hotel: newTenant.hotel,
          event: 'Extension registered — now online'
        }, ...prev.activity];
        return { ...prev, tenants: completed, activity: finalActivity };
      });
      showToast(`${newTenant.hotel} is online`, 'ok');
    }, 1400);
  };

  const totalTenants = adminState.tenants.length;
  const onlineCount = adminState.tenants.filter((t) => t.status === 'online').length;
  const offlineCount = totalTenants - onlineCount;
  const callsCount = adminState.tenants.reduce((sum, t) => sum + (t.callsToday || 0), 0);
  const attentionList = adminState.tenants.filter((t) => t.status !== 'online');

  const filteredTenants = adminState.tenants.filter((t) => {
    const term = searchTerm.toLowerCase();
    const matchesTerm =
      !term ||
      t.hotel.toLowerCase().includes(term) ||
      t.id.toLowerCase().includes(term) ||
      (t.propertyNo && t.propertyNo.toLowerCase().includes(term)) ||
      (t.ownerName && t.ownerName.toLowerCase().includes(term));
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchesTerm && matchesStatus;
  });

  const totalPages = Math.ceil(filteredTenants.length / ITEMS_PER_PAGE) || 1;
  const activePage = currentPage > totalPages ? totalPages : currentPage;
  const startIndex = (activePage - 1) * ITEMS_PER_PAGE;
  const paginatedTenants = filteredTenants.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  return (
    <div id="dashboardView" className="admin-dashboard">
      <button
        type="button"
        className={`mobile-menu-toggle ${isMenuOpen ? 'open' : ''}`}
        aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={isMenuOpen}
        aria-controls="dashboardNavigation"
        onClick={() => setIsMenuOpen((open) => !open)}
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

      {isMenuOpen && (
        <button
          type="button"
          className="menu-backdrop"
          aria-label="Close navigation menu"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside className={`sidebar ${isMenuOpen ? 'open' : ''}`} id="dashboardNavigation">
        <div className="brand">
          <div className="mark admin-mark">C</div>
          <div className="name">
            CNetVoIP<small style={{ color: '#8A8FB8' }}>PLATFORM</small>
          </div>
        </div>

        <div className="sidebar-ext">
          <div className="pulse-dot on"></div>
          <div className="info" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span>
              Operator<b id="sideOperator">{adminState.operatorId}</b>
            </span>
          </div>
        </div>

        <nav className="nav" id="navList">
          <button
            type="button"
            className={activeTab === 'overview' ? 'active' : ''}
            onClick={() => selectTab('overview')}
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="3" width="7" height="9" rx="1.5" />
              <rect x="14" y="3" width="7" height="5" rx="1.5" />
              <rect x="14" y="12" width="7" height="9" rx="1.5" />
              <rect x="3" y="16" width="7" height="5" rx="1.5" />
            </svg>
            Overview
          </button>
          <button
            type="button"
            className={activeTab === 'tenants' ? 'active' : ''}
            onClick={() => selectTab('tenants')}
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M3 21h18M6 21V7l6-4 6 4v14M9 9h1M9 13h1M14 9h1M14 13h1M10 21v-4h4v4" />
            </svg>
            Tenants
          </button>
          <button
            type="button"
            className={activeTab === 'activity' ? 'active' : ''}
            onClick={() => selectTab('activity')}
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M4 5h16M4 12h16M4 19h10" />
            </svg>
            Call Activity
          </button>

          <div className="divider"></div>

          <button type="button" onClick={handleLogout}>
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            Logout
          </button>
        </nav>
      </aside>

      {/* MAIN CONTAINER */}
      <div className="main">
        <header className="topbar">
          <div>
            <h1>
              Platform Admin<span className="admin-badge">Operator</span>
            </h1>
            <div className="sub">All hotel tenants and AI extensions on core.cnetvoip.cloud</div>
          </div>
        </header>

        <div className="content">
          {/* TAB 1: OVERVIEW */}
          <div className={`tab-panel ${activeTab === 'overview' ? 'active' : ''}`}>
            <div className="kpi-grid">
              <div className="stat-card">
                <div className="lbl">Total PBX Tenants</div>
                <div className="val">49</div>
                <div className="delta">Across CNetPBX cloud</div>
              </div>
              <div className="stat-card">
                <div className="lbl">AI Extensions Provisioned</div>
                <div className="val">{totalTenants}</div>
                <div className="delta">{Math.round((totalTenants / 49) * 100)}% of tenants</div>
              </div>
              <div className="stat-card">
                <div className="lbl">Extensions Online</div>
                <div className="val">{onlineCount}</div>
                <div className="delta">{offlineCount} offline</div>
              </div>
              <div className="stat-card">
                <div className="lbl">Calls Handled Today</div>
                <div className="val">{callsCount}</div>
                <div className="delta">Platform-wide</div>
              </div>
            </div>

            <div className="panel-grid">
              <div className="card">
                <h2>Tenants needing attention</h2>
                <div className="desc">Offline or still provisioning — these hotels aren't taking AI calls.</div>
                <div>
                  {attentionList.map((t) => (
                    <div key={t.id} className="feed-item">
                      <div
                        className="feed-dot"
                        style={{ background: t.status === 'offline' ? 'var(--danger)' : 'var(--warn)' }}
                      ></div>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div className="feed-text">
                            <b>{t.hotel}</b>{' '}
                            <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--mute)' }}>
                              ({t.id})
                            </span>{' '}
                            — Property: {t.propertyNo || 'N/A'}
                          </div>
                          <div className="feed-time">{t.lastActivity}</div>
                        </div>
                        <span className={`status-chip ${t.status}`}>{t.status}</span>
                      </div>
                    </div>
                  ))}
                  {attentionList.length === 0 && (
                    <div className="empty">All tenants are online. Nothing needs attention.</div>
                  )}
                </div>
              </div>

              <div className="card">
                <h2>Recent platform activity</h2>
                <div className="desc">Latest events across every tenant.</div>
                <div>
                  {adminState.activity.slice(0, 5).map((a, i) => (
                    <div key={i} className="feed-item">
                      <div className="feed-dot"></div>
                      <div>
                        <div className="feed-text">
                          <b>{a.hotel}</b> ({a.tenant}) — {a.event}
                        </div>
                        <div className="feed-time">{a.time}</div>
                      </div>
                    </div>
                  ))}
                  {adminState.activity.length === 0 && <div className="empty">No activity yet.</div>}
                </div>
              </div>
            </div>
          </div>

          {/* TAB 2: TENANTS */}
          <div className={`tab-panel ${activeTab === 'tenants' ? 'active' : ''}`}>
            <div className="card">
              <h2>All tenants</h2>
              <div className="desc">Every hotel with an AI extension provisioned on this platform.</div>

              <div className="table-toolbar">
                <div className="table-filters">
                  <input
                    type="text"
                    placeholder="Search hotel, tenant ID, property, or owner…"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                  <select
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                  >
                    <option value="all">All statuses</option>
                    <option value="online">Online</option>
                    <option value="offline">Offline</option>
                    <option value="provisioning">Provisioning</option>
                  </select>
                </div>
                <button type="button" className="btn-solid" onClick={openAddTenant}>
                  + Add Tenant
                </button>
              </div>

              <div className="table-scroll">
                <table className="tenants">
                  <thead>
                    <tr>
                      <th>Tenant ID</th>
                      <th>Hotel Name</th>
                      <th>Hotel Address</th>
                      <th>Property No</th>
                      <th>Owner Name</th>
                      <th>Front Desk / Ring Group</th>
                      <th>Status</th>
                      <th>Calls Today</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedTenants.map((t) => (
                      <tr key={t.id}>
                      <td className="tenant-id-chip">{t.id}</td>
                      <td className="tenant-hotel">{t.hotel}</td>
                      <td
                        className="tenant-did"
                        style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {t.address || 'N/A'}
                      </td>
                      <td className="tenant-did">{t.propertyNo || 'N/A'}</td>
                      <td>
                        <b>{t.ownerName || 'N/A'}</b>
                      </td>
                      <td className="tenant-did">
                        <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
                          {t.hotelProfile?.departmentExtensions?.frontDesk || t.hotelProfile?.frontExt || '501'}
                        </span>
                        {t.hotelProfile?.departmentExtensions?.ringGroup && (
                          <span style={{ color: 'var(--mute)', fontSize: '11px', marginLeft: '5px' }}>
                            (RG: {t.hotelProfile.departmentExtensions.ringGroup})
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`status-chip ${t.status}`}>{t.status}</span>
                      </td>
                      <td>{t.callsToday || 0}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            onClick={() =>
                              window.open(
                                `/tenant-details?tenant=${encodeURIComponent(t.id)}&hotel=${encodeURIComponent(t.hotel)}`,
                                '_blank'
                              )
                            }
                          >
                            View
                          </button>
                          <button type="button" onClick={() => handleRestart(t.id)}>
                            Restart
                          </button>
                          <button type="button" onClick={() => handleToggleSuspend(t.id)}>
                            {t.status === 'offline' ? 'Activate' : 'Suspend'}
                          </button>
                          <button type="button" className="danger" onClick={() => handleRemove(t.id)}>
                            Remove
                          </button>
                        </div>
                      </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredTenants.length === 0 && (
                <div className="empty">No tenants match your filters.</div>
              )}

              {/* PAGINATION CONTROLS */}
              {filteredTenants.length > 0 && (
                <div className="pagination-wrapper">
                  <div className="page-info">
                    Showing {startIndex + 1}–{Math.min(startIndex + ITEMS_PER_PAGE, filteredTenants.length)} of{' '}
                    {filteredTenants.length} tenants
                  </div>
                  <div className="pagination-controls">
                    <button
                      type="button"
                      disabled={activePage === 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    >
                      Prev
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={p === activePage ? 'active' : ''}
                        onClick={() => setCurrentPage(p)}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={activePage === totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* TAB 3: ACTIVITY */}
          <div className={`tab-panel ${activeTab === 'activity' ? 'active' : ''}`}>
            <div className="card">
              <h2>Platform-wide call activity</h2>
              <div className="desc">Every AI-handled call across all tenants, most recent first.</div>
              <div style={{ marginBottom: '16px' }}>
                <button type="button" className="btn-outline" onClick={handleSimulatePlatformCall}>
                  + Simulate call on random tenant
                </button>
              </div>
              <div>
                {adminState.activity.map((a, i) => (
                  <div key={i} className="feed-item">
                    <div className="feed-dot"></div>
                    <div>
                      <div className="feed-text">
                        <b>{a.hotel}</b> ({a.tenant}) — {a.event}
                      </div>
                      <div className="feed-time">{a.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ADD TENANT MODAL */}
      <div className={`modal-overlay ${isModalOpen ? 'show' : ''}`} onClick={(e) => {
        if (e.target.classList.contains('modal-overlay')) setIsModalOpen(false);
      }}>
        <div className="modal">
          <h2>Provision a new AI extension</h2>
          <div className="desc">Adds an AI receptionist for a hotel property on CNetPBX.</div>

          <form onSubmit={submitAddTenant} className="grid2">
            <div className="field-block">
              <label>Tenant ID</label>
              <input
                type="text"
                value={modalForm.tenantId}
                onChange={(e) => setModalForm({ ...modalForm, tenantId: e.target.value })}
                placeholder="Enter tenant ID"
                required
              />
            </div>
            <div className="field-block">
              <label>Hotel Name</label>
              <input
                type="text"
                placeholder="e.g. Grand Palace Hotel"
                value={modalForm.hotelName}
                onChange={(e) => setModalForm({ ...modalForm, hotelName: e.target.value })}
                required
              />
            </div>
            <div className="field-block">
              <label>Property No</label>
              <input
                type="text"
                placeholder="e.g. PR-8821"
                value={modalForm.propertyNo}
                onChange={(e) => setModalForm({ ...modalForm, propertyNo: e.target.value })}
                required
              />
            </div>
            <div className="field-block">
              <label>Owner Name</label>
              <input
                type="text"
                placeholder="e.g. John Doe"
                value={modalForm.ownerName}
                onChange={(e) => setModalForm({ ...modalForm, ownerName: e.target.value })}
                required
              />
            </div>
            <div className="field-block full">
              <label>Hotel Address</label>
              <textarea
                placeholder="e.g. 450 Ocean Drive, Miami, FL"
                value={modalForm.address}
                onChange={(e) => setModalForm({ ...modalForm, address: e.target.value })}
                required
              />
            </div>

            <div className="modal-actions full">
              <button type="button" className="btn-outline" onClick={() => setIsModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn-solid">
                Provision extension
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* TOAST ALERTS */}
      {toastMessage && (
        <div className="toast-stack">
          <div className={`toast ${toastMessage.type}`}>{toastMessage.msg}</div>
        </div>
      )}
    </div>
  );
}