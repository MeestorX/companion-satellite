import Koa from 'koa'
import Router from 'koa-router'
import { koaBody } from 'koa-body'
import serve from 'koa-static'
import http from 'http'
import type Conf from 'conf'
import type { CompanionSatelliteClient } from './client.js'
import type { DeviceManager } from './devices.js'
import type { SatelliteConfig } from './config.js'
import { ApiConfigData, compileConfig, compileStatus, updateConfig } from './apiTypes.js'

import { exec } from 'child_process'
import util from 'util'

export class RestServer {
	private readonly appConfig: Conf<SatelliteConfig>
	private readonly client: CompanionSatelliteClient
	private readonly devices: DeviceManager
	private readonly app: Koa
	private readonly router: Router
	private server: http.Server | undefined

	execPromise = util.promisify(exec)

	constructor(
		webRoot: string,
		appConfig: Conf<SatelliteConfig>,
		client: CompanionSatelliteClient,
		devices: DeviceManager,
	) {
		this.appConfig = appConfig
		this.client = client
		this.devices = devices

		// Monitor for config changes
		this.appConfig.onDidChange('restEnabled', this.open.bind(this))
		this.appConfig.onDidChange('restPort', this.open.bind(this))

		this.app = new Koa()
		this.app.use(serve(webRoot))

		this.router = new Router()

		//GET
		this.router.get('/api/host', async (ctx) => {
			ctx.body = this.appConfig.get('remoteIp')
		})
		this.router.get('/api/port', (ctx) => {
			ctx.body = this.appConfig.get('remotePort')
		})
		this.router.get('/api/connected', (ctx) => {
			ctx.body = this.client.connected
		})
		this.router.get('/api/config', (ctx) => {
			ctx.body = compileConfig(this.appConfig)
		})
		this.router.get('/api/status', (ctx) => {
			ctx.body = compileStatus(this.client)
		})

		
		// List available WiFi networks
		this.router.get('/api/wifi/networks', async (ctx) => {
			try {
			  const { stdout } = await this.execPromise(
				`nmcli -t -f SSID,SIGNAL dev wifi list`
			  );
		  
			  const networks = stdout
				.split('\n')
				.filter((line) => line.trim() !== '' && !line.includes('IN-USE')) // Exclude empty lines and current connections
				.map((line) => {
				  const [ssid, strength] = line.split(':');
				  return { ssid: ssid.trim(), strength: parseInt(strength.trim(), 10) };
				})
				.filter((network) => network.ssid !== '') // Exclude hidden or invalid entries
				.reduce((uniqueNetworks, network) => {
				  if (!uniqueNetworks.find((n) => n.ssid === network.ssid)) {
					uniqueNetworks.push(network); // Avoid duplicate SSIDs
				  }
				  return uniqueNetworks;
				}, [] as { ssid: string; strength: number }[]);
		  
			  ctx.body = { networks };
			} catch (err) {
			  console.error('Error fetching WiFi networks:', err);
			  ctx.status = 500;
			  ctx.body = { error: 'Failed to fetch WiFi networks' };
			}
		  });

		//POST

		// Connect to a WiFi network
		this.router.post('/api/wifi/connect', koaBody(), async (ctx) => {
			const ssid = ctx.request.body['ssid']
			const password = ctx.request.body['password']
			const hidden = ctx.request.body['hidden']
		  
			if (!ssid || !password) {
			  ctx.status = 400;
			  ctx.body = { error: 'SSID and password are required' };
			  return;
			}
		  
			try {
			  // Remove any existing connection for this SSID to avoid conflicts
			  await this.execPromise(`nmcli connection delete id "${ssid}" || true`);
		  
			  // Create a connection profile (hidden or visible is inferred by nmcli)
			  await this.execPromise(
				`nmcli connection add type wifi con-name "${ssid}" ssid "${ssid}"`
			  );
		  
			  // Configure security settings for WPA-PSK (WiFi password)
			  await this.execPromise(
				`nmcli connection modify "${ssid}" wifi-sec.key-mgmt wpa-psk wifi-sec.psk "${password}"`
			  );
		  
			  // Activate the connection
			  await this.execPromise(`nmcli connection up "${ssid}"`);
		  
			  ctx.body = { success: true, message: `Connected to ${ssid}` };
			} catch (err) {
			  ctx.status = 500;
			  ctx.body = { error: 'Failed to connect to WiFi', details: err };
			}
		});
		
		this.router.post('/api/wifi/disconnect', koaBody(), async (ctx) => {
			try {
			  await this.execPromise('nmcli dev disconnect wlan0'); // Replace 'wlan0' with your WiFi interface name
			  ctx.body = { success: true, message: 'Disconnected from WiFi' };
			} catch (err) {
			  ctx.status = 500;
			  ctx.body = { error: 'Failed to disconnect from WiFi', details: err };
			}
		  });

		this.router.post('/api/host', koaBody(), async (ctx) => {
			let host = ''
			if (ctx.request.type == 'application/json') {
				host = ctx.request.body['host']
			} else if (ctx.request.type == 'text/plain') {
				host = ctx.request.body
			}

			if (host) {
				this.appConfig.set('remoteIp', host)

				ctx.body = 'OK'
			} else {
				ctx.status = 400
				ctx.body = 'Invalid host'
			}
		})
		this.router.post('/api/port', koaBody(), async (ctx) => {
			let newPort = NaN
			if (ctx.request.type == 'application/json') {
				newPort = Number(ctx.request.body['port'])
			} else if (ctx.request.type == 'text/plain') {
				newPort = Number(ctx.request.body)
			}

			if (!isNaN(newPort) && newPort > 0 && newPort <= 65535) {
				this.appConfig.set('remotePOrt', newPort)

				ctx.body = 'OK'
			} else {
				ctx.status = 400
				ctx.body = 'Invalid port'
			}
		})
		this.router.post('/api/config', koaBody(), async (ctx) => {
			if (ctx.request.type == 'application/json') {
				const body = ctx.request.body as Partial<ApiConfigData>

				const partialConfig: Partial<ApiConfigData> = {}

				const host = body.host
				if (host !== undefined) {
					if (typeof host === 'string') {
						partialConfig.host = host
					} else {
						ctx.status = 400
						ctx.body = 'Invalid host'
					}
				}

				const port = Number(body.port)
				if (isNaN(port) || port <= 0 || port > 65535) {
					ctx.status = 400
					ctx.body = 'Invalid port'
				} else {
					partialConfig.port = port
				}

				const installationName = body.installationName
				if (installationName !== undefined) {
					if (typeof installationName === 'string') {
						partialConfig.installationName = installationName
					} else {
						ctx.status = 400
						ctx.body = 'Invalid installationName'
					}
				}

				const mdnsEnabled = body.mdnsEnabled
				if (mdnsEnabled !== undefined) {
					if (typeof mdnsEnabled === 'boolean') {
						partialConfig.mdnsEnabled = mdnsEnabled
					} else {
						ctx.status = 400
						ctx.body = 'Invalid mdnsEnabled'
					}
				}

				// Ensure some fields cannot be changed
				delete partialConfig.httpEnabled
				delete partialConfig.httpPort

				updateConfig(this.appConfig, partialConfig)
				ctx.body = compileConfig(this.appConfig)
			}
		})

		this.router.post('/api/rescan', async (ctx) => {
			this.devices.scanDevices()

			ctx.body = 'OK'
		})

		this.app.use(this.router.routes()).use(this.router.allowedMethods())
	}

	public open(): void {
		this.close()

		const enabled = this.appConfig.get('restEnabled')
		const port = this.appConfig.get('restPort')

		if (enabled && port) {
			try {
				this.server = this.app.listen(port)
				console.log(`REST server starting: port: ${port}`)
			} catch (error) {
				console.error('Error starting REST server:', error)
			}
		} else {
			console.log('REST server not starting: port 0')
		}
	}

	public close(): void {
		if (this.server && this.server.listening) {
			this.server.close()
			this.server.closeAllConnections()
			delete this.server
			console.log('The rest server is closed')
		}
	}
}
