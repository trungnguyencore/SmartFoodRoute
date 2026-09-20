import { useEffect, useId, useRef, type PropsWithChildren } from "react";
export function Modal({
  title,
  onClose,
  children,
}: { title: string; onClose: () => void } & PropsWithChildren) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="sheet"
      aria-labelledby={id}
      onCancel={onClose}
    >
      <header className="row sheet-heading">
        <h2 id={id}>{title}</h2>
        <button className="secondary" onClick={onClose} aria-label="Đóng">
          ✕
        </button>
      </header>
      {children}
    </dialog>
  );
}
