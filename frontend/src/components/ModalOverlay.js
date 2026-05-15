import React, { useRef } from 'react';

export default function ModalOverlay({ children, className = 'modal-overlay', onClose }) {
  const startedOnBackdrop = useRef(false);

  return (
    <div
      className={className}
      onPointerDown={(e) => {
        startedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (startedOnBackdrop.current && e.target === e.currentTarget) onClose?.();
        startedOnBackdrop.current = false;
      }}
    >
      {children}
    </div>
  );
}
