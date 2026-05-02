import { useState, useEffect } from "react";
import { useToastStore } from "../stores/toastStore";

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismissToast = useToastStore((s) => s.dismissToast);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 10000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} id={toast.id} message={toast.message} onDismiss={dismissToast} />
      ))}
    </div>
  );
}

function ToastItem({ id, message, onDismiss }: { id: string; message: string; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  return (
    <div
      onClick={() => {
        setVisible(false);
        setTimeout(() => onDismiss(id), 150);
      }}
      style={{
        padding: "10px 16px",
        borderRadius: 8,
        background: "rgba(0,0,0,0.75)",
        color: "#fff",
        fontSize: 14,
        maxWidth: 400,
        whiteSpace: "nowrap" as const,
        overflow: "hidden",
        textOverflow: "ellipsis",
        cursor: "pointer",
        pointerEvents: "auto",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: "opacity 150ms ease, transform 200ms ease",
      }}
    >
      {message}
    </div>
  );
}
