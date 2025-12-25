import { CodexCliHandler } from "../codex-cli"
import { ApiHandlerOptions } from "../../../shared/api"
import { calculateApiCostOpenAI } from "../../../shared/cost"

vi.mock("../../../integrations/codex/run", () => ({
	runCodexExec: vi.fn(),
}))

const { runCodexExec } = await import("../../../integrations/codex/run")
const mockRunCodexExec = vi.mocked(runCodexExec)

describe("CodexCliHandler", () => {
	let handler: CodexCliHandler

	beforeEach(() => {
		vi.clearAllMocks()
		const options: ApiHandlerOptions = {
			codexCliPath: "codex",
			apiModelId: "gpt-5.1-codex",
		}
		handler = new CodexCliHandler(options)
	})

	test("should use configured model when valid", () => {
		const model = handler.getModel()
		expect(model.id).toBe("gpt-5.1-codex")
		expect(model.info.supportsImages).toBe(false)
	})

	test("should fall back to default model when invalid", () => {
		const options: ApiHandlerOptions = {
			codexCliPath: "codex",
			apiModelId: "invalid-model",
		}
		const handlerWithInvalidModel = new CodexCliHandler(options)
		const model = handlerWithInvalidModel.getModel()

		expect(model.id).toBe("gpt-5.1-codex-max")
	})

	test("should call runCodexExec with prompt and model", async () => {
		const systemPrompt = "You are a helpful assistant."
		const messages = [
			{ role: "user" as const, content: "Hello" },
			{ role: "assistant" as const, content: "Hi there" },
		]

		const mockGenerator = async function* (): AsyncGenerator<Record<string, unknown>> {}
		mockRunCodexExec.mockReturnValue(mockGenerator())

		const stream = handler.createMessage(systemPrompt, messages)
		const iterator = stream[Symbol.asyncIterator]()
		await iterator.next()

		expect(mockRunCodexExec).toHaveBeenCalledWith({
			prompt: "System: You are a helpful assistant.\n\nUser: Hello\n\nAssistant: Hi there",
			path: "codex",
			modelId: "gpt-5.1-codex",
		})
	})

	test("should stream text deltas", async () => {
		const systemPrompt = "System prompt"
		const messages = [{ role: "user" as const, content: "Hello" }]

		const mockGenerator = async function* (): AsyncGenerator<Record<string, unknown>> {
			yield { type: "response.output_text.delta", delta: "Hello from Codex" }
		}
		mockRunCodexExec.mockReturnValue(mockGenerator())

		const stream = handler.createMessage(systemPrompt, messages)
		const results = []

		for await (const chunk of stream) {
			results.push(chunk)
		}

		expect(results).toEqual([{ type: "text", text: "Hello from Codex" }])
	})

	test("should stream tool call deltas", async () => {
		const systemPrompt = "System prompt"
		const messages = [{ role: "user" as const, content: "Run tool" }]

		const mockGenerator = async function* (): AsyncGenerator<Record<string, unknown>> {
			yield {
				type: "response.tool_call_arguments.delta",
				index: 0,
				call_id: "call-1",
				name: "run_command",
				delta: '{"command":"ls"}',
			}
		}
		mockRunCodexExec.mockReturnValue(mockGenerator())

		const stream = handler.createMessage(systemPrompt, messages)
		const results = []

		for await (const chunk of stream) {
			results.push(chunk)
		}

		expect(results).toEqual([
			{
				type: "tool_call_partial",
				index: 0,
				id: "call-1",
				name: "run_command",
				arguments: '{"command":"ls"}',
			},
		])
	})

	test("should emit usage chunks", async () => {
		const systemPrompt = "System prompt"
		const messages = [{ role: "user" as const, content: "Hello" }]

		const mockGenerator = async function* (): AsyncGenerator<Record<string, unknown>> {
			yield {
				type: "response.completed",
				usage: {
					input_tokens: 10,
					output_tokens: 5,
				},
			}
		}
		mockRunCodexExec.mockReturnValue(mockGenerator())

		const stream = handler.createMessage(systemPrompt, messages)
		const results = []

		for await (const chunk of stream) {
			results.push(chunk)
		}

		const { totalCost } = calculateApiCostOpenAI(handler.getModel().info, 10, 5, 0, 0)

		expect(results).toEqual([
			{
				type: "usage",
				inputTokens: 10,
				outputTokens: 5,
				cacheWriteTokens: undefined,
				cacheReadTokens: undefined,
				reasoningTokens: undefined,
				totalCost,
			},
		])
	})

	test("should throw on error events", async () => {
		const systemPrompt = "System prompt"
		const messages = [{ role: "user" as const, content: "Hello" }]

		const mockGenerator = async function* (): AsyncGenerator<Record<string, unknown>> {
			yield {
				type: "response.error",
				error: { message: "Bad request" },
			}
		}
		mockRunCodexExec.mockReturnValue(mockGenerator())

		const stream = handler.createMessage(systemPrompt, messages)
		const iterator = stream[Symbol.asyncIterator]()

		await expect(iterator.next()).rejects.toThrow("Bad request")
	})
})
