import React, { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="app-container">
      <header className="hero">
        <div className="badge">Darkano AI Project</div>
        <h1>Sample React Workspace</h1>
        <p>Your interactive application generated and managed inside Darkano AI.</p>
        
        <div className="card">
          <button onClick={() => setCount(c => c + 1)}>
            Counter state: {count}
          </button>
          <p className="hint">
            Edit <code>src/App.tsx</code> and click <strong>Run Build</strong> to refresh preview.
          </p>
        </div>
      </header>
    </div>
  );
}