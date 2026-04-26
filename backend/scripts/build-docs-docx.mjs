/**
 * Merges all markdown files under docs/ into a single .docx (Mermaid blocks replaced with a short note).
 * Run from the backend folder: npm run docs:docx
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import HTMLtoDOCX from 'html-to-docx'
import { marked } from 'marked'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '..', '..')
const docsDir = path.join(repoRoot, 'docs')
const outPath = path.join(docsDir, 'PayToday-Store-Documentation.docx')

const MERMAID_PLACEHOLDER =
  '\n\n> **Diagram (Mermaid):** omitted in this Word export. Open the corresponding `.md` file in the repository to view the diagram.\n\n'

function stripMermaidBlocks(md) {
  return md.replace(/```mermaid[\s\S]*?```/gi, MERMAID_PLACEHOLDER)
}

async function main() {
  const entries = await readdir(docsDir, { withFileTypes: true })
  const mdNames = entries.filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.md')).map((e) => e.name)

  const priority = ['PROJECT_HANDBOOK.md', 'README.md']
  const rest = mdNames.filter((n) => !priority.includes(n)).sort((a, b) => a.localeCompare(b, 'en'))
  const ordered = [...priority.filter((n) => mdNames.includes(n)), ...rest]

  let combinedMd =
    '# PayToday Store — combined documentation\n\n' +
    '_Single export generated from `docs/*.md`. Diagrams drawn in Mermaid are summarized in callouts._\n\n'

  for (const name of ordered) {
    const fp = path.join(docsDir, name)
    let body = await readFile(fp, 'utf8')
    body = stripMermaidBlocks(body)
    const label = name.replace(/\.md$/i, '')
    combinedMd += '\n\n<div class="page-break"></div>\n\n'
    combinedMd += `## Appendix: ${label}\n\n`
    combinedMd += `*Source: \`docs/${name}\`*\n\n`
    combinedMd += body.trimEnd()
    combinedMd += '\n'
  }

  marked.setOptions({ gfm: true })
  const html = await marked.parse(combinedMd)

  const buffer = await HTMLtoDOCX(
    `<div>${html}</div>`,
    null,
    {
      title: 'PayToday Store — documentation',
      subject: 'Merged markdown from docs/',
      creator: 'PayToday Store repository',
      keywords: ['PayToday', 'documentation', 'handbook'],
      description: `Combined ${ordered.length} markdown files from docs/`,
      font: 'Calibri',
      fontSize: 22,
    },
    null,
  )

  await writeFile(outPath, buffer)
  console.log(`Wrote ${outPath} (${ordered.length} sources)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
