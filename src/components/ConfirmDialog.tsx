type Props = {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button for destructive actions */
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  destructive,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null
  const isDestructive = destructive ?? /delete|remove/i.test(confirmLabel)
  return (
    <div
      role="presentation"
      className="apex-modal-overlay fixed inset-0 z-[100] flex items-end justify-center sm:items-center p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-sm apex-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="text-[13px] font-normal text-[#e0e0e0]">
          {title}
        </h2>
        <p className="mt-2 text-[13px] font-normal text-[#a0a0a8] leading-relaxed">{message}</p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            className="min-h-12 flex-1 rounded-[8px] border-[0.5px] border-[var(--apex-border)] bg-[var(--apex-surface-card)] text-[13px] font-normal text-[#e0e0e0]"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`min-h-12 flex-1 rounded-[8px] text-[13px] font-medium ${
              isDestructive
                ? 'bg-[#c43c3c] text-white border-[0.5px] border-[#e85d5d]/40'
                : 'apex-btn-primary'
            }`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
