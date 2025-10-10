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
            <div className={styles.sidebar}>
                <div className={styles.gridBox}></div>
                <h1 className={styles.welcomeText}>Welcome user</h1>
                <button className={styles.navButton}>Overview</button>
                <button className={styles.navButton} onClick={navigateToTeam}>Manage Team</button>
                <button className={styles.navButton} onClick={navigateToRange}>Manage Range</button>
                <div className={styles.settingsGroup}>
                </div>
                <div className={styles.settingsGroup}>
                    <button className={styles.navButton}>User Settings</button>
                    <button className={styles.navButton}>Logout</button>
                </div>
            </div>

            <div className={styles.mainContent}>
                <h1 className={styles.mainHeading}>OVERVIEW</h1>
                
                <div className={styles.topContentRow}>
                    <div className={styles.contentSection}>
                        <h2>Range Status</h2>
                        <p>{`{range deployed & active?}`}</p>
                    </div>
                    <div className={styles.contentSection}>
                        <h2>Range Info</h2>
                        <p>{`{num machines, subnet}`}</p>
                    </div>
                </div>

                <div className={styles.machineContainer}>
                    {Array.from({ length: 4 }).map((_, index) => (
                        <div key={index} className={styles.machineBlock}>
                            <h3>{`{MACHINE}`}</h3>
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