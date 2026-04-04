import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InstructorDashboard from '../../client/src/pages/InstructorDashboard';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock react-router-dom navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderDashboard() {
  return render(
    <MemoryRouter>
      <InstructorDashboard />
    </MemoryRouter>,
  );
}

describe('InstructorDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
    renderDashboard();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders upcoming and past sections with assignments', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        upcoming: [
          {
            id: 'a1',
            requestId: 'r1',
            classSlug: 'python-intro',
            confirmedDate: new Date(Date.now() + 30 * 86400000).toISOString(),
            location: '90210',
            requestStatus: 'confirmed',
            assignmentStatus: 'accepted',
            equipmentStatus: 'ready',
            equipmentCheckedAt: null,
          },
        ],
        past: [
          {
            id: 'a2',
            requestId: 'r2',
            classSlug: 'scratch-basics',
            confirmedDate: new Date(Date.now() - 30 * 86400000).toISOString(),
            location: '90211',
            requestStatus: 'completed',
            assignmentStatus: 'accepted',
            equipmentStatus: 'unknown',
            equipmentCheckedAt: null,
          },
        ],
      }),
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('My Events')).toBeInTheDocument();
    });

    expect(screen.getByText('Upcoming Events')).toBeInTheDocument();
    expect(screen.getByText('Past Events')).toBeInTheDocument();
    expect(screen.getByText('python-intro')).toBeInTheDocument();
    expect(screen.getByText('scratch-basics')).toBeInTheDocument();
    // Equipment badges
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('shows empty state when no assignments', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ upcoming: [], past: [] }),
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('No upcoming events.')).toBeInTheDocument();
    });

    expect(screen.getByText('No past events in the last 12 months.')).toBeInTheDocument();
  });

  it('redirects to login on 401', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    });

    renderDashboard();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
  });
});
