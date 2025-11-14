// Тестовый деплой - проверка автоматического деплоя
import { Routes, Route, Navigate } from 'react-router-dom'
import { MainLayout, AuthLayout, SimpleLayout } from '@/components/layout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import {
  RegisterPage,
  LoginPage,
  EmailConfirmationPage,
  ProfileSetupPage,
  ProfilePage,
  ProfileEditPage,
  DashboardPage,
  EmployeesPage,
  PatientCardsPage,
  PatientCardFormPage,
  ClientsPage,
  InviteClientPage,
  CreateDiaryPage,
  DiaryPage,
  EditDiaryMetricsPage,
  ClientInviteRegisterPage,
  AdminLayout,
  AdminDashboardPage,
  AdminInvitesPage,
  AdminUsersPage,
  AdminSupportPage,
  AdminMonitoringPage,
} from '@/pages'

// Обертка для защищенных роутов с MainLayout
const ProtectedLayout = () => {
  return (
    <ProtectedRoute>
      <MainLayout />
    </ProtectedRoute>
  )
}

// Обертка для защищенных роутов без Header (SimpleLayout)
const ProtectedSimpleLayout = () => {
  return (
    <ProtectedRoute>
      <SimpleLayout />
    </ProtectedRoute>
  )
}

// Обертка для ProfilePage без Layout (свой локальный header)
const ProtectedProfilePage = () => {
  return (
    <ProtectedRoute>
      <ProfilePage />
    </ProtectedRoute>
  )
}

// Обертка для ProfileEditPage без Layout (свой локальный header)
const ProtectedProfileEditPage = () => {
  return (
    <ProtectedRoute>
      <ProfileEditPage />
    </ProtectedRoute>
  )
}

// Обертка для EmployeesPage без Layout (свой локальный header)
const ProtectedEmployeesPage = () => {
  return (
    <ProtectedRoute>
      <EmployeesPage />
    </ProtectedRoute>
  )
}

// Обертка для PatientCardsPage без Layout (свой локальный header)
const ProtectedPatientCardsPage = () => {
  return (
    <ProtectedRoute>
      <PatientCardsPage />
    </ProtectedRoute>
  )
}

// Обертка для ClientsPage без Layout (свой локальный header)
const ProtectedClientsPage = () => {
  return (
    <ProtectedRoute>
      <ClientsPage />
    </ProtectedRoute>
  )
}

// Обертка для InviteClientPage без Layout (свой локальный header)
const ProtectedInviteClientPage = () => {
  return (
    <ProtectedRoute>
      <InviteClientPage />
    </ProtectedRoute>
  )
}

function App() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/email-confirmation" element={<EmailConfirmationPage />} />
        <Route path="/client-invite" element={<ClientInviteRegisterPage />} />
      </Route>
      <Route element={<ProtectedSimpleLayout />}>
        <Route path="/profile/setup" element={<ProfileSetupPage />} />
      </Route>
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Route>
      {/* DashboardPage без Header (свой локальный header с иконкой профиля) */}
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      {/* ProfilePage, ProfileEditPage, EmployeesPage и PatientCardsPage без Header (свой локальный header) */}
      <Route path="/profile" element={<ProtectedProfilePage />} />
      <Route path="/profile/edit" element={<ProtectedProfileEditPage />} />
      <Route path="/profile/employees" element={<ProtectedEmployeesPage />} />
      <Route path="/profile/patient-cards" element={<ProtectedPatientCardsPage />} />
      <Route path="/profile/patient-cards/new" element={<ProtectedRoute><PatientCardFormPage /></ProtectedRoute>} />
      <Route path="/profile/patient-cards/edit" element={<ProtectedRoute><PatientCardFormPage /></ProtectedRoute>} />
      <Route path="/profile/patient-cards/view" element={<ProtectedRoute><PatientCardFormPage /></ProtectedRoute>} />
      <Route path="/profile/clients" element={<ProtectedClientsPage />} />
      <Route path="/profile/invite-client" element={<ProtectedInviteClientPage />} />
      <Route path="/diaries/new" element={<ProtectedRoute><CreateDiaryPage /></ProtectedRoute>} />
        <Route path="/diaries/:id" element={<ProtectedRoute><DiaryPage /></ProtectedRoute>} />
        <Route path="/diaries/:id/edit-metrics" element={<ProtectedRoute><EditDiaryMetricsPage /></ProtectedRoute>} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboardPage />} />
        <Route path="invites" element={<AdminInvitesPage />} />
        <Route
          path="users"
          element={<AdminUsersPage />}
        />
        <Route
          path="support"
          element={<AdminSupportPage />}
        />
        <Route
          path="monitoring"
          element={<AdminMonitoringPage />}
        />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  )
}

export default App
