import { useCallback } from "react"
import { VSCodeCheckbox, VSCodeTextField, VSCodeLink } from "@vscode/webview-ui-toolkit/react"

import { codexCliDefaultModelId, type ProviderSettings } from "@roo-code/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@src/components/ui"
import { inputEventTransform } from "../transforms"

type CodexCliProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
}

export const CodexCli = ({ apiConfiguration, setApiConfigurationField }: CodexCliProps) => {
	const { t } = useAppTranslation()

	const handleInputChange = useCallback(
		<K extends keyof ProviderSettings, E>(
			field: K,
			transform: (event: E) => ProviderSettings[K] = inputEventTransform,
		) =>
			(event: E | Event) => {
				setApiConfigurationField(field, transform(event as E))
			},
		[setApiConfigurationField],
	)

	const authMode = apiConfiguration?.codexCliAuthMode ?? "chatgpt"

	return (
		<>
			<div className="flex flex-col gap-1">
				<label className="block font-medium mb-1">{t("settings:providers.codexCli.authModeLabel")}</label>
				<Select
					value={authMode}
					onValueChange={(value) =>
						setApiConfigurationField("codexCliAuthMode", value as ProviderSettings["codexCliAuthMode"])
					}>
					<SelectTrigger className="w-full">
						<SelectValue placeholder={t("settings:common.select")} />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="chatgpt">{t("settings:providers.codexCli.authModeChatGpt")}</SelectItem>
						<SelectItem value="api-key">{t("settings:providers.codexCli.authModeApiKey")}</SelectItem>
					</SelectContent>
				</Select>
				<div className="text-sm text-vscode-descriptionForeground">
					{authMode === "api-key"
						? t("settings:providers.codexCli.authModeActiveApiKey")
						: t("settings:providers.codexCli.authModeActiveChatGpt")}
				</div>
			</div>

			<VSCodeTextField
				value={apiConfiguration?.codexCliPath || ""}
				onInput={handleInputChange("codexCliPath")}
				placeholder="codex"
				className="w-full">
				<label className="block font-medium mb-1">{t("settings:providers.codexCli.pathLabel")}</label>
			</VSCodeTextField>
			<div className="text-sm text-vscode-descriptionForeground -mt-2">
				{t("settings:providers.codexCli.pathDescription")}
			</div>

			<VSCodeTextField
				value={apiConfiguration?.apiModelId || ""}
				onInput={handleInputChange("apiModelId")}
				placeholder={codexCliDefaultModelId}
				className="w-full mt-3">
				<label className="block font-medium mb-1">{t("settings:providers.codexCli.modelIdLabel")}</label>
			</VSCodeTextField>
			<div className="text-sm text-vscode-descriptionForeground -mt-2">
				{t("settings:providers.codexCli.modelIdDescription")}
			</div>

			{authMode === "api-key" && (
				<>
					<VSCodeTextField
						value={apiConfiguration?.codexCliApiKey || ""}
						type="password"
						onInput={handleInputChange("codexCliApiKey")}
						placeholder={t("settings:placeholders.apiKey")}
						className="w-full mt-3">
						<label className="block font-medium mb-1">{t("settings:providers.codexCli.apiKeyLabel")}</label>
					</VSCodeTextField>
					<div className="text-sm text-vscode-descriptionForeground -mt-2">
						{t("settings:providers.apiKeyStorageNotice")}
					</div>
					<div className="text-sm text-vscode-descriptionForeground mt-2">
						{t("settings:providers.codexCli.apiKeyDescription")}
					</div>
				</>
			)}

			<VSCodeTextField
				value={apiConfiguration?.codexCliOutputSchema || ""}
				onInput={handleInputChange("codexCliOutputSchema")}
				placeholder={t("settings:providers.codexCli.outputSchemaPlaceholder")}
				className="w-full mt-3">
				<label className="block font-medium mb-1">{t("settings:providers.codexCli.outputSchemaLabel")}</label>
			</VSCodeTextField>
			<div className="text-sm text-vscode-descriptionForeground -mt-2">
				{t("settings:providers.codexCli.outputSchemaDescription")}
			</div>

			<VSCodeTextField
				value={apiConfiguration?.codexCliSandbox || ""}
				onInput={handleInputChange("codexCliSandbox")}
				placeholder={t("settings:providers.codexCli.sandboxPlaceholder")}
				className="w-full mt-3">
				<label className="block font-medium mb-1">{t("settings:providers.codexCli.sandboxLabel")}</label>
			</VSCodeTextField>
			<div className="text-sm text-vscode-descriptionForeground -mt-2">
				{t("settings:providers.codexCli.sandboxDescription")}
			</div>

			<div className="mt-3">
				<VSCodeCheckbox
					checked={apiConfiguration?.codexCliFullAuto ?? false}
					onChange={(event: unknown) =>
						setApiConfigurationField(
							"codexCliFullAuto",
							(event as { target: HTMLInputElement }).target.checked,
						)
					}>
					{t("settings:providers.codexCli.fullAutoLabel")}
				</VSCodeCheckbox>
				<div className="text-sm text-vscode-descriptionForeground mt-1">
					{t("settings:providers.codexCli.fullAutoDescription")}
				</div>
			</div>

			<div className="text-sm text-vscode-descriptionForeground mt-3">
				{t("settings:providers.codexCli.description")}
			</div>

			<div className="text-sm text-vscode-descriptionForeground mt-2">
				{t("settings:providers.codexCli.instructions")}{" "}
				<code className="text-vscode-textPreformat-foreground">codex</code>{" "}
				{t("settings:providers.codexCli.instructionsContinued")}
			</div>

			<VSCodeLink
				href="https://github.com/openai/codex"
				className="text-vscode-textLink-foreground hover:text-vscode-textLink-activeForeground mt-2 inline-block">
				{t("settings:providers.codexCli.setupLink")}
			</VSCodeLink>
		</>
	)
}
