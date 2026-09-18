import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../style/connect.css';

const STORAGE_KEY = 'cnv_ai_extension_state_v2';

export default function HotelLogin() {
  const navigate = useNavigate();

  const [phone, setPhone] = useState('+1 408 555 1001');
  const [password, setPassword] = useState('password@123');
  const [showPassword, setShowPassword] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isOnline, setIsOnline] = useState(false);

  const [extension] = useState('510');
  const [tenantId] = useState('TEN-0049');

  const [logs, setLogs] = useState([
    'AI extension initialized',
    'Waiting for SIP registration…'
  ]);

  const terminalEndRef = useRef(null);

  const getTimestamp = () => {
    return new Date().toLocaleTimeString([], { hour12: false });
  };

  const addLog = (msg) => {
    setLogs((prev) => [...prev, msg]);
  };

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleConnect = (e) => {
    e.preventDefault();

    if (!phone.trim() || !password.trim()) {
      addLog('Registration rejected — Phone No and SIP Password are required');
      return;
    }

    setIsConnecting(true);
    addLog(`Authenticating phone number ${phone.trim()}…`);
    addLog('SIP REGISTER sent to core.cnetvoip.cloud');

    setTimeout(() => {
      setIsConnecting(false);
      setIsOnline(true);
      addLog('Registration successful');
      addLog(`Extension ${extension} is ONLINE for ${phone.trim()}`);
      addLog('Opening AI dashboard…');

      const raw = localStorage.getItem(STORAGE_KEY);
      let existing = {};
      if (raw) {
        try {
          existing = JSON.parse(raw);
        } catch (err) {
          console.error(err);
        }
      }

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...existing,
          connected: true,
          tenantId,
          extension,
          hotel: {
            ...(existing.hotel || {}),
            did: phone.trim()
          }
        })
      );

      setTimeout(() => {
        navigate('/hotel-dashboard');
      }, 900);
    }, 1000);
  };

  const handleDisconnect = () => {
    setIsOnline(false);
    setIsConnecting(false);
    addLog('Disconnect signal sent');
    addLog(`Extension ${extension} unregistered — now OFFLINE`);

    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        parsed.connected = false;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      } catch (err) {
        console.error(err);
      }
    }
  };

  return (
    <div id="connectView">
      <div className="console">
        {/* LEFT PANEL */}
        <div className="console-left">
          <div>
            <div className="brand">
              <div className="mark">C</div>
              <div className="name">
                CNetVoIP<small>AI EXTENSION CONSOLE</small>
              </div>
            </div>

            <h1>
              Bring extension <span id="headExt">{extension}</span>
              <br />
              online.
            </h1>
            <p>
              This AI extension answers hotel calls before they reach the front desk. Register it to the PBX to start routing.
            </p>

            <div className={`status-pill ${isOnline ? 'on' : 'off'}`} id="statusPill">
              <div className={`pulse-dot ${isOnline ? 'on' : ''}`} id="pulseDot"></div>
              <div className="txt">
                Tenant <b>{tenantId}</b> · Extension <b>{extension}</b> is{' '}
                <b>{isOnline ? 'ONLINE' : 'OFFLINE'}</b>
              </div>
            </div>
          </div>

          <div>
            <div className={`waveform ${isConnecting || isOnline ? 'live' : ''}`} id="waveform">
              <span></span><span></span><span></span><span></span><span></span><span></span><span></span>
            </div>

            <div className="terminal" id="logBox">
              {logs.map((log, index) => (
                <div key={index} className="line">
                  <span className="t">[{getTimestamp()}]</span> {log}
                </div>
              ))}
              <div ref={terminalEndRef} />
            </div>

            <div className="console-foot">core.cnetvoip.cloud · TLS 1.3 · region us-east</div>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="console-right console-right-centered">
          <form onSubmit={handleConnect} style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
            <div className="field">
              <label htmlFor="inPhone">Phone No</label>
              <input
                type="tel"
                id="inPhone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +1 408 555 1001"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="inPass">SIP Password</label>
              <div className="password-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="inPass"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter SIP password"
                  required
                />
                <button
                  type="button"
                  className="toggle-password"
                  id="togglePassBtn"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? (
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

            <div className="btn-row">
              <button
                type="submit"
                className="btn btn-primary"
                id="connectBtn"
                disabled={isConnecting || isOnline}
              >
                <span>{isConnecting ? 'Connecting…' : isOnline ? 'Connected' : 'Connect'}</span>
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleDisconnect}
                disabled={!isOnline}
              >
                Disconnect
              </button>
            </div>
          </form>

          <Link className="back-link" to="/admin-login">
            Platform operator? Sign in to the admin console →
          </Link>
        </div>
      </div>
    </div>
  );
}