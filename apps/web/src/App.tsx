import { AnalyticsPage } from './pages/analytics-page';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { CashRegisterPage } from './pages/cash-register-page';
import { DashboardPage } from './pages/dashboard-page';
import { LoginPage } from './pages/login-page';
import { OrdersPage } from './pages/orders-page';
import { ProductsManagementPage } from './pages/products-management-page';
import { RegisterPage } from './pages/register-page';
import { StockPage } from './pages/stock-page';
import { AuthProvider } from './providers/auth-provider';
import { ProtectedRoute } from './routes/protected-route';
import { PublicRoute } from './routes/public-route';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<PublicRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/caixa" element={<CashRegisterPage />} />
            <Route path="/estoque" element={<StockPage />} />
            <Route path="/pedidos" element={<OrdersPage />} />
            <Route path="/produtos" element={<ProductsManagementPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
