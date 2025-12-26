import type { ModelInfo } from "../model.js"
import { openAiNativeModels } from "./openai.js"

export type CodexCliModelId = "gpt-5.1-codex-max" | "gpt-5.1-codex" | "gpt-5.1-codex-mini"

export const codexCliDefaultModelId: CodexCliModelId = "gpt-5.1-codex-max"

export const codexCliModels = {
	"gpt-5.1-codex-max": {
		...openAiNativeModels["gpt-5.1-codex-max"],
		supportsImages: false,
	},
	"gpt-5.1-codex": {
		...openAiNativeModels["gpt-5.1-codex"],
		supportsImages: false,
	},
	"gpt-5.1-codex-mini": {
		...openAiNativeModels["gpt-5.1-codex-mini"],
		supportsImages: false,
	},
} as const satisfies Record<CodexCliModelId, ModelInfo>

export type CodexCliTextContent = {
	type: "text"
	text: string
}

export type CodexCliToolUseContent = {
	type: "tool_use"
	id?: string
	name: string
	input: unknown
}

export type CodexCliToolResultContent = {
	type: "tool_result"
	tool_use_id?: string
	content: string | CodexCliTextContent[]
}

export type CodexCliMessageContent = CodexCliTextContent | CodexCliToolUseContent | CodexCliToolResultContent

export type CodexCliMessage = {
	role: "user" | "assistant"
	content: string | CodexCliMessageContent[]
}

export type CodexCliMessagePayload = {
	systemPrompt?: string
	messages: CodexCliMessage[]
}
