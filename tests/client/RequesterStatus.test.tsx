/**
 * Tests for RequesterStatus page — public tokenized status view.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RequesterStatus from '../../client/src/pages/RequesterStatus';

function renderWithRoute(id: string, token: string) {
  return render(
    <MemoryRouter initialEntries={[`/requests/${id}?token=${token}`]}>
      <Routes>
        <Route path="/requests/:id" element={<RequesterStatus />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequesterStatus', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows loading state initially', () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {})); // never resolves
    renderWithRoute('req-123', 'tok-abc');
    expect(screen.getByText(/Loading your request status/i)).toBeInTheDocument();
  });

  it('renders status card for "new" status', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'req-123',
        status: 'new',
        classSlug: 'python-intro',
        classTitle: 'python-intro',
        confirmedDate: null,
        registrationCount: 0,
        publicEventUrl: null,
      }),
    });

    renderWithRoute('req-123', 'tok-abc');

    await waitFor(() => {
      expect(screen.getByText('Event Request Status')).toBeInTheDocument();
    });
    expect(screen.getByText('Under Review')).toBeInTheDocument();
    expect(screen.getByText(/Check back later/i)).toBeInTheDocument();
  });

  it('renders confirmed status with date and registration count', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'req-456',
        status: 'confirmed',
        classSlug: 'python-intro',
        classTitle: 'Introduction to Python',
        confirmedDate: '2026-05-15T10:00:00.000Z',
        registrationCount: 12,
        publicEventUrl: '/events/req-456',
      }),
    });

    renderWithRoute('req-456', 'tok-xyz');

    await waitFor(() => {
      expect(screen.getByText('Confirmed')).toBeInTheDocument();
    });
    expect(screen.getByText(/May 15, 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/12 participants registered/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View Event/i })).toBeInTheDocument();
  });

  it('shows not found for 404 response', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found' }),
    });

    renderWithRoute('req-bad', 'tok-bad');

    await waitFor(() => {
      expect(screen.getByText('Request Not Found')).toBeInTheDocument();
    });
  });

  it('renders dates_proposed status with vote count', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'req-789',
        status: 'dates_proposed',
        classSlug: 'scratch-basics',
        classTitle: 'scratch-basics',
        confirmedDate: null,
        registrationCount: 5,
        publicEventUrl: null,
      }),
    });

    renderWithRoute('req-789', 'tok-def');

    await waitFor(() => {
      expect(screen.getByText('Dates Available for Vote')).toBeInTheDocument();
    });
    expect(screen.getByText(/5 participants have voted/i)).toBeInTheDocument();
  });
});
