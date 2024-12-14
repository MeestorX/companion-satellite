import Router from 'koa-router'
import { koaBody } from 'koa-body'
import { exec } from 'child_process'
import util from 'util'

export function handleWiFi(router: Router): void {
	// Convert CDIR to Netmask
	function cidrToNetmask(cidr: string | number): string | false {
		const cidrValue = parseInt(cidr.toString(), 10)
		if (isNaN(cidrValue) || cidrValue > 32 || cidrValue < 0) return false

		const binary = '1'.repeat(cidrValue).padEnd(32, '0')
		const mask = binary
			.match(/.{8}/g)!
			.map((byte) => parseInt(byte, 2))
			.join('.')

		return mask
	}

	// Convert Netmask to CIDR
	function netmaskToCIDR(netmask: string): number {
		const netmaskParts = netmask.split('.').map(Number)
		const binaryNetmask = netmaskParts.map((part) => part.toString(2).padStart(8, '0')).join('')

		const cidr = binaryNetmask.indexOf('0')
		return cidr === -1 ? 32 : cidr
	}

	const execPromise = util.promisify(exec)

	router.get('/api/wifi/networks', async (ctx) => {
		try {
			const { stdout } = await execPromise(`nmcli -t -f SSID,SIGNAL dev wifi list`)

			const networks = stdout
				.split('\n')
				.filter((line) => line.trim() !== '' && !line.includes('IN-USE')) // Exclude empty lines and current connections
				.map((line) => {
					const [ssid, strength] = line.split(':')
					return { ssid: ssid.trim(), strength: parseInt(strength.trim(), 10) }
				})
				.filter((network) => network.ssid !== '') // Exclude hidden or invalid entries
				.reduce(
					(uniqueNetworks, network) => {
						if (!uniqueNetworks.find((n) => n.ssid === network.ssid)) {
							uniqueNetworks.push(network) // Avoid duplicate SSIDs
						}
						return uniqueNetworks
					},
					[] as { ssid: string; strength: number }[],
				)

			ctx.body = { networks }
		} catch (err: object | any) {
			ctx.status = 500
			let details = err?.stderr.trim()
			ctx.body = { error: 'Failed to fetch WiFi networks', details: details }
		}
	})

	// Get WiFi status
	router.get('/api/wifi/status', async (ctx) => {
		try {
			const { stdout } = await execPromise('nmcli -t con show --active')

			// Parse the output to find the active connection
			const lines = stdout.split('\n')
			const activeNetwork = lines
				.map((line) => line.split(':'))
				.find(([_, __, id, dev]) => dev === 'wlan0' || id.includes('wireless'))

			if (activeNetwork) {
				const ssid = activeNetwork[0]?.trim() || null
				ctx.body = { ssid }
			} else {
				ctx.body = { ssid: null } // No active connection
			}
		} catch (err: object | any) {
			ctx.status = 500
			let details = err?.stderr.trim()
			ctx.body = { error: 'Failed to fetch WiFi status', details: details }
		}
	})

	// Connect to a WiFi network
	router.post('/api/wifi/connect', koaBody(), async (ctx) => {
		const ssid = ctx.request.body['ssid']
		const password = ctx.request.body['password']

		if (!ssid || !password) {
			ctx.status = 400
			ctx.body = { error: 'Failed to connect to WiFi', details: 'SSID and Password are required' }
			return
		}

		try {
			// Remove any existing connection for this SSID to avoid conflicts
			await execPromise(`nmcli con delete id "${ssid}" || true`)

			// Create a connection profile (hidden or visible is inferred by nmcli)
			await execPromise(`nmcli con add type wifi con-name "${ssid}" ssid "${ssid}"`)

			// Configure security settings for WPA-PSK (WiFi password)
			await execPromise(`nmcli con mod "${ssid}" wifi-sec.key-mgmt wpa-psk wifi-sec.psk "${password}"`)

			// Activate the connection
			await execPromise(`nmcli con up "${ssid}"`)

			ctx.body = { success: true, message: `Connected to ${ssid}` }
		} catch (err: object | any) {
			ctx.status = 500
			let details = err?.stderr.trim()
			if (details.includes('wireless-security.psk') || details.includes('could not be found'))
				details = 'Unknown SSID or Incorrect Password'
			ctx.body = { error: 'Failed to connect to WiFi', details: details }
		}
	})

	// Disconnect from a WiFi network
	router.post('/api/wifi/disconnect', koaBody(), async (ctx) => {
		try {
			await execPromise('nmcli dev disconnect wlan0') // Replace 'wlan0' with your WiFi interface name
			ctx.body = { success: true, message: 'Disconnected from WiFi' }
		} catch (err: object | any) {
			ctx.status = 500
			let details = err?.stderr.trim()
			ctx.body = { error: 'Failed to disconnect from WiFi', details: details }
		}
	})

	const wired = 'Wired connection 1' // default name of wired connection with Network Manager

	// Fetch Wired Network Status
	router.get('/api/wired/status', async (ctx) => {
		try {
			const { stdout: modeOutput } = await execPromise(`nmcli -t -f ipv4.method con show "${wired}"`)
			let mode = modeOutput.split(':')[1]?.trim()
			mode = mode === 'manual' ? 'static' : mode === 'auto' ? 'dhcp' : mode

			const { stdout: ipOutput } = await execPromise(`nmcli -t -f IP4.ADDRESS con show "${wired}"`)
			const ipLine = ipOutput.split('\n')[0]
			const ip = ipLine.split('/')[0]?.split(':')[1]?.trim() || ''
			const cidr = ipLine.split('/')[1]?.trim() || ''
			const subnetMask = cidrToNetmask(cidr)

			const { stdout: gatewayOutput } = await execPromise(`nmcli -t -f IP4.GATEWAY con show "${wired}"`)
			const gateway = gatewayOutput.split(':')[1]?.trim() || ''

			ctx.body = {
				mode,
				ip,
				gateway,
				subnetMask,
			}
		} catch (err: object | any) {
			ctx.status = 500
			let details = err?.stderr.trim()
			ctx.body = { error: 'Failed to fetch wired network status', details: details }
		}
	})

	// Configure Wired Network
	router.post('/api/wired/configure', koaBody(), async (ctx) => {
		const { mode, staticIp, subnetMask, gateway } = ctx.request.body

		if (mode !== 'dhcp' && (!staticIp || !subnetMask || !gateway)) {
			ctx.status = 400
			ctx.body = { error: 'Static IP, Subnet Mask, and Gateway are required for static mode' }
			return
		}

		try {
			const cidr = netmaskToCIDR(subnetMask)
			const subnet = `${staticIp}/${cidr}`
			// Remove any existing connection for this network to avoid conflicts
			// await execPromise(`nmcli con delete id ${wired} || true`)

			// Create a connection profile
			// await execPromise(`nmcli con add type ethernet con-name ${wired}`)

			if (mode === 'static') {
				await execPromise(`nmcli con mod "${wired}" ipv4.addresses ${subnet}`)
				await execPromise(`nmcli con mod "${wired}" ipv4.gateway ${gateway}`)
			}
			await execPromise(`nmcli con mod "${wired}" ipv4.method ${mode === 'static' ? 'manual' : 'auto'}`)

			// Activate the connection
			await execPromise(`nmcli con up "${wired}"`)

			ctx.body = { success: true, message: 'Wired network configured successfully' }
		} catch (err: object | any) {
			ctx.status = 500
			let details = err?.stderr.trim()
			if (err?.stderr.includes('failed to modify')) details = err?.stderr.split(':')[2].trim()
			ctx.body = { error: 'Failed to configure wired network', details: details }
		}
	})
}
