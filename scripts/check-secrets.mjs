import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)

const patterns = [
  { name: 'Supabase personal access token', regex: /\bsbp_[A-Za-z0-9]{20,}\b/ },
  { name: 'Supabase service secret key', regex: /\bsb_secret_[A-Za-z0-9_\-]{20,}\b/ },
  { name: 'credentialed PostgreSQL URL', regex: /postgres(?:ql)?:\/\/[^:\s/]+:[^@\s]+@/ },
  { name: 'JWT-like token', regex: /\beyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/ },
  { name: 'private key block', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
]

let failures = 0
for (const file of new Set(files)) {
  let buffer
  try { buffer = readFileSync(file) } catch { continue }
  if (buffer.includes(0)) continue
  const content = buffer.toString('utf8')
  for (const pattern of patterns) {
    if (!pattern.regex.test(content)) continue
    const line = content.slice(0, content.search(pattern.regex)).split('\n').length
    console.error(`${file}:${line}: ${pattern.name} topildi`)
    failures += 1
  }
}
if (failures > 0) { console.error(`Secret scan muvaffaqiyatsiz: ${failures} ta topilma`); process.exit(1) }
console.log('Secret scan: toza')
