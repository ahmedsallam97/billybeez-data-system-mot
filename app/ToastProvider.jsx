"use client";

import { createContext, useContext, useMemo, useState } from "react";

const ToastContext = createContext(null);

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    return () => {};
  }

  return context;
}

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useMemo(() => (message, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, type }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3500);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="toast-stack">
        {toasts.map((toast) => (
          <div className={`toast ${toast.type}`} key={toast.id}>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
