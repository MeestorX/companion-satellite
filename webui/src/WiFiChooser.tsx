import React, { useState, useEffect } from 'react';
import { Button, Form, Spinner, Alert, Row, Col, Card, Tabs, Tab } from 'react-bootstrap';

interface WiFiNetwork {
  ssid: string;
  strength: number;
}

let connectedIp = ''

const WiFiChooser: React.FC = () => {
  const [networks, setNetworks] = useState<WiFiNetwork[]>([]);
  const [selectedSSID, setSelectedSSID] = useState<string>('');
  const [manualSSID, setManualSSID] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [connectedSSID, setConnectedSSID] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [key, setKey] = useState<string>('wifi');

  // Wired Network Configuration State
  const [ipMode, setIpMode] = useState<'dhcp' | 'static'>('dhcp');
  const [staticIp, setStaticIp] = useState<string>('');
  const [subnetMask, setSubnetMask] = useState<string>('');
  const [gateway, setGateway] = useState<string>('');

  const fetchNetworks = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch('/api/wifi/networks');
      const data = await response.json();
      const availableNetworks = data.networks || [];
      setNetworks(availableNetworks);
      if (availableNetworks.length > 0 && !manualSSID) {
        setSelectedSSID(connectedSSID || '');
      }
    } catch (err) {
      setErrorMessage('Failed to fetch WiFi networks!');
    } finally {
      setLoading(false);
    }
  };

  const fetchConnectedSSID = async () => {
    try {
      const response = await fetch('/api/wifi/status');
      const data = await response.json();
      setConnectedSSID(data.ssid || null);
    } catch (err) {
      setErrorMessage('Failed to fetch connection status!');
      setConnectedSSID(null);
    }
  };

  const connectToWiFi = async () => {
    setLoading(true);
    setConnectedSSID(null)
    setErrorMessage(null);
    const ssidToConnect = manualSSID || selectedSSID;
    try {
      const response = await fetch('/api/wifi/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ssid: ssidToConnect, password: password }),
      });
      if (response.ok) {
        setConnectedSSID(ssidToConnect);
        setErrorMessage(null);
      } else {
        const errorData = await response.json();
        setErrorMessage(`${errorData.error || 'Unknown error'}: ${errorData.details || ''}`);
      }
    } catch (error) {
      setErrorMessage('Failed to connect to WiFi!');
    } finally {
      setLoading(false);
    }
  };

  const disconnectFromWiFi = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch('/api/wifi/disconnect', {
        method: 'POST',
      });
      if (response.ok) {
        setConnectedSSID(null);
        setErrorMessage(null);
      } else {
        const errorData = await response.json();
        setErrorMessage(`Failed to disconnect: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      setErrorMessage('Failed to disconnect from WiFi!');
    } finally {
      setLoading(false);
    }
  };

  const fetchWiredStatus = async () => {
    try {
      const response = await fetch('/api/wired/status');
      const data = await response.json();
      connectedIp = data.ip
      setIpMode(data.mode || '');
      setStaticIp(data.ip || '');
      setSubnetMask(data.subnetMask || '');
      setGateway(data.gateway || '');
    } catch (err) {
      setErrorMessage('Failed to fetch wired network status!');
    }
  };

  const configureWiredNetwork = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch('/api/wired/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: ipMode,
          staticIp,
          subnetMask,
          gateway,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        setErrorMessage(`${errorData.error || 'Unknown error'}:\n${errorData.details || ''}`);
      }
    } catch (error) {
      setErrorMessage('Failed to configure wired network.');
    } finally {
      fetchWiredStatus()
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNetworks();
    fetchConnectedSSID();
    fetchWiredStatus();
  }, []);

  return (
    <Card className="mt-3 wifi-chooser">
      <Card.Body>
        <h4>Network Configuration</h4>
          {errorMessage && <Alert variant="danger" className="mt-3">{errorMessage}</Alert>}
          {loading && (
            <div className="mb-3 text-center">
              <Spinner animation="border" role="status" className="me-2" />
              <span>Updating...</span>
            </div>
          )}
          <Tabs activeKey={key} onSelect={(k) => setKey(k || 'wifi')} className="mb-3">
          {/* WiFi Tab */}
          <Tab eventKey="wifi" title="WiFi">
            <Alert variant={connectedSSID ? 'info' : 'warning'}>
              <strong>Status:</strong>{' '}
              {connectedSSID ? `Connected to ${connectedSSID}` : 'Disconnected'}
            </Alert>
 
            <Form.Group className="mb-3">
              <Form.Label>Select a Network</Form.Label>
              <Form.Select
                defaultValue={connectedSSID || ''}
                value={selectedSSID}
                onChange={(e) => setSelectedSSID(e.target.value)}
                disabled={loading}
              >
                {networks.length > 0 ? (
                  networks.map((network) => (
                    <option key={network.ssid} value={network.ssid}>
                      {network.ssid} ({network.strength}%)
                    </option>
                  ))
                ) : (
                  <option disabled>No networks found</option>
                )}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Enter SSID (for hidden networks)</Form.Label>
              <Form.Control
                type="text"
                placeholder="Hidden network SSID"
                value={manualSSID}
                onChange={(e) => setManualSSID(e.target.value)}
                disabled={loading}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>WiFi Password</Form.Label>
              <Form.Control
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </Form.Group>
            <Row>
              <Col>
                <Button
                  variant="primary"
                  onClick={connectToWiFi}
                  disabled={loading || (!!connectedSSID)}
                >
                  Connect
                </Button>
              </Col>
              <Col>
                <Button
                  variant="danger"
                  onClick={disconnectFromWiFi}
                  disabled={loading || !connectedSSID}
                >
                  Disconnect
                </Button>
              </Col>
            </Row>
          </Tab>

          {/* Wired Tab */}
          <Tab eventKey="wired" title="Wired">
            {!loading && <Alert variant={staticIp ? 'info' : 'warning'}>
              <strong>Status:</strong>{' '}
              {staticIp ? `Connected to ${connectedIp}` : 'Disconnected'}
            </Alert>}
            <Form.Group className="mb-3">
              <Form.Label>Mode</Form.Label>
              <Form.Select
                value={ipMode}
                onChange={(e) => setIpMode(e.target.value as 'dhcp' | 'static')}
              >
                <option value="dhcp">DHCP</option>
                <option value="static">Static</option>
              </Form.Select>
            </Form.Group>
            <>
              <Form.Group className="mb-3">
                <Form.Label>IP</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="e.g. 192.168.1.100"
                  value={staticIp}
                  onChange={(e) => setStaticIp(e.target.value)}
                  disabled={ipMode === 'dhcp'}
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Subnet Mask</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="e.g. 255.255.255.0"
                  value={subnetMask}
                  onChange={(e) => setSubnetMask(e.target.value)}
                  disabled={ipMode === 'dhcp'}
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Gateway</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="e.g. 192.168.1.1"
                  value={gateway}
                  onChange={(e) => setGateway(e.target.value)}
                  disabled={ipMode === 'dhcp'}
                />
              </Form.Group>
            </>

            <Button variant="primary" onClick={configureWiredNetwork} disabled={loading}>
              Save Configuration
            </Button>
          </Tab>
        </Tabs>
      </Card.Body>
    </Card>
  );
};

export default WiFiChooser;
