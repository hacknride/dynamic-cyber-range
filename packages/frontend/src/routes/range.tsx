import { createFileRoute, useNavigate } from '@tanstack/react-router';
import React, { useState } from 'react';
import styles from './range.module.css';

export const Route = createFileRoute('/range')({
  component: Range,
});

function Range() {
  const navigate = useNavigate();

  const [difficulty, setDifficulty] = useState('medium');
  const [machineCount, setMachineCount] = useState(4);
  const [linuxCount, setLinuxCount] = useState(2);
  const [windowsCount, setWindowsCount] = useState(2);

  const handleDeploy = () => {
    // These controls will later be wired to the backend to deploy a real range
    alert('Deploy would trigger a real range deployment once the backend is integrated.');
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
          {/* <button className={styles.navButton}>User Settings</button>*/}
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
                onChange={(e) => setDifficulty(e.target.value)}
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
             <p className={styles.warningText}>
                 OS limit: Max {machineCount} machines per user
            </p>

            <p className={styles.helperText}>
              The sum of Linux and Windows hosts should not exceed the total machine count.
            </p>
          </div>

          <div className={styles.card}>
            <h3>Attack Focus</h3>

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
              <span className={styles.summaryLabel}>Linux / Windows</span>
              <span className={styles.summaryValue}>
                {linuxCount} / {windowsCount}
              </span>
            </div>
          </div>
        </section>

        <section className={styles.actions}>
          <button className={styles.secondaryButton}>Preview config</button>
          <div className={styles.actionsRight}>
            <button
              className={styles.dangerButton}
              type="button"
              onClick={handleReset}
            >
              Reset
            </button>
            <button
              className={styles.primaryButton}
              type="button"
              onClick={handleDeploy}
            >
              Deploy range
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

export default Range;
