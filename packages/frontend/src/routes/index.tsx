// // Creating route definition for the '/' path
// export const Route = createFileRoute('/')({
//     component: Landing,
// });

// function Landing() {
//     const navigate = useNavigate()

//     const navigateToRange= ()=>{
//         navigate({ to: '/range'});
//     };
    
//     return (
//         <div className={styles.container}>
//             <h1>Overview</h1>
//             <button onClick={navigateToRange}>Manage Range</button>
//         </div>
//     )
// }

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import styles from './index.module.css';

type Machine = {
  hostname: string;
  scenario: string;
  service: string;
  os: string;
  ip: string;
  saltStates?: string[];
  vars?: Record<string, any>;
  givens?: {
    user?: string;
    password?: string;
    [key: string]: any;
  } | null;
};

type CurrentJob = {
  status: string;
  progress: string;
  createdAt: string;
  updatedAt: string;
  options: {
    difficulty: string;
    'amt-machines': number;
    composition: {
      windows: number;
      linux: number;
      random: number;
    };
  };
  scenarios: Array<{
    name: string;
    vars: Record<string, any>;
  }>;
  machines: Machine[];
    error: string | { message: string; stack?: string } | null;
};

// Creating route definition for the '/' path
export const Route = createFileRoute('/')({
    component: Landing,
});

function Landing() {
    const navigate = useNavigate();
    const [currentJob, setCurrentJob] = useState<CurrentJob | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCredentials, setShowCredentials] = useState<string | null>(null);

    useEffect(() => {
        fetchCurrentJob();
        // Poll for updates every 5 seconds
        const interval = setInterval(fetchCurrentJob, 5000);
        return () => clearInterval(interval);
    }, []);

    const fetchCurrentJob = async () => {
        try {
            const res = await fetch('/api/current-job');
            if (!res.ok) throw new Error('Failed to fetch current job');
            const data = await res.json();
            setCurrentJob(data);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    const navigateToRange = () => {
        navigate({ to: '/range' });
    };


    const getStatusColor = (status: string) => {
        switch (status) {
            case 'provisioning':
            case 'active':
                return '#4CAF50';
            case 'error':
            case 'failed':
                return '#f44336';
            case 'destroyed':
                return '#999';
            default:
                return '#2196F3';
        }
    };

    return (
        <div className={styles.container}>
            {/* Sidebar */}
            <div className={styles.sidebar}>
                <img src="/logo.svg" alt="DCR Logo" className={styles.logo} />
                <h1 className={styles.welcomeText}>Welcome to the Dynamic Cyber Range</h1>

      <button className={styles.navButton}>Overview</button>
      <button
        className={styles.navButton}
        onClick={navigateToRange}
      >
        Manage Range
      </button>
      <button
        className={styles.navButton}
        onClick={() => navigate({ to: '/scenarios' })}
      >
        Scenarios
      </button>

                {/* <div className={styles.settingsGroup}>
                    <button className={styles.navButton}>User Settings</button>
                </div> */}
            </div>

            {/* Main content */}
            <div className={styles.mainContent}>
                <h2 className={styles.mainHeading}>Overview</h2>
                <p>
                    This dashboard summarizes the current state of the cyber range,
                    including deployment status and active machines.
                </p>

                {error && (
                    <div style={{ padding: '1rem', color: '#f44336', marginBottom: '1rem' }}>
                        Error: {error}
                    </div>
                )}

                <div className={styles.topContentRow}>
                    <div className={styles.contentSection}>
                        <h3>Range Status</h3>
                        {loading ? (
                            <p>Loading...</p>
                        ) : currentJob ? (
                            <>
                                <p>
                                    Status: <strong style={{ color: getStatusColor(currentJob.status) }}>
                                        {currentJob.status.charAt(0).toUpperCase() + currentJob.status.slice(1)}
                                    </strong>
                                </p>
                                {currentJob.error && (
                                    <div style={{ color: '#f44336', marginTop: '8px' }}>
                                        <p style={{ margin: 0 }}>
                                            Error: {typeof currentJob.error === 'string' ? currentJob.error : currentJob.error.message}
                                        </p>
                                        {typeof currentJob.error === 'object' && currentJob.error?.stack && (
                                            <details style={{ marginTop: '6px', color: '#ffdddd' }}>
                                                <summary style={{ cursor: 'pointer' }}>Details</summary>
                                                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem', margin: '8px 0 0 0' }}>{currentJob.error.stack}</pre>
                                            </details>
                                        )}
                                    </div>
                                )}
                            </>
                        ) : (
                            <p>No active range</p>
                        )}
                    </div>

                    <div className={styles.contentSection}>
                        <h3>Range Info</h3>
                        {loading ? (
                            <p>Loading...</p>
                        ) : currentJob ? (
                            <>
                                <p><strong>Progress:</strong> {currentJob.progress}</p>
                                <p><strong>Last Updated:</strong> {new Date(currentJob.updatedAt).toLocaleString()}</p>
                                {currentJob.status === 'active' && currentJob.machines.length > 0 && (
                                    <p><strong>Machines Ready:</strong> {currentJob.machines.length}</p>
                                )}
                            </>
                        ) : (
                            <p>No range information available</p>
                        )}
                    </div>
                </div>

                {/* Summary of options and scenarios */}
                {currentJob && currentJob.status === 'active' && (
                    <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                        <h3>Deployment Summary</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <strong>Configuration:</strong>
                                <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
                                    <li>Difficulty: {currentJob.options.difficulty}</li>
                                    <li>Total Machines: {currentJob.options['amt-machines']}</li>
                                    <li>Linux: {currentJob.options.composition.linux}</li>
                                    <li>Windows: {currentJob.options.composition.windows}</li>
                                    <li>Random: {currentJob.options.composition.random}</li>
                                </ul>
                            </div>
                            <div>
                                <strong>Scenarios:</strong>
                                <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
                                    {currentJob.scenarios.map((scenario, idx) => (
                                        <li key={idx}>{scenario.name}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>
                )}

                <h3 style={{ marginTop: '2rem' }}>Machines</h3>
                <div className={styles.machineContainer}>
                    {loading ? (
                        <p>Loading machines...</p>
                    ) : currentJob && currentJob.machines.length > 0 ? (
                        currentJob.machines.map((machine, idx) => (
                            <div key={idx} className={styles.machineBlock}>
                                <h4>{machine.hostname} ({machine.ip})</h4>
                                <p>{machine.os}</p>
                                {machine.givens && (
                                    <>
                                        <button
                                            onClick={() => setShowCredentials(showCredentials === machine.hostname ? null : machine.hostname)}
                                            style={{
                                                marginTop: '0.5rem',
                                                padding: '0.5rem 1rem',
                                                backgroundColor: '#1e3a5f',
                                                color: '#f5f7fa',
                                                border: '1px solid #2a5a8f',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                fontSize: '0.9rem',
                                                fontWeight: '500'
                                            }}
                                        >
                                            {showCredentials === machine.hostname ? 'Hide Credentials' : 'Show Credentials'}
                                        </button>
                                        {showCredentials === machine.hostname && (
                                            <>
                                                <div
                                                    onClick={() => setShowCredentials(null)}
                                                    style={{
                                                        position: 'fixed',
                                                        top: 0,
                                                        left: 0,
                                                        right: 0,
                                                        bottom: 0,
                                                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                                                        zIndex: 999
                                                    }}
                                                />
                                                <div style={{
                                                    position: 'fixed',
                                                    top: '50%',
                                                    left: '50%',
                                                    transform: 'translate(-50%, -50%)',
                                                    backgroundColor: '#0a1628',
                                                    padding: '2rem',
                                                    borderRadius: '8px',
                                                    border: '1px solid #2a5a8f',
                                                    zIndex: 1000,
                                                    minWidth: '300px',
                                                    maxWidth: '500px',
                                                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)'
                                                }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                                        <strong style={{ color: '#f5f7fa', fontSize: '1.2rem' }}>Credentials - {machine.hostname}</strong>
                                                        <button
                                                            onClick={() => setShowCredentials(null)}
                                                            style={{
                                                                backgroundColor: 'transparent',
                                                                border: 'none',
                                                                color: '#f5f7fa',
                                                                fontSize: '1.5rem',
                                                                cursor: 'pointer',
                                                                padding: '0',
                                                                lineHeight: '1',
                                                                opacity: 0.7
                                                            }}
                                                            onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                                            onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                    {machine.givens.user && (
                                                        <div style={{ marginBottom: '1rem' }}>
                                                            <strong style={{ color: '#f5f7fa' }}>Username:</strong>
                                                            <div style={{
                                                                marginTop: '0.25rem',
                                                                backgroundColor: '#0d1117',
                                                                padding: '0.5rem',
                                                                borderRadius: '4px',
                                                                fontFamily: 'monospace',
                                                                fontSize: '1rem',
                                                                color: '#f5f7fa',
                                                                wordBreak: 'break-all'
                                                            }}>
                                                                {machine.givens.user}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {machine.givens.password && (
                                                        <div>
                                                            <strong style={{ color: '#f5f7fa' }}>Password:</strong>
                                                            <div style={{
                                                                marginTop: '0.25rem',
                                                                backgroundColor: '#0d1117',
                                                                padding: '0.5rem',
                                                                borderRadius: '4px',
                                                                fontFamily: 'monospace',
                                                                fontSize: '1rem',
                                                                color: '#f5f7fa',
                                                                wordBreak: 'break-all'
                                                            }}>
                                                                {machine.givens.password}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                        ))
                    ) : (
                        <p>No machines deployed yet</p>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Landing;
