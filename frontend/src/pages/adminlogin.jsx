import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../style/connect.css';

const ADMIN_STORAGE_KEY = 'cnv_admin_platform_state_v2';

export default function AdminLogin() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('admin@cnetvoip');
  const [passcode, setPasscode] = useState('operator@123');
  const [showPasscode, setShowPasscode] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);

  const [logs, setLogs] = useState([
    'Operator console initialized',
    'Waiting for operator sign-in…'
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

  const handleSignIn = (e) => {
    e.preventDefault();

    if (!email.trim() || !passcode.trim()) {
      addLog('Authentication rejected — Email and Passcode required');
      return;
    }

    setIsSigningIn(true);
    addLog(`Verifying operator credentials for ${email.trim()}…`);
    addLog('Authorizing TLS 1.3 session on core.cnetvoip.cloud…');

    setTimeout(() => {
      setIsSigningIn(false);
      setIsUnlocked(true);
      addLog('Access GRANTED: Operator session established');
      addLog('Redirecting to Platform Admin console…');

      const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
      let existing = {};
      if (raw) {
        try {
          existing = JSON.parse(raw);
        } catch (err) {
          console.error(err);
        }
      }

      localStorage.setItem(
        ADMIN_STORAGE_KEY,
        JSON.stringify({
          ...existing,
          authenticated: true,
          operatorId: email.trim()
        })
      );

      setTimeout(() => {
        navigate('/admin-dashboard');
      }, 900);
    }, 1000);
  };

  return (
    <div id="connectView">
      <div className="console">
        {/* LEFT PANEL */}
        <div className="console-left">
          <div>
            <div className="brand">
              <div className="mark admin-mark">C</div>
              <div className="name">
                CNetVoIP<small>PLATFORM OPERATOR CONSOLE</small>
              </div>
            </div>

            <h1>
              Manage every hotel
              <br />
              on one line.
            </h1>
            <p>
              This console controls AI extensions across all tenants on core.cnetvoip.cloud — provisioning, status, and call activity in one place.
            </p>

            <div className={`status-pill ${isUnlocked ? '' : 'off'}`} id="statusPill">
              <div className={`pulse-dot ${isUnlocked ? 'on' : ''}`} id="pulseDot"></div>
              <div className="txt">
                Platform access is <b>{isUnlocked ? 'UNLOCKED' : 'LOCKED'}</b>
              </div>
            </div>
          </div>

          <div>
            <div className="platform-mini-stats" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <b>49</b>
                <span>Tenants</span>
              </div>
              <div>
                <b>4,653</b>
                <span>Extensions</span>
              </div>
              <div>
                <b>94</b>
                <span>DIDs</span>
              </div>
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
          <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
            <div className="field">
              <label htmlFor="inOperator">Operator Email</label>
              <input
                type="email"
                id="inOperator"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. operator@cnetvoip.cloud"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="inPasscode">Passcode</label>
              <div className="password-wrapper">
                <input
                  type={showPasscode ? 'text' : 'password'}
                  id="inPasscode"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Enter operator passcode"
                  required
                />
                <button
                  type="button"
                  className="toggle-password"
                  id="togglePassBtn"
                  onClick={() => setShowPasscode((prev) => !prev)}
                  aria-label="Toggle passcode visibility"
                >
                  {showPasscode ? (
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
                disabled={isSigningIn || isUnlocked}
              >
                <span>{isSigningIn ? 'Signing in…' : isUnlocked ? 'Authenticated' : 'Sign in to console'}</span>
              </button>
            </div>
          </form>

          <Link className="back-link" to="/hotel-login">
            ← Back to hotel extension login
          </Link>
        </div>
      </div>
    </div>
  );
}