import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AnalyticsDashboard from '../../client/src/pages/admin/AnalyticsDashboard';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const mockData = {
  period: { from: '2026-01-01', to: '2026-04-01' },
  eventFunnel: {
    unverified: 2,
    new: 5,
    discussing: 3,
    dates_proposed: 1,
    confirmed: 6,
    completed: 4,
    cancelled: 2,
    total: 23,
  },
  instructorUtilization: [
    {
      instructorId: 1,
      displayName: 'Alice Instructor',
      accepted: 5,
      declined: 1,
      timed_out: 0,
      pending: 0,
      total: 6,
    },
  ],
  registrations: {
    interested: 10,
    confirmed: 8,
    cancelled: 2,
    totalKids: 80,
    total: 20,
  },
};

function renderDashboard() {
  return render(
    <MemoryRouter>
      <AnalyticsDashboard />
    </MemoryRouter>,
  );
}

describe('AnalyticsDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData,
    });
  });

  it('renders the analytics dashboard heading', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument();
    });
  });

  it('renders event funnel table with status counts', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Event Funnel')).toBeInTheDocument();
    });
    expect(screen.getByText('confirmed')).toBeInTheDocument();
    expect(screen.getByText('23')).toBeInTheDocument(); // total
  });

  it('renders instructor utilization table', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Instructor Utilization')).toBeInTheDocument();
    });
    expect(screen.getByText('Alice Instructor')).toBeInTheDocument();
  });

  it('renders registration summary', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Registration Summary')).toBeInTheDocument();
    });
    expect(screen.getByText('80')).toBeInTheDocument(); // totalKids
  });

  it('date picker triggers re-fetch when Apply is clicked', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument();
    });

    const applyButton = screen.getByText('Apply');
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
