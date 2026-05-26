import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import { pathToFileURL } from "url"

let injected = false

const BASE_SKILLS = new Set(["caveman", "karpathy-guidelines", "auto-skill-select", "superpowers"])
const SKILLS_DIR = join(homedir(), ".agents/skills/auto-skill-select")
const SKILL_MATCHER = join(SKILLS_DIR, "scripts/skill-matcher.js")
const SKILLS_INDEX = join(SKILLS_DIR, ".skills-index.json")

const REPLACEMENT =
  "Skills are auto-matched by the auto-skill-select plugin and injected into context. " +
  "You can still load additional skills manually via the skill tool."

const SKILLS_RE = /<available_skills>[\s\S]*?<\/available_skills>/g

function stripParts(parts) {
  for (const p of parts) {
    if (p.type === "text" && SKILLS_RE.test(p.text)) {
      SKILLS_RE.lastIndex = 0
      p.text = p.text.replace(SKILLS_RE, REPLACEMENT)
    }
  }
}

export const AutoSkillHook = async ({ client }) => {
  return {
    "experimental.chat.system.transform": async (_input, output) => {
      if (typeof output.system === "string" && SKILLS_RE.test(output.system)) {
        SKILLS_RE.lastIndex = 0
        output.system = output.system.replace(SKILLS_RE, REPLACEMENT)
      }
    },

    "experimental.chat.messages.transform": async (_input, output) => {
      if (!output?.messages?.length) return

      for (const msg of output.messages) {
        if (msg.info?.role === "system" && msg.parts?.length) {
          stripParts(msg.parts)
        }
      }

      if (injected) return
      injected = true

      if (!existsSync(SKILLS_INDEX) || !existsSync(SKILL_MATCHER)) return

      try {
        const firstUser = output.messages.find(
          (m) => m.info?.role === "user" && m.parts?.length
        )
        if (!firstUser) return
        const userText = firstUser.parts.find((p) => p.type === "text")?.text?.trim()
        if (!userText) return

        const { loadSkills, score } = await import(pathToFileURL(SKILL_MATCHER).href)
        const allSkills = loadSkills(SKILLS_INDEX)
        if (!allSkills?.length) return

        const results = score(allSkills, userText)
        const matched = results.filter(
          (r) => r.score >= 70 && !BASE_SKILLS.has(r.name)
        )
        if (!matched.length) return

        const skillMessages = []
        for (const m of matched) {
          const skill = allSkills.find((s) => s.name === m.name)
          if (!skill?.path || !existsSync(skill.path)) continue
          skillMessages.push({
            info: { role: "system" },
            parts: [{ type: "text", text: `[auto-loaded skill: ${m.name} (score: ${m.score}/100)]\n\n${readFileSync(skill.path, "utf8")}` }]
          })
        }

        if (!skillMessages.length) return
        output.messages.unshift(...skillMessages)
      } catch (_) {}
    }
  }
}

export default AutoSkillHook
