import { createFileRoute, useNavigate } from '@tanstack/react-router';
import React, { useState } from 'react';
import styles from './range.module.css';

export const Route = createFileRoute('/range')({
  component: Range,
});

type RangePayload = {
  difficulty: 'easy' | 'medium' | 'hard';
  machinesPresent: number;
  category: string;         // TEMP: fixed until you wire checkboxes
  windowsCount: number;
  linuxCount: number;
  randomCount: number;
  segmentation?: boolean;   // not yet in UI; add later if needed
};

function Range() {
  const navigate = useNavigate();

  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [machineCount, setMachineCount] = useState<string>('4');
  const [linuxCount, setLinuxCount] = useState<string>('2');
  const [windowsCount, setWindowsCount] = useState<string>('2');

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

    const payload: RangePayload = {
      difficulty,
      machinesPresent: mp,
      category: 'web-app-exploits', // TODO: derive from the checkboxes later
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
    alert('Payload to be sent:\n\n' + JSON.stringify(payload, null, 2));
  };

  const handleDeploy = async () => {
    const payload = buildPayload();
    if (!payload) return;

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

      const data = await res.json(); // { id, status, machines, config? }
      // Navigate to the status page for this new range
      navigate({ to: '/range/$id', params: { id: data.id } });
    } catch (err: any) {
      console.error('Error creating range:', err);
      alert(`Error creating range: ${err?.message ?? String(err)}`);
    }
  };

  const handleReset = () => {
    setDifficulty('easy');
    setMachineCount('1');
    setLinuxCount('0');
    setWindowsCount('0');
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

        <div className={styles.settingsGroup}>
          {/* <button className={styles.navButton}>User Settings</button>*/}
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
                  else if (num > 20) setMachineCount('20');
                }}
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
                  const max = Number(machineCount) || 20;
                  if (num < 0) setLinuxCount('0');
                  else if (num > max) setLinuxCount(String(max));
                }}
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
                  const max = Number(machineCount) || 20;
                  if (num < 0) setWindowsCount('0');
                  else if (num > max) setWindowsCount(String(max));
                }}
              />
            </label>
             <p className={styles.warningText}>
                 OS limit: Max {machineCount} machines per user
            </p>

            <p className={styles.helperText}>
              The sum of Linux and Windows hosts should not exceed the total machine count.
              (The remainder will be treated as Random.)
            </p>
          </div>

          <div className={styles.card}>
            <h3>Attack Focus</h3>

            {/* These are visual for now. Later, wire to state to set category(s). */}
            <label className={styles.checkboxField}>
              <input type="checkbox" defaultChecked />
              <span>Web application testing</span>
            </label>

            <label className={styles.checkboxField}>
              <input type="checkbox" />
              <span>Active Directory / internal network</span>
            </label>

            <label className={styles.checkboxField}>
              <input type="checkbox" />
              <span>Cloud / external services</span>
            </label>

            <label className={styles.checkboxField}>
              <input type="checkbox" />
              <span>Blue-team / detection focused</span>
            </label>
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
            <button className={styles.dangerButton} type="button" onClick={handleReset}>
              Reset
            </button>
            <button className={styles.primaryButton} type="button" onClick={handleDeploy}>
              Deploy range
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

export default Range;
