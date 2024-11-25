import { Button, Form, Card } from 'react-bootstrap'
import type { ApiConfigData } from '../../satellite/src/apiTypes'
import { useCallback, useMemo, useState } from 'react'
import { SaveApiConfigData } from './Api/types'

interface SettingsFormProps {
	currentConfig: ApiConfigData | null
	loadError: Error | null
	saveConfig: SaveApiConfigData
	includeApiEnable: boolean
}
export function SettingsForm({
	currentConfig,
	loadError,
	saveConfig,
	includeApiEnable,
}: SettingsFormProps): JSX.Element {
	const [modifiedConfig, setModifiedConfig] = useState<Partial<ApiConfigData>>({})
	const fullModifiedConfig: ApiConfigData | undefined = useMemo(() => {
		return currentConfig ? { ...currentConfig, ...modifiedConfig } : undefined
	}, [currentConfig, modifiedConfig])

	const mySaveConfig = useCallback(() => {
		saveConfig(modifiedConfig)
			.then(() => {
				console.log('config saved')
				setModifiedConfig({})
			})
			.catch((e) => {
				console.error('config save failed', e)
			})
	}, [saveConfig, modifiedConfig])

	return (
		<>
		<Card className="mt-3 settings-form">
		<Card.Body>
			<h3>Settings</h3>
			{loadError ? <p>{loadError.toString()}</p> : ''}

			{fullModifiedConfig && !loadError && (
				<SettingsFormInner
					fullConfig={fullModifiedConfig}
					hasChanges={Object.keys(modifiedConfig).length > 0}
					setModifiedConfig={setModifiedConfig}
					saveConfig={mySaveConfig}
					includeApiEnable={includeApiEnable}
				/>
			)}

			{!fullModifiedConfig && !loadError && 'Loading...'}
		</Card.Body>
		</Card>
		</>
	)
}

interface SettingsFormInnerProps {
	fullConfig: ApiConfigData
	hasChanges: boolean
	setModifiedConfig: React.Dispatch<React.SetStateAction<Partial<ApiConfigData>>>
	saveConfig: () => void
	includeApiEnable: boolean
}
function SettingsFormInner({
	fullConfig,
	hasChanges,
	setModifiedConfig,
	saveConfig,
	includeApiEnable,
}: SettingsFormInnerProps) {
	const setHost = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const value = e.currentTarget.value

			setModifiedConfig((oldConfig) => ({
				...oldConfig,
				host: value,
			}))
		},
		[setModifiedConfig],
	)
	const setPort = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const value = Number(e.currentTarget.value)

			setModifiedConfig((oldConfig) => ({
				...oldConfig,
				port: value,
			}))
		},
		[setModifiedConfig],
	)
	const setHttpEnabled = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const value = !!e.currentTarget.checked

			setModifiedConfig((oldConfig) => ({
				...oldConfig,
				httpEnabled: value,
			}))
		},
		[setModifiedConfig],
	)

	const setHttpPort = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const value = Number(e.currentTarget.value)

			setModifiedConfig((oldConfig) => ({
				...oldConfig,
				httpPort: value,
			}))
		},
		[setModifiedConfig],
	)
	const setMdnsEnabled = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const value = !!e.currentTarget.checked

			setModifiedConfig((oldConfig) => ({
				...oldConfig,
				mdnsEnabled: value,
			}))
		},
		[setModifiedConfig],
	)
	const setInstallationName = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const value = e.currentTarget.value

			setModifiedConfig((oldConfig) => ({
				...oldConfig,
				installationName: value,
			}))
		},
		[setModifiedConfig],
	)

	const saveConfigFull = useCallback(
		(e: React.FormEvent<HTMLFormElement>) => {
			e.preventDefault()

			saveConfig()
		},
		[saveConfig],
	)

	return (

		<Form onSubmit={saveConfigFull}>
			<legend>Companion Connection</legend>

			<Form.Group className="mb-3" controlId="formCompanionAddress">
				<Form.Label>Address</Form.Label>
				<Form.Control
					type="text"
					placeholder="Companion address (eg 127.0.0.1 or companion.local)"
					value={fullConfig.host}
					onChange={setHost}
				/>
			</Form.Group>

			<Form.Group className="mb-3" controlId="formCompanionPort">
				<Form.Label>Port</Form.Label>
				<Form.Control
					type="number"
					placeholder="16622"
					min={1}
					max={65535}
					value={fullConfig.port}
					onChange={setPort}
				/>
				<Form.Text className="text-muted">
					Only change this if you know what you are doing. In almost all cases this should be left at the default.
				</Form.Text>
			</Form.Group>

			<Form.Group className="mb-3" controlId="formCompanionPort">
				<Form.Label>MDNS Announce</Form.Label>
				<Form.Check type="switch" label="Enabled" checked={fullConfig.mdnsEnabled} onChange={setMdnsEnabled} />
				<Form.Text className="text-muted">
					Announce this Satellite installation to the network. This allows for easy setup from inside Companion.
				</Form.Text>
			</Form.Group>

			<Form.Group className="mb-3" controlId="formCompanionAddress">
				<Form.Label>Installation name</Form.Label>
				<Form.Control
					type="text"
					placeholder="Installation name"
					value={fullConfig.installationName}
					onChange={setInstallationName}
				/>
				<Form.Text className="text-muted">Name to use for this installation in MDNS announcements</Form.Text>
			</Form.Group>

			{includeApiEnable && (
				<>
					<legend>HTTP Interface & API</legend>

					<Form.Group className="mb-3" controlId="formHttpPort">
						<Form.Check type="switch" label="Enabled" checked={fullConfig.httpEnabled} onChange={setHttpEnabled} />
					</Form.Group>

					<Form.Group className="mb-3" controlId="formHttpPort">
						<Form.Label>Port</Form.Label>
						<Form.Control
							type="number"
							placeholder="9999"
							min={1}
							max={65535}
							value={fullConfig.httpPort}
							onChange={setHttpPort}
						/>
					</Form.Group>
				</>
			)}

			<Button variant="primary" type="submit" disabled={!hasChanges}>
				Save
			</Button>
		</Form>

	)
}
