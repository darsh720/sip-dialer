import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../style/hoteldashboard.css';
import { DEPARTMENT_LIST, defaultHotelProfile } from '../lib/hotelProfile';
import AiKnowledgeModal from './aiknowledge';

const DEFAULT_STATE = {
  connected: true,
  tenantId: 'TEN-0049',
  extension: '510',
  hotel: {
    name: 'ABC Hotel',
    did: '+1 408 555 1001',
    frontExt: '501',
    tz: 'America/New_York',
    address: '123 Main Street, New York, USA',
    greeting: 'Welcome to ABC Hotel. How may I help you today?',
    lang: 'English',
    fallback: '501',
    departmentExtensions: {
      ...defaultHotelProfile.departmentExtensions,
      frontDesk: '501',
    },
  },
  kb: [
    { q: 'What is check-in time?', a: 'Check-in starts at 2:00 PM.' },
    { q: 'Do you provide free Wi-Fi?', a: 'Yes, free Wi-Fi is available in all rooms.' },
  ],
  logs: [
    { time: '09:14 AM', caller: '+1 646 555 0912', intent: 'transfer', duration: '0:42', status: 'completed' },
    { time: '09:47 AM', caller: '+1 917 555 0134', intent: 'lookup', duration: '0:28', status: 'completed' },
    { time: '10:22 AM', caller: '+1 332 555 0087', intent: 'ticket', duration: '1:05', status: 'escalated' },
    { time: '11:03 AM', caller: '+1 718 555 0221', intent: 'lookup', duration: '0:19', status: 'completed' },
    { time: '11:40 AM', caller: '+1 212 555 0399', intent: 'transfer', duration: '0:00', status: 'missed' },
  ],
  settings: {
    greeting: true,
    autoTransfer: true,
    sms: true,
    email: false,
    voice: 'Warm Female — Aria',
    retries: 2,
  },
};

const STORAGE_KEY = 'cnv_ai_extension_state_v2';

export default function HotelDashboard() {
  const navigate = useNavigate();

  // Load state from localStorage or fallback to default
  const [data, setData] = useState(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        return {
          ...DEFAULT_STATE,
          ...parsed,
          hotel: {
            ...DEFAULT_STATE.hotel,
            ...(parsed.hotel || {}),
            departmentExtensions: {
              ...DEFAULT_STATE.hotel.departmentExtensions,
              ...((parsed.hotel && parsed.hotel.departmentExtensions) || {}),
            },
          },
        };
      } catch (e) {
        console.error(e);
      }
    }
    return DEFAULT_STATE;
  });

  const [activeTab, setActiveTab] = useState('overview');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Form states
  const [hotelForm, setHotelForm] = useState(() => ({
    ...DEFAULT_STATE.hotel,
    ...data.hotel,
    departmentExtensions: {
      ...DEFAULT_STATE.hotel.departmentExtensions,
      ...(data.hotel?.departmentExtensions || {}),
      ...(data.hotel?.frontExt ? { frontDesk: data.hotel.frontExt } : {}),
    },
  }));
  const [settingsForm, setSettingsForm] = useState(data.settings);
  const [hotelSaved, setHotelSaved] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Knowledge Base Inputs, Filter & Modal Visibility
  const [newQ, setNewQ] = useState('');
  const [newA, setNewA] = useState('');
  const [kbSearch, setKbSearch] = useState('');
  const [isJsonModalOpen, setIsJsonModalOpen] = useState(false);

  // Call Logs Filters
  const [logSearch, setLogSearch] = useState('');
  const [logFilter, setLogFilter] = useState('all');

  // Sync profile to backend helper
  const syncProfileToBackend = (hForm) => {
    const deptExts = {
      ...defaultHotelProfile.departmentExtensions,
      ...(hForm.departmentExtensions || {}),
      ...(hForm.frontExt ? { frontDesk: hForm.frontExt } : {}),
    };
    fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: data.tenantId,
        hotel_profile: {
          propertyName: hForm.name,
          hotel: hForm.name,
          propertyPhoneNumber: hForm.did,
          propertyAddress: hForm.address,
          address: hForm.address,
          greeting: hForm.greeting,
          departmentExtensions: deptExts,
        },
      }),
    }).catch((err) => console.error('Could not sync hotel profile to backend', err));
  };

  // Sync back to localStorage and backend on update
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  useEffect(() => {
    syncProfileToBackend(hotelForm);
  }, []);

  // Logout handler
  const handleLogout = () => {
    setIsMenuOpen(false);
    const updated = { ...data, connected: false };
    setData(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    navigate('/hotel-login');
  };

  const selectTab = (tab) => {
    setActiveTab(tab);
    setIsMenuOpen(false);
  };

  // Hotel Details Save
  const handleSaveHotel = (e) => {
    e.preventDefault();
    const updatedHotel = {
      ...hotelForm,
      frontExt: hotelForm.departmentExtensions?.frontDesk || hotelForm.frontExt || '',
    };
    setData((prev) => ({ ...prev, hotel: updatedHotel }));
    syncProfileToBackend(updatedHotel);
    setHotelSaved(true);
    setTimeout(() => setHotelSaved(false), 2000);
  };

  // Settings Save
  const handleSaveSettings = (e) => {
    e.preventDefault();
    setData((prev) => ({ ...prev, settings: settingsForm }));
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  };

  // Add Q&A to Knowledge Base
  const handleAddQA = () => {
    if (!newQ.trim() || !newA.trim()) return;
    const updatedKb = [...data.kb, { q: newQ.trim(), a: newA.trim() }];
    setData((prev) => ({ ...prev, kb: updatedKb }));
    setNewQ('');
    setNewA('');
  };

  // Delete Q&A from Knowledge Base
  const handleDeleteQA = (indexToDelete) => {
    const updatedKb = data.kb.filter((_, idx) => idx !== indexToDelete);
    setData((prev) => ({ ...prev, kb: updatedKb }));
  };

  // Simulate incoming test call
  const handleSimulateCall = () => {
    const intents = ['transfer', 'lookup', 'ticket'];
    const randomIntent = intents[Math.floor(Math.random() * intents.length)];
    const randomStatus = ['completed', 'escalated', 'missed'][Math.floor(Math.random() * 3)];
    const durationMin = Math.floor(Math.random() * 2);
    const durationSec = String(Math.floor(Math.random() * 60)).padStart(2, '0');

    const newLog = {
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      caller: `+1 ${Math.floor(200 + Math.random() * 800)} 555 ${String(Math.floor(1000 + Math.random() * 9000))}`,
      intent: randomIntent,
      duration: `${durationMin}:${durationSec}`,
      status: randomStatus,
    };

    setData((prev) => ({
      ...prev,
      logs: [newLog, ...prev.logs],
    }));
  };

  // KPI Calculations
  const totalCalls = data.logs.length;
  const transfers = data.logs.filter((l) => l.intent === 'transfer').length;
  const lookups = data.logs.filter((l) => l.intent === 'lookup').length;
  const tickets = data.logs.filter((l) => l.intent === 'ticket').length;

  const transfersPct = totalCalls ? Math.round((transfers / totalCalls) * 100) : 0;
  const lookupsPct = totalCalls ? Math.round((lookups / totalCalls) * 100) : 0;

  // Filtered lists
  const filteredKb = data.kb.filter(
    (item) =>
      item.q.toLowerCase().includes(kbSearch.toLowerCase()) ||
      item.a.toLowerCase().includes(kbSearch.toLowerCase())
  );

  const filteredLogs = data.logs.filter((log) => {
    const matchTerm = log.caller.toLowerCase().includes(logSearch.toLowerCase());
    const matchStatus = logFilter === 'all' || log.status === logFilter;
    return matchTerm && matchStatus;
  });

  return (
    <div id="dashboardView" className="hotel-dashboard">
      <button
        type="button"
        className={`hotel-mobile-menu-toggle ${isMenuOpen ? 'open' : ''}`}
        aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={isMenuOpen}
        aria-controls="hotelDashboardNavigation"
        onClick={() => setIsMenuOpen((open) => !open)}
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

      {isMenuOpen && (
        <button
          type="button"
          className="hotel-menu-backdrop"
          aria-label="Close navigation menu"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside className={`sidebar ${isMenuOpen ? 'open' : ''}`} id="hotelDashboardNavigation">
        <div className="brand">
          <div className="mark">C</div>
          <div className="name">
            CNetVoIP<small style={{ color: '#8A8FB8' }}>HOTEL AI</small>
          </div>
        </div>

        <div className="sidebar-ext">
          <div className="pulse-dot on"></div>
          <div className="info" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span>Tenant<b id="sideTenant">{data.tenantId}</b></span>
            <span style={{ opacity: 0.65 }}>Extension<b id="sideExt">{data.extension}</b></span>
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
            className={activeTab === 'hotel' ? 'active' : ''}
            onClick={() => selectTab('hotel')}
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M3 21h18M6 21V7l6-4 6 4v14M9 9h1M9 13h1M14 9h1M14 13h1M10 21v-4h4v4" />
            </svg>
            Hotel Details
          </button>
          <button
            type="button"
            className={activeTab === 'kb' ? 'active' : ''}
            onClick={() => selectTab('kb')}
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 20a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2 8 8 0 0 0-8 8 8 8 0 0 0 8 8Z" />
              <path d="M12 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2 8 8 0 0 1 8 8 8 8 0 0 1-8 8Z" />
            </svg>
            Knowledge Base
          </button>
          <button
            type="button"
            className={activeTab === 'logs' ? 'active' : ''}
            onClick={() => selectTab('logs')}
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M4 5h16M4 12h16M4 19h10" />
            </svg>
            Call Logs
          </button>
          <button
            type="button"
            className={activeTab === 'settings' ? 'active' : ''}
            onClick={() => selectTab('settings')}
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
            </svg>
            AI Settings
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
            <h1 id="topHotelName">{data.hotel.name}</h1>
            <div className="sub">
              AI receptionist · tenant <span>{data.tenantId}</span> · extension <span>{data.extension}</span>
            </div>
          </div>
          <div className="topbar-right">
            <div className="live-pill">
              <div className="pulse-dot on"></div>ON CALL LINE
            </div>
          </div>
        </header>

        <div className="content">
          {/* TAB 1: OVERVIEW */}
          <div className={`tab-panel ${activeTab === 'overview' ? 'active' : ''}`}>
            <div className="stat-grid">
              <div className="stat-card">
                <div className="lbl">Calls Today</div>
                <div className="val">{totalCalls}</div>
                <div className="delta">▲ live</div>
              </div>
              <div className="stat-card">
                <div className="lbl">Transferred to Desk</div>
                <div className="val">{transfers}</div>
                <div className="delta">{transfersPct}% of calls</div>
              </div>
              <div className="stat-card">
                <div className="lbl">Guest Lookups</div>
                <div className="val">{lookups}</div>
                <div className="delta">{lookupsPct}% of calls</div>
              </div>
              <div className="stat-card">
                <div className="lbl">Tickets Created</div>
                <div className="val">{tickets}</div>
                <div className="delta">Maintenance notified</div>
              </div>
            </div>

            <div className="panel-grid">
              <div className="card">
                <h2>Recent activity</h2>
                <div className="desc">Latest calls answered by the AI extension.</div>
                <div id="recentList">
                  {data.logs.slice(0, 5).map((log, i) => (
                    <div key={i} className="mini-row">
                      <div>
                        <div className="who">{log.caller}</div>
                        <div className="meta">
                          {log.time} · {log.duration}
                        </div>
                      </div>
                      <span className={`tag ${log.intent}`}>{log.intent}</span>
                    </div>
                  ))}
                  {data.logs.length === 0 && <div className="empty">No calls answered yet.</div>}
                </div>
              </div>

              <div>
                <div className="card" style={{ marginBottom: '16px' }}>
                  <h2>Greeting preview</h2>
                  <div className="desc">What callers hear on extension {data.extension}.</div>
                  <div className="greeting-preview">
                    <div className="waveform live" style={{ marginBottom: '10px' }}>
                      <span></span><span></span><span></span><span></span><span></span><span></span><span></span>
                    </div>
                    <div className="hotel-name">{data.hotel.name}</div>
                    <div className="msg">{data.hotel.greeting}</div>
                  </div>
                </div>

                <div className="card">
                  <h2>Simulate a call</h2>
                  <div className="desc">Generate a live test call to see it flow through the system.</div>
                  <button
                    type="button"
                    className="btn-solid"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={handleSimulateCall}
                  >
                    Simulate incoming call
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* TAB 2: HOTEL DETAILS */}
          <div className={`tab-panel ${activeTab === 'hotel' ? 'active' : ''}`}>
            <div className="card">
              <h2>Hotel details</h2>
              <div className="desc">
                This information drives the AI's greeting and routing for extension {data.extension}.
              </div>

              <form onSubmit={handleSaveHotel} className="grid2">
                <div className="field-block">
                  <label>Tenant ID</label>
                  <input
                    type="text"
                    value={data.tenantId}
                    readOnly
                    style={{ color: 'var(--mute)', background: '#F1F2F8' }}
                  />
                </div>

                <div className="field-block">
                  <label>Hotel name</label>
                  <input
                    type="text"
                    value={hotelForm.name}
                    onChange={(e) => setHotelForm({ ...hotelForm, name: e.target.value })}
                  />
                </div>

                <div className="field-block">
                  <label>Hotel DID number</label>
                  <input
                    type="text"
                    value={hotelForm.did}
                    onChange={(e) => setHotelForm({ ...hotelForm, did: e.target.value })}
                  />
                </div>

                <div className="field-block">
                  <label>Front desk extension</label>
                  <input
                    type="text"
                    value={hotelForm.frontExt}
                    onChange={(e) => setHotelForm({ ...hotelForm, frontExt: e.target.value })}
                  />
                </div>

                <div className="field-block">
                  <label>Time zone</label>
                  <select
                    value={hotelForm.tz}
                    onChange={(e) => setHotelForm({ ...hotelForm, tz: e.target.value })}
                  >
                    <option>America/New_York</option>
                    <option>Asia/Kolkata</option>
                    <option>Europe/London</option>
                    <option>Asia/Dubai</option>
                  </select>
                </div>

                <div className="field-block full">
                  <label>Hotel address</label>
                  <textarea
                    value={hotelForm.address}
                    onChange={(e) => setHotelForm({ ...hotelForm, address: e.target.value })}
                  />
                </div>

                <div className="field-block full">
                  <label>AI greeting message</label>
                  <textarea
                    value={hotelForm.greeting}
                    onChange={(e) => setHotelForm({ ...hotelForm, greeting: e.target.value })}
                  />
                </div>

                <div className="field-block">
                  <label>AI voice language</label>
                  <select
                    value={hotelForm.lang}
                    onChange={(e) => setHotelForm({ ...hotelForm, lang: e.target.value })}
                  >
                    <option>English</option>
                    <option>Hindi</option>
                    <option>Gujarati</option>
                  </select>
                </div>

                <div className="field-block">
                  <label>Fallback transfer extension</label>
                  <input
                    type="text"
                    value={hotelForm.fallback}
                    onChange={(e) => setHotelForm({ ...hotelForm, fallback: e.target.value })}
                  />
                </div>

                <div className="field-block full">
                  <h3 style={{ margin: '14px 0 2px', fontSize: '15px' }}>Department Extensions</h3>
                  <div className="desc" style={{ marginBottom: '10px' }}>
                    Configure direct extensions for each hotel department. When a caller requests the <strong>Front Desk</strong>, the AI tries Front Desk first and automatically fails over to the <strong>Ring Group</strong> if Front Desk is unavailable or busy.
                  </div>
                </div>

                {DEPARTMENT_LIST.map(([key, label]) => (
                  <div className="field-block" key={key}>
                    <label htmlFor={`h-dept-${key}`}>{label} Extension</label>
                    <input
                      id={`h-dept-${key}`}
                      type="text"
                      inputMode="numeric"
                      value={hotelForm.departmentExtensions?.[key] || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setHotelForm({
                          ...hotelForm,
                          ...(key === 'frontDesk' ? { frontExt: val } : {}),
                          departmentExtensions: {
                            ...hotelForm.departmentExtensions,
                            [key]: val,
                          },
                        });
                      }}
                      placeholder="e.g. 501"
                    />
                  </div>
                ))}

                <div className="field-block full" style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '10px' }}>
                  <button type="submit" className="btn-solid">
                    Save hotel details
                  </button>
                  <span
                    style={{
                      fontSize: '12.5px',
                      color: 'var(--signal)',
                      fontWeight: 600,
                      opacity: hotelSaved ? 1 : 0,
                      transition: '0.3s',
                    }}
                  >
                    Saved
                  </span>
                </div>
              </form>
            </div>
          </div>

          {/* TAB 3: KNOWLEDGE BASE */}
          <div className={`tab-panel ${activeTab === 'kb' ? 'active' : ''}`}>
            <div className="card">
              <div className="kb-heading">
                <div>
                  <h2>AI question &amp; answer knowledge base</h2>
                  <div className="desc">
                    The AI searches this list and speaks the matching answer to callers.
                  </div>
                </div>
                <button type="button" className="btn-outline kb-json-button" onClick={() => setIsJsonModalOpen(true)}>
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m8 9-3 3 3 3M16 9l3 3-3 3M14 5l-4 14" />
                  </svg>
                  View AI JSON
                </button>
              </div>

              <div className="kb-add">
                <div className="field-block">
                  <label>Question</label>
                  <input
                    type="text"
                    placeholder="e.g. What time is check-out?"
                    value={newQ}
                    onChange={(e) => setNewQ(e.target.value)}
                  />
                </div>
                <div className="field-block">
                  <label>Answer</label>
                  <input
                    type="text"
                    placeholder="e.g. Check-out is at 11:00 AM."
                    value={newA}
                    onChange={(e) => setNewA(e.target.value)}
                  />
                </div>
                <button type="button" className="btn-solid" onClick={handleAddQA}>
                  Add
                </button>
              </div>

              <div className="field-block kb-search">
                <input
                  type="text"
                  placeholder="Search questions…"
                  value={kbSearch}
                  onChange={(e) => setKbSearch(e.target.value)}
                />
              </div>

              <div className="kb-list">
                {filteredKb.map((item, idx) => (
                  <div key={idx} className="kb-item">
                    <div>
                      <div className="q">{item.q}</div>
                      <div className="a">{item.a}</div>
                    </div>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => handleDeleteQA(idx)}
                      title="Delete question"
                    >
                      <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                ))}
                {filteredKb.length === 0 && <div className="empty">No questions found matching your search.</div>}
              </div>
            </div>
          </div>

          {/* TAB 4: CALL LOGS */}
          <div className={`tab-panel ${activeTab === 'logs' ? 'active' : ''}`}>
            <div className="card">
              <h2>Call logs</h2>
              <div className="desc">Every call the AI extension has answered.</div>

              <div className="logs-toolbar">
                <div className="logs-filters">
                  <input
                    type="text"
                    placeholder="Search caller…"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                  />
                  <select value={logFilter} onChange={(e) => setLogFilter(e.target.value)}>
                    <option value="all">All statuses</option>
                    <option value="completed">Completed</option>
                    <option value="escalated">Escalated</option>
                    <option value="missed">Missed</option>
                  </select>
                </div>
                <button type="button" className="btn-outline" onClick={handleSimulateCall}>
                  + Simulate call
                </button>
              </div>

              <table className="logs">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Caller</th>
                    <th>Intent</th>
                    <th>Duration</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log, idx) => (
                    <tr key={idx}>
                      <td>{log.time}</td>
                      <td className="caller">{log.caller}</td>
                      <td>
                        <span className={`tag ${log.intent}`}>{log.intent}</span>
                      </td>
                      <td>{log.duration}</td>
                      <td>
                        <span className={`status-chip ${log.status}`}>{log.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredLogs.length === 0 && <div className="empty">No calls match your filters yet.</div>}
            </div>
          </div>

          {/* TAB 5: AI SETTINGS */}
          <div className={`tab-panel ${activeTab === 'settings' ? 'active' : ''}`}>
            <div className="card">
              <h2>AI settings</h2>
              <div className="desc">Control how the AI extension behaves on live calls.</div>

              <form onSubmit={handleSaveSettings}>
                <div className="toggle-row">
                  <div>
                    <div className="t-lbl">AI greeting enabled</div>
                    <div className="t-desc">Answer new calls with the greeting before routing.</div>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={settingsForm.greeting}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, greeting: e.target.checked })
                      }
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="toggle-row">
                  <div>
                    <div className="t-lbl">Auto-transfer on no match</div>
                    <div className="t-desc">
                      Send the caller to the front desk if intent isn't understood.
                    </div>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={settingsForm.autoTransfer}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, autoTransfer: e.target.checked })
                      }
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="toggle-row">
                  <div>
                    <div className="t-lbl">SMS alerts for tickets</div>
                    <div className="t-desc">
                      Text maintenance the moment a complaint ticket is created.
                    </div>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={settingsForm.sms}
                      onChange={(e) => setSettingsForm({ ...settingsForm, sms: e.target.checked })}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="toggle-row">
                  <div>
                    <div className="t-lbl">Email daily call summary</div>
                    <div className="t-desc">
                      Send front desk a digest of the day's AI-handled calls.
                    </div>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={settingsForm.email}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, email: e.target.checked })
                      }
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="grid2" style={{ marginTop: '20px' }}>
                  <div className="field-block">
                    <label>Text-to-speech voice</label>
                    <select
                      value={settingsForm.voice}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, voice: e.target.value })
                      }
                    >
                      <option>Warm Female — Aria</option>
                      <option>Neutral Male — Theo</option>
                      <option>Crisp Female — Nova</option>
                    </select>
                  </div>
                  <div className="field-block">
                    <label>Max clarifying attempts before escalation</label>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      value={settingsForm.retries}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          retries: parseInt(e.target.value, 10) || 1,
                        })
                      }
                    />
                  </div>
                </div>

                <div
                  style={{
                    marginTop: '18px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                  }}
                >
                  <button type="submit" className="btn-solid">
                    Save settings
                  </button>
                  <span
                    style={{
                      fontSize: '12.5px',
                      color: 'var(--signal)',
                      fontWeight: 600,
                      opacity: settingsSaved ? 1 : 0,
                      transition: '0.3s',
                    }}
                  >
                    Saved
                  </span>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* GRAPHICAL & JSON AI KNOWLEDGE MODAL */}
      <AiKnowledgeModal
        isOpen={isJsonModalOpen}
        onClose={() => setIsJsonModalOpen(false)}
        data={data}
        hotelForm={hotelForm}
      />
    </div>
  );
}