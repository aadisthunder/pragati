import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AppShell } from './components/layout/AppShell';
// Lazy loaded route components for optimal bundle splitting & background prefetching
const LoginPage = React.lazy(() =>
  import('./pages/LoginPage').then((m) => ({ default: m.LoginPage }))
);
const InstructorPage = React.lazy(() =>
  import('./pages/InstructorPage').then((m) => ({ default: m.InstructorPage }))
);
const QuizzesPage = React.lazy(() =>
  import('./pages/QuizzesPage').then((m) => ({ default: m.QuizzesPage }))
);
const QuizArenaPage = React.lazy(() =>
  import('./pages/QuizArenaPage').then((m) => ({ default: m.QuizArenaPage }))
);
const AnalyticsPage = React.lazy(() =>
  import('./pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage }))
);

const PageLoader: React.FC = () => (
  <div className="flex h-screen w-full items-center justify-center bg-[#FAF8FD]">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
  </div>
);

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<PageLoader />}>
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

