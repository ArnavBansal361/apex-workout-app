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
  accent: string
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
  accent,
}: Props) {
  if (!open) return null
  const isDestructive = destructive ?? /delete|remove/i.test(confirmLabel)
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center p-4 bg-black/75">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-sm apex-card p-5"
      >
        <h2 id="confirm-title" className="text-[13px] font-normal text-[#e0e0e0]">
          {title}
        </h2>
        <p className="mt-2 text-[13px] font-normal text-[#555] leading-relaxed">{message}</p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            className="min-h-12 flex-1 rounded-[12px] border border-[#1e1e1e] bg-[#161616] text-[13px] font-normal text-[#e0e0e0]"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="min-h-12 flex-1 rounded-[12px] text-[13px] font-medium text-[#0c0c0c]"
            style={{
              backgroundColor: isDestructive ? '#b91c1c' : accent,
            }}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
