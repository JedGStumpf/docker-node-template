import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EventPage from '../../client/src/pages/EventPage';

// ---- Mock fetch ----

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ---- Helpers ----

function renderEventPage(path = '/events/req-123?token=abc') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/events/:requestId" element={<EventPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockEventInfoResponse(overrides: Record<string, any> = {}) {
  return {
    id: 'req-123',
    classSlug: 'python-intro',
    status: 'dates_proposed',
    proposedDates: ['2026-06-15', '2026-06-22'],
    confirmedDate: null,
    locationFreeText: 'Room 101',
    eventType: 'private',
    minHeadcount: 5,
    votingDeadline: '2026-06-10T00:00:00Z',
    voteTallies: { '2026-06-15': 3, '2026-06-22': 1 },
    registrationCount: 2,
    ...overrides,
  };
}

// ---- Tests ----

describe('EventPage & RegistrationForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders event info with proposed dates and vote tallies', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockEventInfoResponse(),
    });

    renderEventPage();

    await waitFor(() => {
      expect(screen.getByText('python-intro')).toBeInTheDocument();
    });

    expect(screen.getByText('Location: Room 101')).toBeInTheDocument();
    expect(screen.getByText('3 kids registered')).toBeInTheDocument();
    expect(screen.getByText('1 kids registered')).toBeInTheDocument();
  });

  it('shows error for invalid token (401)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid token' }),
    });

    renderEventPage();

    await waitFor(() => {
      expect(screen.getByText('This registration link is invalid')).toBeInTheDocument();
    });
  });

  it('shows error when no token in URL', async () => {
    renderEventPage('/events/req-123');

    await waitFor(() => {
      expect(screen.getByText('This registration link is invalid')).toBeInTheDocument();
    });
  });

  it('shows registration form for dates_proposed events', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockEventInfoResponse(),
    });

    renderEventPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /register/i })).toBeInTheDocument();
    });

    expect(screen.getByTestId('attendee-name')).toBeInTheDocument();
    expect(screen.getByTestId('attendee-email')).toBeInTheDocument();
    expect(screen.getByTestId('number-of-kids')).toBeInTheDocument();
    expect(screen.getByTestId('date-2026-06-15')).toBeInTheDocument();
    expect(screen.getByTestId('date-2026-06-22')).toBeInTheDocument();
  });

  it('shows "registration not open" when status is not dates_proposed', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockEventInfoResponse({ status: 'confirmed', confirmedDate: '2026-06-15T00:00:00Z' }),
    });

    renderEventPage();

    await waitFor(() => {
      expect(screen.getByText('Registration is not currently open for this event.')).toBeInTheDocument();
    });
  });

  it('validates at least one date must be selected', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockEventInfoResponse(),
    });

    renderEventPage();

    await waitFor(() => {
      expect(screen.getByTestId('attendee-name')).toBeInTheDocument();
    });

    // Fill in name and email, but don't select any date
    fireEvent.change(screen.getByTestId('attendee-name'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByTestId('attendee-email'), { target: { value: 'alice@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Please select at least one date');
    });
  });

  it('submits registration successfully and shows confirmation', async () => {
    // First call: fetch event info
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockEventInfoResponse(),
    });

    renderEventPage();

    await waitFor(() => {
      expect(screen.getByTestId('attendee-name')).toBeInTheDocument();
    });

    // Fill form
    fireEvent.change(screen.getByTestId('attendee-name'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByTestId('attendee-email'), { target: { value: 'alice@example.com' } });
    fireEvent.change(screen.getByTestId('number-of-kids'), { target: { value: '3' } });
    fireEvent.click(screen.getByTestId('date-2026-06-15'));

    // Second call: submit registration
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: 'reg-1' }),
    });

    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    await waitFor(() => {
      expect(screen.getByText("You're registered!")).toBeInTheDocument();
    });

    // Verify the registration POST was called
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [url, opts] = mockFetch.mock.calls[1];
    expect(url).toBe('/api/events/req-123/register');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.attendeeName).toBe('Alice');
    expect(body.availableDates).toContain('2026-06-15');
  });

  it('shows duplicate email error on 409', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockEventInfoResponse(),
    });

    renderEventPage();

    await waitFor(() => {
      expect(screen.getByTestId('attendee-name')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('attendee-name'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByTestId('attendee-email'), { target: { value: 'alice@example.com' } });
    fireEvent.click(screen.getByTestId('date-2026-06-15'));

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Duplicate' }),
    });

    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent("You've already registered for this event");
    });
  });

  it('shows error on 422 (registration closed)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockEventInfoResponse(),
    });

    renderEventPage();

    await waitFor(() => {
      expect(screen.getByTestId('attendee-name')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('attendee-name'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByTestId('attendee-email'), { target: { value: 'alice@example.com' } });
    fireEvent.click(screen.getByTestId('date-2026-06-15'));

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ error: 'Registration is not currently open for this event' }),
    });

    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Registration is not currently open for this event');
    });
  });
});
