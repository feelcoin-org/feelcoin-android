import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type NetworkDefaults = {
  p2p_port: number;
  daemon_rpc_port: number;
  zmq_port: number;
  wallet_rpc_port: number;
};

type DaemonInfo = {
  reachable: boolean;
  host: string;
  port: number;
  height: number | null;
  target_height: number | null;
  difficulty: number | null;
  target_seconds: number | null;
  incoming_connections: number | null;
  outgoing_connections: number | null;
  synchronized: boolean | null;
  status: string | null;
  version: string | null;
  error: string | null;
};

type WalletRpcStatus = {
  reachable: boolean;
  host: string;
  port: number;
  version: number | null;
  release: boolean | null;
  error: string | null;
};

const FALLBACK_NETWORK: NetworkDefaults = {
  p2p_port: 35780,
  daemon_rpc_port: 35781,
  zmq_port: 35782,
  wallet_rpc_port: 35784,
};

const EMPTY_DAEMON: DaemonInfo = {
  reachable: false,
  host: "127.0.0.1",
  port: 35781,
  height: null,
  target_height: null,
  difficulty: null,
  target_seconds: null,
  incoming_connections: null,
  outgoing_connections: null,
  synchronized: null,
  status: null,
  version: null,
  error: null,
};

const EMPTY_WALLET_RPC: WalletRpcStatus = {
  reachable: false,
  host: "127.0.0.1",
  port: 35784,
  version: null,
  release: null,
  error: null,
};

function formatNumber(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat().format(value);
}

function App() {
  const [network, setNetwork] = useState<NetworkDefaults>(FALLBACK_NETWORK);
  const [daemon, setDaemon] = useState<DaemonInfo>(EMPTY_DAEMON);
  const [walletRpc, setWalletRpc] = useState<WalletRpcStatus>(EMPTY_WALLET_RPC);
  const [checking, setChecking] = useState(false);

  async function refreshServices() {
    setChecking(true);
    try {
      const [daemonResult, walletResult] = await Promise.all([
        invoke<DaemonInfo>("daemon_info"),
        invoke<WalletRpcStatus>("wallet_rpc_status"),
      ]);
      setDaemon(daemonResult);
      setWalletRpc(walletResult);
    } catch {
      setDaemon({
        ...EMPTY_DAEMON,
        error: "Unable to query the local desktop backend.",
      });
      setWalletRpc(EMPTY_WALLET_RPC);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    invoke<NetworkDefaults>("network_defaults")
      .then(setNetwork)
      .catch(() => setNetwork(FALLBACK_NETWORK));

    refreshServices();
  }, []);

  const totalConnections =
    (daemon.incoming_connections ?? 0) + (daemon.outgoing_connections ?? 0);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="coin-mark" src="/feelcoin-logo.png" alt="Feelcoin logo" />
          <div>
            <strong>FEELCOIN</strong>
            <span>DESKTOP</span>
          </div>
        </div>

        <nav>
          <button className="nav-item active">Overview</button>
          <button className="nav-item" disabled>
            Wallet
          </button>
          <button className="nav-item" disabled>
            Send
          </button>
          <button className="nav-item" disabled>
            Receive
          </button>
          <button className="nav-item" disabled>
            Transactions
          </button>
          <button className="nav-item" disabled>
            Node
          </button>
          <button className="nav-item" disabled>
            Settings
          </button>
        </nav>

        <div className="sidebar-note">
          <span className="shield">✓</span>
          <div>
            <strong>No bundled miner</strong>
            <small>Mining remains separate and opt-in.</small>
          </div>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">OFFICIAL FEELCOIN WALLET</p>
            <h1>Welcome to Feelcoin Desktop</h1>
            <p className="subtle">
              Local-first wallet control with transparent network status.
            </p>
          </div>

          <div className={daemon.reachable ? "status online" : "status offline"}>
            <span />
            {daemon.reachable ? "Local daemon online" : "Local daemon offline"}
          </div>
        </header>

        <section className="hero-card">
          <div>
            <p className="eyebrow">FEELCOIN NETWORK</p>
            <h2>In Feels We Trust.</h2>
            <p>
              Feelcoin Desktop is being built around explicit local-node control,
              transparent processes, and a clean wallet package with no hidden
              mining component.
            </p>
          </div>
          <img className="hero-symbol" src="/feelcoin-logo.png" alt="Feelcoin" />
        </section>

        <section className="network-strip">
          <div>
            <span>BLOCK HEIGHT</span>
            <strong>{formatNumber(daemon.height)}</strong>
          </div>
          <div>
            <span>CONNECTIONS</span>
            <strong>{daemon.reachable ? formatNumber(totalConnections) : "—"}</strong>
          </div>
          <div>
            <span>NODE SYNC</span>
            <strong>
              {daemon.synchronized === null
                ? "—"
                : daemon.synchronized
                  ? "Synced"
                  : "Syncing"}
            </strong>
          </div>
          <div>
            <span>WALLET RPC</span>
            <strong>{walletRpc.reachable ? "Ready" : "Offline"}</strong>
          </div>
        </section>

        <section className="grid">
          <article className="card">
            <div className="card-heading">
              <div>
                <p className="eyebrow">LOCAL NODE</p>
                <h3>Daemon status</h3>
              </div>
              <span className={daemon.reachable ? "dot online-dot" : "dot"} />
            </div>

            <div className="metric">
              <span>RPC endpoint</span>
              <strong>
                {daemon.host}:{network.daemon_rpc_port}
              </strong>
            </div>

            <div className="metric">
              <span>Daemon</span>
              <strong>{daemon.reachable ? "Reachable" : "Not detected"}</strong>
            </div>

            <div className="metric">
              <span>Incoming peers</span>
              <strong>{formatNumber(daemon.incoming_connections)}</strong>
            </div>

            <div className="metric">
              <span>Outgoing peers</span>
              <strong>{formatNumber(daemon.outgoing_connections)}</strong>
            </div>

            {daemon.error && <p className="error-note">{daemon.error}</p>}

            <button className="primary" onClick={refreshServices} disabled={checking}>
              {checking ? "Checking…" : "Refresh local services"}
            </button>
          </article>

          <article className="card">
            <div className="card-heading">
              <div>
                <p className="eyebrow">LOCAL WALLET SERVICE</p>
                <h3>Wallet RPC</h3>
              </div>
              <span className={walletRpc.reachable ? "dot online-dot" : "dot"} />
            </div>

            <div className="metric">
              <span>RPC endpoint</span>
              <strong>
                {walletRpc.host}:{network.wallet_rpc_port}
              </strong>
            </div>

            <div className="metric">
              <span>Status</span>
              <strong>{walletRpc.reachable ? "Ready" : "Not detected"}</strong>
            </div>

            <div className="metric">
              <span>RPC version</span>
              <strong>{formatNumber(walletRpc.version)}</strong>
            </div>

            <p className="service-note">
              This probe only checks the local Feelcoin wallet RPC service. It
              does not request a seed, private key, password, or wallet file.
            </p>
          </article>

          <article className="card">
            <p className="eyebrow">NETWORK DEFAULTS</p>
            <h3>Feelcoin ports</h3>
            <div className="ports">
              <div>
                <span>P2P</span>
                <strong>{network.p2p_port}</strong>
              </div>
              <div>
                <span>Daemon RPC</span>
                <strong>{network.daemon_rpc_port}</strong>
              </div>
              <div>
                <span>ZMQ</span>
                <strong>{network.zmq_port}</strong>
              </div>
              <div>
                <span>Wallet RPC</span>
                <strong>{network.wallet_rpc_port}</strong>
              </div>
            </div>

            <div className="node-details">
              <span>Reported status</span>
              <strong>{daemon.status ?? "—"}</strong>
              <span>Daemon version</span>
              <strong>{daemon.version ?? "—"}</strong>
              <span>Difficulty</span>
              <strong>{formatNumber(daemon.difficulty)}</strong>
              <span>Target block time</span>
              <strong>
                {daemon.target_seconds === null ? "—" : `${daemon.target_seconds}s`}
              </strong>
            </div>
          </article>

          <article className="card">
            <p className="eyebrow">NEXT MILESTONE</p>
            <h3>Open a real wallet</h3>
            <p className="service-note">
              The next step is controlled wallet RPC lifecycle management:
              create, open, restore, lock, send, receive, and transaction history.
              Wallet secrets will stay local and will never be written to logs.
            </p>
            <div className="coming-soon">Wallet controls are under development</div>
          </article>

          <article className="card wide">
            <p className="eyebrow">SECURITY MODEL</p>
            <h3>Visible processes. Explicit choices.</h3>
            <div className="principles">
              <div>
                <strong>No silent mining</strong>
                <span>The desktop wallet does not contain or launch a miner.</span>
              </div>
              <div>
                <strong>No antivirus bypasses</strong>
                <span>
                  We do not ask users to disable Defender or add broad exclusions.
                </span>
              </div>
              <div>
                <strong>No packers or obfuscation</strong>
                <span>Official builds remain reviewable and straightforward.</span>
              </div>
              <div>
                <strong>Release verification</strong>
                <span>Official releases will publish SHA-256 checksums.</span>
              </div>
            </div>
          </article>
        </section>

        <footer>
          Feelcoin Desktop v0.1 development scaffold · Community-first · Open source
        </footer>
      </section>
    </main>
  );
}

export default App;
