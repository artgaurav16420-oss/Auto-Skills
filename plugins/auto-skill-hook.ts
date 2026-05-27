import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import { pathToFileURL } from "url"

let injected: boolean = false

const BASE_SKILLS: Set<string> = new Set(["caveman", "karpathy-guidelines", "auto-skill-select", "superpowers"])
const SKILLS_DIR: string = join(homedir(), ".agents/skills/auto-skill-select")
const SKILL_MATCHER: string = join(SKILLS_DIR, "scripts/skill-matcher.js")
const SKILLS_INDEX: string = join(SKILLS_DIR, ".skills-index.json")
const AUTO_SKILL_SKILL: string = join(SKILLS_DIR, "SKILL.md")

let _autoSkillContent: string | null | undefined = undefined

function getAutoSkillContent(): string | null {
  if (_autoSkillContent !== undefined) return _autoSkillContent
  if (!existsSync(AUTO_SKILL_SKILL)) {
    _autoSkillContent = null
    return null
  }
  const content: string = readFileSync(AUTO_SKILL_SKILL, "utf8")
  _autoSkillContent = `<!-- auto-skill-select-loaded -->
<EXTREMELY_IMPORTANT>
You have auto-skill-select. Follow its workflow before every task.

**IMPORTANT: The auto-skill-select skill content is included below. It is ALREADY LOADED - you are currently following it. Do NOT use the skill tool to load "auto-skill-select" again - that would be redundant.**

${content}
</EXTREMELY_IMPORTANT>`
  return _autoSkillContent
}

async function getSkillInjections(userText: string): Promise<string[] | null> {
  if (!existsSync(SKILLS_INDEX) || !existsSync(SKILL_MATCHER)) return null
  try {
    const { loadSkills, score } = await import(pathToFileURL(SKILL_MATCHER).href) as { loadSkills: Function; score: Function }
    const allSkills: any[] = loadSkills(SKILLS_INDEX)
    if (!allSkills?.length) return null
    const results: any[] = score(allSkills, userText)
    const matched: any[] = results.filter(
      (r: any) => r.score >= 70 && !BASE_SKILLS.has(r.name)
    )
    if (!matched.length) return null
    const parts: string[] = []
    for (const m of matched) {
      const skill: any = allSkills.find((s: any) => s.name === m.name)
      if (!skill?.path || !existsSync(skill.path)) continue
      parts.push(`[auto-loaded skill: ${m.name} (score: ${m.score}/100)]\n\n${readFileSync(skill.path, "utf8")}`)
    }
    return parts.length ? parts : null
  } catch (e) {
    console.error("[auto-skill-hook] injection error:", e)
    return null
  }
}

export const AutoSkillHook = async (): Promise<Record<string, Function>> => {
  return {
    "experimental.chat.messages.transform": async (_input: any, output: any) => {
      if (!output?.messages?.length || injected) return

      const firstUser: any = output.messages.find((m: any) => m.info?.role === "user")
      if (!firstUser || !firstUser.parts?.length) return

      const textPart: any = firstUser.parts.find((p: any) => p.type === "text")
      if (!textPart) return

      if (textPart.text.includes("<!-- auto-skill-select-loaded -->")) return

      const autoContent: string | null = getAutoSkillContent()
      if (!autoContent) return

      const injections: string[] = [autoContent]
      const taskInjections: string[] | null = await getSkillInjections(textPart.text)
      if (taskInjections) {
        injections.push(...taskInjections)
      }

      injected = true
      firstUser.parts.unshift({ type: "text", text: injections.join("\n\n") })
    }
  }
}

export default AutoSkillHook
