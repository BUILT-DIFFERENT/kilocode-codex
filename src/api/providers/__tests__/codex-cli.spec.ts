import { CodexCliHandler } from "../codex-cli"
import { ApiHandlerOptions } from "../../../shared/api"
import { calculateApiCostOpenAI } from "../../../shared/cost"

vi.mock("../../../integrations/codex/run", () => ({
	runCodexExec: vi.fn(),
	ensureCodexLogin: vi.fn(),
}))

const { runCodexExec, ensureCodexLogin } = await import("../../../integrations/codex/run")
const mockRunCodexExec = vi.mocked(runCodexExec)
const mockEnsureCodexLogin = vi.mocked(ensureCodexLogin)

describe("CodexCliHandler", () => {
	let handler: CodexCliHandler

	beforeEach(() => {
		vi.clearAllMocks()
		mockEnsureCodexLogin.mockResolvedValue()
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

	test("should use custom model when configured", () => {
		const options: ApiHandlerOptions = {
			codexCliPath: "codex",
			apiModelId: "custom-codex-model",
		}
		const handlerWithCustomModel = new CodexCliHandler(options)
		const model = handlerWithCustomModel.getModel()

		expect(model.id).toBe("custom-codex-model")
	})

	test("should fall back to default model when no model is provided", () => {
		const options: ApiHandlerOptions = {
			codexCliPath: "codex",
			apiModelId: "   ",
		}
		const handlerWithNoModel = new CodexCliHandler(options)
		const model = handlerWithNoModel.getModel()

		expect(model.id).toBe("gpt-5.1-codex-max")
	})

	test("should call runCodexExec with structured prompt and model", async () => {
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

		expect(mockEnsureCodexLogin).toHaveBeenCalledWith({ path: "codex", env: undefined })
		expect(mockRunCodexExec).toHaveBeenCalledWith({
			prompt: {
				systemPrompt: "You are a helpful assistant.",
				messages: [
					{ role: "user", content: "Hello" },
					{ role: "assistant", content: "Hi there" },
				],
			},
			path: "codex",
			modelId: "gpt-5.1-codex",
			outputSchema: undefined,
			sandbox: undefined,
			fullAuto: undefined,
			env: undefined,
		})
	})

	test("should pass Codex CLI overrides to runCodexExec", async () => {
		const options: ApiHandlerOptions = {
			codexCliPath: "codex",
			apiModelId: "gpt-5.1-codex",
			codexCliOutputSchema: "schema.json",
			codexCliSandbox: "docker",
			codexCliFullAuto: true,
		}
		handler = new CodexCliHandler(options)

		const mockGenerator = async function* (): AsyncGenerator<Record<string, unknown>> {}
		mockRunCodexExec.mockReturnValue(mockGenerator())

		const stream = handler.createMessage("Hello", [{ role: "user" as const, content: "Hi" }])
		const iterator = stream[Symbol.asyncIterator]()
		await iterator.next()

		expect(mockRunCodexExec).toHaveBeenCalledWith({
			prompt: {
				systemPrompt: "Hello",
				messages: [{ role: "user", content: "Hi" }],
			},
			path: "codex",
			modelId: "gpt-5.1-codex",
			outputSchema: "schema.json",
			sandbox: "docker",
			fullAuto: true,
			env: undefined,
		})
	})

	test("should build structured messages with tool calls and results", async () => {
		const systemPrompt = "System prompt"
		const messages = [
			{ role: "user" as const, content: [{ type: "text" as const, text: "Use a tool" }] },
			{
				role: "assistant" as const,
				content: [
					{
						type: "tool_use" as const,
						id: "call-1",
						name: "run_command",
						input: { command: "ls" },
					},
					{ type: "text" as const, text: "Running..." },
				],
			},
			{
				role: "user" as const,
				content: [
					{
						type: "tool_result" as const,
						tool_use_id: "call-1",
						content: [{ type: "text" as const, text: "done" }],
					},
				],
			},
		]

		const mockGenerator = async function* (): AsyncGenerator<Record<string, unknown>> {}
		mockRunCodexExec.mockReturnValue(mockGenerator())

		const stream = handler.createMessage(systemPrompt, messages)
		const iterator = stream[Symbol.asyncIterator]()
		await iterator.next()

		expect(mockRunCodexExec).toHaveBeenCalledWith({
			prompt: {
				systemPrompt,
				messages: [
					{ role: "user", content: [{ type: "text", text: "Use a tool" }] },
					{
						role: "assistant",
						content: [
							{
								type: "tool_use",
								id: "call-1",
								name: "run_command",
								input: { command: "ls" },
							},
							{ type: "text", text: "Running..." },
						],
					},
					{
						role: "user",
						content: [
							{
								type: "tool_result",
								tool_use_id: "call-1",
								content: [{ type: "text", text: "done" }],
							},
						],
					},
				],
			},
			path: "codex",
			modelId: "gpt-5.1-codex",
			outputSchema: undefined,
			sandbox: undefined,
			fullAuto: undefined,
			env: undefined,
		})
	})

	test("should replace images with placeholders for Codex CLI", async () => {
		const messages = [
			{
				role: "user" as const,
				content: [
					{
						type: "image" as const,
						source: { type: "base64", media_type: "image/png", data: "abc" },
					},
				],
			},
		]

		const mockGenerator = async function* (): AsyncGenerator<Record<string, unknown>> {}
		mockRunCodexExec.mockReturnValue(mockGenerator())

		const stream = handler.createMessage("System", messages)
		const iterator = stream[Symbol.asyncIterator]()
		await iterator.next()

		expect(mockRunCodexExec).toHaveBeenCalledWith({
			prompt: {
				systemPrompt: "System",
				messages: [
					{
						role: "user",
						content: [
							{
								type: "text",
								text: "[Image (base64): image/png not supported by Codex CLI]",
							},
						],
					},
				],
			},
			path: "codex",
			modelId: "gpt-5.1-codex",
			outputSchema: undefined,
			sandbox: undefined,
			fullAuto: undefined,
			env: undefined,
		})
	})

	test("should pass api key environment and skip login for api-key auth", async () => {
		const options: ApiHandlerOptions = {
			codexCliPath: "codex",
			apiModelId: "gpt-5.1-codex",
			codexCliAuthMode: "api-key",
			codexCliApiKey: "sk-test-123",
		}
		handler = new CodexCliHandler(options)
		const mockGenerator = async function* (): AsyncGenerator<Record<string, unknown>> {}
		mockRunCodexExec.mockReturnValue(mockGenerator())

		const stream = handler.createMessage("Hello", [{ role: "user" as const, content: "Hi" }])
		const iterator = stream[Symbol.asyncIterator]()
		await iterator.next()

		expect(mockEnsureCodexLogin).not.toHaveBeenCalled()
		expect(mockRunCodexExec).toHaveBeenCalledWith({
			prompt: {
				systemPrompt: "Hello",
				messages: [{ role: "user", content: "Hi" }],
			},
			path: "codex",
			modelId: "gpt-5.1-codex",
			outputSchema: undefined,
			sandbox: undefined,
			fullAuto: undefined,
			env: { OPENAI_API_KEY: "sk-test-123" },
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
