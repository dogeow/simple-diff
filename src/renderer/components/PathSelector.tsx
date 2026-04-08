interface PathSelectorProps {
  readonly label: string
  readonly value: string
  readonly onChange: (path: string) => void
}

export default function PathSelector({ label, value, onChange }: PathSelectorProps) {
  const handleBrowse = async () => {
    const result = await window.api.selectFolder()
    if (result.success && result.data) {
      onChange(result.data)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-neutral-400">{label}</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="选择目录路径..."
          className="flex-1 rounded border border-neutral-600 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-100 placeholder-neutral-500 outline-none focus:border-blue-500"
        />
        <button
          onClick={handleBrowse}
          className="rounded bg-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-600 active:bg-neutral-500"
        >
          浏览...
        </button>
      </div>
    </div>
  )
}
