import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";
import { Login } from "./app/pages/Login";
import { Chat } from "./app/pages/Chat";
import { ProtectedRoute } from "./app/components/ProtectedRoute";
import { ErrorBoundary } from "./app/components/ErrorBoundary";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* F-W: Error Boundary 包住整個 App */}
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Chat />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);
