import type { Plugin } from "@opencode-ai/plugin"
import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { homedir } from "os"

let injected = false
let systemStripped = false

const BASE_SKILLS = new Set(["caveman", "karpathy-guidelines", "auto-skill-select", "superpowers"])
const SKILLS_DIR = join(homedir(), ".agents/skills/auto-skill-select")
const SKILL_MATCHER = join(SKILLS_DIR, "scripts/skill-matcher.js")
const SKILLS_INDEX = join(SKILLS_DIR, ".skills-index.json")

const AVAILABLE_SKILLS_REPLACEMENT =
  "Skills are auto-matched by the auto-skill-select plugin and injected into context. " +
  "You can still load additional skills manually via the skill tool."

export default (async () => {
  return {
    "experimental.chat.system.transform": (system: string | any[]) => {
      if (systemStripped) return system
      systemStripped = true

      if (typeof system === "string") {
        const start = system.indexOf("<available_skills>")
        const end = system.indexOf("</available_skills>")
        if (start !== -1 && end !== -1) {
          return (
            system.slice(0, start) +
            AVAILABLE_SKILLS_REPLACEMENT +
            system.slice(end + "</available_skills>".length)
          )
        }
        return system
      }

      if (Array.isArray(system)) {
        return system.map((msg) => {
          if (typeof msg.content === "string" && msg.content.includes("<available_skills>")) {
            const start = msg.content.indexOf("<available_skills>")
            const end = msg.content.indexOf("</available_skills>")
            if (start !== -1 && end !== -1) {
              return {
                ...msg,
                content:
                  msg.content.slice(0, start) +
                  AVAILABLE_SKILLS_REPLACEMENT +
                  msg.content.slice(end + "</available_skills>".length),
              }
            }
          }
          return msg
        })
      }

      return system
    },

    "experimental.chat.messages.transform": (messages: any[]) => {
      if (injected) return messages
      injected = true

      if (!existsSync(SKILLS_INDEX) || !existsSync(SKILL_MATCHER)) return messages

      try {
        const firstUser = messages.find(
          (m: any) => m.role === "user" && typeof m.content === "string" && m.content.trim()
        )
        if (!firstUser) return messages

        const { loadSkills, score } = require(SKILL_MATCHER)
        const allSkills = loadSkills(SKILLS_INDEX)
        if (!allSkills.length) return messages

        const results = score(allSkills, firstUser.content)
        const matched = results.filter(
          (r: any) => r.score >= 70 && !BASE_SKILLS.has(r.name)
        )
        if (!matched.length) return messages

        const skillMessages: any[] = []
        for (const m of matched) {
          const skill = allSkills.find((s: any) => s.name === m.name)
          if (!skill?.path || !existsSync(skill.path)) continue
          const content = readFileSync(skill.path, "utf8")
          skillMessages.push({
            role: "system",
            content: `[auto-loaded skill: ${m.name} (score: ${m.score}/100)]\n\n${content}`,
          })
        }

        if (!skillMessages.length) return messages
        return [...skillMessages, ...messages]
      } catch {
        return messages
      }
    },
  }
}) satisfies Plugin
