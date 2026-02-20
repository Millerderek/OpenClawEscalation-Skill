# Changelog

All notable changes to openclaw-escalation will be documented here.

---

## [1.0.0] — 2026-02-19

### Added
- Initial release
- `escalate_to_powerful_model` tool definition and handler
- Support for Claude Opus 4.6, Gemini 2.0 Pro, and GPT-4o as escalation targets
- Per-model token budget tracking persisted in OpenClaw session JSONL
- Task complexity estimation (`low` / `medium` / `high`) for pre-flight budget checks
- Automatic fallback chain: Claude Opus → Gemini 2.0 Pro → GPT-4o
- Escalation limit per session (default: 3) with persistent count in session JSONL
- `downgraded` flag in response payload when fallback model was used
- Session-aware dispatch wiring example
- System prompt addition for Kimi K2.5
- Agent install instructions
