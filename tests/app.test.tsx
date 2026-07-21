import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { App } from '../src/App';

// Proves the jsdom + React test path works end to end.
describe('App', () => {
  it('renders the Antinode wordmark', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Antinode' })).toBeDefined();
  });
});
