import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.csv'])

function extensionOf(filename: string): string {
  const match = filename.toLowerCase().match(/\.[^.]+$/)
  return match?.[0] ?? ''
}

export async function extractText(filename: string, buffer: Buffer): Promise<string> {
  const ext = extensionOf(filename)

  if (TEXT_EXTENSIONS.has(ext) || filename.toLowerCase().endsWith('.text')) {
    return buffer.toString('utf8')
  }

  if (ext === '.pdf') {
    const parser = new PDFParse({ data: buffer })
    try {
      const result = await parser.getText()
      return result.text ?? ''
    } finally {
      await parser.destroy()
    }
  }

  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ buffer })
    return result.value ?? ''
  }

  throw new Error(`Unsupported file type: ${ext || 'unknown'}`)
}
