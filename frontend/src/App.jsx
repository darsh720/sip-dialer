import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import HotelLogin from './pages/hotellogin.jsx';
import AdminLogin from './pages/adminlogin.jsx';
import AdminDashboard from './pages/admindashboard.jsx';
import HotelDashboard from './pages/hoteldashboard.jsx';
import TenantDetails from './pages/tenantdetails.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/admin-dashboard" replace />} />
        <Route path="/hotel-login" element={<HotelLogin />} />
        <Route path="/admin-login" element={<AdminLogin />} />
        <Route path="/admin-dashboard" element={<AdminDashboard />} />
        <Route path="/hotel-dashboard" element={<HotelDashboard />} />
        <Route path="/tenant-details" element={<TenantDetails />} />
      </Routes>
    </BrowserRouter>
  );
}