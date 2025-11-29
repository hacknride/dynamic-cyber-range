import { createFileRoute, useNavigate } from '@tanstack/react-router';
import React, { useState, useEffect } from 'react';
import styles from './range.module.css';

export const Route = createFileRoute('/range')({
  component: Range,
});

type RangePayload = {
  difficulty: 'easy' | 'medium' | 'hard';
  machinesPresent: number;
  category: string[];       // Array of selected attack-focus categories
  windowsCount: number;
  linuxCount: number;
  randomCount: number;
  segmentation?: boolean;   // not yet in UI; add later if needed
};

function Range() {
  const navigate = useNavigate();

  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('easy');
  const [machineCount, setMachineCount] = useState<string>('1');
  const [linuxCount, setLinuxCount] = useState<string>('0');
  const [windowsCount, setWindowsCount] = useState<string>('0');
  
  // Track range status based on current job
  const [rangeStatus, setRangeStatus] = useState<'idle' | 'building' | 'deployed' | 'destroying'>('idle');
  const [loading, setLoading] = useState(true);
  
  // Attack focus categories loaded from scenarios
  const [attackFocusCategories, setAttackFocusCategories] = useState<Array<{ category: string; displayName: string }>>([]);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());

  // ────────────────────────────────────────────────────────────────────────────
  // Fetch scenarios on mount
  useEffect(() => {
    fetchScenarios();
  }, []);

  // Fetch current job status
  useEffect(() => {
    fetchCurrentJob();
    // Poll for updates every 5 seconds
    const interval = setInterval(fetchCurrentJob, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchScenarios = async () => {
    try {
      const res = await fetch('/api/scenarios');
      if (!res.ok) throw new Error('Failed to fetch scenarios');
      const data = await res.json();
      setAttackFocusCategories(data.map((cat: any) => ({ 
        category: cat.category, 
        displayName: cat.displayName 
      })));
      // Default to first category selected
      if (data.length > 0) {
        setSelectedCategories(new Set([data[0].category]));
      }
    } catch (err) {
      console.error('Error fetching scenarios:', err);
    }
  };

  const fetchCurrentJob = async () => {
    try {
      const res = await fetch('/api/current-job');
      if (!res.ok) throw new Error('Failed to fetch current job');
      const data = await res.json();
      
      // Map job status to range status
      const status = data?.status?.toLowerCase();
      if (status === 'provisioning' || status === 'building' || status === 'deploying') {
        setRangeStatus('building');
      } else if (status === 'destroying') {
        setRangeStatus('destroying');
      } else if (status === 'active' || status === 'deployed') {
        setRangeStatus('deployed');
      } else if (status === 'destroyed' || status === 'error' || status === 'failed' || status === 'idle') {
        setRangeStatus('idle');
      }

      // Populate form fields from currentJob options ONLY when building/deployed
      // Don't overwrite user input when idle
      if ((data.status === 'provisioning' || data.status === 'active') && data.options) {
        if (data.options.difficulty) {
          setDifficulty(data.options.difficulty as 'easy' | 'medium' | 'hard');
        }
        if (data.options['amt-machines'] !== undefined) {
          setMachineCount(String(data.options['amt-machines']));
        }
        if (data.options.composition) {
          if (data.options.composition.linux !== undefined) {
            setLinuxCount(String(data.options.composition.linux));
          }
          if (data.options.composition.windows !== undefined) {
            setWindowsCount(String(data.options.composition.windows));
          }
        }
      }
    } catch (err) {
      console.error('Error fetching current job:', err);
      // On error, assume idle state
      setRangeStatus('idle');
    } finally {
      setLoading(false);
    }
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Helpers
  const buildPayload = (): RangePayload | null => {
    const mp = Number(machineCount || 0);
    const lc = Number(linuxCount || 0);
    const wc = Number(windowsCount || 0);

    if (!difficulty) {
      alert('Please select a difficulty.');
      return null;
    }
    if (!Number.isFinite(mp) || mp < 1) {
      alert('Total machines must be a number ≥ 1.');
      return null;
    }
    if ([lc, wc].some(n => !Number.isFinite(n) || n < 0)) {
      alert('Linux/Windows must be numbers ≥ 0.');
      return null;
    }
    if (lc + wc > mp) {
      alert(`Linux + Windows (${lc + wc}) cannot exceed Total machines (${mp}).`);
      return null;
    }

    const rc = mp - (lc + wc); // fill the rest as "random"

    // Convert selectedCategories Set to array
    const categoryArray = Array.from(selectedCategories);
    
    const payload: RangePayload = {
      difficulty,
      machinesPresent: mp,
      category: categoryArray.length > 0 ? categoryArray : ['web-exploits'], // Use actual folder name
      windowsCount: wc,
      linuxCount: lc,
      randomCount: rc,
      // segmentation: false, // add when you expose a toggle
    };

    return payload;
  };

  const handlePreview = () => {
    const payload = buildPayload();
    if (!payload) return;
    
    // Show the exact payload that will be sent to /api/ranges
    const categoryArray = Array.from(selectedCategories);
    const previewData = {
      difficulty: payload.difficulty,
      machinesPresent: payload.machinesPresent,
      category: categoryArray.length > 0 ? categoryArray : ['web-exploits'],
      windowsCount: payload.windowsCount,
      linuxCount: payload.linuxCount,
      randomCount: payload.randomCount,
    };
    
    alert('Payload to be sent to /api/ranges:\n\n' + JSON.stringify(previewData, null, 2));
  };

  const handleDeploy = async () => {
    const payload = buildPayload();
    if (!payload) return;

    // Show confirmation prompt
    const confirmed = window.confirm(
      'Are you sure you wish to deploy the range with your current options?'
    );
    if (!confirmed) return;

    try {
      const res = await fetch('/api/ranges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(msg || `HTTP ${res.status}`);
      }

      const data = await res.json();
      // Status will be updated by polling fetchCurrentJob
      await fetchCurrentJob();
    } catch (err: any) {
      console.error('Error creating range:', err);
      alert(`Error creating range: ${err?.message ?? String(err)}`);
    }
  };

  const handleDestroy = async () => {
    // Show confirmation prompt
    const confirmed = window.confirm(
      'Are you sure you want to destroy the range?'
    );
    if (!confirmed) return;

    try {
      const res = await fetch('/api/ranges', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(msg || `HTTP ${res.status}`);
      }

      // Status will be updated by polling fetchCurrentJob
      await fetchCurrentJob();
      handleReset();
    } catch (err: any) {
      console.error('Error destroying range:', err);
      alert(`Error destroying range: ${err?.message ?? String(err)}`);
    }
  };

  const handleReset = () => {
    setDifficulty('easy');
    setMachineCount('1');
    setLinuxCount('0');
    setWindowsCount('0');
  };

  // Determine if controls should be disabled (only editable when idle/destroyed)
  const isDisabled = rangeStatus === 'building' || rangeStatus === 'deployed' || rangeStatus === 'destroying';

  const toggleCategory = (category: string) => {
    if (isDisabled) return;
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        // Keep at least one selected
        if (next.size > 1) {
          next.delete(category);
        }
      } else {
        next.add(category);
      }
      return next;
    });
  };

  return (
    <div className={styles.container}>
      {/* Sidebar navigation */}
      <aside className={styles.sidebar}>
        <img src="/logo.svg" alt="DCR Logo" className={styles.logo} />
        <h1 className={styles.title}>Manage Range</h1>

        <button
          className={styles.navButton}
          onClick={() => navigate({ to: '/' })}
        >
          Overview
        </button>
        <button className={styles.navButtonActive}>Manage Range</button>
        <button
          className={styles.navButton}
          onClick={() => navigate({ to: '/scenarios' })}
        >
          Scenarios
        </button>

        <div className={styles.settingsGroup}>
          <button className={styles.navButton}>User Settings</button>
        </div>
      </aside>

      {/* Main configuration content */}
      <main className={styles.mainContent}>
        <header className={styles.header}>
          <h2>Range Configuration</h2>
          <p>
            Configure your range before deployment by selecting from the options below.
          </p>
        </header>

        <section className={styles.cardGrid}>
          <div className={styles.card}>
            <h3>Difficulty &amp; Size</h3>

            <label className={styles.field}>
              <span>Difficulty</span>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
                disabled={isDisabled}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>

            <label className={styles.field}>
              <span>Total machines</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={machineCount}
                onChange={(e) => {
                  const val = e.target.value;
                  if (/^\d*$/.test(val)) setMachineCount(val);
                }}
                onBlur={(e) => {
                  const num = Number(e.target.value);
                  if (num < 1) setMachineCount('1');
                  else if (num > 5) setMachineCount('5');
                }}
                disabled={isDisabled}
              />
            </label>
          </div>

          <div className={styles.card}>
            <h3>Operating Systems</h3>

            <label className={styles.field}>
              <span>Linux hosts</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={linuxCount}
                onChange={(e) => {
                  const val = e.target.value;
                  if (/^\d*$/.test(val)) setLinuxCount(val);
                }}
                onBlur={(e) => {
                  const num = Number(e.target.value);
                  const max = Math.min(Number(machineCount) || 5, 5);
                  if (num < 0) setLinuxCount('0');
                  else if (num > max) setLinuxCount(String(max));
                }}
                disabled={isDisabled}
              />
            </label>

            <label className={styles.field}>
              <span>Windows hosts</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={windowsCount}
                onChange={(e) => {
                  const val = e.target.value;
                  if (/^\d*$/.test(val)) setWindowsCount(val);
                }}
                onBlur={(e) => {
                  const num = Number(e.target.value);
                  const max = Math.min(Number(machineCount) || 5, 5);
                  if (num < 0) setWindowsCount('0');
                  else if (num > max) setWindowsCount(String(max));
                }}
                disabled={isDisabled}
              />
            </label>

            <p className={styles.helperText}>
              The sum of Linux and Windows hosts should not exceed the total machine count.
              (The remainder will be treated as Random.)
            </p>
          </div>

          <div className={styles.card}>
            <h3>Attack Focus</h3>

            {attackFocusCategories.length === 0 ? (
              <p className={styles.helperText}>Loading attack focus categories...</p>
            ) : (
              attackFocusCategories.map((cat) => (
                <label key={cat.category} className={styles.checkboxField}>
                  <input 
                    type="checkbox" 
                    checked={selectedCategories.has(cat.category)}
                    onChange={() => toggleCategory(cat.category)}
                    disabled={isDisabled} 
                  />
                  <span>{cat.displayName}</span>
                </label>
              ))
            )}
          </div>
        </section>

        <section className={styles.summarySection}>
          <h3>Current Selection</h3>
          <div className={styles.summaryRow}>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Difficulty</span>
              <span className={styles.summaryValue}>{difficulty}</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Machines</span>
              <span className={styles.summaryValue}>{machineCount || 0}</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Linux / Windows / Random</span>
              <span className={styles.summaryValue}>
                {linuxCount || 0} / {windowsCount || 0} / {Math.max(0, Number(machineCount || 0) - (Number(linuxCount || 0) + Number(windowsCount || 0)))}
              </span>
            </div>
          </div>
        </section>

        <section className={styles.actions}>
          <button className={styles.secondaryButton} type="button" onClick={handlePreview}>
            Preview config
          </button>
          <div className={styles.actionsRight}>
            <button 
              className={styles.dangerButton} 
              type="button" 
              onClick={handleReset}
              disabled={isDisabled}
            >
              Reset
            </button>
            {rangeStatus === 'deployed' || rangeStatus === 'destroying' ? (
              <button 
                className={styles.destroyButton} 
                type="button" 
                onClick={handleDestroy}
                disabled={rangeStatus === 'destroying'}
              >
                {rangeStatus === 'destroying' ? 'Destroying...' : 'Destroy Range'}
              </button>
            ) : (
              <button 
                className={styles.primaryButton} 
                type="button" 
                onClick={handleDeploy}
                disabled={rangeStatus === 'building'}
              >
                {rangeStatus === 'building' ? 'Building...' : 'Deploy range'}
              </button>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default Range;
