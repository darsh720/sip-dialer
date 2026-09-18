import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import '../style/tenantdetails.css';
import { DEPARTMENT_LIST, defaultHotelProfile, normalizeHotelProfile } from '../lib/hotelProfile';

const ADMIN_STORAGE_KEY = 'cnv_admin_platform_state_v2';

const createDefaultHotelForm = (tenantId, hotelQuery) =>
  normalizeHotelProfile({
    id: tenantId,
    hotel: hotelQuery,
    propertyNo: 'PR-1001',
    ownerName: 'John Doe',
    address: '123 Main Street, New York, NY',
    propertyName: hotelQuery,
    propertyAddress: '123 Main Street, New York, NY',
    propertyPhoneNumber: '+1 (212) 555-0147',
    propertyFaxNumber: '+1 (212) 555-0148',
    propertyCheckInTime: '2:00 PM',
    propertyCheckOutTime: '11:00 AM',
    lateCheckoutPolicy: 'Subject to availability after 11:00 AM for a fee.',
    cancellationPolicy: 'Free cancellation up to 48 hours before arrival.',
    roomTypes: ['Standard Room', 'Deluxe Suite'],
    smokingRoom: 'No',
    petPolicy: 'No',
    parkingPolicy: 'Yes',
    parkingFee: '15',
    nearbyLocation: 'Downtown shopping district, 5 minutes walk to train station',
    breakfast: 'Yes',
    lunch: 'Yes',
    dinner: 'Yes',
    breakfastTime: '7:00 AM - 10:30 AM',
    lunchTime: '12:30 PM - 2:30 PM',
    dinnerTime: '6:30 PM - 9:30 PM',
    bookingAmount: 'Yes',
    bookingAmountValue: '120',
    roomType: 'AC',
    hotelAmenities: ['WiFi', 'Fitness Center', 'Pool'],
    fitness: 'Yes',
    fitnessHours: '6:00 AM - 10:00 PM',
    pool: 'Yes',
    poolHours: '7:00 AM - 9:00 PM',
    guestWifiPassword: 'hotel@2026',
    housekeepingHours: '9:00 AM - 6:00 PM',
  });

export default function TenantDetails() {
  const [searchParams] = useSearchParams();
  const tenantId = searchParams.get('tenant') || '1000';
  const hotelQuery = searchParams.get('hotel') || 'ABC Hotel';

  const [activeTab, setActiveTab] = useState('registration');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const selectTab = (tab) => {
    setActiveTab(tab);
    setIsMenuOpen(false);
  };

  // Extension Registration Form State
  const [extForm, setExtForm] = useState({
    number: '501',
    password: 'sip@password123',
    protocol: 'UDP',
    serverUrl: 'core.cnetvoip.cloud',
  });
  const [showExtPassword, setShowExtPassword] = useState(false);
  const [extSaved, setExtSaved] = useState(false);
  const [extSaving, setExtSaving] = useState(false);
  const [extError, setExtError] = useState('');

  // Hotel Details Form State
  const [hotelForm, setHotelForm] = useState(() => createDefaultHotelForm(tenantId, hotelQuery));
  const [hotelSaved, setHotelSaved] = useState(false);

  // Load tenant information from storage and sync active profile to backend
  useEffect(() => {
    const syncProfileToBackend = (profileToSync) => {
      fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, hotel_profile: profileToSync }),
      }).catch((err) => console.error('Could not sync hotel profile to backend', err));
    };

    const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.tenants)) {
          const match = parsed.tenants.find((t) => String(t.id) === String(tenantId));
          if (match) {
            const normalized = normalizeHotelProfile({
              ...defaultHotelProfile,
              ...match,
              ...match.hotelProfile,
              id: match.id,
              hotel: match.hotel || hotelQuery,
              propertyNo: match.propertyNo || 'PR-1001',
              ownerName: match.ownerName || 'John Doe',
              address: match.address || match.propertyAddress || '123 Main Street, New York, NY',
              propertyName: match.propertyName || match.hotel || hotelQuery,
              propertyAddress: match.propertyAddress || match.address || '123 Main Street, New York, NY',
            });
            setHotelForm(normalized);
            syncProfileToBackend(normalized);
            return;
          }
        }
      } catch (err) {
        console.error(err);
      }
    }

    // Check if backend already has an active profile
    fetch('/api/profile')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data && data.hotel_profile && Object.keys(data.hotel_profile).length > 0) {
          setHotelForm((prev) => normalizeHotelProfile({ ...prev, ...data.hotel_profile }));
        } else {
          // Sync default profile to backend so extensions/routing work out of the box
          syncProfileToBackend(hotelForm);
        }
      })
      .catch(() => {
        syncProfileToBackend(hotelForm);
      });
  }, [tenantId, hotelQuery]);

  const handleSaveExtension = async (e) => {
    e.preventDefault();
    if (!extForm.number.trim() || !extForm.password.trim() || !extForm.serverUrl.trim()) {
      return;
    }

    setExtSaving(true);
    setExtError('');
    setExtSaved(false);

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extension: extForm.number.trim(),
          password: extForm.password,
          server: extForm.serverUrl.trim(),
          port: 5060,
          tenant_id: tenantId,
          hotel_profile: hotelForm,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'The AI extension could not be registered.');
      }

      setExtSaved(true);
      setTimeout(() => setExtSaved(false), 3000);
    } catch (err) {
      setExtError(err.message || 'The AI extension could not be registered.');
    } finally {
      setExtSaving(false);
    }
  };

  const handleSaveHotel = (e) => {
    e.preventDefault();

    const normalized = normalizeHotelProfile({
      ...hotelForm,
      id: tenantId,
      hotel: hotelForm.hotel || hotelForm.propertyName || hotelQuery,
      propertyName: hotelForm.propertyName || hotelForm.hotel || hotelQuery,
      propertyAddress: hotelForm.propertyAddress || hotelForm.address || '',
      address: hotelForm.address || hotelForm.propertyAddress || '',
      roomTypes: Array.isArray(hotelForm.roomTypes) ? hotelForm.roomTypes : String(hotelForm.roomTypes || '').split(',').map((item) => item.trim()).filter(Boolean),
      hotelAmenities: Array.isArray(hotelForm.hotelAmenities) ? hotelForm.hotelAmenities : String(hotelForm.hotelAmenities || '').split(',').map((item) => item.trim()).filter(Boolean),
    });

    const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.tenants)) {
          parsed.tenants = parsed.tenants.map((t) =>
            String(t.id) === String(tenantId)
              ? {
                  ...t,
                  id: tenantId,
                  hotel: normalized.hotel,
                  propertyNo: normalized.propertyNo,
                  ownerName: normalized.ownerName,
                  address: normalized.propertyAddress || normalized.address,
                  propertyName: normalized.propertyName,
                  propertyAddress: normalized.propertyAddress,
                  propertyPhoneNumber: normalized.propertyPhoneNumber,
                  propertyFaxNumber: normalized.propertyFaxNumber,
                  propertyCheckInTime: normalized.propertyCheckInTime,
                  propertyCheckOutTime: normalized.propertyCheckOutTime,
                  lateCheckoutPolicy: normalized.lateCheckoutPolicy,
                  cancellationPolicy: normalized.cancellationPolicy,
                  roomTypes: normalized.roomTypes,
                  smokingRoom: normalized.smokingRoom,
                  petPolicy: normalized.petPolicy,
                  parkingPolicy: normalized.parkingPolicy,
                  parkingFee: normalized.parkingFee,
                  nearbyLocation: normalized.nearbyLocation,
                  breakfast: normalized.breakfast,
                  lunch: normalized.lunch,
                  dinner: normalized.dinner,
                  breakfastTime: normalized.breakfastTime,
                  lunchTime: normalized.lunchTime,
                  dinnerTime: normalized.dinnerTime,
                  bookingAmount: normalized.bookingAmount,
                  bookingAmountValue: normalized.bookingAmountValue,
                  roomType: normalized.roomType,
                  hotelAmenities: normalized.hotelAmenities,
                  fitness: normalized.fitness,
                  fitnessHours: normalized.fitnessHours,
                  pool: normalized.pool,
                  poolHours: normalized.poolHours,
                  guestWifiPassword: normalized.guestWifiPassword,
                  housekeepingHours: normalized.housekeepingHours,
                  departmentExtensions: normalized.departmentExtensions,
                  hotelProfile: normalized,
                }
              : t
          );
          localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(parsed));
        }
      } catch (err) {
        console.error(err);
      }
    }

    setHotelForm(normalized);
    fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: tenantId, hotel_profile: normalized }),
    }).catch((err) => console.error('Could not update active AI profile', err));
    setHotelSaved(true);
    setTimeout(() => setHotelSaved(false), 2000);
  };

  return (
    <div id="dashboardView" className="tenant-details-dashboard">
      <button
        type="button"
        className={`tenant-mobile-menu-toggle ${isMenuOpen ? 'open' : ''}`}
        aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={isMenuOpen}
        aria-controls="tenantDetailsNavigation"
        onClick={() => setIsMenuOpen((open) => !open)}
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

      {isMenuOpen && (
        <button
          type="button"
          className="tenant-menu-backdrop"
          aria-label="Close navigation menu"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside className={`sidebar ${isMenuOpen ? 'open' : ''}`} id="tenantDetailsNavigation">
        <div className="brand">
          <div className="mark">C</div>
          <div className="name">
            CNetVoIP<small style={{ color: '#8A8FB8' }}>TENANT VIEW</small>
          </div>
        </div>

        <div className="sidebar-ext">
          <div className="pulse-dot on"></div>
          <div className="info" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span>Tenant<b>{hotelForm.id}</b></span>
            <span style={{ opacity: 0.65 }}>Property<b>{hotelForm.propertyNo || 'N/A'}</b></span>
          </div>
        </div>

        <nav className="nav" id="navList">
          <button
            type="button"
            className={activeTab === 'registration' ? 'active' : ''}
            onClick={() => selectTab('registration')}
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 2a5 5 0 0 1 5 5v3H7V7a5 5 0 0 1 5-5z" />
              <rect x="5" y="10" width="14" height="12" rx="2" />
              <circle cx="12" cy="16" r="1" />
            </svg>
            Ext Registration
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

          <div className="divider"></div>

          <button type="button" onClick={() => { setIsMenuOpen(false); window.close(); }}>
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
            Close View
          </button>
        </nav>
      </aside>

      {/* MAIN CONTAINER */}
      <div className="main">
        <header className="topbar">
          <div>
            <h1>{hotelForm.hotel}</h1>
            <div className="sub">
              Tenant ID <span>{hotelForm.id}</span> · Property <span>{hotelForm.propertyNo || 'N/A'}</span> · Owner <span>{hotelForm.ownerName || 'N/A'}</span>
            </div>
          </div>
          <div className="topbar-right">
            <div className="live-pill">
              <div className="pulse-dot on"></div>OPERATOR MANAGE VIEW
            </div>
          </div>
        </header>

        <div className="content">
          {/* TAB 1: EXTENSION REGISTRATION */}
          <div className={`tab-panel ${activeTab === 'registration' ? 'active' : ''}`}>
            <div className="card">
              <h2>Create &amp; Register AI Extension</h2>
              <div className="desc">
                Enter SIP credentials and server details to create and provision a live AI receptionist extension.
              </div>

              <form onSubmit={handleSaveExtension} className="grid2">
                <div className="field-block">
                  <label htmlFor="regExtNumber">Extension Number</label>
                  <input
                    type="text"
                    id="regExtNumber"
                    value={extForm.number}
                    onChange={(e) => setExtForm({ ...extForm, number: e.target.value })}
                    placeholder="e.g. 501"
                    required
                  />
                </div>

                <div className="field-block">
                  <label htmlFor="regExtPassword">Extension Password</label>
                  <div className="password-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type={showExtPassword ? 'text' : 'password'}
                      id="regExtPassword"
                      value={extForm.password}
                      onChange={(e) => setExtForm({ ...extForm, password: e.target.value })}
                      placeholder="Enter SIP password"
                      style={{ paddingRight: '42px' }}
                      required
                    />
                    <button
                      type="button"
                      className="toggle-password"
                      onClick={() => setShowExtPassword((prev) => !prev)}
                      aria-label="Toggle password visibility"
                      style={{
                        position: 'absolute',
                        right: '12px',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--mute)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '4px',
                        borderRadius: '6px',
                      }}
                    >
                      {showExtPassword ? (
                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div className="field-block">
                  <label htmlFor="regExtProtocol">Extension Protocol</label>
                  <select
                    id="regExtProtocol"
                    value={extForm.protocol}
                    onChange={(e) => setExtForm({ ...extForm, protocol: e.target.value })}
                  >
                    <option value="UDP">UDP</option>
                  </select>
                </div>

                <div className="field-block">
                  <label htmlFor="regServerUrl">Server URL</label>
                  <input
                    type="text"
                    id="regServerUrl"
                    value={extForm.serverUrl}
                    onChange={(e) => setExtForm({ ...extForm, serverUrl: e.target.value })}
                    placeholder="e.g. core.cnetvoip.cloud"
                    required
                  />
                </div>

                <div className="field-block full" style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '10px' }}>
                  <button type="submit" className="btn-solid" disabled={extSaving}>
                    {extSaving ? 'Registering...' : 'Save & Register AI Extension'}
                  </button>
                  <span
                    style={{
                      fontSize: '12.5px',
                      color: 'var(--signal)',
                      fontWeight: 600,
                      opacity: extSaved ? 1 : 0,
                      transition: '0.3s',
                    }}
                  >
                    Registered Successfully
                  </span>
                  {extError && (
                    <span style={{ fontSize: '12.5px', color: '#d95c5c', fontWeight: 600 }}>
                      {extError}
                    </span>
                  )}
                </div>
              </form>
            </div>
          </div>

          {/* TAB 2: HOTEL DETAILS */}
          <div className={`tab-panel ${activeTab === 'hotel' ? 'active' : ''}`}>
            <div className="card">
              <h2>Property &amp; Hotel Details</h2>
              <div className="desc">View and manage information provisioned for this tenant.</div>

              <form onSubmit={handleSaveHotel} className="grid2">
                <div className="field-block">
                  <label htmlFor="vTenant">Tenant ID</label>
                  <input
                    type="text"
                    id="vTenant"
                    value={hotelForm.id}
                    readOnly
                    style={{ color: 'var(--mute)', background: '#F1F2F8' }}
                  />
                </div>
                <div className="field-block">
                  <label htmlFor="vProperty">Property No</label>
                  <input
                    type="text"
                    id="vProperty"
                    value={hotelForm.propertyNo}
                    onChange={(e) => setHotelForm({ ...hotelForm, propertyNo: e.target.value })}
                    required
                  />
                </div>
                <div className="field-block">
                  <label htmlFor="vHotel">Hotel Name</label>
                  <input
                    type="text"
                    id="vHotel"
                    value={hotelForm.hotel}
                    onChange={(e) => setHotelForm({ ...hotelForm, hotel: e.target.value, propertyName: e.target.value })}
                    required
                  />
                </div>
                <div className="field-block">
                  <label htmlFor="vOwner">Owner Name</label>
                  <input
                    type="text"
                    id="vOwner"
                    value={hotelForm.ownerName}
                    onChange={(e) => setHotelForm({ ...hotelForm, ownerName: e.target.value })}
                    required
                  />
                </div>
                <div className="field-block full">
                  <label htmlFor="pName">Property Name</label>
                  <input
                    id="pName"
                    type="text"
                    value={hotelForm.propertyName}
                    onChange={(e) => setHotelForm({ ...hotelForm, propertyName: e.target.value, hotel: e.target.value })}
                  />
                </div>
                <div className="field-block full">
                  <label htmlFor="vAddress">Property Address</label>
                  <textarea
                    id="vAddress"
                    value={hotelForm.propertyAddress || hotelForm.address}
                    onChange={(e) => setHotelForm({ ...hotelForm, propertyAddress: e.target.value, address: e.target.value })}
                    required
                  />
                </div>
                <div className="field-block">
                  <label htmlFor="pPhone">Property Phone Number</label>
                  <input
                    id="pPhone"
                    type="text"
                    value={hotelForm.propertyPhoneNumber}
                    onChange={(e) => setHotelForm({ ...hotelForm, propertyPhoneNumber: e.target.value })}
                  />
                </div>
                <div className="field-block">
                  <label htmlFor="pFax">Property Fax Number</label>
                  <input
                    id="pFax"
                    type="text"
                    value={hotelForm.propertyFaxNumber}
                    onChange={(e) => setHotelForm({ ...hotelForm, propertyFaxNumber: e.target.value })}
                  />
                </div>
                <div className="field-block">
                  <label htmlFor="checkIn">Property Check-In Time</label>
                  <input
                    id="checkIn"
                    type="text"
                    value={hotelForm.propertyCheckInTime}
                    onChange={(e) => setHotelForm({ ...hotelForm, propertyCheckInTime: e.target.value })}
                  />
                </div>
                <div className="field-block">
                  <label htmlFor="checkOut">Property Check-out Time</label>
                  <input
                    id="checkOut"
                    type="text"
                    value={hotelForm.propertyCheckOutTime}
                    onChange={(e) => setHotelForm({ ...hotelForm, propertyCheckOutTime: e.target.value })}
                  />
                </div>
                <div className="field-block full">
                  <label htmlFor="lateCheckout">Late Checkout Policy</label>
                  <textarea
                    id="lateCheckout"
                    value={hotelForm.lateCheckoutPolicy}
                    onChange={(e) => setHotelForm({ ...hotelForm, lateCheckoutPolicy: e.target.value })}
                  />
                </div>
                <div className="field-block full">
                  <label htmlFor="cancellation">Cancellation Policy</label>
                  <textarea
                    id="cancellation"
                    value={hotelForm.cancellationPolicy}
                    onChange={(e) => setHotelForm({ ...hotelForm, cancellationPolicy: e.target.value })}
                  />
                </div>
                <div className="field-block full">
                  <label htmlFor="roomTypes">Which types of room (comma separated)</label>
                  <input
                    id="roomTypes"
                    type="text"
                    value={hotelForm.roomTypes.join(', ')}
                    onChange={(e) => setHotelForm({ ...hotelForm, roomTypes: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) })}
                  />
                </div>
                <div className="field-block">
                  <label htmlFor="smokingRoom">Smoking room</label>
                  <select
                    id="smokingRoom"
                    value={hotelForm.smokingRoom}
                    onChange={(e) => setHotelForm({ ...hotelForm, smokingRoom: e.target.value })}
                  >
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>
                <div className="field-block">
                  <label htmlFor="petPolicy">Pet Policy</label>
                  <select
                    id="petPolicy"
                    value={hotelForm.petPolicy}
                    onChange={(e) => setHotelForm({ ...hotelForm, petPolicy: e.target.value })}
                  >
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>
                <div className="field-block">
                  <label htmlFor="parkingPolicy">Parking Policy</label>
                  <select
                    id="parkingPolicy"
                    value={hotelForm.parkingPolicy}
                    onChange={(e) => setHotelForm({ ...hotelForm, parkingPolicy: e.target.value })}
                  >
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>
                <div className="field-block">
                  <label htmlFor="parkingFee">Parking Amount</label>
                  <input
                    id="parkingFee"
                    type="text"
                    value={hotelForm.parkingFee}
                    onChange={(e) => setHotelForm({ ...hotelForm, parkingFee: e.target.value })}
                    placeholder={hotelForm.parkingPolicy === 'Yes' ? 'e.g. $15' : 'Not applicable'}
                    disabled={hotelForm.parkingPolicy !== 'Yes'}
                  />
                </div>
                <div className="field-block full">
                  <label htmlFor="nearbyLocation">Nearby Location</label>
                  <textarea
                    id="nearbyLocation"
                    value={hotelForm.nearbyLocation}
                    onChange={(e) => setHotelForm({ ...hotelForm, nearbyLocation: e.target.value })}
                  />
                </div>
                <div className="field-block">
                  <label htmlFor="breakfast">Breakfast</label>
                  <select
                    id="breakfast"
                    value={hotelForm.breakfast}
                    onChange={(e) => setHotelForm({ ...hotelForm, breakfast: e.target.value })}
                  >
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>
                <div className="field-block">
                  <label htmlFor="lunch">Lunch</label>
                  <select
                    id="lunch"
                    value={hotelForm.lunch}
                    onChange={(e) => setHotelForm({ ...hotelForm, lunch: e.target.value })}
                  >
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>
                <div className="field-block">
                  <label htmlFor="dinner">Dinner</label>
                  <select
                    id="dinner"
                    value={hotelForm.dinner}
                    onChange={(e) => setHotelForm({ ...hotelForm, dinner: e.target.value })}
                  >
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>
                <div className="field-block">
                  <label htmlFor="breakfastTime">Breakfast Time</label>
                  <input
                    id="breakfastTime"
                    type="text"
                    value={hotelForm.breakfastTime}
                    onChange={(e) => setHotelForm({ ...hotelForm, breakfastTime: e.target.value })}
                  />
                </div>
                <div className="field-block">
                  <label htmlFor="lunchTime">Lunch Time</label>
                  <input
                    id="lunchTime"
                    type="text"
                    value={hotelForm.lunchTime}
                    onChange={(e) => setHotelForm({ ...hotelForm, lunchTime: e.target.value })}
                  />
                </div>
                <div className="field-block">
                  <label htmlFor="dinnerTime">Dinner Time</label>
                  <input
                    id="dinnerTime"
                    type="text"
                    value={hotelForm.dinnerTime}
                    onChange={(e) => setHotelForm({ ...hotelForm, dinnerTime: e.target.value })}
                  />
                </div>
                <div className="field-block">
                  <label htmlFor="bookingAmount">Booking Amount</label>
                  <select
                    id="bookingAmount"
                    value={hotelForm.bookingAmount}
                    onChange={(e) => setHotelForm({ ...hotelForm, bookingAmount: e.target.value })}
                  >
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>
                <div className="field-block">
                  <label htmlFor="bookingAmountValue">Booking Amount Value</label>
                  <input
                    id="bookingAmountValue"
                    type="text"
                    value={hotelForm.bookingAmountValue}
                    onChange={(e) => setHotelForm({ ...hotelForm, bookingAmountValue: e.target.value })}
                    placeholder={hotelForm.bookingAmount === 'Yes' ? 'e.g. $120' : 'Not applicable'}
                    disabled={hotelForm.bookingAmount !== 'Yes'}
                  />
                </div>
                <div className="field-block">
                  <label htmlFor="roomType">Room Type</label>
                  <select
                    id="roomType"
                    value={hotelForm.roomType}
                    onChange={(e) => setHotelForm({ ...hotelForm, roomType: e.target.value })}
                  >
                    <option value="AC">AC Room</option>
                    <option value="Non-AC">Non AC Room</option>
                    <option value="Both">AC &amp; Non AC</option>
                  </select>
                </div>
                <div className="field-block full">
                  <label htmlFor="hotelAmenities">Hotel Amenities (comma separated)</label>
                  <input
                    id="hotelAmenities"
                    type="text"
                    value={hotelForm.hotelAmenities.join(', ')}
                    onChange={(e) => setHotelForm({ ...hotelForm, hotelAmenities: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) })}
                  />
                </div>
                <div className="field-block">
                  <label htmlFor="fitness">Fitness</label>
                  <select
                    id="fitness"
                    value={hotelForm.fitness}
                    onChange={(e) => setHotelForm({ ...hotelForm, fitness: e.target.value })}
                  >
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>
                <div className="field-block">
                  <label htmlFor="fitnessHours">Fitness Hours</label>
                  <input
                    id="fitnessHours"
                    type="text"
                    value={hotelForm.fitnessHours}
                    onChange={(e) => setHotelForm({ ...hotelForm, fitnessHours: e.target.value })}
                    placeholder={hotelForm.fitness === 'Yes' ? 'e.g. 6:00 AM - 10:00 PM' : 'Not applicable'}
                    disabled={hotelForm.fitness !== 'Yes'}
                  />
                </div>
                <div className="field-block">
                  <label htmlFor="pool">Pool</label>
                  <select
                    id="pool"
                    value={hotelForm.pool}
                    onChange={(e) => setHotelForm({ ...hotelForm, pool: e.target.value })}
                  >
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>
                <div className="field-block">
                  <label htmlFor="poolHours">Pool Hours</label>
                  <input
                    id="poolHours"
                    type="text"
                    value={hotelForm.poolHours}
                    onChange={(e) => setHotelForm({ ...hotelForm, poolHours: e.target.value })}
                    placeholder={hotelForm.pool === 'Yes' ? 'e.g. 7:00 AM - 9:00 PM' : 'Not applicable'}
                    disabled={hotelForm.pool !== 'Yes'}
                  />
                </div>
                <div className="field-block">
                  <label htmlFor="wifiPassword">Guest WiFi Password</label>
                  <input
                    id="wifiPassword"
                    type="text"
                    value={hotelForm.guestWifiPassword}
                    onChange={(e) => setHotelForm({ ...hotelForm, guestWifiPassword: e.target.value })}
                  />
                </div>
                <div className="field-block">
                  <label htmlFor="housekeepingHours">Housekeeping Hours</label>
                  <input
                    id="housekeepingHours"
                    type="text"
                    value={hotelForm.housekeepingHours}
                    onChange={(e) => setHotelForm({ ...hotelForm, housekeepingHours: e.target.value })}
                  />
                </div>
                <div className="field-block full">
                  <h3 style={{ margin: '12px 0 0' }}>Department Extensions</h3>
                  <div className="desc">
                    Add extension numbers for hotel departments. If a caller asks to speak with the <strong>Front Desk</strong>, the AI checks Front Desk first and automatically transfers to the <strong>Ring Group</strong> if Front Desk is busy or unavailable.
                  </div>
                </div>
                {DEPARTMENT_LIST.map(([key, label]) => (
                  <div className="field-block" key={key}>
                    <label htmlFor={`department-${key}`}>{label} Extension</label>
                    <input
                      id={`department-${key}`}
                      type="text"
                      inputMode="numeric"
                      value={hotelForm.departmentExtensions?.[key] || ''}
                      onChange={(e) => setHotelForm({
                        ...hotelForm,
                        departmentExtensions: {
                          ...hotelForm.departmentExtensions,
                          [key]: e.target.value,
                        },
                      })}
                      placeholder="e.g. 501"
                    />
                  </div>
                ))}
                <div className="field-block full" style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '10px' }}>
                  <button type="submit" className="btn-solid">
                    Save Hotel Details
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
              <h2>AI Knowledge Base</h2>
              <div className="desc">Questions and automated responses configured for this hotel.</div>
              <div className="kb-list">
                <div className="kb-item">
                  <div>
                    <div className="q">What is check-in time?</div>
                    <div className="a">Check-in starts at 2:00 PM.</div>
                  </div>
                </div>
                <div className="kb-item">
                  <div>
                    <div className="q">Do you provide free Wi-Fi?</div>
                    <div className="a">Yes, free Wi-Fi is available in all rooms and public areas.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* TAB 4: CALL LOGS */}
          <div className={`tab-panel ${activeTab === 'logs' ? 'active' : ''}`}>
            <div className="card">
              <h2>Call Logs</h2>
              <div className="desc">Recent activity on this extension line.</div>
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
                  <tr>
                    <td>09:14 AM</td>
                    <td className="caller">+1 646 555 0912</td>
                    <td><span className="tag transfer">transfer</span></td>
                    <td>0:42</td>
                    <td><span className="status-chip completed">completed</span></td>
                  </tr>
                  <tr>
                    <td>09:47 AM</td>
                    <td className="caller">+1 917 555 0134</td>
                    <td><span className="tag lookup">lookup</span></td>
                    <td>0:28</td>
                    <td><span className="status-chip completed">completed</span></td>
                  </tr>
                  <tr>
                    <td>10:22 AM</td>
                    <td className="caller">+1 332 555 0087</td>
                    <td><span className="tag ticket">ticket</span></td>
                    <td>1:05</td>
                    <td><span className="status-chip escalated">escalated</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}