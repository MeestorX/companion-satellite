import Router from 'koa-router'
import { koaBody } from 'koa-body'

import { exec } from 'child_process'
import util from 'util'

export function handleWiFi(router: Router) {

	var execPromise = util.promisify(exec)

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
			.reduce((uniqueNetworks, network) => {
				if (!uniqueNetworks.find((n) => n.ssid === network.ssid)) {
				uniqueNetworks.push(network); // Avoid duplicate SSIDs
				}
				return uniqueNetworks
			}, [] as { ssid: string; strength: number }[])
		
			ctx.body = { networks }
		} catch (err) {
			console.error('Error fetching WiFi networks:', err)
			ctx.status = 500;
			ctx.body = { error: 'Failed to fetch WiFi networks' }
		}
	})

	// Get WiFi status
	router.get('/api/wifi/status', async (ctx) => {
		try {
			const { stdout } = await execPromise(`nmcli -t -f ACTIVE,SSID dev wifi`)

			// Parse the output to find the active connection
			const lines = stdout.split('\n')
			const activeNetwork = lines
				.map((line) => line.split(':'))
				.find(([active]) => active === 'yes')

			if (activeNetwork) {
				const ssid = activeNetwork[1]?.trim() || null
				ctx.body = { ssid }
			} else {
				ctx.body = { ssid: null } // No active connection
			}
		} catch (err) {
			console.error('Failed to fetch WiFi status:', err)
			ctx.status = 500;
			ctx.body = { error: 'Failed to fetch WiFi status' }
		}
	})

	// Connect to a WiFi network
	router.post('/api/wifi/connect', koaBody(), async (ctx) => {
		const ssid = ctx.request.body['ssid']
		const password = ctx.request.body['password']
		const hidden = ctx.request.body['hidden']
		
		if (!ssid || !password) {
			ctx.status = 400;
			ctx.body = { error: 'SSID and password are required' }
			return
		}
		
		try {
			// Remove any existing connection for this SSID to avoid conflicts
			await execPromise(`nmcli connection delete id "${ssid}" || true`)
		
			// Create a connection profile (hidden or visible is inferred by nmcli)
			await execPromise(`nmcli connection add type wifi con-name "${ssid}" ssid "${ssid}"`)
		
			// Configure security settings for WPA-PSK (WiFi password)
			await execPromise(`nmcli connection modify "${ssid}" wifi-sec.key-mgmt wpa-psk wifi-sec.psk "${password}"`)
		
			// Activate the connection
			await execPromise(`nmcli connection up "${ssid}"`)
		
			ctx.body = { success: true, message: `Connected to ${ssid}` }
		} catch (err) {
			ctx.status = 500;
			ctx.body = { error: 'Failed to connect to WiFi', details: err }
		}
	});

	// Disconnect from a WiFi network
	router.post('/api/wifi/disconnect', koaBody(), async (ctx) => {
		try {
			await execPromise('nmcli dev disconnect wlan0'); // Replace 'wlan0' with your WiFi interface name
			ctx.body = { success: true, message: 'Disconnected from WiFi' }
		} catch (err) {
			ctx.status = 500
			ctx.body = { error: 'Failed to disconnect from WiFi', details: err }
		}
	})
}