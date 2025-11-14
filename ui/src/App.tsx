import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import POSTerminal from './pages/POSTerminal';
import OrderQueue from './pages/OrderQueue';
import Login from './pages/Login';
import { BackOfficePortal } from './components/BackOffice/BackOfficePortal';
import { useAuthStore } from './store/authStore';

function App() {
  const { isAuthenticated } = useAuthStore();

  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/pos"
          element={isAuthenticated ? <POSTerminal /> : <Navigate to="/login" />}
        />
        <Route
          path="/queue"
          element={isAuthenticated ? <OrderQueue /> : <Navigate to="/login" />}
        />
        <Route
          path="/backoffice/*"
          element={isAuthenticated ? <BackOfficePortal /> : <Navigate to="/login" />}
        />
        <Route path="/" element={<Navigate to={isAuthenticated ? "/queue" : "/login"} />} />
      </Routes>
      <Toaster position="top-right" richColors />
    </>
  );
}

export default App;
