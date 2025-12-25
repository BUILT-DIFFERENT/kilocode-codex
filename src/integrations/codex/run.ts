import * as vscode from "vscode"
import readline from "readline"
import { execa } from "execa"

export type CodexCliEvent = Record<string, any>

type CodexCliOptions = {
	prompt: string
	path?: string
	modelId?: string
}

type ProcessState = {
	error: Error | null
	stderrLogs: string
	exitCode: number | null
}

const CODEX_CLI_INSTALLATION_URL = "https://github.com/openai/codex"
const cwd = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath).at(0)

export async function* runCodexExec(options: CodexCliOptions): AsyncGenerator<CodexCliEvent> {
	const codexPath = options.path || "codex"
	let process

	try {
		process = runProcess(options)
	} catch (error: any) {
		if (error.code === "ENOENT" || error.message?.includes("ENOENT")) {
			throw createCodexCliNotFoundError(codexPath, error)
		}
		throw error
	}

	const rl = readline.createInterface({
		input: process.stdout,
	})

	try {
		const processState: ProcessState = {
			error: null,
			stderrLogs: "",
			exitCode: null,
		}

		process.stderr.on("data", (data) => {
			processState.stderrLogs += data.toString()
		})

		process.on("close", (code) => {
			processState.exitCode = code
		})

		process.on("error", (err) => {
			if (err.message.includes("ENOENT") || (err as any).code === "ENOENT") {
				processState.error = createCodexCliNotFoundError(codexPath, err)
			} else {
				processState.error = err
			}
			rl.close()
		})

		for await (const line of rl) {
			if (processState.error) {
				throw processState.error
			}

			const trimmed = line.trim()
			if (!trimmed) {
				continue
			}

			const parsed = attemptParseEvent(trimmed)
			if (!parsed) {
				continue
			}

			yield parsed
		}

		if (processState.error) {
			throw processState.error
		}

		const { exitCode } = await process
		if (exitCode !== null && exitCode !== 0) {
			const errorOutput = (processState.error as any)?.message || processState.stderrLogs?.trim()
			throw new Error(
				`Codex CLI process exited with code ${exitCode}.${errorOutput ? ` Error output: ${errorOutput}` : ""}`,
			)
		}
	} finally {
		rl.close()
		if (!process.killed) {
			process.kill()
		}
	}
}

function runProcess({ prompt, path, modelId }: CodexCliOptions) {
	const codexPath = path || "codex"
	const args = ["exec", "--json"]

	if (modelId) {
		args.push("--model", modelId)
	}

	const child = execa(codexPath, args, {
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
		cwd,
		maxBuffer: 1024 * 1024 * 1000,
	})

	setImmediate(() => {
		try {
			child.stdin.write(prompt, "utf8", (error: Error | null | undefined) => {
				if (error) {
					console.error("Error writing to Codex CLI stdin:", error)
					child.kill()
				}
			})
			child.stdin.end()
		} catch (error) {
			console.error("Error accessing Codex CLI stdin:", error)
			child.kill()
		}
	})

	return child
}

function attemptParseEvent(data: string): CodexCliEvent | null {
	try {
		return JSON.parse(data)
	} catch (error) {
		console.error("Error parsing Codex CLI event:", error, data.length)
		return null
	}
}

function createCodexCliNotFoundError(codexPath: string, originalError: Error): Error {
	const error = new Error(
		`Codex CLI not found at '${codexPath}'. Install it from ${CODEX_CLI_INSTALLATION_URL}. Original error: ${originalError.message}`,
	)
	error.name = "CodexCliNotFoundError"
	return error
}
