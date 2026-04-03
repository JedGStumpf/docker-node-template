import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import AppLayout from './components/AppLayout';
import Login from './pages/Login';
import Home from './pages/Home';
import Chat from './pages/Chat';
import About from './pages/About';
import McpSetup from './pages/McpSetup';
import NotFound from './pages/NotFound';
import Account from './pages/Account';
import Channels from './pages/Channels';
import RequestIntake from './pages/RequestIntake';
import AdminRequests from './pages/admin/AdminRequests';
import AdminRequestDetail from './pages/admin/AdminRequestDetail';
import AdminLogin from './pages/admin/AdminLogin';
import AdminLayout from './pages/admin/AdminLayout';
import EnvironmentInfo from './pages/admin/EnvironmentInfo';
import DatabaseViewer from './pages/admin/DatabaseViewer';
import ConfigPanel from './pages/admin/ConfigPanel';
import LogViewer from './pages/admin/LogViewer';
import SessionViewer from './pages/admin/SessionViewer';
import PermissionsPanel from './pages/admin/PermissionsPanel';
import ScheduledJobsPanel from './pages/admin/ScheduledJobsPanel';
import ImportExport from './pages/admin/ImportExport';
import UsersPanel from './pages/admin/UsersPanel';
import EventPage from './pages/EventPage';
import EmailQueueAdmin from './pages/admin/EmailQueueAdmin';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Login (standalone, no layout) */}
          <Route path="/login" element={<Login />} />

          {/* Admin login (standalone, no layout) */}
          <Route path="/admin" element={<AdminLogin />} />

          {/* Public event registration (no auth required) */}
          <Route path="/events/:requestId" element={<EventPage />} />

          {/* All authenticated routes share AppLayout (sidebar + topbar) */}
          <Route element={<AppLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/about" element={<About />} />
            <Route path="/account" element={<Account />} />
            <Route path="/request" element={<RequestIntake />} />
            <Route path="/mcp-setup" element={<McpSetup />} />

            {/* Admin pages — auth-gated by AdminLayout */}
            <Route element={<AdminLayout />}>
              <Route path="/admin/users" element={<UsersPanel />} />
              <Route path="/admin/env" element={<EnvironmentInfo />} />
              <Route path="/admin/db" element={<DatabaseViewer />} />
              <Route path="/admin/config" element={<ConfigPanel />} />
              <Route path="/admin/logs" element={<LogViewer />} />
              <Route path="/admin/sessions" element={<SessionViewer />} />
              <Route path="/admin/permissions" element={<PermissionsPanel />} />
              <Route path="/admin/scheduler" element={<ScheduledJobsPanel />} />
              <Route path="/admin/import-export" element={<ImportExport />} />
              <Route path="/admin/channels" element={<Channels />} />
              <Route path="/admin/requests" element={<AdminRequests />} />
              <Route path="/admin/requests/:id" element={<AdminRequestDetail />} />
              <Route path="/admin/email-queue" element={<EmailQueueAdmin />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
