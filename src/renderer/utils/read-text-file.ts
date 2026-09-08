/**
 * 把一个 `File` 读成文本。
 *
 * 拖入面板（`TextInputPanel` 的 drop）和文本工具栏 `⋯ → 从文件载入…`（`TextComparePage`
 * 的 `<input type="file">`）是同一件事的两个入口，读取与失败文案因此只写一遍。
 *
 * 走浏览器的 `FileReader` 而不是 `window.api.selectFile()` + `readText()`：后者的
 * `readText` 只接受「在某个 source 根之下」的路径（`src-tauri/src/files.rs` 的
 * `resolve_local_abs` 会拒绝根外路径），为了载入任意一个文件而现编一个 source 根，
 * 比直接用文件对象要绕，而且在浏览器预览态（mock 运行时）根本无法工作。
 */
export async function readFileAsText(file: File): Promise<string> {
  if (file.size > 32 * 1024 * 1024) throw new Error('文本预览仅支持 32 MB 以内的文件；大文件仍可进行目录对比和同步。')
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'))
    reader.readAsText(file)
  })
}
