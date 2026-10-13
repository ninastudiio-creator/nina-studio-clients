import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import ClientsList from './pages/ClientsList'
import ClientDetail from './pages/ClientDetail'
import SurveyHub from './pages/SurveyHub'
import SurveyEditor from './pages/SurveyEditor'
import SurveyResponses from './pages/SurveyResponses'
import DocumentEditor from './pages/DocumentEditor'
import PublicSurvey from './pages/PublicSurvey'
import SetPassword from './pages/SetPassword'
import Today from './crm/Today'
import Orders from './crm/Orders'
import Clients from './crm/Clients'
import ClientFile from './crm/ClientFile'
import Review from './crm/Review'
import Leads from './crm/Leads'
import Data from './crm/Data'

const crmRoutes = [
  ['/crm', Today],
  ['/crm/orders', Orders],
  ['/crm/clients', Clients],
  ['/crm/clients/:clientId', ClientFile],
  ['/crm/review', Review],
  ['/crm/leads', Leads],
  ['/crm/data', Data],
]

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/set-password" element={<ProtectedRoute><SetPassword /></ProtectedRoute>} />
        <Route path="/survey/:token" element={<PublicSurvey />} />

        <Route path="/" element={<Navigate to="/crm" replace />} />
        {crmRoutes.map(([path, Page]) => (
          <Route key={path} path={path} element={<ProtectedRoute><Page /></ProtectedRoute>} />
        ))}

        <Route
          path="/websites"
          element={
            <ProtectedRoute>
              <ClientsList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/clients/:clientId"
          element={
            <ProtectedRoute>
              <ClientDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/clients/:clientId/documents/:documentId"
          element={
            <ProtectedRoute>
              <DocumentEditor />
            </ProtectedRoute>
          }
        />
        <Route
          path="/clients/:clientId/survey"
          element={
            <ProtectedRoute>
              <SurveyHub />
            </ProtectedRoute>
          }
        />
        <Route
          path="/clients/:clientId/survey/new"
          element={
            <ProtectedRoute>
              <SurveyEditor isEditing={false} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/clients/:clientId/survey/edit"
          element={
            <ProtectedRoute>
              <SurveyEditor isEditing={true} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/clients/:clientId/survey/responses"
          element={
            <ProtectedRoute>
              <SurveyResponses />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
