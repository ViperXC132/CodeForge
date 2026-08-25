import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { readDir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { monaco } from './monaco-runtime'

type TreeNode = {
  name: string
  path: string
  kind: 'file' | 'folder'
  children?: TreeNode[]
}

type OpenFile = {
  path: string
  name: string
  language: string
  value: string
  dirty: boolean
}

const IGNORED_DIRECTORIES = new Set(['node_modules', '.git', 'target', 'dist', 'build', '.next'])

function languageForFile(name: string) {
  const extension = name.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', json: 'json',
    css: 'css', scss: 'scss', html: 'html', htm: 'html', md: 'markdown', rs: 'rust',
    py: 'python', java: 'java', kt: 'kotlin', go: 'go', c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp',
    cs: 'csharp', xml: 'xml', yaml: 'yaml', yml: 'yaml', toml: 'ini', sh: 'shell', ps1: 'powershell',
  }
  return map[extension ?? ''] ?? 'plaintext'
}

function fileIcon(name: string, kind: TreeNode['kind']) {
  if (kind === 'folder') return '▸'
  const extension = name.split('.').pop()?.toLowerCase()
  if (extension === 'ts' || extension === 'tsx') return 'TS'
  if (extension === 'js' || extension === 'jsx') return 'JS'
  if (extension === 'json') return '{}'
  if (extension === 'css' || extension === 'scss') return '#'
  if (extension === 'html' || extension === 'htm') return '<>'
  if (extension === 'rs') return 'R'
  if (extension === 'py') return 'Py'
  return '·'
}

async function readTree(path: string): Promise<TreeNode[]> {
  const entries = await readDir(path)
  const nodes: TreeNode[] = []

  for (const entry of entries) {
    if (!entry.name || entry.name.startsWith('.') && entry.name !== '.env') continue
    const childPath = `${path}\\${entry.name}`
    if (entry.isDirectory) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue
      nodes.push({ name: entry.name, path: childPath, kind: 'folder', children: await readTree(childPath) })
    } else {
      nodes.push({ name: entry.name, path: childPath, kind: 'file' })
    }
  }

  return nodes.sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'folder' ? -1 : 1)
}

export default function App() {
  const [root, setRoot] = useState<string | null>(null)
  const [tree, setTree] = useState<TreeNode[]>([])
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(260)
  const [isResizing, setIsResizing] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const editorInstance = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const models = useRef(new Map<string, monaco.editor.ITextModel>())

  const activeFile = useMemo(() => openFiles.find((file) => file.path === activePath) ?? null, [openFiles, activePath])

  const refreshTree = useCallback(async (path: string) => {
    setTree(await readTree(path))
  }, [])

  const openFolder = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false })
    if (!selected || typeof selected !== 'string') return
    setRoot(selected)
    setOpenFiles([])
    setActivePath(null)
    models.current.forEach((model) => model.dispose())
    models.current.clear()
    await refreshTree(selected)
  }, [refreshTree])

  const openFile = useCallback(async (file: TreeNode) => {
    if (file.kind !== 'file') return
    const existing = openFiles.find((item) => item.path === file.path)
    if (existing) {
      setActivePath(file.path)
      return
    }
    const value = await readTextFile(file.path)
    const model = monaco.editor.createModel(value, languageForFile(file.name), monaco.Uri.file(file.path))
    models.current.set(file.path, model)
    setOpenFiles((current) => [...current, { path: file.path, name: file.name, language: languageForFile(file.name), value, dirty: false }])
    setActivePath(file.path)
  }, [openFiles])

  useEffect(() => {
    if (!editorRef.current) return
    const editor = monaco.editor.create(editorRef.current, {
      automaticLayout: true,
      theme: 'vs-dark',
      minimap: { enabled: true },
      smoothScrolling: true,
      cursorSmoothCaretAnimation: 'on',
      fontLigatures: true,
      padding: { top: 14 },
      renderWhitespace: 'selection',
      tabSize: 2,
    })
    editorInstance.current = editor
    return () => {
      editor.dispose()
      editorInstance.current = null
    }
  }, [])

  useEffect(() => {
    const editor = editorInstance.current
    if (!editor || !activeFile) {
      if (editor) editor.setModel(null)
      return
    }
    const model = models.current.get(activeFile.path)
    if (!model) return
    editor.setModel(model)
    editor.focus()
  }, [activeFile])

  useEffect(() => {
    const editor = editorInstance.current
    if (!editor) return
    const disposable = editor.onDidChangeModelContent(() => {
      const model = editor.getModel()
      if (!model) return
      const path = model.uri.fsPath
      setOpenFiles((current) => current.map((file) => file.path === path ? { ...file, value: model.getValue(), dirty: true } : file))
    })
    return () => disposable.dispose()
  }, [])

  useEffect(() => {
    if (!isResizing) return
    const move = (event: MouseEvent) => setSidebarWidth(Math.min(420, Math.max(200, event.clientX)))
    const up = () => setIsResizing(false)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [isResizing])

  const saveActive = useCallback(async () => {
    if (!activeFile) return
    const model = models.current.get(activeFile.path)
    if (!model) return
    await writeTextFile(activeFile.path, model.getValue())
    setOpenFiles((current) => current.map((file) => file.path === activeFile.path ? { ...file, value: model.getValue(), dirty: false } : file))
  }, [activeFile])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveActive()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [saveActive])

  const closeTab = (path: string) => {
    const index = openFiles.findIndex((file) => file.path === path)
    const model = models.current.get(path)
    model?.dispose()
    models.current.delete(path)
    setOpenFiles((current) => current.filter((file) => file.path !== path))
    if (activePath === path) {
      const next = openFiles[index + 1] ?? openFiles[index - 1]
      setActivePath(next?.path ?? null)
    }
  }

  return (
    <main className="app-shell">
      <header className="titlebar">
        <div className="brand"><span className="brand-mark">◆</span> CodeForge</div>
        <div className="titlebar-project">{root ? root.split('\\').pop() : 'No project open'}</div>
        <button className="open-button" onClick={() => void openFolder()}>Open Folder</button>
      </header>
      <section className="workspace">
        <aside className="explorer" style={{ width: sidebarWidth }}>
          <div className="explorer-header"><span>EXPLORER</span><span>{root ? 'WORKSPACE' : 'NO PROJECT'}</span></div>
          <div className="tree">
            {!root && <button className="empty-action" onClick={() => void openFolder()}>Open a folder to start</button>}
            {tree.map((node) => (
              <TreeItem key={node.path} node={node} depth={0} onOpen={openFile} icon={fileIcon} />
            ))}
          </div>
          <div className="sidebar-resize" onMouseDown={() => setIsResizing(true)} />
        </aside>
        <section className="editor-area">
          <nav className="tabs">
            {openFiles.map((file) => (
              <button key={file.path} className={`tab ${activePath === file.path ? 'active' : ''}`} onClick={() => setActivePath(file.path)}>
                <span>{fileIcon(file.name, 'file')}</span><span>{file.name}</span>{file.dirty && <span className="dirty-dot">●</span>}
                <span className="tab-close" onClick={(event) => { event.stopPropagation(); closeTab(file.path) }}>×</span>
              </button>
            ))}
          </nav>
          <div ref={editorRef} className="monaco-host" />
          <footer className="statusbar">
            <span>{activeFile?.language ?? 'Plain Text'}</span>
            <span>{activeFile ? `${activeFile.dirty ? 'Modified' : 'Saved'} · ${activeFile.path}` : 'CodeForge'}</span>
          </footer>
        </section>
      </section>
    </main>
  )
}

function TreeItem({ node, depth, onOpen, icon }: { node: TreeNode; depth: number; onOpen: (node: TreeNode) => void; icon: (name: string, kind: TreeNode['kind']) => string }) {
  const [expanded, setExpanded] = useState(depth < 1)
  return (
    <div>
      <button className="tree-row" style={{ paddingLeft: 12 + depth * 16 }} onDoubleClick={() => node.kind === 'file' ? onOpen(node) : setExpanded((value) => !value)} onClick={() => node.kind === 'folder' && setExpanded((value) => !value)}>
        <span className="tree-chevron">{node.kind === 'folder' ? (expanded ? '⌄' : '›') : ''}</span>
        <span className="tree-icon">{icon(node.name, node.kind)}</span>
        <span>{node.name}</span>
      </button>
      {node.kind === 'folder' && expanded && node.children?.map((child) => <TreeItem key={child.path} node={child} depth={depth + 1} onOpen={onOpen} icon={icon} />)}
    </div>
  )
}
