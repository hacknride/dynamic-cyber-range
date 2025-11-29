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

type Category = {
  category: string;
  displayName: string;
  scenarios: Scenario[];
};

function ScenariosPage() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchScenarios();
  }, []);

  const fetchScenarios = async () => {
    try {
      const res = await fetch('/api/scenarios');
      if (!res.ok) throw new Error('Failed to fetch scenarios');
      const data = await res.json();
      setCategories(data);
      // Expand all categories by default
      setExpandedCategories(new Set(data.map((c: Category) => c.category)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
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
            Browse all available scenarios organized by attack focus. Each scenario includes
            specific configurations and vulnerabilities for training purposes.
          </p>
        </header>

        {loading && <p>Loading scenarios...</p>}
        
        {error && (
          <div className={styles.error}>
            Error: {error}
          </div>
        )}

        {!loading && !error && categories.length === 0 && (
          <p>No scenarios found.</p>
        )}

        {!loading && !error && categories.length > 0 && (
          <div className={styles.categoriesContainer}>
            {categories.map((cat) => (
              <div key={cat.category} className={styles.categoryCard}>
                <div
                  className={styles.categoryHeader}
                  onClick={() => toggleCategory(cat.category)}
                >
                  <h3>{cat.displayName}</h3>
                  <span className={styles.expandIcon}>
                    {expandedCategories.has(cat.category) ? '▼' : '▶'}
                  </span>
                </div>

                {expandedCategories.has(cat.category) && (
                  <div className={styles.scenariosList}>
                    {cat.scenarios.length === 0 ? (
                      <p className={styles.emptyText}>No scenarios in this category</p>
                    ) : (
                      cat.scenarios.map((scenario) => (
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
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default ScenariosPage;
