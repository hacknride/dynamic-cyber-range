import { createFileRoute, useNavigate } from '@tanstack/react-router'
import React, { useState } from "react";
import styles from './range.module.css';

// Creating route definition for the '/' path
export const Route = createFileRoute('/range')({
    component: RangePage,
})

export default function RangePage() {

    const navigate = useNavigate()

    const navigateToLanding= ()=>{
        navigate({ to: '/'})
    }

    const navigateToTeam= ()=>{
        navigate({ to: '/team'})
    }

    // does nothing for now, just a temporary fix to get buttons working for
    // range actions
    const placeholder= ()=>{
        return
    }

    // State for each dropdown menu
    const [difficulty, setDifficulty] = useState('');
    const [machinesPresent, setMachinesPresent] = useState('');
    const [category, setCategory] = useState('');
    const [windowsCount, setWindowsCount] = useState('');
    const [linuxCount, setLinuxCount] = useState('');
    const [randomCount, setRandomCount] = useState('');

    function DropdownMenu() {
        const [selectedOptions, setSelectedOption] = useState('');

        const handleSelectChange = (event) => {
            setSelectedOption(event.target.value);
        };
    }
    

    return (
        <div className={styles.container}>
            <div className={styles.sidebar}>
                <div className={styles.gridBox}></div>
                <h1 className={styles.welcomeText}>Welcome user</h1>
                <button className={styles.navButton} onClick={navigateToLanding}>Overview</button>
                <button className={styles.navButton} onClick={navigateToTeam}>Manage Team</button>
                <button className={styles.navButton}>Manage Range</button>
                <div className={styles.settingsGroup}>
                </div>
                <div className={styles.settingsGroup}>
                    <button className={styles.navButton}>User Settings</button>
                    <button className={styles.navButton}>Logout</button>
                </div>
            </div>

            <div className={styles.mainContent}>
    <h1 className={styles.mainHeading}>Manage Range</h1>
    <div className={styles.contentGrid}>
        <div className={styles.leftColumn}>
            {/* Range Actions Section */}
            <div className={styles.formSection}>
                <h2>Range Actions</h2>
                <div className={styles.buttonGroup}>
                    <button className={styles.deployButton} onClick={placeholder}>
                        {`{deploy/shutdown}`}
                    </button>
                    <button className={styles.resetButton} onClick={placeholder}>
                        Reset
                    </button>
                </div>
            </div>

            {/* Pre Deployment Options Section */}
            <div className={styles.formSection}>
                <h2>Pre Deployment Options</h2>
                <p className={styles.lockedText}>{`{displays LOCKED if range is deployed}`}</p>
                <br></br>
                
                <label className={styles.label}>Range Difficulty</label><br></br>
                <select 
                    className={styles.select} 
                    value={difficulty} 
                    onChange={(e) => setDifficulty(e.target.value)}
                >
                    <option value="" disabled>Value</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                </select>
                
                <br></br><br></br>
                <label className={styles.label}>Machines Present</label>
                <br></br>
                <select 
                    className={styles.select} 
                    value={machinesPresent} 
                    onChange={(e) => setMachinesPresent(e.target.value)}
                >
                    <option value="" disabled>Value</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                </select>

                <div className={styles.toggleContainer}>
                    <br></br>
                    <label className={styles.label}>Segmentation?</label>
                    <span className={styles.toggleSwitch}>
                        <input type="checkbox" />
                        <span className={styles.slider}></span>
                    </span>
                </div>
            </div>

            {/* Category Section */}
            <br></br><br></br>
            <div className={styles.formSection}>
                <h2>Category</h2>
                <label className={styles.label}>Select Category Practice</label>
                <br></br>
                <select 
                    className={styles.select} 
                    value={category} 
                    onChange={(e) => setCategory(e.target.value)}
                >
                    <option value="" disabled>Value</option>
                    <option value="web-app-exploits">Web App Exploits</option>
                    <option value="active-directory">Active Directory</option>
                    <option value="linux-privesc">Linux Privesc</option>
                    <option value="reverse-engineering">Reverse Engineering</option>
                </select>
            </div>
        </div>

                <div className={styles.rightColumn}>
                        {/* Network Composition Section */}
                        <div className={styles.formSection}>
                            <h2>Network Composition &#123;amt machines&#125;</h2>
                            <label className={styles.label}>Windows</label>
                            <br></br>
                            <select 
                                className={styles.select} 
                                value={windowsCount} 
                                onChange={(e) => setWindowsCount(e.target.value)}
                            >
                                <option value="" disabled>Value</option>
                                <option value="0">0</option>
                                <option value="1">1</option>
                                <option value="2">2</option>
                            </select>
                            <br></br><br></br>
                            <label className={styles.label}>Linux</label>
                            <br></br>
                            <select 
                                className={styles.select} 
                                value={linuxCount} 
                                onChange={(e) => setLinuxCount(e.target.value)}
                            >
                                <option value="" disabled>Value</option>
                                <option value="0">0</option>
                                <option value="1">1</option>
                                <option value="2">2</option>
                            </select>
                            <br></br><br></br>
                            <label className={styles.label}>Random</label>
                            <br></br>
                            <select 
                                className={styles.select} 
                                value={randomCount} 
                                onChange={(e) => setRandomCount(e.target.value)}
                            >
                                <option value="" disabled>Value</option>
                                <option value="0">0</option>
                                <option value="1">1</option>
                                <option value="2">2</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}