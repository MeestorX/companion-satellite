import React, { useState, useEffect } from 'react';
import { Button, Form, Spinner, Alert, Row, Col } from 'react-bootstrap';

interface WiFiNetwork {
  ssid: string;
  strength: number;
}

const WiFiChooser: React.FC = () => {
  const [networks, setNetworks] = useState<WiFiNetwork[]>([]);
  const [selectedSSID, setSelectedSSID] = useState<string>('');
  const [manualSSID, setManualSSID] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [connectedSSID, setConnectedSSID] = useState<string | null>(null); // Current connected SSID

  const fetchNetworks = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/wifi/networks');
      const data = await response.json();
      setNetworks(data.networks || []);
    } catch (err) {
      console.error('Failed to fetch WiFi networks:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchConnectedSSID = async () => {
    try {
      const response = await fetch('/api/wifi/status');
      const data = await response.json();
      setConnectedSSID(data.ssid || null); // Set currently connected SSID
    } catch (err) {
      console.error('Failed to fetch connection status:', err);
    }
  };

  const connectToWiFi = async () => {
    setStatus('Connecting...');
    setLoading(true);
    const ssidToConnect = manualSSID || selectedSSID;

    try {
      const response = await fetch('/api/wifi/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ssid: ssidToConnect, password, hidden: !!manualSSID }),
      });

      if (response.ok) {
        setStatus(`Successfully connected to ${ssidToConnect}`);
        setConnectedSSID(ssidToConnect); // Update connected SSID
      } else {
        const errorData = await response.json();
        setStatus(`Failed to connect: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to connect to WiFi:', error);
      setStatus('Failed to connect to WiFi.');
    } finally {
      setLoading(false);
    }
  };

  const disconnectFromWiFi = async () => {
    setStatus('Disconnecting...');
    setLoading(true);
    try {
      const response = await fetch('/api/wifi/disconnect', {
        method: 'POST',
      });

      if (response.ok) {
        setStatus('Disconnected successfully');
        setConnectedSSID(null); // Clear connected SSID
      } else {
        const errorData = await response.json();
        setStatus(`Failed to disconnect: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to disconnect from WiFi:', error);
      setStatus('Failed to disconnect from WiFi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNetworks();
    fetchConnectedSSID();
  }, []);

  return (
    <div className="wifi-chooser mt-3">
      <h4>WiFi Configuration</h4>

      {loading && (
        <div className="mb-3">
          <Spinner animation="border" role="status">
            <span className="visually-hidden">Loading...</span>
          </Spinner>
        </div>
      )}

      {status && <Alert variant="info">{status}</Alert>}

      <Form.Group className="mb-3">
        <Form.Label>Select a Network</Form.Label>
        <Form.Select
          value={selectedSSID}
          onChange={(e) => setSelectedSSID(e.target.value)}
          disabled={loading}
        >
          <option value="">Choose Network or Enter hidden SSID below...</option>
          {networks.map((network) => (
            <option key={network.ssid} value={network.ssid}>
              {network.ssid} ({network.strength}%)
            </option>
          ))}
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
            disabled={loading || (!selectedSSID && !manualSSID)}
          >
            Connect
          </Button>
        </Col>
        <Col>
          <Button
            variant="danger"
            onClick={disconnectFromWiFi}
            disabled={loading || !connectedSSID} // Disable if not connected
          >
            Disconnect
          </Button>
        </Col>
      </Row>
    </div>
  );
};

export default WiFiChooser;
