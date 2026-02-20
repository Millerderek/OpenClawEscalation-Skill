# openclaw-escalation

A drop-in skill for [OpenClaw](https://github.com/openclaw) that allows the primary AI model (Kimi K2.5) to escalate complex tasks to a more powerful model — without switching the default model or disrupting the existing agent setup.

When the primary model determines a task exceeds its capabilities, it calls the escalation tool, which routes the task to the best available model, tracks token spend per session, and automatically falls back to the next model in the chain if the preferred one is over budget or unavailable.

---

## How it works

1. Kimi K2.5 identifies a task as too complex and calls `escalate_to_powerful_model`
2. It selects the best target model and rates the task complexity (`low` / `medium` / `high`)
3. The handler checks whether the target model has enough token budget remaining for the session
4. If budget is sufficient, the task is sent to that model and the result is returned to Kimi
5. If the model is over budget or fails, the handler automatically tries the next model in the fallback chain
6. Token usage and escalation count are recorded in the session JSONL file and persist across restarts

---

## Fallback chain

| Priority | Model | Best for |
|----------|-------|----------|
| 1 | `claude-opus-4-6` | Deep reasoning, complex debugging, multi-step analysis |
| 2 | `gemini-2.0-pro` | Long context, document analysis, multimodal |
| 3 | `gpt-4o` | Structured output, JSON schema, precise code generation |

---

## File structure

```
openclaw-escalation/
├── tools/
│   ├── escalateToPowerfulModel.js          # Main handler
│   └── escalateToPowerfulModel.tool.json   # Tool definition for OpenClaw config
├── dispatch.js                             # Wiring example for tool dispatch
├── system-prompt-addition.txt              # Add this to Kimi's system prompt
├── AgentInstallInstructions.txt            # Step-by-step install guide for agents
├── .env.example                            # Environment variable template
├── package.json
└── CHANGELOG.md
```

---

## Quick start

1. Copy `tools/escalateToPowerfulModel.js` into your OpenClaw tools directory
2. Add the contents of `tools/escalateToPowerfulModel.tool.json` to your tools array
3. Merge `dispatch.js` into your existing tool dispatch logic
4. Copy `.env.example` to `.env` and fill in your API keys
5. Append `system-prompt-addition.txt` to Kimi's system prompt
6. Run `npm install`

See `AgentInstallInstructions.txt` for detailed step-by-step instructions written for an AI agent to follow.

---

## Configuration

### Budget limits

Edit `MODEL_TOKEN_BUDGETS` in `tools/escalateToPowerfulModel.js` to match your API limits:

```js
const MODEL_TOKEN_BUDGETS = {
  "claude-opus-4-6": 50000,  // output tokens per session
  "gemini-2.0-pro":  80000,
  "gpt-4o":          40000,
};
```

### Escalation limit

Default is 3 escalations per session. Change `ESCALATION_LIMIT` in the handler to adjust.

### Disabling a model

Remove its key from `.env` and its entry from the `enum` in `escalateToPowerfulModel.tool.json`.

---

## Session persistence

Escalations are recorded as `escalation_used` events directly in OpenClaw's session JSONL files at:

```
~/.openclaw/agents/main/sessions/<session-id>.jsonl
```

Token counts survive process restarts. To audit usage:

```bash
# All escalations across all sessions
grep -r "escalation_used" ~/.openclaw/agents/main/sessions/

# Token spend for a specific session
grep "escalation_used" ~/.openclaw/agents/main/sessions/<session-id>.jsonl
```

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | If using Claude | From [console.anthropic.com](https://console.anthropic.com) |
| `GEMINI_API_KEY` | If using Gemini | From [aistudio.google.com](https://aistudio.google.com) |
| `OPENAI_API_KEY` | If using GPT-4o | From [platform.openai.com](https://platform.openai.com) |

---

## License

MIT
