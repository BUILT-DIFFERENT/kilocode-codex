import { useCallback } from "react"
import { VSCodeTextField, VSCodeLink } from "@vscode/webview-ui-toolkit/react"

import type { ProviderSettings } from "@roo-code/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
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

	return (
		<>
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
