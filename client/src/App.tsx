import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { InstructorPage } from './pages/InstructorPage';

// Lazy loaded route components for optimal bundle splitting & background prefetching
const QuizzesPage = React.lazy(() =>
  import('./pages/QuizzesPage').then((m) => ({ default: m.QuizzesPage }))
);
const QuizArenaPage = React.lazy(() =>
  import('./pages/QuizArenaPage').then((m) => ({ default: m.QuizArenaPage }))
);
const AnalyticsPage = React.lazy(() =>
  import('./pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage }))
);

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={null}>
          <Routes>
            {/* Public Authentication Route */}
            <Route path="/login" element={<LoginPage />} />

            {/* Protected Application Routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/instructor" replace />} />
              <Route path="instructor" element={<InstructorPage />} />
              <Route path="quizzes" element={<QuizzesPage />} />
              <Route path="quizzes/:id" element={<QuizArenaPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
            </Route>

            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/instructor" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;

