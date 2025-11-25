import { createFileRoute, useNavigate } from '@tanstack/react-router'
import React from "react";
import styles from './team.module.css';

// Creating route definition for the '/team' path
export const Route = createFileRoute('/team')({
    component: TeamPage,
})

export default function TeamPage() {

    const navigate = useNavigate()

    const navigateToLanding= ()=>{
        navigate({ to: '/'})
    }

    const navigateToRange= ()=>{
        navigate({ to: '/range'})
    }
    

    return (
        <div className={styles.container}>
            <div className={styles.sidebar}>
                <div className={styles.gridBox}></div>
                <h1 className={styles.welcomeText}>Welcome user</h1>
                <button className={styles.navButton} onClick={navigateToLanding}>Overview</button>
                <button className={styles.navButton}>Manage Team</button>
                <button className={styles.navButton} onClick={navigateToRange}>Manage Range</button>
                <div className={styles.settingsGroup}>
                </div>
                <div className={styles.settingsGroup}>
                    <button className={styles.navButton}>User Settings</button>
                    <button className={styles.navButton}>Logout</button>
                </div>
            </div>
   
            {/*    <div className={styles.mainContent}>
                <h1 className={styles.mainHeading}>MANAGE TEAM</h1>
                
             <div className={styles.topContentRow}>
                    <div className={styles.contentSection}>
                        <h2>Your VPN Access</h2>
                    </div>
               </div>*/}

                <div className={styles.vpnBlock}>
                        <p className={styles.usernameText}>{`{username}`}</p>
                        <p>{`{Download VPN}`}</p>
                        <p>{`{Regenerate}`}</p>
                    </div>

                <div className={styles.topContentRow}>
                    <div className={styles.contentSection}>
                        <h2>Your Team 3/4</h2> {/* will need to change later to by dynamic */}
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
        </>
    );
}
