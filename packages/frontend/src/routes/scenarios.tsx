import { createFileRoute, useNavigate } from '@tanstack/react-router';
import React, { useState, useEffect } from 'react';
import styles from './scenarios.module.css';

export const Route = createFileRoute('/scenarios')({
  component: ScenariosPage,
});

type Scenario = {
  name: string;
  os: string;
  difficulty: string;
  vars: Record<string, any>;
};

type Subcategory = {
  name: string;
  displayName: string;
  scenarios: Scenario[];
};

type Stage = {
  stage: string;
  displayName: string;
  subcategories: Subcategory[];
};

function ScenariosPage() {
  const navigate = useNavigate();
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());
  const [expandedSubcategories, setExpandedSubcategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchScenarios();
  }, []);

  const fetchScenarios = async () => {
    try {
      const res = await fetch('/api/scenarios');
      if (!res.ok) throw new Error('Failed to fetch scenarios');
      const data = await res.json();
      setStages(data);
      // Stages are always expanded (not collapsible)
      setExpandedStages(new Set(data.map((s: Stage) => s.stage)));
      // Expand all subcategories by default
      const allSubcats = data.flatMap((s: Stage) => 
        s.subcategories?.map((sub: Subcategory) => `${s.stage}/${sub.name}`) || []
      );
      setExpandedSubcategories(new Set(allSubcats));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const toggleSubcategory = (key: string) => {
    setExpandedSubcategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div className={styles.container}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <img src="/logo.svg" alt="DCR Logo" className={styles.logo} />
        <h1 className={styles.title}>Scenarios</h1>

        <button
          className={styles.navButton}
          onClick={() => navigate({ to: '/' })}
        >
          Overview
        </button>
        <button
          className={styles.navButton}
          onClick={() => navigate({ to: '/range' })}
        >
          Manage Range
        </button>
        <button className={styles.navButtonActive}>Scenarios</button>

        <div className={styles.settingsGroup}>
          <button className={styles.navButton}>User Settings</button>
        </div>
      </aside>

      {/* Main content */}
      <main className={styles.mainContent}>
        <header className={styles.header}>
          <h2>Available Scenarios</h2>
          <p>
            Browse all available scenarios organized by attack stages. Each stage contains categories
            with specific vulnerabilities and configurations for training purposes.
          </p>
        </header>

        {loading && <p>Loading scenarios...</p>}
        
        {error && (
          <div className={styles.error}>
            Error: {error}
          </div>
        )}

        {!loading && !error && stages.length === 0 && (
          <p>No scenarios found.</p>
        )}

        {!loading && !error && stages.length > 0 && (
          <div className={styles.categoriesContainer}>
            {stages.map((stage) => (
              <div key={stage.stage} className={styles.stageCard}>
                <div className={styles.stageHeader}>
                  <h2>{stage.displayName}</h2>
                </div>

                {stage.subcategories && (
                  <div className={styles.subcategoriesContainer}>
                    {stage.subcategories.map((subcat) => {
                      const subcatKey = `${stage.stage}/${subcat.name}`;
                      return (
                        <div key={subcatKey} className={styles.categoryCard}>
                          <div
                            className={styles.categoryHeader}
                            onClick={() => toggleSubcategory(subcatKey)}
                          >
                            <h3>{subcat.displayName}</h3>
                            <span className={styles.expandIcon}>
                              {expandedSubcategories.has(subcatKey) ? '▼' : '▶'}
                            </span>
                          </div>

                          {expandedSubcategories.has(subcatKey) && (
                            <div className={styles.scenariosList}>
                              {subcat.scenarios.length === 0 ? (
                                <p className={styles.emptyText}>No scenarios in this category</p>
                              ) : (
                                subcat.scenarios.map((scenario) => (
                                  <div key={scenario.name} className={styles.scenarioItem}>
                                    <div className={styles.scenarioHeader}>
                                      <span className={styles.scenarioName}>
                                        {scenario.os === 'linux' ? '🐧' : scenario.os === 'windows' ? '🪟' : '💻'}{' '}
                                        {scenario.name.charAt(0).toUpperCase() + scenario.name.slice(1)}
                                      </span>
                                      <span className={styles.difficultyBadge} data-difficulty={scenario.difficulty}>
                                        {scenario.difficulty}
                                      </span>
                                    </div>
                                    {Object.keys(scenario.vars).length > 0 && (
                                      <div className={styles.scenarioVars}>
                                        <small>Variables:</small>
                                        <ul>
                                          {Object.entries(scenario.vars).map(([key, value]) => (
                                            <li key={key}>
                                              <code>{key}</code>: {String(value)}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default ScenariosPage;
