import type { Anthropic } from "@anthropic-ai/sdk"

/**
 * Filters out image blocks from messages since Codex CLI doesn't support images.
 * Replaces image blocks with text placeholders similar to Claude Code handling.
 */
export function filterMessagesForCodexCli(
	messages: Anthropic.Messages.MessageParam[],
): Anthropic.Messages.MessageParam[] {
	return messages.map((message) => {
		if (typeof message.content === "string") {
			return message
		}

		const filteredContent = message.content.map((block) => {
			if (block.type === "image") {
				const sourceType = block.source?.type || "unknown"
				const mediaType = block.source && "media_type" in block.source ? block.source.media_type : "unknown"
				return {
					type: "text" as const,
					text: `[Image (${sourceType}): ${mediaType} not supported by Codex CLI]`,
				}
			}

			return block
		})

		return {
			...message,
			content: filteredContent,
		}
	})
}
