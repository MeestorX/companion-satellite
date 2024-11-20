import React, { useState, useEffect } from 'react';
import { Button, Form, Spinner, Alert, Row, Col, Card } from 'react-bootstrap';

interface WiFiNetwork {
  ssid: string;
  strength: number;
}

const WiFiChooser: React.FC = () => {
  const [networks, setNetworks] = useState<WiFiNetwork[]>([]);
  const [selectedSSID, setSelectedSSID] = useState<string>('');
  const [manualSSID, setManualSSID] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [connectedSSID, setConnectedSSID] = useState<string | null>(null); // Current connected SSID

  const fetchNetworks = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/wifi/networks');
      const data = await response.json();
      const availableNetworks = data.networks || [];
      setNetworks(availableNetworks);

      // Automatically select the first network if available
      if (availableNetworks.length > 0 && !manualSSID) {
        setSelectedSSID(availableNetworks[0].ssid);
      }
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
      setConnectedSSID(null); // Default to disconnected
    }
  };

  const connectToWiFi = async () => {
    setLoading(true);
    const ssidToConnect = manualSSID || selectedSSID;
  
    try {
      const response = await fetch('/api/wifi/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ssid: ssidToConnect, password, hidden: !!manualSSID }),
      });
  
      if (response.ok) {
        // Connection succeeded
        setConnectedSSID(ssidToConnect); // Update connected SSID
      } else {
        // Handle connection failure
        const errorData = await response.json();
        console.error(`Failed to connect: ${errorData.error || 'Unknown error'}`);
        alert(`Failed to connect: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to connect to WiFi:', error);
      alert('Failed to connect to WiFi.');
    } finally {
      setLoading(false);
    }
  };
  
  const disconnectFromWiFi = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/wifi/disconnect', {
        method: 'POST',
      });

      if (response.ok) {
        setConnectedSSID(null); // Clear connected SSID
      } else {
        console.error('Failed to disconnect');
      }
    } catch (error) {
      console.error('Failed to disconnect from WiFi:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNetworks();
    fetchConnectedSSID();
  }, []);

  return (
    <Card className="mt-3 wifi-chooser">
      <Card.Body>
        <h4>WiFi Configuration</h4>

        {/* Status Message */}
        <Alert variant="info">
          <strong>Status:</strong>{' '}
          {connectedSSID ? `Connected to ${connectedSSID}` : 'Disconnected'}
        </Alert>

        {/* Loading Spinner */}
        {loading && (
          <div className="mb-3 text-center">
            <Spinner animation="border" role="status" className="me-2" />
            <span>Loading...</span>
          </div>
        )}

        {/* Network Selection */}
        <Form.Group className="mb-3">
          <Form.Label>Select a Network</Form.Label>
          <Form.Select
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

        {/* Hidden Network */}
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

        {/* WiFi Password */}
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

        {/* Buttons */}
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
      </Card.Body>
    </Card>
  );
};

export default WiFiChooser;
