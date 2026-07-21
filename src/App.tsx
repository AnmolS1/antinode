// T01 placeholder chrome. T04 rebuilds this as the real shell (source picker,
// onboarding, panels) under src/ui/ and re-wires main.tsx to mount it.
export function App() {
  return (
    <main className="landing">
      <h1 className="wordmark">Antinode</h1>
      <p className="tagline">It listens, and gives the sound a shape.</p>
      <p className="scaffold-note">
        Scaffold ready. The audio engine, render core, and source picker arrive in Wave&nbsp;A.
      </p>
    </main>
  );
}
