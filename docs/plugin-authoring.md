# Plugin Authoring Guide

Auto-skill-select supports OpenCode plugins for extending skill loading behavior.

## Building

```bash
npm run build:plugin
```

Compiles TypeScript from `plugins/` to `plugins/dist/` using `tsconfig.plugin.json`.

## Loading in OpenCode

Reference the compiled output in your OpenCode configuration:

```json
{
  "plugins": [
    "./plugins/dist/auto-skill-hook.js"
  ]
}
```

## Plugin Hook API Surface

Plugins use the standard OpenCode plugin transform pattern:

```typescript
// Transform executed on each chat message
export const AutoSkillHook = async () => {
  return {
    "experimental.chat.messages.transform": async (input, output) => {
      // Modify output.messages before they reach the model
    }
  }
}
```

## Minimal Working Template

```typescript
export const MyPlugin = async () => {
  return {
    "experimental.chat.messages.transform": async (_input, output) => {
      if (!output?.messages?.length) return;
      // Your transform logic here
    }
  }
}

export default MyPlugin
```
