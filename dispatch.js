// dispatch.js
// Add this to your existing OpenClaw tool dispatch logic.
// This file shows only the escalation-relevant wiring — merge it into your existing dispatcher.

import { deriveSessionKey, resolveSessionKey } from "/usr/lib/node_modules/openclaw/dist/sessions-CHz-yoEe.js";
import { handleEscalate } from "./tools/escalateToPowerfulModel.js";

// -------------------------------------------------------
// Session resolution
// Adjust agentId, contextType, and contextId to match
// how your OpenClaw instance derives its session key.
// -------------------------------------------------------

const sessionKey = deriveSessionKey(agentId, contextType, contextId);
const session = resolveSessionKey(sessionKey); // resolves to { id: "<uuid>", ... }

// -------------------------------------------------------
// Tool dispatch — add this case to your existing switch/if block
// -------------------------------------------------------

if (toolCall.name === "escalate_to_powerful_model") {
  const result = await handleEscalate(toolCall.input, session.id);

  toolResults.push({
    tool_use_id: toolCall.id,
    content: JSON.stringify(result),
  });
}
