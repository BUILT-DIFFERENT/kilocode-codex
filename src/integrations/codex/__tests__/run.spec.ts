import { execa } from "execa"

import { ensureCodexLogin, getCodexAuthStatus } from "../run"

vi.mock("execa", () => ({
	execa: vi.fn(),
}))

const mockExeca = vi.mocked(execa)

describe("getCodexAuthStatus", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	test("returns authenticated when auth status reports true", async () => {
		mockExeca.mockResolvedValueOnce({
			stdout: JSON.stringify({ authenticated: true }),
			stderr: "",
		} as any)

		const status = await getCodexAuthStatus({ path: "codex" })

		expect(status).toEqual(
			expect.objectContaining({
				authenticated: true,
				source: "auth-status",
			}),
		)
		expect(mockExeca).toHaveBeenCalledWith(
			"codex",
			["auth", "status", "--json"],
			expect.objectContaining({ env: expect.any(Object) }),
		)
	})

	test("falls back to exec when auth status command is unsupported", async () => {
		mockExeca.mockRejectedValueOnce({ stderr: "unknown command: auth" } as any)
		mockExeca.mockResolvedValueOnce({ stdout: "", stderr: "" } as any)

		const status = await getCodexAuthStatus({ path: "codex" })

		expect(status).toEqual(
			expect.objectContaining({
				authenticated: true,
				source: "exec",
			}),
		)
		expect(mockExeca).toHaveBeenNthCalledWith(
			2,
			"codex",
			["exec", "--json"],
			expect.objectContaining({ input: "ping" }),
		)
	})
})

describe("ensureCodexLogin", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	test("runs login when unauthenticated", async () => {
		mockExeca.mockResolvedValueOnce({
			stdout: JSON.stringify({ authenticated: false }),
			stderr: "",
		} as any)
		mockExeca.mockResolvedValueOnce({ stdout: "", stderr: "" } as any)

		await ensureCodexLogin({ path: "codex" })

		expect(mockExeca).toHaveBeenNthCalledWith(
			2,
			"codex",
			["login"],
			expect.objectContaining({ env: expect.any(Object) }),
		)
	})

	test("surfaces login error output", async () => {
		mockExeca.mockResolvedValueOnce({
			stdout: JSON.stringify({ authenticated: false }),
			stderr: "",
		} as any)
		mockExeca.mockRejectedValueOnce({ stderr: "login failed" } as any)

		await expect(ensureCodexLogin({ path: "codex" })).rejects.toThrow(
			"Codex CLI login failed. Error output: login failed",
		)
	})
})
