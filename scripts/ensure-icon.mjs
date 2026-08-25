import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

// Generate a small, valid 32-bit Windows ICO without external dependencies.
const size = 32
const rowBytes = size * 4
const xorBytes = rowBytes * size
const maskRowBytes = 4
const maskBytes = maskRowBytes * size
const dibBytes = 40 + xorBytes + maskBytes
const ico = Buffer.alloc(6 + 16 + dibBytes)

// ICO header
ico.writeUInt16LE(0, 0)
ico.writeUInt16LE(1, 2)
ico.writeUInt16LE(1, 4)

// Directory entry
ico[6] = size
ico[7] = size
ico[8] = 0
ico[9] = 0
ico.writeUInt16LE(1, 10)
ico.writeUInt16LE(32, 12)
ico.writeUInt32LE(dibBytes, 14)
ico.writeUInt32LE(22, 18)

const dib = 22
ico.writeUInt32LE(40, dib)
ico.writeInt32LE(size, dib + 4)
ico.writeInt32LE(size * 2, dib + 8)
ico.writeUInt16LE(1, dib + 12)
ico.writeUInt16LE(32, dib + 14)
ico.writeUInt32LE(0, dib + 16)
ico.writeUInt32LE(xorBytes, dib + 20)
ico.writeInt32LE(0, dib + 24)
ico.writeInt32LE(0, dib + 28)
ico.writeUInt32LE(0, dib + 32)
ico.writeUInt32LE(0, dib + 36)

// CodeForge-style blue outlined square with a dark center.
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const border = x < 4 || x >= 28 || y < 4 || y >= 28
    const inner = x >= 10 && x < 22 && y >= 10 && y < 22
    const blue = border || !inner
    const r = blue ? 70 : 18
    const g = blue ? 180 : 22
    const b = blue ? 255 : 32
    const offset = dib + 40 + (size - 1 - y) * rowBytes + x * 4
    ico[offset] = b
    ico[offset + 1] = g
    ico[offset + 2] = r
    ico[offset + 3] = 255
  }
}

const iconPath = resolve('src-tauri/icons/icon.ico')
await mkdir(dirname(iconPath), { recursive: true })
await writeFile(iconPath, ico)
console.log(`Generated valid Windows icon: ${iconPath}`)
