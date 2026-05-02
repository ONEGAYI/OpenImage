import { useState, useEffect, useRef } from "react";
import { useToastStore } from "../stores/toastStore";

export default function ToastContainer() {
  const toast = useToastStore((s) => s.toast);
  const dismissToast = useToastStore((s) => s.dismissToast);

  return toast ? <ToastItem key={toast.id} message={toast.message} onDismiss={dismissToast} /> : null;
}

function ToastItem({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  return (
    <div
      onClick={() => {
        setVisible(false);
        dismissTimerRef.current = setTimeout(onDismiss, 150);
      }}
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: visible ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(20px)",
        zIndex: 10000,
        padding: "10px 16px",
        borderRadius: 8,
        background: "rgba(0,0,0,0.75)",
        color: "#fff",
        fontSize: 14,
        maxWidth: 400,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        cursor: "pointer",
        pointerEvents: "auto",
        opacity: visible ? 1 : 0,
        transition: "opacity 150ms ease, transform 200ms ease",
      }}
    >
      {message}
    </div>
  );
}
