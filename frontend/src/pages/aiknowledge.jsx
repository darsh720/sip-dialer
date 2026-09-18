import React, { useState } from 'react';
import '../style/aiknowledge.css';

export default function AiKnowledgeModal({ isOpen, onClose, data, hotelForm }) {
  const [activeView, setActiveView] = useState('graphical'); // 'graphical' | 'json'
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  // Construct structured payload based on Property & Hotel Details
  const aiPayload = {
    tenant_id: data.tenantId,
    property_details: {
      property_name: hotelForm.name,
      property_no: hotelForm.did,
      property_address: hotelForm.address,
      time_zone: hotelForm.tz,
      front_desk_extension: hotelForm.frontExt || hotelForm.departmentExtensions?.frontDesk || '',
      fallback_extension: hotelForm.fallback || '',
      check_in_time: hotelForm.propertyCheckInTime || '',
      check_out_time: hotelForm.propertyCheckOutTime || '',
      late_checkout_policy: hotelForm.lateCheckoutPolicy || '',
      cancellation_policy: hotelForm.cancellationPolicy || ''
    },
    hotel_details: {
      greeting: hotelForm.greeting,
      language: hotelForm.lang,
      department_extensions: hotelForm.departmentExtensions || {}
    },
    knowledge_base: data.kb || []
  };

  const jsonString = JSON.stringify(aiPayload, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy JSON: ', err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(hotelForm.name || 'hotel').toLowerCase().replace(/\s+/g, '_')}_ai_kb.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="ai-modal-backdrop" onClick={onClose}>
      <div className="ai-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* MODAL HEADER */}
        <div className="ai-modal-header">
          <div className="ai-modal-titles">
            <span className="ai-modal-badge">AI Knowledge Engine</span>
            <h2>Property &amp; Hotel Details Payload</h2>
            <p>Live schema compiled for AI Assistant call routing and Q&amp;A resolution.</p>
          </div>
          <button className="ai-modal-close" onClick={onClose} aria-label="Close modal">
            &times;
          </button>
        </div>

        {/* VIEW TOGGLE */}
        <div className="ai-view-tabs">
          <button
            type="button"
            className={`ai-tab-btn ${activeView === 'graphical' ? 'active' : ''}`}
            onClick={() => setActiveView('graphical')}
          >
            Graphical View
          </button>
          <button
            type="button"
            className={`ai-tab-btn ${activeView === 'json' ? 'active' : ''}`}
            onClick={() => setActiveView('json')}
          >
            Raw JSON
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="ai-modal-content">
          {activeView === 'graphical' ? (
            <div className="graphical-view">
              <div className="summary-banner">
                <div className="summary-item">
                  <label>Tenant</label>
                  <span>{aiPayload.tenant_id}</span>
                </div>
                <div className="summary-item">
                  <label>Property</label>
                  <span>{aiPayload.property_details.property_name}</span>
                </div>
                <div className="summary-item">
                  <label>Direct Inward Dial (DID)</label>
                  <span>{aiPayload.property_details.property_no}</span>
                </div>
                <div className="summary-item">
                  <label>Active Language</label>
                  <span>{aiPayload.hotel_details.language}</span>
                </div>
              </div>

              <div className="details-section">
                <h3>Property &amp; Routing Specs</h3>
                <div className="grid-details">
                  <div className="detail-card">
                    <span className="label">Address</span>
                    <span className="val">{aiPayload.property_details.property_address || 'Not Configured'}</span>
                  </div>
                  <div className="detail-card">
                    <span className="label">Time Zone</span>
                    <span className="val">{aiPayload.property_details.time_zone}</span>
                  </div>
                  <div className="detail-card">
                    <span className="label">Front Desk Ext</span>
                    <span className="val">{aiPayload.property_details.front_desk_extension}</span>
                  </div>
                  <div className="detail-card">
                    <span className="label">Fallback Ext</span>
                    <span className="val">{aiPayload.property_details.fallback_extension}</span>
                  </div>
                  <div className="detail-card">
                    <span className="label">Check-in / Check-out</span>
                    <span className="val">{aiPayload.property_details.check_in_time} / {aiPayload.property_details.check_out_time}</span>
                  </div>
                  <div className="detail-card">
                    <span className="label">AI Greeting</span>
                    <span className="val font-italic">"{aiPayload.hotel_details.greeting}"</span>
                  </div>
                </div>
              </div>

              <div className="details-section">
                <h3>Department Extension Mapping</h3>
                <div className="dept-tags">
                  {Object.entries(aiPayload.hotel_details.department_extensions).map(([dept, ext]) => (
                    <div key={dept} className="dept-tag">
                      <span className="dept-name">{dept}</span>
                      <span className="dept-ext">Ext {ext || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="details-section">
                <h3>Loaded Q&amp;A Entries ({aiPayload.knowledge_base.length})</h3>
                <div className="kb-scroll-list">
                  {aiPayload.knowledge_base.map((item, idx) => (
                    <div key={idx} className="kb-bubble">
                      <p className="q"><strong>Q:</strong> {item.q}</p>
                      <p className="a"><strong>A:</strong> {item.a}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="json-code-container">
              <pre>
                <code>{jsonString}</code>
              </pre>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="ai-modal-footer">
          <div className="footer-status">
            <span>{aiPayload.knowledge_base.length} Knowledge entries loaded</span>
          </div>
          <div className="footer-actions">
            <button type="button" className="btn-outline" onClick={handleDownload}>
              Download JSON
            </button>
            <button type="button" className="btn-solid" onClick={handleCopy}>
              {copied ? 'Copied to Clipboard!' : 'Copy JSON'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}