import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import os from "os";

const ESCALATION_LIMIT = 3;
const SESSIONS_DIR = path.join(os.homedir(), ".openclaw", "agents", "main", "sessions");

// Per-model token spend soft limits (output tokens).
// Adjust these based on your actual API budgets.
const MODEL_TOKEN_BUDGETS = {
  "claude-opus-4-6": 50000,  // ~$37.50 at $15/MTok output
  "gemini-2.0-pro":  80000,  // generous — Gemini pricing is lower
  "gpt-4o":          40000,  // ~$24 at $60/MTok output
};

// Estimated output tokens by complexity level
const COMPLEXITY_TOKEN_ESTIMATE = {
  low:    500,
  medium: 2000,
  high:   4000,
};

// Fallback chain — order to try if preferred model is over budget or errors
const FALLBACK_CHAIN = ["claude-opus-4-6", "gemini-2.0-pro", "gpt-4o"];

// -------------------------------------------------------
// Session JSONL helpers
// -------------------------------------------------------

function readSessionEvents(sessionId) {
  const sessionFile = path.join(SESSIONS_DIR, `${sessionId}.jsonl`);
  if (!fs.existsSync(sessionFile)) return [];

  const lines = fs.readFileSync(sessionFile, "utf8").trim().split("\n");
  const events = [];
  for (const line of lines) {
    try { events.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return events;
}

function appendSessionEvent(sessionId, event) {
  const sessionFile = path.join(SESSIONS_DIR, `${sessionId}.jsonl`);
  fs.appendFileSync(sessionFile, JSON.stringify(event) + "\n", "utf8");
}

function getEscalationCount(events) {
  return events.filter(e => e.type === "escalation_used").length;
}

function getModelTokensUsed(events, model) {
  return events
    .filter(e => e.type === "escalation_used" && e.model === model)
    .reduce((sum, e) => sum + (e.tokens_used || 0), 0);
}

function modelHasBudget(events, model, complexity) {
  const budget = MODEL_TOKEN_BUDGETS[model];
  if (!budget) return true;
  const used = getModelTokensUsed(events, model);
  const needed = COMPLEXITY_TOKEN_ESTIMATE[complexity] || 2000;
  const headroom = budget - used;
  const hasBudget = headroom >= needed;
  if (!hasBudget) {
    console.log(
      `[Escalation] ${model} budget low: ${used}/${budget} tokens used, need ~${needed} more.`
    );
  }
  return hasBudget;
}

function recordEscalation(sessionId, model, reason, complexity, tokensUsed) {
  appendSessionEvent(sessionId, {
    type: "escalation_used",
    timestamp: new Date().toISOString(),
    model,
    reason,
    complexity,
    tokens_used: tokensUsed,
  });
}

// -------------------------------------------------------
// Main handler
// -------------------------------------------------------

export async function handleEscalate(input, sessionId) {
  const { task, reason, model: preferredModel, estimated_complexity: complexity } = input;

  if (!sessionId) {
    return { error: "No sessionId provided — cannot track escalation limits." };
  }

  const events = readSessionEvents(sessionId);
  const count = getEscalationCount(events);

  if (count >= ESCALATION_LIMIT) {
    return {
      error: `Escalation limit (${ESCALATION_LIMIT}) reached for this session. Handle the task yourself as best you can.`,
      model_used: null,
      escalations_remaining: 0,
    };
  }

  // Preferred model first, then fallback chain (deduped)
  const candidates = [
    preferredModel,
    ...FALLBACK_CHAIN.filter(m => m !== preferredModel),
  ];

  let lastError = null;

  for (const model of candidates) {
    if (!modelHasBudget(events, model, complexity)) {
      console.log(`[Escalation] Skipping ${model} — insufficient budget. Trying next.`);
      continue;
    }

    console.log(
      `[Escalation] Session: ${sessionId} | Trying: ${model} | Complexity: ${complexity} | Reason: ${reason}`
    );

    try {
      let response;
      let tokensUsed = 0;

      if (model === "claude-opus-4-6") {
        ({ response, tokensUsed } = await callClaude(task));
      } else if (model === "gemini-2.0-pro") {
        ({ response, tokensUsed } = await callGemini(task));
      } else if (model === "gpt-4o") {
        ({ response, tokensUsed } = await callGPT4o(task));
      } else {
        throw new Error(`Unknown escalation model: ${model}`);
      }

      recordEscalation(sessionId, model, reason, complexity, tokensUsed);
      const remaining = ESCALATION_LIMIT - (count + 1);
      const wasDowngraded = model !== preferredModel;

      return {
        model_used: model,
        preferred_model: preferredModel,
        downgraded: wasDowngraded,
        downgrade_reason: wasDowngraded ? "Preferred model over budget or unavailable" : null,
        escalation_reason: reason,
        complexity,
        tokens_used: tokensUsed,
        escalations_remaining: remaining,
        response,
      };
    } catch (err) {
      console.error(`[Escalation] ${model} failed: ${err.message}`);
      lastError = err;
    }
  }

  return {
    error: `All escalation models failed or over budget. Last error: ${lastError?.message}`,
    model_used: null,
  };
}

// -------------------------------------------------------
// Model callers
// -------------------------------------------------------

async function callClaude(task) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    system: "You are a highly capable AI. Answer thoroughly and precisely.",
    messages: [{ role: "user", content: task }],
  });
  return {
    response: res.content[0].text,
    tokensUsed: res.usage?.output_tokens || 0,
  };
}

async function callGemini(task) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-pro" });
  const result = await model.generateContent(task);
  const text = result.response.text();
  const tokensUsed = result.response.usageMetadata?.candidatesTokenCount || 0;
  return { response: text, tokensUsed };
}

async function callGPT4o(task) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 4096,
    messages: [
      { role: "system", content: "You are a highly capable AI. Answer thoroughly and precisely." },
      { role: "user", content: task },
    ],
  });
  return {
    response: res.choices[0].message.content,
    tokensUsed: res.usage?.completion_tokens || 0,
  };
}
