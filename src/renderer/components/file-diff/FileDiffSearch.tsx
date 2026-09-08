import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import type { TextDiffResult } from '../../../../shared/types'
import { Button, IconButton, Input } from '../ui'

export default function FileDiffSearch({ result, onNavigate, onClose }: {
  result: TextDiffResult | null
  onNavigate: (row: number) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(-1)
  const matches = useMemo(() => {
    if (!query || !result) return []
    const text = query.toLowerCase()
    return result.leftLines.flatMap((line, row) => line.content.toLowerCase().includes(text)
      || result.rightLines[row]?.content.toLowerCase().includes(text) ? [row] : [])
  }, [query, result])
  useEffect(() => { setIndex(-1) }, [matches])
  const go = (step: number) => {
    if (!matches.length) return
    const next = (index + step + matches.length) % matches.length
    setIndex(next)
    onNavigate(matches[next])
  }
  return <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface px-2 py-1.5">
    <Input autoFocus size="sm" aria-label="查找文件文本" placeholder="查找左右文件中的文本…" value={query}
      onChange={(event) => setQuery(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.stopPropagation(); onClose() }
        if (event.key === 'Enter') { event.preventDefault(); go(event.shiftKey ? -1 : 1) }
      }} />
    <span role="status" className="shrink-0 text-xs text-fg-muted">{query ? `${index < 0 ? 0 : index + 1} / ${matches.length}` : '输入查找内容'}</span>
    <Button size="sm" icon={ChevronUp} disabled={!matches.length} onClick={() => go(-1)}>上一处</Button>
    <Button size="sm" icon={ChevronDown} disabled={!matches.length} onClick={() => go(1)}>下一处</Button>
    <IconButton size="sm" icon={X} label="关闭查找" onClick={onClose} />
  </div>
}
