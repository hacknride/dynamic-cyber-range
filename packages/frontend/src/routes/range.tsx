import { createFileRoute, useNavigate } from '@tanstack/react-router'
import React, { useState } from "react";
import styles from './range.module.css';

// Define or import the RangePayload type
type RangePayload = {
    difficulty: 'easy' | 'medium' | 'hard';
    machinesPresent: number;
    category: string;
    windowsCount: number;
    linuxCount: number;
    randomCount: number;
};

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
    const sendToBackend = async () => {
        // Coerce to numbers safely (selects often give strings)
        const mp = Number(machinesPresent ?? 0);
        const wc = Number(windowsCount ?? 0);
        const lc = Number(linuxCount ?? 0);
        const rc = Number(randomCount ?? 0);
      
        // Basic validation
        if (!difficulty || !category) {
          alert("Please select a difficulty and a category.");
          return;
        }
        if (!Number.isFinite(mp) || mp < 1) {
          alert("Machines Present must be a number ≥ 1.");
          return;
        }
        if ([wc, lc, rc].some((n) => !Number.isFinite(n) || n < 0)) {
          alert("Windows/Linux/Random must be numbers ≥ 0.");
          return;
        }
        if (wc + lc + rc !== mp) {
          alert(`Windows + Linux + Random must equal Machines Present (${mp}).`);
          return;
        }
      
        const payload: RangePayload = {
          difficulty: difficulty as RangePayload['difficulty'],
          machinesPresent: mp,
          category,
          windowsCount: wc,
          linuxCount: lc,
          randomCount: rc,
        };
      
        try {
          const res = await fetch('/api/ranges', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include', // keep if backend uses cookies
            body: JSON.stringify(payload),
          });
      
          if (!res.ok) {
            // Try to surface server error details (Zod, etc.)
            let msg = '';
            try {
              const text = await res.text();
              msg = text || `HTTP ${res.status}`;
            } catch {
              msg = `HTTP ${res.status}`;
            }
            throw new Error(msg);
          }
      
          const data = await res.json();
          console.log('Range created:', data);
      
          // If you have TanStack Router's useNavigate available, you can do:
          // navigate({ to: '/range/$id', params: { id: data.id } });
      
          alert(`Range created with ID: ${data.id} (status: ${data.status})`);
        } catch (err: any) {
          console.error('Error creating range:', err);
          alert(`Error creating range: ${err?.message ?? String(err)}`);
        }
      };
      

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
                    <button className={styles.deployButton} onClick={sendToBackend}>
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