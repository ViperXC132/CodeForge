import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { readDir, readTextFile, writeTextFile, type DirEntry } from '@tauri-apps/plugin-fs'
import { monaco } from './monaco'

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
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    css: 'css',
    scss: 'scss',
    html: 'html',
    htm: 'html',
    md: 'markdown',
    rs: 'rust',
    py: 'python',
    java: 'java',
    kt: 'kotlin',
    go: 'go',
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    hpp: 'cpp',
    cs: 'csharp',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'ini',
    sh: 'shell',
    ps1: 'powershell',
  }
  return (extension && map[extension]) || 'plaintext'
}

function iconFor(name: string, kind: TreeNode['kind']) {
  if (kind === 'folder') return '▸'
  const extension = name.split('.').pop()?.toLowerCase()
  if (extension === 'ts' || extension === 'tsx') return 'TS'
  if (extension === 'js' || extension === 'jsx') return 'JS'
  if (extension === 'rs') return 'RS'
  if (extension === 'json') return '{}'
  if (extension === 'css' || extension === 'scss') return '#'
  if (extension === 'html') return '<>'
  if (extension === 'md') return 'M'
  return '·'
}

async function buildTree(rootPath: string): Promise<TreeNode> {
  const entries = await readDir(rootPath)
  const children: TreeNode[] = []

  for (const entry of entries) {
    if (!entry.name || (entry.isDirectory && IGNORED_DIRECTORIES.has(entry.name))) continue
    const path = `${rootPath.replace(/[\\/]$/, '')}/${entry.name}`
    if (entry.isDirectory) {
      children.push({ ...(await buildTree(path)), name: entry.name, path, kind: 'folder' })
    } else {
      children.push({ name: entry.name, path, kind: 'file' })
    }
  }

  children.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })

  return { name: rootPath.split(/[\\/]/).filter(Boolean).pop() ?? rootPath, path: rootPath, kind: 'folder', children }
}

function TreeItem({ node, depth, onOpen }: { node: TreeNode; depth: number; onOpen: (node: TreeNode) => void }) {
  const [expanded, setExpanded] = useState(depth === 0)
  const isFolder = node.kind === 'folder'

  return (
    <div>
      <button
        className={`tree-item ${isFolder ? 'folder' : 'file'}`}
        style={{ paddingLeft: `${12 + depth * 14}px` }}
        onClick={() => (isFolder ? setExpanded((value) => !value) : onOpen(node))}
        title={node.path}
      >
        <span className={`tree-chevron ${expanded ? 'expanded' : ''}`}>{isFolder ? '▸' : ''}</span>
        <span className={`file-icon ${isFolder ? 'folder-icon' : ''}`}>{iconFor(node.name, node.kind)}</span>
        <span className="tree-label">{node.name}</span>
      </button>
      {isFolder && expanded && node.children?.map((child) => (
        <TreeItem key={child.path} node={child} depth={depth + 1} onOpen={onOpen} />
      ))}
    </div>
  )
}

export default function App() {
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [tree, setTree] = useState<TreeNode | null>(null)
  const [files, setFiles] = useState<OpenFile[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  const [status, setStatus] = useState('Ready')
  const editorHost = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const modelRef = useRef<monaco.editor.ITextModel | null>(null)

  const activeFile = useMemo(() => files.find((file) => file.path === activePath) ?? null, [files, activePath])

  const refreshTree = useCallback(async (root: string) => {
    try {
      setTree(await buildTree(root))
    } catch (error) {
      setStatus(`Could not read project: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [])

  const openProject = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false, title: 'Open Project' })
    if (!selected || Array.isArray(selected)) return
    setStatus('Opening project…')
    setProjectPath(selected)
    setFiles([])
    setActivePath(null)
    await refreshTree(selected)
    setStatus('Project opened')
  }, [refreshTree])

  const openFile = useCallback(async (node: TreeNode) => {
    if (node.kind !== 'file') return
    const existing = files.find((file) => file.path === node.path)
    if (existing) {
      setActivePath(existing.path)
      return
    }

    try {
      const value = await readTextFile(node.path)
      const file: OpenFile = { path: node.path, name: node.name, language: languageForFile(node.name), value, dirty: false }
      setFiles((current) => [...current, file])
      setActivePath(node.path)
      setStatus(`Opened ${node.name}`)
    } catch (error) {
      setStatus(`Could not open ${node.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [files])

  const saveActive = useCallback(async () => {
    if (!activeFile || !editorRef.current) return
    const value = editorRef.current.getValue()
    try {
      await writeTextFile(activeFile.path, value)
      setFiles((current) => current.map((file) => file.path === activeFile.path ? { ...file, value, dirty: false } : file))
      setStatus(`Saved ${activeFile.name}`)
    } catch (error) {
      setStatus(`Save failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [activeFile])

  useEffect(() => {
    if (!editorHost.current) return
    const editor = monaco.editor.create(editorHost.current, {
      value: '',
      language: 'plaintext',
      theme: 'codeforge-dark',
      automaticLayout: true,
      fontFamily: 'JetBrains Mono, Cascadia Code, Consolas, monospace',
      fontSize: 14,
      lineHeight: 22,
      minimap: { enabled: true, scale: 1 },
      padding: { top: 18, bottom: 18 },
      smoothScrolling: true,
      cursorSmoothCaretAnimation: 'on',
      renderWhitespace: 'selection',
      roundedSelection: false,
      scrollBeyondLastLine: false,
      tabSize: 2,
    })
    editorRef.current = editor

    monaco.editor.defineTheme('codeforge-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6f7785' },
        { token: 'keyword', foreground: 'c792ea' },
        { token: 'string', foreground: 'a8d18d' },
      ],
      colors: {
        'editor.background': '#0d0f12',
        'editor.foreground': '#d8dee9',
        'editorLineNumber.foreground': '#414854',
        'editorLineNumber.activeForeground': '#8b93a1',
        'editor.lineHighlightBackground': '#12151a',
        'editor.selectionBackground': '#29313d',
        'editorCursor.foreground': '#d8dee9',
        'editorIndentGuide.background': '#1b1f26',
        'editorIndentGuide.activeBackground': '#2a303a',
      },
    })
    monaco.editor.setTheme('codeforge-dark')

    const disposable = editor.onDidChangeModelContent(() => {
      const currentPath = activePath
      if (!currentPath) return
      const value = editor.getValue()
      setFiles((current) => current.map((file) => file.path === currentPath ? { ...file, value, dirty: value !== file.value } : file))
    })

    return () => {
      disposable.dispose()
      editor.dispose()
      editorRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!editorRef.current) return
    if (modelRef.current) modelRef.current.dispose()

    if (!activeFile) {
      modelRef.current = monaco.editor.createModel('', 'plaintext')
    } else {
      modelRef.current = monaco.editor.createModel(activeFile.value, activeFile.language, monaco.Uri.file(activeFile.path))
    }
    editorRef.current.setModel(modelRef.current)
    editorRef.current.focus()

    return () => {
      modelRef.current?.dispose()
      modelRef.current = null
    }
  }, [activeFile?.path])

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

  return (
    <div className="app-shell">
      <header className="topbar" data-tauri-drag-region>
        <div className="brand" data-tauri-drag-region>
          <div className="brand-mark">⌘</div>
          <span>CodeForge</span>
          {projectPath && <span className="project-title">/ {projectPath.split(/[\\/]/).pop()}</span>}
        </div>
        <div className="top-actions">
          <button className="icon-button" title="Command Palette">⌘K</button>
          <button className="icon-button" title="Settings">⚙</button>
        </div>
      </header>

      <main className="workspace">
        <aside className="sidebar">
          <div className="sidebar-header">
            <span>EXPLORER</span>
            <div className="sidebar-actions">
              <button title="Open project" onClick={() => void openProject()}>＋</button>
              <button title="Refresh" onClick={() => projectPath && void refreshTree(projectPath)}>↻</button>
            </div>
          </div>
          <div className="explorer">
            {!tree ? (
              <div className="explorer-empty">
                <div className="empty-icon">⌁</div>
                <strong>No project open</strong>
                <span>Open a folder to start forging.</span>
                <button className="primary-button" onClick={() => void openProject()}>Open Folder</button>
              </div>
            ) : (
              <TreeItem node={tree} depth={0} onOpen={(node) => void openFile(node)} />
            )}
          </div>
        </aside>

        <section className="editor-area">
          <div className="tabbar">
            {files.length === 0 ? (
              <div className="tab-empty">Welcome to CodeForge</div>
            ) : files.map((file) => (
              <button key={file.path} className={`tab ${file.path === activePath ? 'active' : ''}`} onClick={() => setActivePath(file.path)}>
                <span className="file-icon">{iconFor(file.name, 'file')}</span>
                <span>{file.name}</span>
                {file.dirty && <span className="dirty-dot" />}
              </button>
            ))}
          </div>
          <div className="editor-host" ref={editorHost}>
            {!activeFile && (
              <div className="welcome-overlay">
                <div className="forge-glyph">⌘</div>
                <h1>Forge something.</h1>
                <p>Open a project and start writing code.</p>
                <div className="welcome-actions">
                  <button className="primary-button" onClick={() => void openProject()}>Open Folder</button>
                  <span>Ctrl + S saves the active file</span>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="statusbar">
        <span>{status}</span>
        <span>{activeFile ? `${activeFile.language} · ${activeFile.dirty ? 'Modified' : 'Saved'}` : 'No file selected'}</span>
      </footer>
    </div>
  )
}
