import { readFileSync, existsSync } from "fs"
import { join, dirname } from "path"
import { homedir } from "os"
import { fileURLToPath } from "url"
import { createRequire } from "module"

const __dirname = dirname(fileURLToPath(import.meta.url))
const _require = createRequire(import.meta.url)

let injected = false

const BASE_SKILLS = new Set(["caveman", "karpathy-guidelines", "auto-skill-select", "superpowers"])
const SKILLS_DIR = join(homedir(), ".agents/skills/auto-skill-select")
const SKILL_MATCHER = join(SKILLS_DIR, "scripts/skill-matcher.js")
const SKILLS_INDEX = join(SKILLS_DIR, ".skills-index.json")

const AVAILABLE_SKILLS_REPLACEMENT =
  "Skills are auto-matched by the auto-skill-select plugin and injected into context. " +
  "You can still load additional skills manually via the skill tool."

function stripAvailableSkillsFromMessage(msg) {
  if (msg.info?.role !== "system" || !msg.parts?.length) return false
  let modified = false
  for (let i = 0; i < msg.parts.length; i++) {
    const p = msg.parts[i]
    if (p.type === "text" && p.text.includes("<available_skills>")) {
      p.text = p.text.replace(
        /<available_skills>[\s\S]*?<\/available_skills>/g,
        AVAILABLE_SKILLS_REPLACEMENT
      )
      modified = true
    }
  }
  return modified
}

export const AutoSkillHook = async ({ client }) => {
  return {
    "experimental.chat.messages.transform": async (_input, output) => {
      if (!output?.messages?.length) return

      // 1. Strip <available_skills> from every system message (every turn)
      let strippedAny = false
      for (const msg of output.messages) {
        if (stripAvailableSkillsFromMessage(msg)) strippedAny = true
      }
      if (strippedAny && client?.app?.log) {
        await client.app.log({
          body: { service: "auto-skill-hook", level: "info", message: "Stripped <available_skills> from system prompt" }
        })
      }

      // 2. Auto-load matched skills (one shot, on first user message)
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

        const { loadSkills, score } = _require(SKILL_MATCHER)
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
          const content = readFileSync(skill.path, "utf8")
          skillMessages.push({
            info: { role: "system" },
            parts: [{ type: "text", text: `[auto-loaded skill: ${m.name} (score: ${m.score}/100)]\n\n${content}` }]
          })
        }

        if (!skillMessages.length) return
        output.messages.unshift(...skillMessages)

        if (client?.app?.log) {
          await client.app.log({
            body: { service: "auto-skill-hook", level: "info", message: `Auto-loaded ${skillMessages.length} skill(s): ${matched.map(m => m.name).join(", ")}` }
          })
        }
      } catch (err) {
        if (client?.app?.log) {
          await client.app.log({
            body: { service: "auto-skill-hook", level: "error", message: `Skill injection failed: ${err.message}`, extra: { stack: err.stack } }
          })
        }
      }
    }
  }
}
