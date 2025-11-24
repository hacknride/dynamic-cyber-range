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
import React from 'react';
import styles from './index.module.css';

// Creating route definition for the '/' path
export const Route = createFileRoute('/')({
    component: Landing,
});

function Landing() {
    const navigate = useNavigate();

    const navigateToRange = () => {
        navigate({ to: '/range' });
    };

    const navigateToTeam = () => {
        navigate({ to: '/team' });
    };

return (
  <div className={styles.container}>
    {/* Sidebar */}
    <div className={styles.sidebar}>
      <div className={styles.gridBox}>
      <div className={styles.imageContainer}>
  <img src=packages/frontend/public/images.jpg alt="My Photo" className={styles.myImage} />
</div>


      </div>
      <h1 className={styles.welcomeText}>Welcome to the Dynamic Cyber Range</h1>

      <button className={styles.navButton}>Overview</button>
      <button
        className={styles.navButton}
        onClick={navigateToTeam}
      >
        Manage Team
      </button>
      <button
        className={styles.navButton}
        onClick={navigateToRange}
      >
        Manage Range
      </button>

      <div className={styles.settingsGroup}>
        <button className={styles.navButton}>User Settings</button>
      </div>
    </div>

    {/* Main content */}
    <div className={styles.mainContent}>
      <h2 className={styles.mainHeading}>Overview</h2>
      <p>
        This dashboard summarizes the current state of the cyber range,
        including deployment status and active machines.
      </p>

      <div className={styles.topContentRow}>
        <div className={styles.contentSection}>
          <h3>Range Status</h3>
          <p>Range deployed &amp; active: <strong>Pending integration</strong></p>
        </div>

        <div className={styles.contentSection}>
          <h3>Range Info</h3>
          <p>Machines, subnet, and other details will appear here once connected.</p>
        </div>
      </div>

      <h3 style={{ marginTop: '2rem' }}>Machines</h3>
      <div className={styles.machineContainer}>
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className={styles.machineBlock}>
            <h4>{`{MACHINE}`}</h4>
            <p>{`{service}`}</p>
            <p>{`{ip}`}</p>
            <p>{`{up/down}`}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
);
}

export default Landing;
