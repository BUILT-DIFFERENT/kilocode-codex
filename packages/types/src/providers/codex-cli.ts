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
