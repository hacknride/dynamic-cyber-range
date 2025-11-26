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
  const [machineCount, setMachineCount] = useState<number>(4);
  const [linuxCount, setLinuxCount] = useState<number>(2);
  const [windowsCount, setWindowsCount] = useState<number>(2);

  // ────────────────────────────────────────────────────────────────────────────
  // Helpers
  const buildPayload = (): RangePayload | null => {
    const mp = Number(machineCount ?? 0);
    const lc = Number(linuxCount ?? 0);
    const wc = Number(windowsCount ?? 0);

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
    setDifficulty('medium');
    setMachineCount(4);
    setLinuxCount(2);
    setWindowsCount(2);
  };

  return (
    <div className={styles.container}>
      {/* Sidebar navigation */}
      <aside className={styles.sidebar}>
        <div className={styles.gridBox}></div>
        <h1 className={styles.title}>Manage Range</h1>

        <button
          className={styles.navButton}
          onClick={() => navigate({ to: '/' })}
        >
          Overview
        </button>
        <button
          className={styles.navButton}
          onClick={() => navigate({ to: '/team' })}
        >
          Manage Team
        </button>
        <button className={styles.navButtonActive}>Manage Range</button>

        <div className={styles.settingsGroup}>
          <button className={styles.navButton}>User Settings</button>
        </div>
      </aside>

      {/* Main configuration content */}
      <main className={styles.mainContent}>
        <header className={styles.header}>
          <h2>Range Configuration</h2>
          <p>
            Use these controls to describe the kind of training environment you want.
            This page currently acts as a configuration mock and will be wired to the
            backend deployment pipeline in a later phase.
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
                type="number"
                min={1}
                max={20}
                value={machineCount}
                onChange={(e) => setMachineCount(Number(e.target.value))}
              />
            </label>
          </div>

          <div className={styles.card}>
            <h3>Operating Systems</h3>

            <label className={styles.field}>
              <span>Linux hosts</span>
              <input
                type="number"
                min={0}
                max={machineCount}
                value={linuxCount}
                onChange={(e) => setLinuxCount(Number(e.target.value))}
              />
            </label>

            <label className={styles.field}>
              <span>Windows hosts</span>
              <input
                type="number"
                min={0}
                max={machineCount}
                value={windowsCount}
                onChange={(e) => setWindowsCount(Number(e.target.value))}
              />
            </label>

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
              <span className={styles.summaryValue}>{machineCount}</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Linux / Windows / Random</span>
              <span className={styles.summaryValue}>
                {linuxCount} / {windowsCount} / {Math.max(0, machineCount - (linuxCount + windowsCount))}
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
