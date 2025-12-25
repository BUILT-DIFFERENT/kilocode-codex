import type { Anthropic } from "@anthropic-ai/sdk"
import { codexCliDefaultModelId, codexCliModels, type CodexCliModelId, type ModelInfo } from "@roo-code/types"

import type { ApiHandler, ApiHandlerCreateMessageMetadata } from "../index"
import type { ApiStream } from "../transform/stream"
import { runCodexExec } from "../../integrations/codex/run"
import type { ApiHandlerOptions } from "../../shared/api"
import { convertToSimpleMessages } from "../transform/simple-format"
import { calculateApiCostOpenAI } from "../../shared/cost"
import { BaseProvider } from "./base-provider"

type CodexCliEvent = Record<string, any>

export class CodexCliHandler extends BaseProvider implements ApiHandler {
	private options: ApiHandlerOptions

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options
	}

	async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		_metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		const model = this.getModel()
		const prompt = buildCodexPrompt(systemPrompt, messages)

		for await (const event of runCodexExec({
			prompt,
			path: this.options.codexCliPath,
			modelId: model.id,
		})) {
			const errorMessage = getCodexError(event)
			if (errorMessage) {
				throw new Error(errorMessage)
			}

			yield* this.processEvent(event, model.info)
		}
	}

	getModel(): { id: string; info: ModelInfo } {
		const modelId = this.options.apiModelId

		if (modelId && modelId in codexCliModels) {
			return { id: modelId as CodexCliModelId, info: codexCliModels[modelId as CodexCliModelId] }
		}

		return { id: codexCliDefaultModelId, info: codexCliModels[codexCliDefaultModelId] }
	}

	private async *processEvent(event: CodexCliEvent, modelInfo: ModelInfo): ApiStream {
		if (event?.type === "response.text.delta" || event?.type === "response.output_text.delta") {
			if (event?.delta) {
				yield { type: "text", text: event.delta }
			}
			return
		}

		if (
			event?.type === "response.reasoning.delta" ||
			event?.type === "response.reasoning_text.delta" ||
			event?.type === "response.reasoning_summary.delta" ||
			event?.type === "response.reasoning_summary_text.delta"
		) {
			if (event?.delta) {
				yield { type: "reasoning", text: event.delta }
			}
			return
		}

		if (
			event?.type === "response.tool_call_arguments.delta" ||
			event?.type === "response.function_call_arguments.delta"
		) {
			const callId = event.call_id || event.tool_call_id || event.id
			const name = event.name || event.function_name
			const args = event.delta || event.arguments

			yield {
				type: "tool_call_partial",
				index: event.index ?? 0,
				id: callId,
				name,
				arguments: args,
			}
			return
		}

		if (event?.type === "response.output_item.added" || event?.type === "response.output_item.done") {
			const item = event?.item
			if (item) {
				if (item.type === "text" && item.text) {
					yield { type: "text", text: item.text }
				} else if (item.type === "reasoning" && item.text) {
					yield { type: "reasoning", text: item.text }
				} else if (item.type === "message" && Array.isArray(item.content)) {
					for (const content of item.content) {
						if ((content?.type === "text" || content?.type === "output_text") && content?.text) {
							yield { type: "text", text: content.text }
						}
					}
				}
			}
			return
		}

		if (event?.type === "response.done" || event?.type === "response.completed") {
			const usageData = this.normalizeUsage(event?.response?.usage || event?.usage, modelInfo)
			if (usageData) {
				yield usageData
			}
			return
		}

		if (event?.choices?.[0]?.delta?.content) {
			yield { type: "text", text: event.choices[0].delta.content }
			return
		}

		if (event?.item && typeof event.item.text === "string" && event.item.text.length > 0) {
			yield { type: "text", text: event.item.text }
			return
		}

		if (event?.message?.content) {
			const content = event.message.content
			if (typeof content === "string" && content.length > 0) {
				yield { type: "text", text: content }
				return
			}
		}

		if (event?.text && typeof event.text === "string") {
			yield { type: "text", text: event.text }
			return
		}

		const usageData = this.normalizeUsage(event?.response?.usage || event?.usage, modelInfo)
		if (usageData) {
			yield usageData
		}
	}

	private normalizeUsage(usage: any, modelInfo: ModelInfo) {
		if (!usage) {
			return undefined
		}

		const inputDetails = usage.input_tokens_details ?? usage.prompt_tokens_details
		const cachedTokens = inputDetails?.cached_tokens ?? 0
		const cacheMissTokens = inputDetails?.cache_miss_tokens ?? 0

		let inputTokens = usage.input_tokens ?? usage.prompt_tokens ?? 0
		if (inputTokens === 0 && (cachedTokens > 0 || cacheMissTokens > 0)) {
			inputTokens = cachedTokens + cacheMissTokens
		}

		const outputTokens = usage.output_tokens ?? usage.completion_tokens ?? 0
		const cacheWriteTokens = usage.cache_creation_input_tokens ?? usage.cache_write_tokens ?? 0
		const cacheReadTokens =
			usage.cache_read_input_tokens ?? usage.cache_read_tokens ?? usage.cached_tokens ?? cachedTokens ?? 0

		const { totalCost } = calculateApiCostOpenAI(
			modelInfo,
			inputTokens,
			outputTokens,
			cacheWriteTokens,
			cacheReadTokens,
		)

		const reasoningTokens =
			typeof usage.output_tokens_details?.reasoning_tokens === "number"
				? usage.output_tokens_details.reasoning_tokens
				: undefined

		return {
			type: "usage" as const,
			inputTokens,
			outputTokens,
			cacheWriteTokens: cacheWriteTokens || undefined,
			cacheReadTokens: cacheReadTokens || undefined,
			reasoningTokens,
			totalCost,
		}
	}
}

function buildCodexPrompt(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]) {
	const parts: string[] = []
	const trimmedSystem = systemPrompt?.trim()

	if (trimmedSystem) {
		parts.push(`System: ${trimmedSystem}`)
	}

	for (const message of convertToSimpleMessages(messages)) {
		if (!message.content) {
			continue
		}

		const roleLabel = message.role === "assistant" ? "Assistant" : "User"
		parts.push(`${roleLabel}: ${message.content}`)
	}

	return parts.join("\n\n")
}

function getCodexError(event: CodexCliEvent): string | null {
	if (!event) {
		return null
	}

	const type = typeof event.type === "string" ? event.type : ""
	const hasErrorType = type.includes("error")
	const errorPayload = event.error ?? event

	if (hasErrorType || event.status === "error" || event.error) {
		if (typeof errorPayload === "string") {
			return errorPayload
		}
		if (errorPayload?.message) {
			return errorPayload.message
		}
		if (event.message && typeof event.message === "string") {
			return event.message
		}
		return "Codex CLI returned an error."
	}

	return null
}
