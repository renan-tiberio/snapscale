import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

export const repoPath = ({ relative }) => join(REPO_ROOT, relative)

export const readTextFile = ({ relative }) => {
  try {
    return readFileSync(repoPath({ relative }), 'utf8')
  } catch {
    return null
  }
}

export const listDirectory = ({ relative }) => {
  try {
    return readdirSync(repoPath({ relative })).toSorted()
  } catch {
    return null
  }
}

export const fileStats = ({ relative }) => {
  const source = readTextFile({ relative })
  if (source === null) return null
  const stats = statSync(repoPath({ relative }))
  return { lines: source.split('\n').length, bytes: stats.size }
}

export const git = ({ args }) => {
  try {
    const stdout = execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' })
    return { ok: true, stdout: stdout.trimEnd() }
  } catch (error) {
    return { ok: false, stdout: '', message: error.message }
  }
}

export const gitLines = ({ args }) => {
  const result = git({ args })
  if (!result.ok || result.stdout === '') return []
  return result.stdout.split('\n')
}

export const refExists = ({ ref }) => git({ args: ['rev-parse', '--verify', '--quiet', ref] }).ok
