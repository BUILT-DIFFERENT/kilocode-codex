import * as vscode from "vscode"
import readline from "readline"
import { execa } from "execa"

export type CodexCliEvent = Record<string, any>

type CodexCliOptions = {
	prompt: string
	path?: string
	modelId?: string
	outputSchema?: string
	sandbox?: string
	fullAuto?: boolean
	env?: NodeJS.ProcessEnv
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

type CodexAuthStatus = {
	authenticated: boolean
	source: "auth-status" | "exec"
	raw?: unknown
	error?: string
}

export async function getCodexAuthStatus({
	path,
	env,
}: Pick<CodexCliOptions, "path" | "env">): Promise<CodexAuthStatus> {
	const codexPath = path || "codex"
	const mergedEnv = mergeEnv(env)

	try {
		const { stdout } = await execa(codexPath, ["auth", "status", "--json"], {
			cwd,
			env: mergedEnv,
			stdout: "pipe",
			stderr: "pipe",
		})

		const { authenticated, raw } = parseAuthStatus(stdout)
		if (typeof authenticated === "boolean") {
			return { authenticated, source: "auth-status", raw }
		}

		return { authenticated: true, source: "auth-status", raw }
	} catch (error) {
		const errorOutput = formatCodexCliError(error)
		if (isUnsupportedAuthCommand(errorOutput)) {
			return getCodexAuthStatusFromExec({ path: codexPath, env: mergedEnv })
		}

		return {
			authenticated: false,
			source: "auth-status",
			error: errorOutput || "Codex CLI auth status check failed.",
		}
	}
}

export async function ensureCodexLogin({ path, env }: Pick<CodexCliOptions, "path" | "env">): Promise<void> {
	const codexPath = path || "codex"
	const status = await getCodexAuthStatus({ path: codexPath, env })

	if (status.authenticated) {
		return
	}

	try {
		await execa(codexPath, ["login"], {
			cwd,
			env: mergeEnv(env),
			stdout: "pipe",
			stderr: "pipe",
		})
	} catch (error) {
		const errorOutput = formatCodexCliError(error)
		throw new Error(`Codex CLI login failed.${errorOutput ? ` Error output: ${errorOutput}` : ""}`)
	}
}

async function getCodexAuthStatusFromExec({
	path,
	env,
}: {
	path: string
	env: NodeJS.ProcessEnv
}): Promise<CodexAuthStatus> {
	try {
		await execa(path, ["exec", "--json"], {
			cwd,
			env,
			input: "ping",
			stdout: "pipe",
			stderr: "pipe",
		})

		return { authenticated: true, source: "exec" }
	} catch (error) {
		return {
			authenticated: false,
			source: "exec",
			error: formatCodexCliError(error) || "Codex CLI auth check failed.",
		}
	}
}

function runProcess(options: CodexCliOptions) {
	const { prompt, path, modelId, env, outputSchema, sandbox, fullAuto } = options
	const codexPath = path || "codex"
	const args = ["exec", "--json"]
	const resolvedModelId = modelId?.trim()

	if (resolvedModelId) {
		args.push("--model", resolvedModelId)
	}

	const resolvedOutputSchema = outputSchema?.trim()
	if (resolvedOutputSchema) {
		args.push("--output-schema", resolvedOutputSchema)
	}

	const resolvedSandbox = sandbox?.trim()
	if (resolvedSandbox) {
		args.push("--sandbox", resolvedSandbox)
	}

	if (fullAuto) {
		args.push("--full-auto")
	}

	const child = execa(codexPath, args, {
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
		cwd,
		env: mergeEnv(env),
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

function parseAuthStatus(output: string): { authenticated?: boolean; raw?: unknown } {
	const trimmed = output.trim()
	if (!trimmed) {
		return {}
	}

	try {
		const parsed = JSON.parse(trimmed)
		if (parsed && typeof parsed === "object") {
			const authValue =
				(parsed as { authenticated?: boolean }).authenticated ??
				(parsed as { logged_in?: boolean }).logged_in ??
				(parsed as { loggedIn?: boolean }).loggedIn

			if (typeof authValue === "boolean") {
				return { authenticated: authValue, raw: parsed }
			}

			const statusValue = (parsed as { status?: string }).status
			if (typeof statusValue === "string") {
				const normalized = statusValue.toLowerCase()
				if (normalized.includes("unauth") || normalized.includes("signed-out")) {
					return { authenticated: false, raw: parsed }
				}
				if (normalized.includes("auth") || normalized.includes("signed-in")) {
					return { authenticated: true, raw: parsed }
				}
			}
		}

		return { raw: parsed }
	} catch (error) {
		console.error("Error parsing Codex CLI auth status:", error)
		return {}
	}
}

function isUnsupportedAuthCommand(message: string): boolean {
	const normalized = message.toLowerCase()
	return (
		normalized.includes("unknown command") ||
		normalized.includes("unrecognized command") ||
		normalized.includes("unknown subcommand") ||
		normalized.includes("invalid choice")
	)
}

function mergeEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	return { ...process.env, ...env }
}

function formatCodexCliError(error: unknown): string {
	if (typeof error === "string") {
		return error
	}

	if (error && typeof error === "object") {
		const err = error as {
			stderr?: string
			shortMessage?: string
			message?: string
			cause?: unknown
		}
		return (
			err.stderr?.trim() ||
			err.shortMessage?.trim() ||
			err.message?.trim() ||
			(typeof err.cause === "string" ? err.cause : "") ||
			""
		)
	}

	return ""
}

function createCodexCliNotFoundError(codexPath: string, originalError: Error): Error {
	const error = new Error(
		`Codex CLI not found at '${codexPath}'. Install it from ${CODEX_CLI_INSTALLATION_URL}. Original error: ${originalError.message}`,
	)
	error.name = "CodexCliNotFoundError"
	return error
}
